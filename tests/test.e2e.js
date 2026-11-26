// テスト版（つながない）の画面の確かめ。使い方: node tests/test.e2e.js（どこにも送らない）
const {chromium} = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "app");
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.existsSync(f) && fs.statSync(f).isFile() ? fs.createReadStream(f).pipe(r) : r.writeHead(404).end(); }).listen(8781);
let ok = 0, ng = 0; const check = (n, v) => { v ? ok++ : ng++; console.log((v ? "OK " : "NG ") + n); };
const SHOT = process.env.SHOT;
(async () => {
  const b = await chromium.launch();
  for (const [w, cs] of [[390, "dark"], [320, "light"]]) {
    const p = await b.newPage({viewport: {width: w, height: 844}, colorScheme: cs, deviceScaleFactor: SHOT ? 2 : 1}); const errs = [];
    p.on("pageerror", e => errs.push(e.message)); p.on("requestfailed", r => { if (!r.url().includes("media/")) errs.push("req " + r.url()); });
    await p.goto("http://localhost:8781/_t.html"); await p.waitForTimeout(400);
    const tag = `[${w} ${cs}]`;
    const bal = async () => +(await p.textContent("#balv")).replace(/,/g, "");
    const total = () => p.evaluate(() => Object.values(__jt.S.users).reduce((s, u) => s + u.bal, 0) === Object.values(__jt.S.users).filter(u => u.member).length * 1000);
    check(tag + " はじめの残高（Kenji）", await bal() > 0);
    check(tag + " 横にはみ出さない", !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    if (SHOT) await p.screenshot({path: `${SHOT}/home-${w}.png`});
    // 持つ（数に限りのない音楽：鍵をかけて）
    const waves = await p.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "Ambient Waves").id);
    await p.evaluate(id => __jt.detail(id), waves); await p.waitForTimeout(300);
    check(tag + " 持つ前は印なし・試聴の案内", !(await p.$eval("#dcard", e => e.classList.contains("held"))) && (await p.textContent("#sheet")).includes("最初の8秒"));
    await p.click('.acts2 [data-holdask]'); await p.waitForTimeout(200);
    await p.check('input[name="vis"][value="lock"]');
    if (SHOT) await p.screenshot({path: `${SHOT}/holdask-${w}.png`});
    const b0 = await p.evaluate(() => __jt.S.users[__jt.me].bal);
    await p.click("[data-hold]"); await p.waitForTimeout(1800);
    check(tag + " 持つと印が現れ、50 jeni 減る", await p.$eval("#dcard", e => e.classList.contains("held")) && await p.evaluate(() => __jt.S.users[__jt.me].bal) === b0 - 50);
    check(tag + " 持つと全部聞ける", !(await p.textContent("#sheet")).includes("最初の8秒"));
    check(tag + " 鍵をかけた人は人数に入らない", (await p.textContent("#sheet")).includes("鍵をかけて持っている人"));
    if (SHOT) await p.screenshot({path: `${SHOT}/held-${w}.png`});
    // 数に限りのあるカードでは鍵を選べない
    const bread = await p.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "天然酵母カンパーニュ").id);
    await p.evaluate(id => __jt.detail(id), bread); await p.click('.acts2 [data-holdask]'); await p.waitForTimeout(200);
    check(tag + " 現物では「鍵をかける」を選べない", await p.$eval('input[name="vis"][value="lock"]', e => e.disabled));
    await p.click("[data-hold]"); await p.waitForTimeout(300);
    // 投げ銭
    await p.evaluate(id => __jt.detail(id), waves); await p.click('[data-tipask]'); await p.click('[data-amt="50"]'); await p.click("[data-tip]"); await p.waitForTimeout(200);
    check(tag + " 投げ銭しても jeni の合計は変わらない", await total());
    // その場で売る（Kenji が売り、Farmer_S が買う）
    await p.click("[data-close]"); await p.click("[data-make]"); await p.click('[data-mode="sale"]'); await p.click('[data-sample="media/bread.jpg"]');
    await p.fill("#m-title", "焼きたてのパン"); await p.fill("#m-price", "120"); await p.click("[data-create]"); await p.waitForTimeout(300);
    check(tag + " 一度きりの QR（数字のカウントダウンなし）", !!(await p.$(".qrwrap svg.q")) && !/\d:\d\d/.test(await p.textContent("#sheet")));
    if (SHOT) await p.screenshot({path: `${SHOT}/sale-${w}.png`});
    const kb = await p.evaluate(() => __jt.S.users[__jt.me].bal);
    await p.click(`[data-buyas="${"b".repeat(64)}"]`); await p.click("[data-pay]"); await p.waitForTimeout(400);
    check(tag + " 払い終わり（コインが出る）・売った人に 120 jeni", (await p.textContent("#sheet")).includes("払い終わりました") && await p.evaluate(() => __jt.S.users[__jt.me].bal) === kb + 120);
    if (SHOT) await p.screenshot({path: `${SHOT}/paid-${w}.png`});
    await p.click('#sheet [data-detail]'); await p.waitForTimeout(200);
    check(tag + " レシートは受け取り済み", (await p.textContent("#sheet")).includes("受け取り済み"));
    // 返す（売った人だけ）
    await p.click(`[data-refund="${"b".repeat(64)}"]`); await p.waitForTimeout(200);
    check(tag + " 返すと 120 jeni が戻る", await p.evaluate(() => __jt.S.users[__jt.me].bal) === kb);
    check(tag + " 返しても jeni の合計は変わらない", await total());
    // 仲間の輪：Kenji には見える、SoundArchitect には見えない
    await p.click("[data-close]"); await p.click('[data-f="circle"]');
    check(tag + " 輪の人には輪のカードが見える", (await p.textContent("#home .list")).includes("来週の種まき"));
    await p.selectOption("#who", "d".repeat(64)); await p.click('[data-f="circle"]');
    check(tag + " 輪の外の人には見えない", !(await p.textContent("#home .list")).includes("来週の種まき"));
    // 画面に出さない：Farmer_S の持ち方は、ほかの人（Haru）には名前が出ない
    await p.selectOption("#who", "c".repeat(64));
    await p.evaluate(id => __jt.detail(id), waves); await p.waitForTimeout(200);
    check(tag + " 画面に出さない人は「ほか n人」", (await p.textContent("#sheet")).includes("ほか 1人（画面に出さない）") && !(await p.textContent("#sheet .box")).includes("Farmer_S（"));
    // 参加：ゆず を Haru に認めてもらう
    await p.click("[data-close]"); await p.selectOption("#who", "e".repeat(64)); await p.waitForTimeout(100);
    check(tag + " 参加前は案内が出る", (await p.textContent("#home")).includes("まだ参加していません"));
    await p.click("[data-me]"); await p.waitForTimeout(300);
    if (SHOT) await p.screenshot({path: `${SHOT}/mecard-${w}.png`});
    await p.click(`[data-vouchby="${"c".repeat(64)}"]`); await p.waitForTimeout(400);
    check(tag + " 認められると 1000 jeni（コインが出る）", (await p.textContent("#sheet")).includes("1,000 jeni が届きました"));
    if (SHOT) await p.screenshot({path: `${SHOT}/joined-${w}.png`});
    check(tag + " 合計は 参加人数×1000 のまま", await total());
    // 順番待ち → 譲る（カレー：Kenji が持っている、Farmer_S が待っている）
    await p.click("[data-close]"); await p.selectOption("#who", "a".repeat(64));
    const curry = await p.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "特製スパイスカレー").id);
    await p.evaluate(id => __jt.detail(id), curry); await p.click("[data-passask]"); await p.click(`[data-passto="${"b".repeat(64)}"]`); await p.waitForTimeout(200);
    check(tag + " 譲ると持ち主が変わる", await p.evaluate(id => __jt.S.cards[id].copies[0].owner === "b".repeat(64), curry));
    // 作る（仲間の輪へ・数に限りあり）
    await p.click("[data-close]"); await p.click("[data-make]"); await p.click('[data-mode="make"]');
    await p.fill("#m-title", "苗の分けあい"); await p.fill("#m-body", "トマトの苗を3つ"); await p.fill("#m-price", "10"); await p.check("#m-lim"); await p.fill("#m-supply", "3");
    await p.click("[data-create]"); await p.waitForTimeout(200);
    check(tag + " カードを出せる", (await p.textContent("#sheet")).includes("苗の分けあい"));
    await p.click("#sheet [data-close]"); await p.click("#home [data-rules]"); await p.waitForTimeout(200);
    check(tag + " きまりに「運営のサーバーはありません」", (await p.textContent("#sheet")).includes("運営のサーバーはありません"));
    check(tag + " 詳細も横にはみ出さない", !(await p.evaluate(() => document.getElementById("sheet").scrollWidth > innerWidth)));
    // 変わったところ：11項目それぞれ押すと画面が開く
    await p.click("#sheet [data-close]").catch(() => {});
    for (let i = 0; i < 11; i++) {
      await p.click("#guide"); await p.waitForTimeout(150); await p.click(`[data-go="${i}"]`); await p.waitForTimeout(250);
      const open = await p.evaluate(() => !document.getElementById("sheet").hidden), txt = open ? await p.textContent("#sheet") : await p.textContent("#home");
      const want = [/来週の種まき|Ambient Waves/, /特製スパイスカレー/, /だれでも最初の8秒/, /持ち方を選ぶ/, /投げ銭/, /順番|譲る/, /受け取った/, /買う人に読んでもらう|QRを出す/, /まだ参加していない人が読むと/, /来週の種まき/, /運営のサーバーはありません/][i];
      check(`${tag} 変わったところ ${i + 1}`, want.test(txt) && !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
      if (SHOT && i === 0) { await p.click("#guide"); await p.waitForTimeout(150); await p.screenshot({path: `${SHOT}/guide-${w}.png`}); await p.click("#sheet [data-close]"); }
    }
    check(tag + " エラーなし", errs.length === 0); if (errs.length) console.log(errs);
    await p.close();
  }
  console.log(ok, "OK", ng, "NG"); await b.close(); srv.close(); process.exit(ng ? 1 : 0);
})();
