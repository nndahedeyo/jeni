// テスト版（つながない）の画面の確かめ。使い方: node tests/test.e2e.js（どこにも送らない）
const {chromium} = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "app");
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.existsSync(f) && fs.statSync(f).isFile() ? fs.createReadStream(f).pipe(r) : r.writeHead(404).end(); }).listen(8781);
let ok = 0, ng = 0; const check = (n, v) => { v ? ok++ : ng++; console.log((v ? "OK " : "NG ") + n); };
const SHOT = process.env.SHOT;
const K = c => c.repeat(64);
(async () => {
  const b = await chromium.launch();
  for (const [w, cs] of [[390, "dark"], [320, "light"]]) {
    const p = await b.newPage({viewport: {width: w, height: 844}, colorScheme: cs, deviceScaleFactor: SHOT ? 2 : 1, hasTouch: true}); const errs = [];
    p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://localhost:8781/_t.html"); await p.waitForTimeout(400);
    const tag = `[${w} ${cs}]`;
    const id = t => p.evaluate(t => Object.values(__jt.S.cards).find(c => c.title === t).id, t);
    const bal = () => p.evaluate(() => __jt.S.users[__jt.me].bal);
    const total = () => p.evaluate(() => Object.values(__jt.S.users).reduce((s, u) => s + u.bal, 0) === Object.values(__jt.S.users).filter(u => u.member).length * 1000);
    const lp = async sel => { const el = await p.$(sel); const bx = await el.boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.waitForTimeout(1300); await p.mouse.up(); await p.waitForTimeout(300); };
    const tap = async sel => { const el = await p.$(sel); const bx = await el.boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(250); };
    check(tag + " 横にはみ出さない", !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    if (SHOT) await p.screenshot({path: `${SHOT}/home-${w}.png`});
    // 一覧の行を押すと、カードが1枚ずつのページで開く
    const rain = await id("雨の作業小屋");
    await p.click(`#home [data-detail="${rain}"].line`); await p.waitForTimeout(400);
    check(tag + " カードのページで開く（上下にめくれる）", await p.evaluate(id => document.getElementById("sheet").classList.contains("feed") && !!document.getElementById("pg-" + id) && document.querySelectorAll(".pg").length > 3, rain));
    check(tag + " 1ページにカードと押すものだけ（画面に収まる）", await p.evaluate(id => { const g = document.getElementById("pg-" + id).getBoundingClientRect(); return g.height <= innerHeight; }, rain));
    if (SHOT) await p.screenshot({path: `${SHOT}/page-${w}.png`});
    // 短く押しても持たない。長押しで持つ（印が現れる）
    const b0 = await bal();
    await tap(`#pg-${rain} [data-lp="hold"]`);
    check(tag + " 短く押しただけでは jeni が動かない", await bal() === b0);
    await lp(`#pg-${rain} [data-lp="hold"]`); await p.waitForTimeout(1500);
    check(tag + " 長押しで持つ・40 jeni 減る・印が現れる", await bal() === b0 - 40 && await p.$eval(`#pg-${rain} .jc2`, e => e.classList.contains("held")));
    if (SHOT) await p.screenshot({path: `${SHOT}/held-${w}.png`});
    // 見せ方を変える
    await p.click(`#pg-${rain} [data-vis]`); await p.waitForTimeout(200);
    check(tag + " 見せ方を「画面に出さない」に変えられる", (await p.textContent(`#pg-${rain} .minor`)).includes("画面に出さない"));
    // 投げ銭：金額を選んで長押し
    const waves = await id("Ambient Waves");
    await p.evaluate(id => document.getElementById("pg-" + id).scrollIntoView(), waves); await p.waitForTimeout(200);
    await p.click(`#pg-${waves} [data-tipask]`); await p.click(`[data-amt="50"][data-for="${waves}"]`);
    const b1 = await bal(); await lp(`#pg-${waves} [data-lp="tip"]`);
    check(tag + " 投げ銭を長押しで贈る（50 jeni）・合計は変わらない", await bal() === b1 - 50 && await total());
    // 動画はカードの中で再生
    const field = await id("畑の一日");
    await p.evaluate(id => document.getElementById("pg-" + id).scrollIntoView(), field);
    await p.click(`#pg-${field} [data-cplay]`); await p.waitForTimeout(800);
    check(tag + " 動画はカードの中で再生", await p.evaluate(id => { const v = document.querySelector(`#pg-${id} video.inplay`); return !!v && !v.paused; }, field));
    if (SHOT) await p.screenshot({path: `${SHOT}/video-${w}.png`});
    // 中身はだれでも全部（文章）
    const soil = await id("土を耕すということ");
    check(tag + " 文章は持っていなくても全部読める", (await p.textContent(`#pg-${soil} .body`)).includes("小さな道ができました"));
    // 記録（下から）：持っている人
    await p.click(`#pg-${waves} [data-rec]`); await p.waitForTimeout(200);
    check(tag + " 記録は下から出る（持っている人）", !(await p.$eval("#over", e => e.hidden)) && (await p.textContent("#over")).includes("持っている人"));
    if (SHOT) await p.screenshot({path: `${SHOT}/rec-${w}.png`});
    await p.click("[data-overclose]");
    // 押している途中ではなすと、持たない（印も消える）
    const curry = await id("特製スパイスカレー"), paddy = await id("夜明けの田んぼ");
    await p.evaluate(id => document.getElementById("pg-" + id).scrollIntoView(), paddy);
    { const el = await p.$(`#pg-${paddy} [data-lp="hold"]`); const bx = await el.boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.waitForTimeout(500);
      check(tag + " 押しているあいだ印が描かれていく", await p.$eval(`#pg-${paddy} .jc2`, e => e.classList.contains("drawing")));
      await p.mouse.up(); await p.waitForTimeout(300);
      check(tag + " 途中ではなすと持たない", !(await p.$eval(`#pg-${paddy} .jc2`, e => e.classList.contains("drawing") || e.classList.contains("held")))); }
    // 全画面：カードだけ
    await p.click("[data-imm]"); await p.waitForTimeout(200);
    check(tag + " 全画面ではカードだけ", await p.evaluate(id => document.getElementById("sheet").classList.contains("imm") && getComputedStyle(document.querySelector(`#pg-${id} .acts2`)).display === "none", paddy));
    if (SHOT) await p.screenshot({path: `${SHOT}/imm-${w}.png`});
    await p.click("[data-imm]"); void curry;
    // 左へスワイプしても戻らない（右へスワイプで戻る）
    await p.evaluate(() => { const s = (x, y, type) => { const t = new Touch({identifier: 1, target: document.body, clientX: x, clientY: y}); document.dispatchEvent(new TouchEvent(type, {touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true})); }; s(300, 400, "touchstart"); s(60, 410, "touchend"); });
    await p.waitForTimeout(200);
    check(tag + " 左へスワイプでは戻らない", await p.evaluate(() => !document.getElementById("sheet").hidden));
    // 横にスワイプで戻る
    await p.touchscreen.tap(5, 400).catch(() => {});
    await p.evaluate(() => { const s = (x, y, type) => { const t = new Touch({identifier: 1, target: document.body, clientX: x, clientY: y}); document.dispatchEvent(new TouchEvent(type, {touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true})); }; s(40, 400, "touchstart"); s(260, 410, "touchend"); });
    await p.waitForTimeout(300);
    check(tag + " 横にスワイプすると一覧へ戻る", await p.evaluate(() => document.getElementById("sheet").hidden));
    // 一覧：左へスワイプすると右どなりの項目（現物）
    await p.evaluate(() => { const s = (x, y, type) => { const t = new Touch({identifier: 1, target: document.body, clientX: x, clientY: y}); document.dispatchEvent(new TouchEvent(type, {touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true})); }; s(300, 600, "touchstart"); s(80, 610, "touchend"); });
    await p.waitForTimeout(200);
    check(tag + " 一覧で左へスワイプすると「現物」", await p.$eval('[data-f="rwa"]', e => e.getAttribute("aria-pressed") === "true"));
    await p.click('[data-f="all"]');
    // その場で売る（Kenji が売り、Farmer_S が買う）→ 貝が降る
    await p.click("[data-make]"); await p.click('[data-mk="sale"]'); await p.click('[data-sample="media/bread.jpg"]');
    await p.fill("#m-title", "焼きたてのパン"); await p.fill("#m-price", "120"); await p.click("[data-create]"); await p.waitForTimeout(300);
    const kb = await bal();
    await p.click(`[data-buyas="${K("b")}"]`); await p.click("[data-pay]"); await p.waitForTimeout(500);
    check(tag + " 払い終わり・貝が現れる・売った人に 120 jeni", (await p.textContent("#sheet")).includes("払い終わりました") && !!(await p.$(".done .coin")) && await bal() === kb + 120);
    if (SHOT) await p.screenshot({path: `${SHOT}/paid-${w}.png`});
    await p.click('#sheet [data-detail]'); await p.waitForTimeout(300);
    const sale = await p.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "焼きたてのパン").id);
    await p.click(`#pg-${sale} [data-rec]`); await p.waitForTimeout(200);
    await p.click(`[data-refund="${K("b")}"]`); await p.waitForTimeout(200);
    check(tag + " 返すと 120 jeni が戻る・合計は変わらない", await bal() === kb && await total());
    await p.click("[data-overclose]"); await p.click("#sheet [data-close]");
    // プロフィールを編集（名前・ひとこと・見せ方）
    await p.click("[data-me]"); await p.click("[data-editme]"); await p.fill("#p-name", "けんじ"); await p.fill("#p-line", "畑と音のあいだ"); await p.selectOption("#p-vis", "hide"); await p.click("[data-saveme]"); await p.waitForTimeout(200);
    await p.click("#sheet [data-close]");
    check(tag + " プロフィールの名前とひとことが変わる", (await p.textContent("#home .me")).includes("けんじ") && (await p.textContent("#home .me")).includes("畑と音のあいだ"));
    const bread = await id("天然酵母カンパーニュ");
    await p.click(`#home [data-detail="${bread}"].line`); await p.waitForTimeout(300);
    await lp(`#pg-${bread} [data-lp="hold"]`); await p.waitForTimeout(300);
    check(tag + " 見せ方の決まり（画面に出さない）で持つ", await p.evaluate(id => __jt.S.cards[id].copies.filter(x => x.owner === __jt.me).pop().vis === "hide", bread));
    await p.click("#sheet [data-close]");
    // 仲間の輪
    await p.click('[data-f="circle"]');
    check(tag + " 輪の人には輪のカードが見える", (await p.textContent("#home .list")).includes("来週の種まき"));
    await p.selectOption("#who", K("d")); await p.click('[data-f="circle"]');
    check(tag + " 輪の外の人には見えない", !(await p.textContent("#home .list")).includes("来週の種まき"));
    // 参加：ゆず を Haru に認めてもらう → 貝が降る
    await p.selectOption("#who", K("e")); await p.click("[data-me]"); await p.waitForTimeout(300);
    await p.click(`[data-vouchby="${K("c")}"]`); await p.waitForTimeout(400);
    check(tag + " 認められると 1,000 jeni・貝が現れる", (await p.textContent("#sheet")).includes("1,000 jeni が届きました") && !!(await p.$(".done .coin")));
    if (SHOT) await p.screenshot({path: `${SHOT}/joined-${w}.png`});
    check(tag + " 合計は 参加人数×1000 のまま", await total());
    await p.click("#sheet [data-close]");
    // 会話：書くと会話に出る
    await p.selectOption("#who", K("a"));
    const paddy2 = await id("夜明けの田んぼ");
    await p.evaluate(id => __jt.detail(id), paddy2); await p.click(`#pg-${paddy2} [data-talk]`); await p.waitForTimeout(200);
    check(tag + " 会話が読める（持っている・作った人の印）", (await p.textContent("#over")).includes("冬至のころ") && (await p.textContent("#over")).includes("作った人"));
    await p.fill("#t-text", "来年の春に行きます"); await p.click("[data-say]"); await p.waitForTimeout(200);
    check(tag + " 会話を書ける", (await p.textContent("#over")).includes("来年の春に行きます"));
    if (SHOT) await p.screenshot({path: `${SHOT}/talk-${w}.png`});
    await p.click("[data-overclose]");
    // 人のカード：お互いに友達なら話せる・通話（見本）
    await p.click(`#pg-${paddy2} [data-person]`); await p.waitForTimeout(200);
    check(tag + " お互いに友達なら「話す」", !!(await p.$("[data-chat]")));
    await p.click("[data-chat]"); await p.fill("#c-text", "土曜はよろしく"); await p.click("[data-send]"); await p.waitForTimeout(150);
    check(tag + " 2人の会話を送れる", (await p.textContent("#over")).includes("土曜はよろしく"));
    if (SHOT) await p.screenshot({path: `${SHOT}/chat-${w}.png`});
    await p.click("[data-call]"); await p.waitForTimeout(200);
    check(tag + " 通話の画面（見本）", (await p.textContent("#over")).includes("終える"));
    await p.click("[data-hang]"); await p.click("[data-overclose]"); await p.click("#sheet [data-close]");
    // 友達でない人とは話せない（SoundArchitect は Kenji を友達にしていない）
    await p.evaluate(() => __jt.person(__jt.P.sound.pk)); await p.waitForTimeout(150);
    check(tag + " お互いに友達でなければ「話す」は出ない", !(await p.$("[data-chat]")));
    await p.click("#sheet [data-close]");
    // 現物の引き換え：持っている人が QR を出し、お店が読む
    const bread2 = await id("天然酵母カンパーニュ");
    await p.evaluate(id => __jt.detail(id), bread2); await p.click(`#pg-${bread2} [data-redeem]`); await p.waitForTimeout(200);
    check(tag + " 引き換えの一度きりの QR", !!(await p.$("#over .qrwrap svg")));
    if (SHOT) await p.screenshot({path: `${SHOT}/redeem-${w}.png`});
    const usedBefore = await p.evaluate(id => __jt.S.cards[id].copies.filter(x => x.used).length, bread2);
    await p.click("[data-shopread]"); await p.waitForTimeout(200);
    check(tag + " お店が読むと「使った」になる", await p.evaluate(id => __jt.S.cards[id].copies.filter(x => x.used).length, bread2) === usedBefore + 1);
    // プロジェクト：自分のカードをつなぐ
    await p.selectOption("#who", K("c"));
    const pj = await id("みんなの種の地図");
    await p.evaluate(id => __jt.detail(id), pj); await p.click(`#pg-${pj} [data-attachask]`); await p.click("[data-attach]"); await p.waitForTimeout(200);
    check(tag + " プロジェクトに自分のカードをつなげる", await p.evaluate(id => __jt.S.cards[id].items.length, pj) === 4);
    if (SHOT) await p.screenshot({path: `${SHOT}/project-${w}.png`});
    await p.click("#sheet [data-close]");
    // 危ないカード：実績のある2人で隠れる
    const soil2 = await id("土を耕すということ");
    for (const who of ["a", "c"]) { await p.selectOption("#who", K(who)); await p.evaluate(id => __jt.detail(id), soil2); await p.click(`#pg-${soil2} [data-rec]`); await p.click("[data-flagcard]"); await p.waitForTimeout(150); await p.click("[data-overclose]"); await p.click("#sheet [data-close]"); }
    check(tag + " 実績のある2人の知らせでカードが隠れる", await p.evaluate(id => __jt.S.cards[id].hidden, soil2) && !(await p.textContent("#home .list")).includes("土を耕す"));
    await p.selectOption("#who", K("a"));
    // 作る：まず何をカードにするか選び、要る欄だけ出る
    await p.selectOption("#who", K("a")); await p.click('[data-f="all"]');
    await p.click("[data-make]"); await p.waitForTimeout(150);
    check(tag + " 作る：はじめは何をカードにするかだけ", (await p.$$("[data-mk]")).length >= 6 && !(await p.$("#m-title")));
    if (SHOT) await p.screenshot({path: `${SHOT}/make1-${w}.png`});
    await p.click('[data-mk="text"]'); await p.waitForTimeout(150);
    check(tag + " 文章のカード：写真・数・URL の欄は出ない", !!(await p.$("#m-body")) && !(await p.$("#m-photo")) && !(await p.$("#m-supply")) && !(await p.$("#m-url")));
    await p.click('[data-mk="make"]'); await p.click('[data-mk="app"]'); await p.waitForTimeout(150);
    await p.fill("#m-title", "苗の記録帳"); await p.fill("#m-url", "http://だめ"); await p.click("[data-create]"); await p.waitForTimeout(150);
    check(tag + " アプリのURLは https:// でないと出せない", !(await p.evaluate(() => Object.values(__jt.S.cards).some(c => c.title === "苗の記録帳"))));
    await p.fill("#m-url", "https://example.com/nae"); await p.fill("#m-price", "20"); await p.click("[data-create]"); await p.waitForTimeout(200);
    check(tag + " アプリのカードを出せる", await p.evaluate(() => Object.values(__jt.S.cards).some(c => c.title === "苗の記録帳" && c.kind === "app")));
    if (SHOT) await p.screenshot({path: `${SHOT}/make2-${w}.png`});
    await p.click("#sheet [data-close]");
    // アプリのカード：持っている人は「アプリを開く」
    const app = await id("在来種の地図（アプリ）");
    await p.evaluate(id => __jt.detail(id), app); await p.waitForTimeout(200);
    check(tag + " 持っているアプリのカードに「アプリを開く」", !!(await p.$(`#pg-${app} [data-openapp]`)));
    if (SHOT) await p.screenshot({path: `${SHOT}/app-${w}.png`});
    check(tag + " 会話のしるしはカードの中", !!(await p.$(`#pg-${app} .jc2 [data-talk]`)));
    await p.click("#sheet [data-close]");
    await p.click('[data-f="project"]');
    check(tag + " プロジェクト・アプリの項目", (await p.textContent("#home .list")).includes("みんなの種の地図") && (await p.textContent("#home .list")).includes("在来種の地図（アプリ）"));
    if (SHOT) await p.screenshot({path: `${SHOT}/home2-${w}.png`});
    await p.click('[data-f="all"]');
    const pj2 = await id("みんなの種の地図");
    await p.evaluate(id => __jt.detail(id), pj2); await p.waitForTimeout(200);
    check(tag + " プロジェクトに状態・求めているもの・関わった人", /進行中/.test(await p.textContent(`#pg-${pj2}`)) && /在来種の写真/.test(await p.textContent(`#pg-${pj2}`)) && /関わった人/.test(await p.textContent(`#pg-${pj2}`)));
    if (SHOT) await p.screenshot({path: `${SHOT}/project2-${w}.png`, fullPage: false});
    const rain2 = await id("雨の作業小屋");
    await p.evaluate(id => __jt.detail(id), rain2); await p.waitForTimeout(200);
    check(tag + " 持っているデジタルのカードに「元のデータを受け取る」", !!(await p.$(`#pg-${rain2} [data-orig]`)));
    if (SHOT) await p.screenshot({path: `${SHOT}/page2-${w}.png`});
    await p.click("#sheet [data-close]");
    // 変わったところ：それぞれ押すと画面が開く
    const want = [/何をカードにする/, /アプリを開く/, /会話/, /友達|話す/, /みんなの種の地図/, /天然酵母/, /記録/, /Ambient|雨の作業小屋/, /畑の一日/, /長押しで持つ|持っている/, /小さな道ができました/, /特製スパイスカレー/, /持っている人/, /見せ方/, /買う人に読んでもらう|QRを出す/, /わたしのカード/, /来週の種まき/, /jeni のきまり/];
    for (let i = 0; i < want.length; i++) {
      await p.click("#guide"); await p.waitForTimeout(150); await p.click(`[data-go="${i}"]`); await p.waitForTimeout(300);
      const txt = (await p.evaluate(() => document.getElementById("sheet").hidden ? "" : document.getElementById("sheet").textContent)) + (await p.textContent("#over")) + (await p.textContent("#home"));
      check(`${tag} 変わったところ ${i + 1}`, want[i].test(txt) && !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
      await p.evaluate(() => { const o = document.getElementById("over"); if (!o.hidden) document.querySelector("[data-overclose]").click(); });
    }
    check(tag + " エラーなし", errs.length === 0); if (errs.length) console.log(errs);
    await p.close();
  }
  console.log(ok, "OK", ng, "NG"); await b.close(); srv.close(); process.exit(ng ? 1 : 0);
})();
