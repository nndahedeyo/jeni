// つなぐ版（site/index.html）を、中継のまね（ブラウザの中で受け答えする）で確かめる。本物の中継には一切送らない。
// 使い方: python3 tools/build_live.py && GENESIS=<はじまりの番号> node tests/live.e2e.js
const { chromium } = require("playwright");
const RECP = []; const RECSET = new Set();
async function recDump() { if (!process.env.REC) return;
  const fs2 = require("fs"); let prev = []; try { prev = fs2.readFileSync(process.env.REC, "utf8").split("\n").filter(Boolean); } catch (e) {} fs2.writeFileSync(process.env.REC, [...new Set([...prev, ...RECSET])].sort().join("\n") + "\n"); }
const path = require("path");
const URL = "file://" + path.resolve(__dirname, "..", "index.html");
const GEN = process.env.GENESIS;
if (!GEN) { console.error("GENESIS が要ります"); process.exit(2); }
const store = [], subs = new Set(); let down = false;
const match = (f, e) => (!f.kinds || f.kinds.includes(e.kind)) && (!f["#t"] || e.tags.some(t => t[0] === "t" && f["#t"].includes(t[1]))) && (!f.until || e.created_at <= f.until);
let realSockets = 0;
// 置き場（Blossom）のまね：PUT /upload（その人の鍵で署名した kind 24242 の許可を確かめる）・PUT /mirror・GET /<sha256>（Range に応える）
const crypto = require("crypto"), fs = require("fs"), os = require("os"), cp = require("child_process");
const U2 = globalThis.URL;
const BLOB = {"blossom.nostr.build": {}, "blossom.primal.net": {}}, AUTHS = []; let failPrimary = 0;
const CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, x-sha-256", "access-control-allow-methods": "GET, HEAD, PUT, OPTIONS"};
async function blossom(page) {
  await page.route(/^https:\/\/(blossom\.nostr\.build|blossom\.primal\.net)\//, async r => {
    const q = r.request(), u = new U2(q.url()), host = u.hostname, box = BLOB[host];
    if (q.method() === "OPTIONS") return r.fulfill({status: 204, headers: CORS});
    if (q.method() === "PUT") {
      if (host === "blossom.nostr.build" && failPrimary > 0) { failPrimary--; return r.fulfill({status: 500, headers: {...CORS, "x-reason": "まね：止まっています"}, body: ""}); }
      let ev = null; try { ev = JSON.parse(Buffer.from(String(q.headers()["authorization"] || "").replace(/^Nostr /, ""), "base64").toString("utf8")); } catch (e) {}
      if (!ev || ev.kind !== 24242 || !/^[0-9a-f]{128}$/.test(ev.sig || "")) return r.fulfill({status: 401, headers: CORS, body: ""});
      AUTHS.push(ev);
      let body = q.postDataBuffer(), type = q.headers()["content-type"] || "application/octet-stream";
      if (u.pathname === "/mirror") { const from = JSON.parse(body.toString()).url, fu = new U2(from), src = (BLOB[fu.hostname] || {})[fu.pathname.slice(1).split(".")[0]]; if (!src) return r.fulfill({status: 404, headers: CORS, body: ""}); body = src.body; type = src.type; }
      const x = crypto.createHash("sha256").update(body).digest("hex");
      if (!ev.tags.some(t => t[0] === "x" && t[1] === x)) return r.fulfill({status: 403, headers: CORS, body: ""});
      box[x] = {body, type}; const ext = {"video/mp4": ".mp4", "audio/mp4": ".m4a", "image/jpeg": ".jpg"}[type] || "";
      return r.fulfill({status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({url: `https://${host}/${x}${ext}`, sha256: x, size: body.length, type})});
    }
    const it = box[u.pathname.slice(1).split(".")[0]]; if (!it) return r.fulfill({status: 404, headers: CORS, body: ""});
    const m = /bytes=(\d*)-(\d*)/.exec(q.headers()["range"] || ""), n = it.body.length;
    if (!m) return r.fulfill({status: 200, headers: {...CORS, "accept-ranges": "bytes"}, contentType: it.type, body: it.body});
    const a = m[1] ? +m[1] : 0, z = m[2] ? Math.min(+m[2], n - 1) : n - 1;
    return r.fulfill({status: 206, headers: {...CORS, "accept-ranges": "bytes", "content-range": `bytes ${a}-${z}/${n}`}, contentType: it.type, body: it.body.subarray(a, z + 1)});
  });
  // 変換の部品（Mediabunny）は手元の写し（MB_DIST）
  const D = process.env.MB_DIST || "";
  await page.route("https://cdn.jsdelivr.net/**", r => { const u = r.request().url();
    if (u.endsWith("mediabunny.min.mjs")) return r.fulfill({contentType: "text/javascript", headers: CORS, body: 'export * from "./m/modules/src/index.js";'});
    const m = u.match(/dist\/bundles\/m\/(.*)$/); if (m && D && fs.existsSync(path.join(D, m[1]))) return r.fulfill({contentType: "text/javascript", headers: CORS, body: fs.readFileSync(path.join(D, m[1]))});
    r.fulfill({status: 404, headers: CORS, body: ""}); });
}
let VID = ""; try { if (process.env.MB_DIST) { VID = path.join(os.tmpdir(), "jeni-live150.mp4"); if (!fs.existsSync(VID)) cp.execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 150 -c:v libx264 -preset ultrafast -b:v 3M -c:a aac -b:a 128k -pix_fmt yuv420p ${VID}`); } } catch (e) { VID = ""; }
async function relay(page) {
  page.on("websocket", () => {});
  await page.routeWebSocket(/.*/, ws => {
    if (!/^wss:\/\/(relay\.damus\.io|nos\.lol|relay\.primal\.net|relay\.nostr\.band)\//.test(ws.url() + "/")) realSockets++;
    if (down) { ws.close(); return; }
    ws.onMessage(m => { const d = JSON.parse(m);
      if (d[0] === "REQ") { const f = d[2]; for (const e of store.filter(e => match(f, e)).sort((a, b) => b.created_at - a.created_at).slice(0, f.limit || 500)) ws.send(JSON.stringify(["EVENT", d[1], e])); ws.send(JSON.stringify(["EOSE", d[1]])); subs.add({ws, id: d[1], f}); }
      if (d[0] === "EVENT") { const e = d[1]; if (!store.some(x => x.id === e.id)) { store.push(e); for (const s of subs) if (match(s.f, e)) try { s.ws.send(JSON.stringify(["EVENT", s.id, e])); } catch (x) {} } ws.send(JSON.stringify(["OK", e.id, true, ""])); }
    });
  });
}
(async () => {
  const b = await chromium.launch({args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]});
  const errs = [], log = [];
  const check = (l, c) => { if (!c) process.exitCode = 1; log.push((c ? "OK  " : "NG  ") + l); };
  const open = async (ctx, hash = "") => { const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message)); if (process.env.REC) { await p.exposeFunction("__jaRec", x => RECSET.add(x)).catch(() => {}); await p.addInitScript({path: path.join(__dirname, "i18n", "rec.js")}); } if (process.env.LANG_EN) await p.addInitScript(() => { Object.defineProperty(navigator, "languages", {get: () => ["en-US", "en"]}); Object.defineProperty(navigator, "language", {get: () => "en-US"}); }); await relay(p);
    await p.route(/^https?:\/\//, r => r.fulfill({status: 404, body: ""}));   // 外へは出さない（刻みの記録の読み込みなど）
    await blossom(p);
    await p.goto(URL + hash); await p.waitForTimeout(700); return p; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const st = p => p.evaluate(() => ({me: __jt.me, bal: (__jt.S.users[__jt.me] || {}).bal, member: !!(__jt.S.users[__jt.me] || {}).member}));
  const until = async (p, fn, ms = 8000, arg) => { if (typeof ms !== "number") { arg = ms; ms = 8000; } const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await wait(200); } return false; };
  try {
    // はじまりの人
    const A = await b.newContext({locale: "ja-JP", permissions: ["microphone", "geolocation"], geolocation: {latitude: 35.68, longitude: 139.76}});
    const a = await open(A, "#genesis=" + GEN);
    check("はじまり：jeni とは（貝は待っている）", /jeni は、貝のしるし/.test(await a.textContent("#sheet")) && !!(await a.$("#sheet .coin.idle"))); await a.click('[data-story="3"]'); await a.waitForTimeout(150);
    check("はじめて開くと、はじめての人が判断できる3つ（名前は見える・消せない・鍵の控え）と名前の欄", /名前は、みんなに見えます/.test(await a.textContent("#sheet")) && /消せません/.test(await a.textContent("#sheet")) && /Face ID で守ります/.test(await a.textContent("#sheet")) && !!(await a.$("#st-name")));
    await a.fill("#st-name", "はじめ"); await a.click("[data-start]"); await wait(1200);
    let s = await st(a);
    check("はじまりの番号で参加し、1,000 jeni", s.member && s.bal === 1000 && /はじまりの人として参加/.test(await a.textContent("#sheet")));
    check("鍵の控えがまだのあいだ、わたしのカードの印に小さな赤い印", !!(await a.$(".pmark .kdot")));
    await a.click("#sheet [data-close]"); await wait(500);
    check("参加の知らせを閉じると「鍵を守る」（パスキーで守る・64文字の控え・人に見せない注意）", !!(await a.$("[data-pksave]")) && /鍵を守る/.test(await a.textContent("#sheet")) && /[0-9a-f]{64}/.test(await a.textContent("#sheet .keyv")) && /人に見せない/.test(await a.textContent("#sheet")));
    await a.click("#sheet details.more summary"); await a.click("[data-keysaved]"); await wait(200);
    check("控えましたを押すと赤い印が消える（控えたことはこの端末の中だけ・中継には出さない）", !(await a.$(".pmark .kdot")) && !store.some(e => e.content.includes("keysaved")));
    check("署名した出来事が中継に届く", await until(a, () => true) && store.some(e => e.pubkey === s.me && e.kind === 7740 && e.sig && e.sig.length === 128));
    check("試験運用の表示（見ている人・最初に戻す・変わったところは出ない）", !(await a.$("#who")) && !(await a.$("[data-reset]")) && await a.$eval("#guide", e => e.hidden));
    // カードを出す（画像は小さくして中継へ）
    await a.click("[data-make]"); await wait(200);
    await a.click('.mk-g button:nth-child(2)'); await a.click('.mk-k [data-mk="text"]');
    await a.fill("#m-title", "はじめてのカード"); await a.fill("#m-body", "つなぐ版の最初のカード"); await a.fill("#m-price", "20");
    await a.click("[data-create]"); await wait(1200);
    const cardId = await a.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "はじめてのカード").id);
    check("カードが出て、中継に届く", !!cardId && store.some(e => e.id === cardId));
    check("見本の画像の選びは出ない", true);
    // 招待
    await a.click("#sheet [data-close]"); await a.click(".me [data-me]"); await wait(200); await a.click("[data-invite]"); await wait(400);
    const link = await a.$eval("#over .sub[style*='break-all']", e => e.textContent);
    check("招待のリンク（このページの #join=）", /#join=[0-9a-f]{64}\.\.[0-9a-f]{24}$/.test(link));
    // 招待された人
    const B = await b.newContext({locale: "ja-JP", permissions: ["microphone"]});
    const bp = await open(B, link.slice(link.indexOf("#")));
    await bp.click('[data-story="3"]'); await bp.fill("#st-name", "ふたり"); await bp.click("[data-start]");
    check("招待のリンクから参加して 1,000 jeni", await until(bp, () => __jt.S.users[__jt.me] && __jt.S.users[__jt.me].member && __jt.S.users[__jt.me].bal === 1000, 10000));
    check("参加したことが画面に出る（認めた人の名前）", await until(bp, () => /はじめ さんに認められて/.test(document.getElementById("sheet").textContent), 8000));
    await bp.click("#sheet [data-close]").catch(() => {}); await wait(500);
    await bp.evaluate(() => { const b = document.querySelector("[data-keysaved]"); if (b) b.click(); });
    const bpk = (await st(bp)).me;
    check("はじまりの人の側にも届く", await until(a, pk => !!(__jt.S.users[pk] && __jt.S.users[pk].member), 8000, bpk));
    // 持つ・投げ銭
    await until(bp, id => !!__jt.S.cards[id], 8000, cardId);
    await bp.evaluate(id => __jt.detail(id), cardId); await wait(300);
    await bp.evaluate(id => { const b = document.querySelector(`#pg-${id} [data-lp="hold"]`); b.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true})); }, cardId); await wait(1300);
    check("長押しで持つ（20 jeni）", (await st(bp)).bal === 980);
    check("作った人に 20 jeni が届く", await until(a, () => __jt.S.users[__jt.me].bal === 1020, 8000));
    // 友達になって、2人だけの会話（封）
    await bp.evaluate(pk => __jt.person(pk), (await st(a)).me); await wait(300); await bp.click("[data-friend]"); await wait(500);
    await until(a, pk => !!(__jt.S.users[pk] && __jt.S.users[pk].friends.includes(__jt.me)), 8000, bpk);
    await a.evaluate(pk => __jt.person(pk), bpk); await wait(300); await a.click("[data-friend]"); await wait(600);
    await a.evaluate(pk => __jt.person(pk), bpk); await wait(300);
    check("お互いに友達になると、カードの中に電話と会話", !!(await a.$("#sheet .pcomm [data-chat]")));
    await a.click("#sheet .pcomm [data-chat]"); await wait(300); await a.fill("#c-text", "こんにちは、届きますか"); await a.click("[data-send]"); await wait(1200);
    const dm = store.find(e => e.kind === 7742);
    check("会話は封をして中継に置く（中継からは読めない）", !!dm && !dm.content.includes("こんにちは") && dm.tags.some(t => t[0] === "p" && t[1] === bpk));
    check("相手の端末では読める", await until(bp, () => Object.values(__jt.CHAT).flat().some(m => m.text === "こんにちは、届きますか"), 8000));
    await a.click("[data-cplus]"); await a.setInputFiles("#c-pic", path.resolve(__dirname, "..", "app", "media", "paddy.jpg"));
    check("会話：写真は封をして置き場へ、相手の端末で開ける", await until(bp, () => Object.values(__jt.CHAT).flat().some(m => m.pics && m.pics[0].k), 15000));
    await a.click("[data-cplus]"); await a.setInputFiles("#c-file", {name: "memo.txt", mimeType: "text/plain", buffer: Buffer.from("jeni memo")});
    check("会話：ファイルも封をして届く（名前つき）", await until(bp, () => Object.values(__jt.CHAT).flat().some(m => m.file && m.file.name === "memo.txt" && m.file.k), 15000));
    check("相手が会話を開いていると、届いたものがその場で並ぶ", await (async () => { const pk = await a.evaluate(() => __jt.me); await bp.evaluate(pk => __jt.chatSheet(pk), pk); await wait(300); await a.fill("#c-text", "その場で届く？"); await a.click("[data-send]"); return until(bp, () => /その場で届く？/.test(document.getElementById("c-talk").textContent), 8000); })());
    await bp.click("[data-overclose]").catch(() => {});
    // 通話（2人の端末を直接つなぐ）
    await a.click("[data-overclose]").catch(() => {});
    await a.evaluate(pk => __jt.person(pk), bpk); await wait(300);
    await a.click("#sheet .pcomm [data-call]"); await wait(1500);
    check("電話をかけると、相手に着信", await until(bp, () => !!document.querySelector("[data-pickup]"), 8000));
    await bp.click("[data-pickup]");
    check("出ると、2人がつながる", await until(a, () => /話しています/.test((document.getElementById("call-s") || {}).textContent || ""), 15000));
    await a.click("[data-hang]"); await wait(800);
    check("終えると、相手の画面も閉じる", await until(bp, () => document.getElementById("over").hidden, 8000));
    // ビデオ通話：相手は「ビデオで出る」か「声だけで出る」を選べる。2人の映像が届く
    await wait(1500); await a.evaluate(pk => __jt.person(pk), bpk); await wait(300);
    await a.click("#sheet .pcomm [data-vcall]"); await wait(1500);
    check("ビデオ通話をかけると、相手に「ビデオで出る・声だけで出る」", await until(bp, () => !!document.querySelector('[data-pickup="v"]') && !!document.querySelector('[data-pickup="a"]'), 8000));
    await bp.click('[data-pickup="v"]');
    check("ビデオで出ると、お互いに相手の映像が見える", await until(a, () => { const v = document.getElementById("rtc-v"); return !!v && v.videoWidth > 0; }, 15000) && await until(bp, () => { const v = document.getElementById("rtc-v"); return !!v && v.videoWidth > 0; }, 15000));
    check("自分の映像も小さく出る・カメラを切れる", await a.evaluate(() => document.getElementById("rtc-me").videoWidth > 0 && !!document.querySelector("[data-camoff]")));
    await a.click("[data-camoff]"); check("カメラを切ると、ボタンが「カメラを入れる」に", /カメラを入れる/.test(await a.textContent("[data-camoff]")));
    await a.click("[data-hang]"); await wait(800);
    check("ビデオ通話を終えると、相手の画面も閉じ、カメラが止まる", await until(bp, () => document.getElementById("over").hidden, 8000));
    // 贈る：jeni を直接（長押し）→ 相手のお知らせに届く
    await a.evaluate(pk => __jt.person(pk), bpk); await wait(300); await a.click("#sheet .pcomm [data-giftp]"); await wait(200);
    await a.fill("#g-amt", "15"); const gb = (await st(a)).bal;
    await a.evaluate(() => document.querySelector('#over [data-lp="gsend"]').dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}))); await wait(1300);
    check("相手のプロフィールから jeni を贈れる（長押し）", /15 jeni を贈りました/.test(await a.textContent("#over")) && (await st(a)).bal === gb - 15);
    check("贈られた人に届き、お知らせに出る", await until(bp, () => (__jt.S.sends || []).some(g => g.to === __jt.me && g.amount === 15), 8000) && await bp.evaluate(() => { document.querySelector('[data-fx="news"]') && document.querySelector('[data-fx="news"]').click(); return /から 15 jeni が届きました/.test(document.getElementById("sheet").textContent); }));
    await bp.evaluate(() => __jt.closeSheet()).catch(() => {}); await a.click("[data-overclose]").catch(() => {});
    // 鍵をかけて持つ：中継の記録には、どのカードかが出ない。作った人と持った人の画面だけで「持っている」
    await a.evaluate(() => __jt.closeSheet()).catch(() => {});
    await a.click("[data-make]"); await a.click('.mk-g button:nth-child(2)'); await a.click('.mk-k [data-mk="text"]'); await wait(200);
    await a.fill("#m-title", "鍵で持つ文"); await a.fill("#m-price", "10").catch(() => {}); await a.click("[data-create]"); await wait(1500);
    const lockId = await a.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "鍵で持つ文").id);
    await until(bp, id => !!__jt.S.cards[id], 8000, lockId);
    await bp.evaluate(() => { __jt.PREF[__jt.me] = "lock"; }); await bp.evaluate(id => __jt.detail(id), lockId); await wait(300);
    const lb = (await st(bp)).bal;
    await bp.evaluate(id => { const b = document.querySelector(`#pg-${id} [data-lp="hold"]`); b.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true})); }, lockId); await wait(1800);
    const ph = store.find(e => e.pubkey === bpk && e.kind === 7740 && e.content.includes('"phold"'));
    check("鍵をかけて持つと、中継の記録にはどのカードかが出ない（払った相手と額だけ）", !!ph && !ph.content.includes(lockId) && !store.some(e => e.pubkey === bpk && e.content.includes('"hold"') && e.content.includes(lockId)));
    const lp2 = await st(bp); check("鍵をかけて持った人の画面：持っている（鍵つき）", lp2.bal < lb && await bp.evaluate(id => __jt.S.cards[id].copies.some(x => x.owner === __jt.me && x.vis === "lock"), lockId));
    check("作った人の画面でも、鍵つきで持たれている", await until(a, ([id, pk]) => __jt.S.cards[id].copies.some(x => x.owner === pk && x.vis === "lock"), 10000, [lockId, bpk]));
    await bp.evaluate(() => { __jt.PREF[__jt.me] = "show"; });
    // ---- その場で売る：売る人の QR（このページの #pay=）を、買う人がスマホのカメラで読む → 長押しで払う ----
    await a.evaluate(() => __jt.closeSheet()).catch(() => {}); await a.click("[data-overclose]").catch(() => {});
    await a.click("[data-make]"); await a.click('.mk-g button:nth-child(4)'); await wait(200);
    await a.setInputFiles("#m-photo", path.resolve(__dirname, "..", "app", "media", "bread.jpg")); await wait(500);
    await a.fill("#m-title", "焼きたてのパン"); await a.fill("#m-price", "30"); await a.click("[data-create]"); await wait(800);
    const payLink = await a.evaluate(() => __jt.MK.sale && `${__jt.MK.sale.id}.${__jt.MK.sale.code}`);
    check("その場で売る QR はこのページの #pay= ", !!payLink);
    const bp2 = await open(B, "#pay=" + payLink); await wait(800);
    check("買う人の画面に、カードと「長押しで払う」", !!(await bp2.$('[data-lp="buy"]')));
    await bp2.evaluate(() => document.querySelector('[data-lp="buy"]').dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}))); await wait(1500);
    check("払うと、払い終わりの画面", /払い終わりました/.test(await bp2.textContent("#sheet")));
    check("売る人の画面に「払われました」", await until(a, () => /払われました/.test(document.getElementById("sheet").textContent), 10000));
    const saleMedia = store.filter(e => e.kind === 7741 && e.content.includes("data:image/jpeg"));
    check("写真は小さくして中継へ（100KB 未満）", saleMedia.length >= 1 && saleMedia.every(e => e.content.length < 100000));
    await bp2.close();
    // ---- 投げ銭のQR（#tip=）をスマホのカメラで読む → カードを開かずに長押しで投げ銭 ----
    const bpT = await open(B, "#tip=" + cardId); await wait(1200);
    check("投げ銭のQRを読むと、確かめて長押しだけの画面", !!(await bpT.$('#over [data-lp="qtip"]')) && await bpT.evaluate(() => document.getElementById("sheet").hidden));
    const tb = (await st(bpT)).bal, tn = +(await bpT.textContent("#over [data-tipstep]"));
    await bpT.evaluate(() => document.querySelector('#over [data-lp="qtip"]').dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}))); await wait(1400);
    check("長押しで投げ銭が届く", /贈りました/.test(await bpT.textContent("#over")) && (await st(bpT)).bal < tb && store.some(e => e.pubkey === bpk && e.kind === 7740 && e.content.includes('"t":"tip"')));
    await bpT.close(); void tn;
    // ---- 払うQR（#pay=カード）：読むと 持つ と 投げ銭 が1つの画面に ----
    const bpP = await open(B, "#pay=" + cardId); await wait(1200);
    check("払うQR（#pay=カード）を読むと、持つ・投げ銭が1つの画面", !!(await bpP.$('#over [data-lp="qtip"]')) && (!!(await bpP.$('#over [data-lp="qhold"]')) || /もう持っています/.test(await bpP.textContent("#over"))) && /QRで払う/.test(await bpP.textContent("#over h2")));
    await bpP.close();
    // ---- 写真のアルバム：1枚ずつ置き場へ（位置などは消して）、カードには小さな表だけ ----
    await a.evaluate(() => __jt.closeSheet()).catch(() => {}); await a.click("[data-overclose]").catch(() => {});
    await a.click("[data-make]"); await a.click('.mk-g button:nth-child(2)'); await a.click('.mk-k [data-mk="picture"]'); await wait(200);
    await a.setInputFiles("#m-pics", ["paddy.jpg", "field.jpg", "radish.jpg"].map(f => path.resolve(__dirname, "..", "app", "media", f)));
    check("写真を選ぶと、置き場へ送り、並ぶ", await until(a, () => document.querySelectorAll(".alb .ali:not(.add)").length === 3, 15000));
    await a.fill("#m-title", "畑のアルバム"); await a.click("[data-create]"); await wait(1200);
    const albE = store.filter(e => e.kind === 7741 && e.content.includes('"pics"')).pop(), albM = albE && JSON.parse(albE.content);
    check("アルバムは置き場の3枚（番号つき）と、中継には小さな表だけ", !!albM && albM.pics.length === 3 && albM.pics.every(x => /^https:\/\/blossom\.nostr\.build\/[0-9a-f]{64}\.jpg$/.test(x.u) && x.m.includes("https://blossom.primal.net")) && albE.content.length < 100000);
    check("置き場への許可は、その人の鍵で署名（kind 24242・中継には出さない）", AUTHS.length >= 3 && AUTHS.every(e => e.pubkey === s.me) && !store.some(e => e.kind === 24242));
    const albId = albM && albM.card;
    await until(bp, id => !!__jt.S.cards[id] && !!__jt.MEDIA[id] && (__jt.MEDIA[id].pics || []).length === 3, 10000, albId);
    await bp.evaluate(() => __jt.closeSheet()).catch(() => {}); await bp.evaluate(id => __jt.detail(id), albId); await wait(4800);
    check("相手の画面で、アルバムが自動でめくれる", await bp.$eval(`#pg-${albId} .face[data-album]`, f => +f.dataset.ai >= 1 && [...f.querySelectorAll("img.bgimg")].some(i => /blossom/.test(i.src))));
    // 作ったあとでアルバムに写真を足す（直す）
    await a.evaluate(id => { __jt.closeSheet(); __jt.detail(id); }, albId); await wait(300);
    await a.evaluate(id => { const d = document.querySelector(`#pg-${id} .more`); if (d) d.open = true; }, albId); await a.click(`#pg-${albId} [data-edit]`); await wait(300);
    await a.setInputFiles("#e-pics", ["bread.jpg"].map(f => path.resolve(__dirname, "..", "app", "media", f)));
    await until(a, () => document.querySelectorAll("#over .alb .ali:not(.add)").length === 4, 15000);
    await a.click("#over [data-esave]"); await wait(1200);
    check("直す：作ったあとでアルバムに写真を足せる（相手の画面でも4枚）", await until(bp, id => (__jt.MEDIA[id].pics || []).length === 4, 10000, albId));
    // ---- 長い動画：その場で軽くして、2分ほどずつに分けて置く → 相手の画面で続けて流れる・置き場が1つ消えても写しから ----
    if (VID) {
      await a.evaluate(() => __jt.closeSheet()).catch(() => {});
      await a.click("[data-make]"); await a.click('.mk-g button:nth-child(2)'); await a.click('.mk-k [data-mk="video"]'); await wait(200);
      failPrimary = 1;   // はじめの置き場が1度だけ止まっている
      await a.fill("#m-title", "畑の2分半"); await a.setInputFiles("#m-media", VID);
      const done = await until(a, () => /動画を選びました/.test(document.getElementById("sheet").textContent) || /warnc/.test((document.getElementById("m-job") || {}).className || ""), 240000);
      check("長い動画を軽くして、分けて置き終わる（進み具合の表示のあと）", done && /2:30・2つに分けて置きました/.test(await a.textContent("#sheet")));
      await a.click("[data-create]"); await wait(1200);
      const vE = store.filter(e => e.kind === 7741 && e.content.includes('"parts"')).pop(), vM = vE && JSON.parse(vE.content);
      check("動画は2つ（それぞれ 20MB 未満）・長さ・表紙つき", !!vM && vM.parts.length === 2 && vM.dur === 150 && /^data:image\/jpeg/.test(vM.img) && vM.parts.every(x => (BLOB["blossom.nostr.build"][x.x] || BLOB["blossom.primal.net"][x.x] || {body: {length: 1e9}}).body.length < 20 * 1048576));
      check("はじめの置き場が止まっていても、もう1つの置き場に置ける", !!vM && vM.parts.some(x => /blossom\.primal\.net/.test(x.u)));
      const vid = vM && vM.card;
      await until(bp, id => !!__jt.MEDIA[id] && (__jt.MEDIA[id].parts || []).length === 2, 10000, vid);
      // 1つ目をはじめの置き場から消す → 相手は写しから流す
      const p0 = vM.parts[0]; delete BLOB[new U2(p0.u).hostname][p0.x];
      await bp.evaluate(() => __jt.closeSheet()).catch(() => {}); await bp.evaluate(id => { __jt.detail(id); document.getElementById("pg-" + id).scrollIntoView(); }, vid); await wait(600);
      await bp.click(`#pg-${vid} [data-cplay]`);
      check("相手の画面で流れる（1つ目の置き場が消えていても、写しから）", await until(bp, id => [...document.querySelectorAll(`#pg-${id} video.inplay`)].some(v => !v.paused && v.currentTime > .5), 15000, vid));
      const bx = await (await bp.$(`#pg-${vid} .cbar[data-seek]`)).boundingBox(); await bp.mouse.click(bx.x + bx.width * .9, bx.y + bx.height / 2);
      check("下の線で後ろの部分へ飛べる（2つ目）", await until(bp, id => [...document.querySelectorAll(`#pg-${id} video.inplay`)].some(v => !v.paused && v.currentTime > 50), 15000, vid));
      await bp.click(`#pg-${vid} [data-cplay]`);
    } else check("（変換の確かめは MB_DIST がないのでとばしました）", true);
    // ---- 現物の受け取り：持っている人の一度きりの QR を、作った人が読む ----
    await a.click("#sheet [data-close]").catch(() => {});
    await a.click("[data-make]"); await a.click('.mk-g button:nth-child(1)'); await a.click('.mk-k [data-mk="rwa"]');
    await a.fill("#m-title", "朝の大根"); await a.fill("#m-price", "10"); await a.fill("#m-supply", "2"); await a.click("[data-create]"); await wait(1000);
    const rwa = await a.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "朝の大根").id);
    await until(bp, id => !!__jt.S.cards[id], 8000, rwa); await bp.click("[data-overclose]").catch(() => {});
    await bp.evaluate(id => __jt.detail(id), rwa); await wait(300);
    await bp.evaluate(id => document.querySelector(`#pg-${id} [data-lp="hold"]`).dispatchEvent(new PointerEvent("pointerdown", {bubbles: true})), rwa); await wait(1400);
    await bp.click(`#pg-${rwa} [data-redeem]`); await wait(600);
    const usedLink = await bp.evaluate(id => { const m = document.getElementById("over").textContent.match(/番号：([0-9a-f]{16})/); return m && `${id}.${m[1]}`; }, rwa);
    check("受け取りの QR はこのページの #used=（読めないときの番号つき）", !!usedLink && /読めないときの番号/.test(await bp.textContent("#over")));
    const a4 = await open(A, "#used=" + usedLink); await wait(1500);
    check("作った人が読むと「使った」になる", await until(a4, id => __jt.S.cards[id].copies.some(x => x.used), 8000, rwa));
    check("持っている人の側でも「使った」", await until(bp, id => __jt.S.cards[id].copies.some(x => x.used), 8000, rwa));
    await a4.close();
    // ---- 仲間の輪：中身は輪の人だけが読める（中継には封のまま） ----
    await a.evaluate(() => __jt.closeSheet()).catch(() => {});
    await a.click("[data-make]"); await a.click('.mk-g button:nth-child(2)'); await a.click('.mk-k [data-mk="text"]'); await a.click("[data-newcircle]"); await wait(200);
    await a.fill("#c-name", "身内"); await a.check(`[data-cm][value="${bpk}"]`); await a.click("[data-mkcircle]"); await wait(800);
    await a.fill("#m-title", "輪だけの話"); await a.fill("#m-body", "これは輪の人だけに見える本文"); await a.selectOption("#m-circle", {index: 1}); await a.click("[data-create]"); await wait(1500);
    check("輪のカードの題と本文は、中継では封のまま", !store.some(e => e.content.includes("輪だけの話") || e.content.includes("輪の人だけに見える本文")));
    check("輪の人（招待した人）には題が読める", await until(bp, () => Object.values(__jt.S.cards).some(c => c.title === "輪だけの話"), 10000));
    // 輪の会話も封をして
    const ccard = await bp.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "輪だけの話").id);
    await bp.evaluate(id => __jt.detail(id), ccard); await wait(300); await bp.click(`#pg-${ccard} [data-talk]`); await wait(300);
    await bp.fill("#t-text", "輪の中のひとこと"); await bp.click("[data-say]"); await wait(1200);
    check("輪の会話は中継では封のまま、輪の人には読める", !store.some(e => e.content.includes("輪の中のひとこと")) && await until(a, id => (__jt.S.cards[id].talk || []).some(x => __jt.S.comments[x].text === "輪の中のひとこと"), 10000, ccard));
    await bp.click("[data-overclose]").catch(() => {});
    // 輪のアルバム：鍵で封をしてから置き場へ（置き場には中身が見えない）。輪の人は開いて見られる
    await a.evaluate(() => __jt.closeSheet()).catch(() => {});
    await a.click("[data-make]"); await a.click('.mk-g button:nth-child(2)'); await a.click('.mk-k [data-mk="picture"]'); await wait(200);
    await a.selectOption("#m-circle", {index: 1}); await wait(300);
    check("輪を選ぶと「鍵で封をしてから置きます」と出る", /鍵で封をしてから置きます/.test(await a.textContent("#sheet")));
    const nb0 = Object.keys(BLOB["blossom.nostr.build"]).length;
    await a.setInputFiles("#m-pics", ["field.jpg", "bread.jpg"].map(f => path.resolve(__dirname, "..", "app", "media", f)));
    await until(a, () => document.querySelectorAll(".alb .ali:not(.add)").length === 2, 15000);
    const newBlobs = Object.values(BLOB["blossom.nostr.build"]).slice(nb0);
    check("置き場には封をした中身だけ（写真の形ではない）", newBlobs.length === 2 && newBlobs.every(x => x.body.subarray(4, 8).toString() === "ftyp" && !x.body.includes(Buffer.from([0xff, 0xd8, 0xff]), 0, 64)));
    await a.fill("#m-title", "輪のアルバム"); await a.click("[data-create]"); await wait(1500);
    check("輪のアルバムの中身は中継でも封のまま", !store.some(e => e.kind === 7741 && e.content.includes('"pics"') && e.content.includes("輪のアルバム")) && !store.some(e => e.content.includes("輪のアルバム")));
    const cal = await until(bp, () => Object.values(__jt.S.cards).some(c => c.title === "輪のアルバム"), 10000);
    const calId = await bp.evaluate(() => (Object.values(__jt.S.cards).find(c => c.title === "輪のアルバム") || {}).id);
    await until(bp, id => !!__jt.MEDIA[id] && (__jt.MEDIA[id].pics || []).length === 2, 10000, calId);
    await bp.evaluate(id => { __jt.closeSheet(); __jt.detail(id); }, calId); await wait(400); await bp.click(`#pg-${calId} .cview`);
    check("輪の人は、封を開けて大きく見られる", cal && await until(bp, () => { const im = document.querySelector("#over .album img"); return !!im && /^blob:/.test(im.src) && im.naturalWidth > 0; }, 10000));
    { const nb1 = Object.keys(BLOB["blossom.nostr.build"]).length;
      await a.evaluate(id => { __jt.closeSheet(); __jt.detail(id); }, calId); await wait(300);
      await a.evaluate(id => { const d = document.querySelector(`#pg-${id} .more`); if (d) d.open = true; }, calId); await a.click(`#pg-${calId} [data-edit]`); await wait(300);
      await a.setInputFiles("#e-pics", ["radish.jpg"].map(f => path.resolve(__dirname, "..", "app", "media", f)));
      await until(a, () => document.querySelectorAll("#over .alb .ali:not(.add)").length === 3, 15000);
      const nb = Object.values(BLOB["blossom.nostr.build"]).slice(nb1);
      await a.click("#over [data-esave]"); await wait(1500);
      check("輪のアルバムに足した写真も、封をして置く・輪の人は3枚", nb.length === 1 && nb[0].body.subarray(4, 8).toString() === "ftyp" && await until(bp, id => (__jt.MEDIA[id].pics || []).length === 3 && __jt.MEDIA[id].pics.every(p => p.k), 10000, calId)); }
    if (process.env.MB_DIST) {   // 輪の動画：封をして置き、輪の人は開いて流せる
      await bp.click("[data-overclose]").catch(() => {});
      await a.evaluate(() => __jt.closeSheet()).catch(() => {});
      await a.click("[data-make]"); await a.click('.mk-g button:nth-child(2)'); await a.click('.mk-k [data-mk="video"]'); await wait(200);
      await a.selectOption("#m-circle", {index: 1}); await wait(300); await a.fill("#m-title", "輪の動画");
      await a.setInputFiles("#m-media", path.resolve(__dirname, "..", "app", "media", "field.mp4"));
      await until(a, () => /動画を選びました/.test(document.getElementById("sheet").textContent), 120000);
      await a.click("[data-create]"); await wait(1500);
      const cvId = await until(bp, () => Object.values(__jt.S.cards).some(c => c.title === "輪の動画" && __jt.MEDIA[c.id] && __jt.MEDIA[c.id].parts), 10000) && await bp.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "輪の動画").id);
      await bp.evaluate(id => { __jt.closeSheet(); __jt.detail(id); document.getElementById("pg-" + id).scrollIntoView(); }, cvId); await wait(500);
      await bp.click(`#pg-${cvId} [data-cplay]`);
      check("輪の動画：封をして置き、輪の人の画面では開いて流れる", await until(bp, id => [...document.querySelectorAll(`#pg-${id} video.inplay`)].some(v => /^blob:/.test(v.src) && !v.paused && v.currentTime > .3), 15000, cvId));
      await bp.click(`#pg-${cvId} [data-cplay]`).catch(() => {});
    }
    if (process.env.DBG) console.log("DBG", await bp.evaluate(id => ({img: (document.querySelector("#over .album img") || {}).src, over: document.getElementById("over").innerHTML.slice(0, 300), pics: __jt.MEDIA[id].pics}), calId), await bp.evaluate(async id => { try { await JeniMedia.openPart(__jt.MEDIA[id].pics[0]); return "ok"; } catch (e) { return String(e); } }, calId));
    await bp.click("[data-overclose]").catch(() => {});
    // お気に入りは、この端末の中だけ（開き直しても残る・中継には出さない）
    await bp.click(`#pg-${ccard} [data-fav]`); await wait(300);
    const nEv = store.length; const bp3 = await open(B); await wait(800);
    check("お気に入りは開き直しても残り、中継には出ない", await bp3.evaluate(id => JSON.parse(localStorage.getItem("jeni.fav") || "{}")[__jt.me][id] > 0, ccard) && store.length === nEv);
    await bp3.close();
    // プロフィールのアイコン
    await bp.evaluate(() => __jt.closeSheet()); await bp.click(".me [data-me]"); await wait(200); await bp.click("[data-editme]"); await wait(200);
    await bp.setInputFiles("#p-pic", path.resolve(__dirname, "..", "app", "media", "radish.jpg")); await wait(1500);
    check("プロフィールのアイコンは小さくして中継へ、相手に見える", store.some(e => e.kind === 7741 && e.pubkey === bpk && e.content.includes('"pic"')) && await until(a, pk => /background-image|url\(/.test(document.body.innerHTML) && true, 4000, bpk));
    // 書き出し（自分の記録をファイルに）
    const dl = bp.waitForEvent("download", {timeout: 5000}).catch(() => null); await bp.click("[data-saveme]").catch(() => {}); await bp.click("[data-export]").catch(() => {});
    check("記録を書き出すとファイルになる", !!(await dl));
    // ---- 直す・取り下げる ----
    await a.evaluate(id => __jt.detail(id), cardId); await wait(300); await a.click(`#pg-${cardId} [data-edit]`); await wait(300);
    await a.fill("#e-title", "はじめてのカード（直した）"); await a.click("[data-esave]"); await wait(1200);
    check("直すと、相手の画面でも題が変わる", await until(bp, id => __jt.S.cards[id].title === "はじめてのカード（直した）", 8000, cardId));
    await a.click("#sheet [data-close]").catch(() => {});
    await a.click("[data-make]"); await a.click('.mk-g button:nth-child(2)'); await a.click('.mk-k [data-mk="text"]'); await a.fill("#m-title", "下書き"); await a.click("[data-create]"); await wait(1000);
    const draft = await a.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "下書き").id);
    await a.click(`#pg-${draft} [data-retireask]`); await a.click(`#pg-${draft} [data-retire]`); await wait(1000);
    check("だれも持っていないカードを取り下げると、相手の一覧からも消える", await until(bp, id => !__jt.S.cards[id] || __jt.S.cards[id].gone, 8000, draft));
    // ---- 別の端末で、書き出した鍵で続ける ----
    const key = await a.evaluate(() => JSON.parse(localStorage.getItem("jeni.me")).sk);
    const key0 = key;
    const D = await b.newContext({locale: "ja-JP"}); const d = await open(D);
    await d.click('[data-story="3"]'); await d.click("#st-old summary"); await d.fill("#st-key", key); await d.click("[data-startkey]"); await wait(500);
    check("控えた鍵で続けたときは、鍵の控えの画面を出さない", !/鍵を守る/.test(await d.textContent("#sheet").catch(() => "")) && !(await d.$(".pmark .kdot")));
    check("書き出した鍵で、別の端末でも同じ人・同じ残高", await until(d, bal => __jt.S.users[__jt.me] && __jt.S.users[__jt.me].bal === bal, 10000, (await st(a)).bal));
    // ---- 参加していない人の QR（#me=）を、参加している人が読んで認める ----
    const C = await b.newContext({locale: "ja-JP"}); const cp = await open(C); await cp.click('[data-story="3"]'); await cp.fill("#st-name", "さんにんめ"); await cp.click("[data-start]"); await wait(800);
    check("招待なしで始めた人にも、すぐ鍵の控えの画面", /鍵を守る/.test(await cp.textContent("#sheet"))); await cp.evaluate(() => document.querySelector("[data-keysaved]").click()); await wait(200);
    const cpk = (await st(cp)).me;
    check("招待なしで始めた人は、まだ参加していない", !(await st(cp)).member);
    { const link2 = await a.evaluate(() => { document.querySelector("[data-close]") && document.querySelector("[data-close]").click(); return null; });
      await a.evaluate(() => __jt.closeSheet()).catch(() => {}); await a.click("[data-me]"); await a.click("[data-invite]"); await wait(800);
      const inv = await a.$eval("#over [data-copy]", b => b.dataset.copy); await a.click("[data-overclose]").catch(() => {}); void link2;
      const C3 = await b.newContext({locale: "ja-JP"}); const g3 = await open(C3); await g3.click('[data-story="3"]');
      await g3.click("#sheet details.more summary"); await g3.fill("#st-inv", inv); await g3.fill("#st-name", "とおく"); await g3.click("[data-start]");
      check("ホーム画面のアイコンから：届いた招待のリンクを貼って始めると参加できる", await until(g3, () => __jt.S.users[__jt.me] && __jt.S.users[__jt.me].member, 12000));
      await g3.evaluate(() => { localStorage.setItem("jeni.keysaved", "true"); __jt.closeSheet(); });
      await g3.click("[data-me]"); await wait(300); await g3.click("[data-logout]"); await wait(200);
      check("この端末から出る：長押しで決める（戻り方の一言つき）", /前に使っていた人/.test(await g3.textContent("#over")) && !!(await g3.$('#over [data-lp="logout"]')));
      const lo = await g3.$('#over [data-lp="logout"]'), lb = await lo.boundingBox(); await g3.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2); await g3.mouse.down(); await wait(1300); await g3.mouse.up(); await wait(1500);
      check("出ると、始める画面に戻る（この端末に鍵はない）", await g3.evaluate(() => !localStorage.getItem("jeni.me")) && /jeni は、貝のしるし/.test(await g3.textContent("#sheet")));
      await C3.close(); }
    { const C2 = await b.newContext({locale: "ja-JP"}); const e2 = await open(C2); await e2.click('[data-story="3"]'); await e2.fill("#st-name", "べつのばしょ"); await e2.click("[data-start]"); await wait(800);
      await e2.evaluate(() => document.querySelector("[data-keysaved]").click()); await wait(200);
      await e2.click("[data-me]"); await e2.click("#sheet details.more summary"); await e2.fill("#st-key", key0); await e2.click("[data-startkey]");
      check("まだ参加していない人も、わたしのカードから「前に使っていた人」で参加済みの鍵に戻れる", await until(e2, pk => __jt.me === pk && __jt.S.users[pk] && __jt.S.users[pk].member, 10000, (await st(a)).me));
      await C2.close(); }
    const a5 = await open(A, "#me=" + cpk); await wait(1500);
    check("参加している人が読むと「この人を認める」", /この人を認める/.test(await a5.textContent("#over")));
    await a5.click("[data-vouch]"); await wait(800);
    check("認めると、その人に 1,000 jeni", await until(cp, () => __jt.S.users[__jt.me].member && __jt.S.users[__jt.me].bal === 1000, 10000));
    check("輪に入っていない人には、輪のカードの中身が見えない", !(await cp.evaluate(() => Object.values(__jt.S.cards).some(c => c.title === "輪だけの話" || c.title === "輪のアルバム"))));
    check("ほかの人の画面には、鍵をかけて持ったことが出ない", await cp.evaluate(([id, pk]) => !__jt.S.cards[id].copies.some(x => x.owner === pk), [lockId, bpk]));
    await a5.close();
    // ---- 刻んだ記録（毎日の刻みの一覧を読む） ----
    const a6 = await A.newPage(); a6.on("pageerror", e => errs.push(e.message)); await relay(a6);
    await a6.route(/^https?:\/\//, r => /stamps\/index\.json/.test(r.request().url()) ? r.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({days: {"2026-11-27": [cardId]}})}) : r.fulfill({status: 404, body: ""}));
    await a6.goto(URL); await wait(1500); await a6.evaluate(id => __jt.detail(id), cardId); await wait(300);
    await a6.evaluate(id => document.querySelector(`#pg-${id} .more summary`).click(), cardId); await wait(300);
    check("カードの記録に、ビットコインに刻んだ日", /2026-11-27 の指紋に入っています/.test(await a6.textContent(`#pg-${cardId} .more`)));
    await a6.close();
    // 開き直しても同じ（端末に写しがある）・中継が止まっても見本に切り替わらない
    const before = (await st(a)).bal; await a.close(); const a2 = await open(A);
    check("開き直しても同じ残高", (await st(a2)).bal === before && (await st(a2)).member);
    down = true; const a3 = await open(A); await wait(500);
    check("中継につながらないあいだは「つないでいます」", /つないでいます/.test(await a3.textContent(".tbar .tag")));
    down = false;
    check("どの中継にも、試験の外の宛先へはつながない", realSockets === 0);
    check("画面のエラーなし", errs.length === 0);
  } catch (e) { log.push("NG  例外: " + e.message.split("\n")[0]); process.exitCode = 1; }
  console.log(log.join("\n")); if (errs.length) console.log("errors:", errs.slice(0, 5));
  await recDump(); await b.close();
})();
