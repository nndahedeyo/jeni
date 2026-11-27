// つながらない場所での確かめ：ホーム画面に置く形（決まり・アイコン）と、控えの係で、つながっていなくても開けて使えること
// 使い方: python3 tools/build_live.py && node tests/offline.e2e.js   （本物の中継にはつながない）
const {chromium} = require("playwright"), http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const TY = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json"};
const srv = http.createServer((q, r) => { let f = decodeURIComponent(q.url.split("?")[0]).replace(/^\/jeni\//, "/"); if (f === "/") f = "/index.html";
  const fp = path.join(root, f); if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) return r.writeHead(404).end(); r.writeHead(200, {"Content-Type": TY[path.extname(fp)] || "application/octet-stream"}); fs.createReadStream(fp).pipe(r); }).listen(8795);
let ok = 0, ng = 0; const check = (n, c) => { if (c) ok++; else ng++; console.log((c ? "OK  " : "NG  ") + n); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({locale: "ja-JP", viewport: {width: 390, height: 844}});
  const store = [];   // 中継のまね（どこにもつながない）
  await ctx.routeWebSocket(/.*/, ws => { ws.onMessage(m => { let d; try { d = JSON.parse(m); } catch (e) { return; }
    if (d[0] === "EVENT") { if (!store.some(e => e.id === d[1].id)) store.push(d[1]); ws.send(JSON.stringify(["OK", d[1].id, true, ""])); }
    if (d[0] === "REQ") { for (const e of store) ws.send(JSON.stringify(["EVENT", d[1], e])); ws.send(JSON.stringify(["EOSE", d[1]])); } }); });
  const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.route(/^https:\/\//, r => r.fulfill({status: 404, body: ""}));
  try {
    await p.goto("http://localhost:8795/jeni/"); await p.waitForTimeout(800);
    const man = await p.evaluate(() => fetch(document.querySelector('link[rel="manifest"]').href).then(r => r.json()));
    check("ホーム画面に置ける形（名前・アプリのように開く・アイコン）", man.short_name === "jeni" && man.display === "standalone" && man.icons.some(i => i.sizes === "512x512") && !!(await p.$('link[rel="apple-touch-icon"]')));
    check("控えの係が動く", await p.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active)));
    check("はじめての人へ：iPhone は先にホーム画面に追加、の注意（ブラウザで開いたとき）", /ホーム画面に置く|ホーム画面に追加/.test(await p.textContent("#sheet")));
    await p.fill("#st-name", "そと"); await p.click("[data-start]"); await p.waitForTimeout(600);
    check("始めるとすぐ「鍵を守る」：Face ID・パスキーで守る", /はじめに：鍵を守る/.test(await p.textContent("#sheet")) && !!(await p.$("[data-pksave]")));
    await p.click("#sheet [data-close]"); await p.waitForTimeout(200);
    check("守らずに閉じると、わたしのカードの印に赤い点", !!(await p.$(".pmark .kdot")));
    await p.reload(); await p.waitForTimeout(800);   // 控えの係がページを控える
    await ctx.setOffline(true);
    await p.reload(); await p.waitForTimeout(1000);
    check("つながっていなくても開ける（同じ人のまま）", await p.evaluate(() => !!window.__jt && /そと/.test(document.body.textContent)));
    const tg = await p.textContent(".tbar .tag");
    check("つながっていないと分かる表示", /つながっていません/.test(tg));
    await p.evaluate(() => window.__jt.emit(window.__jt.me, {t: "profile", name: "そと", line: "つながらない所で書いた"})); await p.waitForTimeout(600);
    check("つながっていなくても出せて、端末に控える（つながったら届く）", await p.evaluate(() => window.JeniLive.pending > 0));
    await p.evaluate(() => window.__jt.closeSheet()); await p.waitForTimeout(3200);
    check("まだ届いていないものの数が出る", /まだ届いていないもの/.test(await p.textContent(".tbar .tag")));
    await ctx.setOffline(false); await p.evaluate(() => dispatchEvent(new Event("online")));
    let sent = false; for (let i = 0; i < 40 && !sent; i++) { await p.waitForTimeout(250); sent = await p.evaluate(() => window.JeniLive.pending === 0); }
    check("つながり直すと、控えていたものが届く", sent);
    // パスキー（Face ID など）で鍵を守る：試しの認証器（パスキーの PRF に対応）
    const cdp = await ctx.newCDPSession(p); await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {options: {protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true}});
    await p.click("[data-me]"); await p.click("[data-keyexp]"); await p.waitForTimeout(200);
    const pk0 = await p.evaluate(() => window.JeniLive.me.pk), sk0 = await p.evaluate(() => window.JeniLive.me.sk);
    await p.click("[data-pksave]"); await p.waitForTimeout(1500);
    check("パスキーで守ると、封をした控えが中継に置かれ（鍵そのものは出ない）、赤い印が消える", store.some(e => e.kind === 7745 && e.pubkey === pk0) && !store.some(e => e.content.includes(sk0)) && !(await p.$(".pmark .kdot")));
    // 端末をなくした・記録を消した → パスキーで戻す
    await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1000);
    await p.click("#sheet details.more summary"); await p.click("[data-pkrestore]"); await p.waitForTimeout(2500);
    check("記録を消しても、Face ID・パスキーで同じ人に戻る", await p.evaluate(() => window.JeniLive.me && window.JeniLive.me.pk) === pk0 && /そと/.test(await p.textContent("body")));
    check("画面のエラーなし", errs.length === 0); if (errs.length) console.log(errs);
  } catch (e) { check("例外: " + e.message.split("\n")[0], false); }
  await b.close(); srv.close(); console.log(`${ok} OK ${ng} NG`); process.exit(ng ? 1 : 0);
})();
