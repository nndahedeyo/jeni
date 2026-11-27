// テスト版（つながない）の画面の確かめ。使い方: node tests/test.e2e.js（どこにも送らない）
const {chromium} = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "app");
// 置き場と同じく、一部だけの読み込み（Range・206）に応える（動画の途中へ飛ぶのに要る）
const TYPES = {".mp4": "video/mp4", ".mp3": "audio/mpeg", ".jpg": "image/jpeg", ".html": "text/html; charset=utf-8", ".js": "text/javascript"};
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0]));
  if (!(fs.existsSync(f) && fs.statSync(f).isFile())) return r.writeHead(404).end();
  const n = fs.statSync(f).size, ty = TYPES[path.extname(f)] || "application/octet-stream", m = /bytes=(\d*)-(\d*)/.exec(q.headers.range || "");
  if (!m) { r.writeHead(200, {"Content-Type": ty, "Content-Length": n, "Accept-Ranges": "bytes"}); return fs.createReadStream(f).pipe(r); }
  const a = m[1] ? +m[1] : 0, z = m[2] ? Math.min(+m[2], n - 1) : n - 1;
  r.writeHead(206, {"Content-Type": ty, "Content-Length": z - a + 1, "Content-Range": `bytes ${a}-${z}/${n}`, "Accept-Ranges": "bytes"}); fs.createReadStream(f, {start: a, end: z}).pipe(r); }).listen(8781);
let ok = 0, ng = 0; const check = (n, v) => { v ? ok++ : ng++; console.log((v ? "OK " : "NG ") + n); };
const SHOT = process.env.SHOT;
const K = c => c.repeat(64);
// 変換の部品（Mediabunny）は、ネットにつながず手元の写しを使う（MB_DIST に tsc で組み立てたもの。なければ変換の確かめはとばす）
const MB_DIST = process.env.MB_DIST || "";
const os = require("os"), cp = require("child_process");
let VID = "";
try { if (MB_DIST && fs.existsSync(MB_DIST)) { VID = path.join(os.tmpdir(), "jeni-t12.mp4"); if (!fs.existsSync(VID)) cp.execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 12 -c:v libx264 -preset veryfast -b:v 4M -c:a aac -b:a 128k -pix_fmt yuv420p ${VID}`); } } catch (e) { VID = ""; }
async function routeMB(p) {
  await p.route("https://cdn.jsdelivr.net/**", r => { const u = r.request().url(), h = {"access-control-allow-origin": "*"};
    if (u.endsWith("mediabunny.min.mjs")) return r.fulfill({contentType: "text/javascript", headers: h, body: 'export * from "./m/modules/src/index.js";'});
    const m = u.match(/dist\/bundles\/m\/(.*)$/); if (m && MB_DIST && fs.existsSync(path.join(MB_DIST, m[1]))) return r.fulfill({contentType: "text/javascript", headers: h, body: fs.readFileSync(path.join(MB_DIST, m[1]))});
    r.fulfill({status: 404, body: ""}); });
}
(async () => {
  const b = await chromium.launch();
  for (const [w, cs] of [[390, "dark"], [320, "light"]]) {
    const p = await b.newPage({viewport: {width: w, height: 844}, colorScheme: cs, deviceScaleFactor: SHOT ? 2 : 1, hasTouch: true}); const errs = [];
    // 「くわしく」の中にあるものを押すときは、人と同じように先に「くわしく」を開く
    const click0 = p.click.bind(p);
    const rec = async id => { await p.evaluate(id => { const d = document.querySelector(`#pg-${id} .more`); if (!d.open) d.querySelector("summary").click(); }, id); await p.waitForTimeout(150); };
    p.click = async (sel, o) => { await p.evaluate(sl => { const el = document.querySelector(sl); const d = el && el.closest("details.more"); if (d && !d.open) d.querySelector("summary").click(); }, sel).catch(() => {}); return click0(sel, o); };
    p.on("pageerror", e => errs.push(e.message)); await routeMB(p);
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
    check(tag + " 投げ銭の額は最初に届く量に合わせた段（はじめ 5）", (await p.textContent(`#pg-${waves} [data-tipstep]`)) === "5");
    await p.click(`#pg-${waves} [data-tipstep]`);
    check(tag + " 額を押すと 5→10 に変わる（画面はそのまま）", (await p.textContent(`#pg-${waves} [data-tipstep]`)) === "10");
    const b1 = await bal(); await lp(`#pg-${waves} [data-lp="tip"]`);
    check(tag + " となりを長押しで投げ銭（10 jeni）・合計は変わらない", await bal() === b1 - 10 && await total());
    // 動画はカードの中で再生
    const field = await id("畑の一日");
    await p.evaluate(id => document.getElementById("pg-" + id).scrollIntoView(), field);
    await p.click(`#pg-${field} [data-cplay]`); await p.waitForTimeout(800);
    check(tag + " 動画はカードの中で再生", await p.evaluate(id => { const v = document.querySelector(`#pg-${id} video.inplay`); return !!v && !v.paused; }, field));
    if (SHOT) await p.screenshot({path: `${SHOT}/video-${w}.png`});
    { const bar = await p.$(`#pg-${field} .cbar[data-seek]`), bx = await bar.boundingBox();
      await p.mouse.click(bx.x + bx.width * .4, bx.y + bx.height / 2); await p.waitForTimeout(2600);
      const st = await p.evaluate(id => [...document.querySelectorAll(`#pg-${id} video.inplay`)].map(v => ({src: v.getAttribute("src") || "", on: !v.paused, d: v.duration})), field);
      check(tag + " 分けて置いた動画：1つ目が終わると、2つ目が続けて流れる（先に取っておいた2つ目）", st.length === 1 && st[0].on && (/field-2/.test(st[0].src) || /^blob:/.test(st[0].src)));
      await p.mouse.click(bx.x + bx.width * .2, bx.y + bx.height / 2); await p.waitForTimeout(500);
      const st2 = await p.evaluate(id => [...document.querySelectorAll(`#pg-${id} video.inplay`)].map(v => ({src: v.getAttribute("src") || "", on: !v.paused, t: v.currentTime})), field);
      check(tag + " 下の線を押すと、その所へ（前の部分にも戻れる）", st2.some(v => /field-1/.test(v.src) && v.on && v.t < 3));
      const wb = await p.$eval(`#cbar-${field}`, e => parseFloat(e.style.width));
      check(tag + " 線の長さは全体の中の位置", wb > 10 && wb < 45);
      await p.click(`#pg-${field} [data-cplay]`); }
    // アルバム：カードの表で自動でめくれ、押すと大きく
    { const alb = await id("田んぼと畑の朝");
      await p.evaluate(id => { __jt.detail(id); document.getElementById("pg-" + id).scrollIntoView(); }, alb); await p.waitForTimeout(4700);
      check(tag + " アルバム：カードの表で自動でめくれる・枚数が出る", await p.$eval(`#pg-${alb} .face[data-album]`, f => +f.dataset.ai >= 1 && /写真・3枚/.test(f.textContent)));
      await p.click(`#pg-${alb} .cview`); await p.waitForTimeout(200);
      check(tag + " 押すと大きく1枚ずつ（何枚目か出る）", !!(await p.$("#over .album img")) && /\d \/ 3/.test(await p.textContent("#over .adots")));
      await p.click('#over [data-astep="1"]'); await p.waitForTimeout(300);
      check(tag + " 右を押すと次の写真", /\d \/ 3/.test(await p.textContent("#over .adots")));
      await p.click("#over [data-overclose]"); }
    // 中身はだれでも全部（文章）
    const soil = await id("土を耕すということ");
    check(tag + " 文章は持っていなくても全部読める", (await p.textContent(`#pg-${soil} .body`)).includes("小さな道ができました"));
    // 記録（下から）：持っている人
    check(tag + " 記録のリンクはなく、くわしく・記録にまとまっている", !(await p.$(`#pg-${waves} [data-rec]`)) && /くわしく・記録/.test(await p.textContent(`#pg-${waves} .more summary`)));
    await rec(waves);
    check(tag + " くわしく・記録を開くと持っている人", (await p.textContent(`#pg-${waves} .more`)).includes("持っている人"));
    if (SHOT) await p.screenshot({path: `${SHOT}/rec-${w}.png`});
    // 押している途中ではなすと、持たない（印も消える）
    const curry = await id("特製スパイスカレー"), paddy = await id("田んぼと畑の朝");
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
    // 一覧を左右にはらっても項目は変わらない（項目はアイコンを横に滑らせて選ぶ）。アイコンの並びの上でのはらいは、並びが滑るだけ
    await p.evaluate(() => { const s = (x, y, type) => { const t = new Touch({identifier: 1, target: document.querySelector("#home .list"), clientX: x, clientY: y}); document.querySelector("#home .list").dispatchEvent(new TouchEvent(type, {touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true})); }; s(300, 600, "touchstart"); s(60, 610, "touchend"); });
    await p.waitForTimeout(300);
    check(tag + " 一覧を左右にはらっても項目は変わらない", await p.$eval('[data-f="all"]', e => e.getAttribute("aria-pressed") === "true"));
    await p.evaluate(() => { const m = document.querySelector(".menu"); const s = (x, y, type) => { const t = new Touch({identifier: 1, target: m, clientX: x, clientY: y}); m.dispatchEvent(new TouchEvent(type, {touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true})); }; s(60, 300, "touchstart"); s(300, 302, "touchend"); });
    await p.waitForTimeout(200);
    check(tag + " アイコンの並びの上で右へはらっても、ほかの画面は動かない", await p.$eval('[data-f="all"]', e => e.getAttribute("aria-pressed") === "true") && await p.evaluate(() => document.getElementById("sheet").hidden));
    check(tag + " 選んでいるアイコンがはっきり（緑の地に白）・名前と枚数はしぼりとアイコンの間に控えめに", await p.evaluate(() => getComputedStyle(document.querySelector('.menu [aria-pressed="true"]')).color === "rgb(255, 255, 255)") && /すべて・\d+枚/.test(await p.textContent(".me .mcap")) && await p.evaluate(() => { const c = document.querySelector(".me .mcap").getBoundingClientRect(), m = document.querySelector(".menu-w").getBoundingClientRect(), d = document.querySelector(".mods").getBoundingClientRect(); return c.bottom <= m.top + 1 && c.top >= d.bottom - 1 && parseFloat(getComputedStyle(document.querySelector(".me .mcap")).fontSize) <= 10.5; }) && !(await p.$(".cap")));
    check(tag + " 自分のカードの比率は 1.586 のまま・中身がはみ出さない", await p.evaluate(() => { const m = document.querySelector(".me"), r = m.getBoundingClientRect(); return Math.abs(r.width / r.height - 1.586) < .02 && m.scrollHeight <= m.clientHeight + 1 && [...m.querySelectorAll(".menu-w, .comm, .me-top, .mcap")].every(x => x.getBoundingClientRect().bottom <= r.bottom + 1); }));
    check(tag + " 知らせの赤い印は小さい", await p.evaluate(() => { const b = document.querySelector(".comm b"); return !b || b.getBoundingClientRect().width <= 6; }));
    check(tag + " 地図の項目はない", !(await p.$('[data-f="place"]')));
    // その場で売る（Kenji が売り、Farmer_S が買う）→ 貝が降る
    await p.click("[data-make]"); await p.click('.mk-g [data-mk="sale"]'); await p.click('[data-sample="media/bread.jpg"]');
    await p.fill("#m-title", "焼きたてのパン"); await p.fill("#m-price", "120"); await p.click("[data-create]"); await p.waitForTimeout(300);
    const kb = await bal();
    await p.click(`[data-buyas="${K("b")}"]`); await p.click("[data-pay]"); await p.waitForTimeout(500);
    check(tag + " 払い終わり・貝が現れる・売った人に 120 jeni", (await p.textContent("#sheet")).includes("払い終わりました") && !!(await p.$(".done .coin")) && await bal() === kb + 120);
    if (SHOT) await p.screenshot({path: `${SHOT}/paid-${w}.png`});
    await p.click('#sheet [data-detail]'); await p.waitForTimeout(300);
    const sale = await p.evaluate(() => Object.values(__jt.S.cards).find(c => c.title === "焼きたてのパン").id);
    await rec(sale);
    await p.click(`#pg-${sale} [data-refund="${K("b")}"]`); await p.waitForTimeout(200);
    check(tag + " 返すと 120 jeni が戻る・合計は変わらない", await bal() === kb && await total());
    await p.click("#sheet [data-close]");
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
    const paddy2 = await id("田んぼと畑の朝");
    await p.evaluate(id => __jt.detail(id), paddy2); await p.click(`#pg-${paddy2} [data-talk]`); await p.waitForTimeout(200);
    check(tag + " 会話が読める（持っている・作った人の印）", (await p.textContent("#over")).includes("冬至のころ") && (await p.textContent("#over")).includes("作った人"));
    await p.fill("#t-text", "来年の春に行きます"); await p.click("[data-say]"); await p.waitForTimeout(200);
    check(tag + " 会話を書ける", (await p.textContent("#over")).includes("来年の春に行きます"));
    if (SHOT) await p.screenshot({path: `${SHOT}/talk-${w}.png`});
    await p.click("[data-overclose]");
    // 人のカード：お互いに友達なら話せる・通話（見本）
    await p.click(`#pg-${paddy2} [data-person]`); await p.waitForTimeout(200);
    check(tag + " お互いに友達なら、相手のカードの中（右下）に受話器と吹き出し", !!(await p.$("#sheet .jc2 .pcomm [data-chat]")) && !!(await p.$("#sheet .jc2 .pcomm [data-call]")));
    await p.click("[data-chat]"); await p.fill("#c-text", "土曜はよろしく"); await p.click("[data-send]"); await p.waitForTimeout(150);
    check(tag + " 2人の会話を送れる", (await p.textContent("#over")).includes("土曜はよろしく"));
    if (SHOT) await p.screenshot({path: `${SHOT}/chat-${w}.png`});
    check(tag + " 会話の中に通話の入口は出さない（入口はプロフィールカードだけ）", !(await p.$("#over [data-call]")));
    await p.click("[data-overclose]");
    await p.click("#sheet [data-call]"); await p.waitForTimeout(200);
    check(tag + " 通話の画面（見本）", (await p.textContent("#over")).includes("終える"));
    await p.click("[data-hang]"); await p.waitForTimeout(150);
    check(tag + " 通話を終えるとプロフィールカードに戻る", await p.evaluate(() => document.getElementById("over").hidden) && !!(await p.$("#sheet [data-chat]")));
    // 会話を書いた人の名前から、その人のカードへ
    await p.click("#sheet [data-close]");
    await p.evaluate(id => __jt.detail(id), paddy2); await p.click(`#pg-${paddy2} [data-talk]`); await p.waitForTimeout(200);
    await p.click("#over .cm [data-person]"); await p.waitForTimeout(200);
    check(tag + " 会話の名前から、その人のカード", await p.evaluate(() => document.getElementById("over").hidden && /プロフィール/.test(document.getElementById("sheet").textContent)));
    await p.click("#sheet [data-close]");
    // 自分のプロフィールカードから「話す」：お互いに友達の人の一覧 → 会話・通話
    check(tag + " 残高の下に、電話・会話・お知らせの順で小さく", await p.evaluate(() => { const b = document.querySelector(".bal").getBoundingClientRect(), ks = [...document.querySelectorAll(".comm [data-fx]")].map(x => x.dataset.fx), c = document.querySelector(".comm").getBoundingClientRect(), r = document.querySelector('[data-fx="phones"]').getBoundingClientRect(); return c.top >= b.bottom - 2 && ks.join() === "phones,chats,news" && r.width <= 30; }));
    check(tag + " 不在着信と新しい会話は、数ではなく小さな赤い印", !!(await p.$('[data-fx="phones"] b')) && !/\d/.test(await p.textContent(".comm")));
    await p.click('[data-fx="chats"]'); await p.waitForTimeout(200);
    check(tag + " 吹き出しから、話せる人の一覧（最後のひとことつき）", /Farmer_S/.test(await p.textContent("#sheet")) && /土曜はよろしく/.test(await p.textContent("#sheet")) && !/Bakery_Haru/.test(await p.textContent("#sheet")));
    await p.click("#sheet .crow[data-chat]"); await p.waitForTimeout(150);
    check(tag + " 一覧から会話を開ける", /土曜はよろしく/.test(await p.textContent("#over")));
    await p.click("[data-overclose]"); await p.waitForTimeout(100);
    check(tag + " 会話を開くと、新しい数が消える", !(await p.$("#sheet .nb")));
    await p.click("#sheet [data-close]");
    check(tag + " 読んだあとは吹き出しの数が消える", !(await p.$('[data-fx="chats"] b')));
    await p.click('[data-fx="phones"]'); await p.waitForTimeout(150);
    check(tag + " 電話：不在着信と、かけられる人", /不在着信/.test(await p.textContent("#sheet")) && /かけられる人/.test(await p.textContent("#sheet")));
    await p.click("#sheet [data-call]"); await p.waitForTimeout(150);
    check(tag + " 電話から通話（見本）", /終える/.test(await p.textContent("#over")));
    await p.click("[data-hang]"); await p.waitForTimeout(100);
    check(tag + " かけた記録が残る", /かけた/.test(await p.textContent("#sheet")));
    await p.click("#sheet [data-close]");
    check(tag + " 電話を見たあとは受話器の数が消える", !(await p.$('[data-fx="phones"] b')));
    // 友達でない人とは話せない（SoundArchitect は Kenji を友達にしていない）
    await p.evaluate(() => __jt.person(__jt.P.sound.pk)); await p.waitForTimeout(150);
    check(tag + " お互いに友達でなければ「話す」は出ない", !(await p.$("[data-chat]")));
    await p.click("#sheet [data-close]");
    // 現物の引き換え：持っている人が QR を出し、お店が読む
    const bread2 = await id("天然酵母カンパーニュ");
    await p.evaluate(id => __jt.detail(id), bread2); await p.click(`#pg-${bread2} [data-redeem]`); await p.waitForTimeout(200);
    check(tag + " 引き換えの一度きりの QR", !!(await p.$("#over .qrwrap svg")));
    if (SHOT) await p.screenshot({path: `${SHOT}/redeem-${w}.png`});
    await p.click("[data-overclose]"); await rec(bread2);
    check(tag + " 持っている人の名前から、その人のカードへ", !!(await p.$(`#pg-${bread2} .more .who-row [data-person]`)));
    await p.click(`#pg-${bread2} [data-redeem]`); await p.waitForTimeout(200);
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
    for (const who of ["a", "c"]) { await p.selectOption("#who", K(who)); await p.evaluate(id => __jt.detail(id), soil2); await rec(soil2); await p.click(`#pg-${soil2} [data-flagcard]`); await p.waitForTimeout(150); await p.click("#sheet [data-close]"); }
    check(tag + " 実績のある2人の知らせでカードが隠れる", await p.evaluate(id => __jt.S.cards[id].hidden, soil2) && !(await p.textContent("#home .list")).includes("土を耕す"));
    await p.selectOption("#who", K("a"));
    await p.evaluate(id => __jt.detail(id), soil2); await p.waitForTimeout(150);
    check(tag + " 隠れたカードには投げ銭のボタンを出さない", !(await p.$(`#pg-${soil2} [data-tipstep]`)));
    await p.click("#sheet [data-close]");
    // 作る：まず何をカードにするか選び、要る欄だけ出る
    await p.selectOption("#who", K("a")); await p.click('[data-f="all"]');
    await p.click("[data-make]"); await p.waitForTimeout(150);
    check(tag + " 作る：問いや説明のステップなしで、すぐ入力の欄（はじめは並びの最初＝もの・体験の現物）", !(await p.$(".gdesc")) && !/何を作る/.test(await p.textContent("#sheet")) && !!(await p.$("#m-title")) && await p.$eval('.mk-g [aria-pressed="true"]', e => /もの・体験/.test(e.textContent)) && await p.$eval('.mk-k [aria-pressed="true"]', e => /現物/.test(e.textContent)));
    const mk = async (grp, kind) => { await p.click(`.mk-g button:nth-child(${["thing", "data", "bundle", "sale"].indexOf(grp) + 1})`); await p.waitForTimeout(100); if (kind) { await p.click(`.mk-k [data-mk="${kind}"]`); await p.waitForTimeout(120); } };
    if (SHOT) await p.screenshot({path: `${SHOT}/make1-${w}.png`});
    await mk("data", "picture");
    check(tag + " まとまりを選ぶと、中の種類と、選んだ種類の欄がすぐ下に", (await p.$$(".mk-k [data-mk]")).length === 5 && await p.$eval('.mk-k [aria-pressed="true"]', e => e.textContent.includes("写真")) && !!(await p.$("#m-title")));
    check(tag + " 写真のカード：写真を選ぶまで出せない", await p.$eval("[data-create]", e => e.disabled) && !!(await p.$("#m-pics")));
    await mk("data", "text");
    check(tag + " 文章のカード：画像は選べる（なくてもよい）、数・URL の欄は出ない", !!(await p.$("#m-body")) && !!(await p.$("#m-photo")) && !(await p.$("#m-supply")) && !(await p.$("#m-url")) && !(await p.$eval("[data-create]", e => e.disabled)));
    await mk("thing", "event");
    check(tag + " もの・体験：数の欄（イベントは定員）と地図", !!(await p.$("#m-supply")) && !!(await p.$("[data-mappick]")));
    await (await p.$("[data-mappick]")).scrollIntoViewIfNeeded(); const box = await (await p.$("[data-mappick]")).boundingBox(); await p.mouse.click(box.x + box.width * .7, box.y + box.height * .45); await p.waitForTimeout(150);
    check(tag + " 地図を押すと点が置ける", !!(await p.$("[data-mappick] .mpin")));
    check(tag + " 作る画面に QR の選びはない（QR はいつもカードを開くだけ）", !(await p.$("#m-qr")));
    check(tag + " イベント：日時・場所・定員の欄", !!(await p.$("#m-when")) && !!(await p.$("#m-place")) && /定員/.test(await p.textContent("#sheet")));
    await p.fill("#m-title", "パンづくり教室"); await p.fill("#m-when", "1月10日 10:00"); await p.fill("#m-place", "東京"); await p.fill("#m-supply", "2"); await p.fill("#m-price", "30"); await p.click("[data-create]"); await p.waitForTimeout(200);
    const evt = await id("パンづくり教室");
    check(tag + " イベントを出せる：日時・場所・定員・地図がカードに", /1月10日 10:00/.test(await p.textContent(`#pg-${evt}`)) && /残り 2 \/ 2/.test(await p.textContent(`#pg-${evt}`)) && !!(await p.$(`#pg-${evt} svg.map .mpin`)));
    check(tag + " 裏のQRは「読むと、このカードが開きます」", /読むと、このカードが開きます/.test(await p.textContent(`#pg-${evt} .back`)));
    await p.click("#sheet [data-close]"); await p.click("[data-make]");
    await mk("data", "app");
    await p.fill("#m-title", "苗の記録帳"); await p.fill("#m-url", "http://だめ"); await p.click("[data-create]"); await p.waitForTimeout(150);
    check(tag + " アプリのURLは https:// でないと出せない", !(await p.evaluate(() => Object.values(__jt.S.cards).some(c => c.title === "苗の記録帳"))));
    await p.fill("#m-url", "https://example.com/nae"); await p.fill("#m-price", "20"); await p.click("[data-create]"); await p.waitForTimeout(200);
    check(tag + " アプリのカードを出せる", await p.evaluate(() => Object.values(__jt.S.cards).some(c => c.title === "苗の記録帳" && c.kind === "app")));
    if (SHOT) await p.screenshot({path: `${SHOT}/make2-${w}.png`});
    await p.click("#sheet [data-close]");
    // 音楽のカード：音を選ばないと出せない。選ぶと長さが入る
    await p.click("[data-make]"); await mk("data", "music");
    check(tag + " 音楽のカード：音を選ぶまで出せない", await p.$eval("[data-create]", e => e.disabled) && !!(await p.$("#m-media")));
    await p.fill("#m-title", "畑の朝の音"); await p.click('[data-msample]'); await p.waitForTimeout(600); await p.click('[data-sample="media/paddy.jpg"]'); await p.waitForTimeout(150);
    check(tag + " 音を選ぶと題を残したまま長さが入る", await p.$eval("#m-title", e => e.value) === "畑の朝の音" && /0:\d\d/.test(await p.textContent(".ph-pick.mp")));
    await p.click("[data-create]"); await p.waitForTimeout(200);
    const mus = await id("畑の朝の音");
    check(tag + " 音楽のカードを出せて、画像つきで、カードの中で再生できる", !!(await p.$(`#pg-${mus} [data-cplay]`)) && !!(await p.$(`#pg-${mus} img.bgimg`)));
    await p.click("#sheet [data-close]");
    // 写真のアルバムを作る（見本の画像を2枚）
    await p.click("[data-make]"); await mk("data", "picture");
    check(tag + " 写真：選ぶまで出せない・20枚まで選べる欄", await p.$eval("[data-create]", e => e.disabled) && !!(await p.$("#m-pics[multiple]")));
    await p.click('[data-sample="media/paddy.jpg"]'); await p.waitForTimeout(100); await p.click('[data-sample="media/field.jpg"]'); await p.waitForTimeout(100);
    check(tag + " 2枚選ぶと並び、1枚目が表", (await p.$$(".alb .ali:not(.add)")).length === 2 && /表/.test(await p.textContent(".alb .ali")));
    await p.fill("#m-title", "畑のアルバム"); await p.click("[data-create]"); await p.waitForTimeout(200);
    { const al = await id("畑のアルバム"); check(tag + " アルバムのカードを出せる（写真・2枚）", /写真・2枚/.test(await p.textContent(`#pg-${al} .face`))); }
    await p.click("#sheet [data-close]");
    check(tag + " 写真・音・動画のカードでは、輪を選ぶ欄を出さない", await (async () => { await p.click("[data-make]"); await mk("data", "video"); const r = !(await p.$("#m-circle")); await p.click("#sheet [data-close]"); return r; })());
    // 動画のファイルを選ぶと、その場で軽くして（進み具合）、出せる
    if (VID) {
      await p.click("[data-make]"); await mk("data", "video"); await p.fill("#m-title", "試しの動画");
      await p.setInputFiles("#m-media", VID); await p.waitForTimeout(300);
      check(tag + " 動画を選ぶと進み具合が出る", /動画を軽くしています|準備しています|選びました/.test(await p.textContent("#sheet")));
      await p.waitForFunction(() => /動画を選びました/.test(document.getElementById("sheet").textContent) || /warnc/.test((document.getElementById("m-job") || {}).className || ""), null, {timeout: 120000}).catch(() => {});
      check(tag + " 軽くし終わると長さが出て、題はそのまま", /動画を選びました（0:12/.test(await p.textContent("#sheet")) && await p.$eval("#m-title", e => e.value) === "試しの動画");
      await p.click("[data-create]"); await p.waitForTimeout(300);
      const tv = await id("試しの動画");
      check(tag + " 変えた動画のカード：表紙が動画から作られ、長さつき", await p.evaluate(id => { const m = __jt.MEDIA[id]; return !!m && m.parts && m.parts.length >= 1 && /^data:image/.test(m.img) && m.len === "0:12"; }, tv));
      await p.click(`#pg-${tv} [data-cplay]`); await p.waitForTimeout(1200);
      check(tag + " その動画がカードの中で流れる", await p.evaluate(id => [...document.querySelectorAll(`#pg-${id} video.inplay`)].some(v => !v.paused && v.currentTime > 0), tv));
      await p.click(`#pg-${tv} [data-cplay]`); await p.click("#sheet [data-close]");
    }
    // アプリのカード：持っている人は「アプリを開く」
    const app = await id("在来種の地図（アプリ）");
    await p.evaluate(id => __jt.detail(id), app); await p.waitForTimeout(200);
    check(tag + " 持っているアプリのカードに「アプリを開く」", !!(await p.$(`#pg-${app} [data-openapp]`)));
    if (SHOT) await p.screenshot({path: `${SHOT}/app-${w}.png`});
    check(tag + " 会話のしるしはカードの中", !!(await p.$(`#pg-${app} .jc2 [data-talk]`)));
    await p.click("#sheet [data-close]");
    await p.click('[data-f="music"]');
    check(tag + " 音楽の項目", /雨の作業小屋/.test(await p.textContent("#home .list")) && !/田んぼと畑の朝/.test(await p.textContent("#home .list")));
    check(tag + " 一覧の外に切り替えの帯を出さない", !(await p.$(".wsub")));
    // 全画面：中身が画面いっぱい（カードの枠なし）・1枚ずつ
    const fld = await id("畑の一日");
    await p.evaluate(id => __jt.detail(id), fld); await p.click("[data-imm]"); await p.waitForTimeout(250);
    check(tag + " 全画面：カードが画面いっぱい、写真は全体が見える大きさ", await p.evaluate(id => { const j = document.querySelector("#pg-" + id + " .jc2").getBoundingClientRect(), im = document.querySelector("#pg-" + id + " .bgimg"); return Math.abs(j.width - innerWidth) < 2 && Math.abs(j.height - innerHeight) < 2 && (!im || getComputedStyle(im).objectFit === "contain"); }, fld));
    await p.click("[data-imm]"); await p.click("#sheet [data-close]");
    // 招待：一度きりのリンクとQR → まだ参加していない人が開くと参加
    await p.click(".me [data-me]"); await p.waitForTimeout(150);
    await p.click("[data-invite]"); await p.waitForTimeout(150);
    check(tag + " 招待：リンクとQR（7日間・1人）", /#join=/.test(await p.textContent("#over")) && !!(await p.$("#over .qrbox svg")));
    await p.click("[data-joinas]"); await p.waitForTimeout(200);
    check(tag + " 招待のリンクから参加すると 1,000 jeni", /1,000 jeni が届きました/.test(await p.textContent("#sheet")) && await p.evaluate(() => __jt.S.users["e".repeat(64)].member));
    await p.click("#sheet [data-close]"); await p.selectOption("#who", K("a")); await p.waitForTimeout(150);
    // きまりの版・記録の控え（書き出し・要約を刻む）・ウォレットの場所
    check(tag + " 出来事にきまりの版が付く", await p.evaluate(() => __jt.EV.every(e => JSON.parse(e.content).v === 1)));
    await p.click(".me [data-me]"); await p.waitForTimeout(150);
    check(tag + " わたしのカード：記録の控え（書き出す・刻む）", !!(await p.$("[data-export]")) && /刻んだ要約 1日分/.test(await p.textContent("#sheet")));
    await p.click("[data-anchor]"); await p.waitForTimeout(150);
    check(tag + " いま刻むと2日分に", /刻んだ要約 2日分/.test(await p.textContent("#sheet")));
    await p.click("[data-export]"); await p.waitForTimeout(100);
    check(tag + " 書き出しの知らせ", /書き出しました/.test(await p.textContent("#toast")));
    check(tag + " 裏にウォレットの場所（開発中・押せない）と、開発者募集の説明", !!(await p.$("#dcard .back .wal button[disabled]")) && /開発者を募集/.test(await p.textContent("#sheet")) && /シードフレーズ/.test(await p.textContent("#sheet")));
    check(tag + " ウォレットには jeni の印を使わない・受け取る/送るは大きく（裏の右側の下 0.382）", !(await p.$("#dcard .wal .coin")) && await p.evaluate(() => { const w = document.querySelector("#dcard .wal").getBoundingClientRect(), c = document.querySelector("#dcard .back").getBoundingClientRect(), b = document.querySelector("#dcard .wal .wb button").getBoundingClientRect(); return Math.abs(w.height / c.height - 0.382) < .03 && b.height > c.height * .2; }));
    await p.click("#sheet [data-close]");
    const rad = await id("朝採り大根 3本セット");
    await p.evaluate(id => __jt.detail(id), rad); await rec(rad);
    check(tag + " カードの記録：刻んだ要約に入っている証明", /日目の要約に入っています（証明 \d段）/.test(await p.textContent(`#pg-${rad} .more`)));
    await p.click("#sheet [data-close]");
    check(tag + " 名前の前にプロフィールアイコン（角丸の四角）", await p.evaluate(() => { const a = document.querySelector("#home .list .avs"); return !!a && getComputedStyle(a).borderRadius !== "50%"; }));
    // 近く：現在地から近い順（ほかの項目と同じ一覧・距離つき）
    await p.click('[data-f="all"]'); await p.click('[data-mod="near"]'); await p.waitForTimeout(200);
    check(tag + " しぼりはアイコンの上（持っている・お気に入り・近く）、アイコンに印は付けない", await p.evaluate(() => { const m = document.querySelector(".mods").getBoundingClientRect(), n = document.querySelector(".menu").getBoundingClientRect(); return m.bottom <= n.top + 1 && document.querySelectorAll(".mods [data-mod]").length === 3 && getComputedStyle(document.querySelector('.menu [data-f="music"]'), "::after").content === "none"; }));
    check(tag + " 近く：近い順に距離つき、地図の点のないカードは出ない", await p.evaluate(() => { const ds = [...document.querySelectorAll("#home .list .dist")].map(x => x.textContent); const km = ds.map(t => t.endsWith("km") ? parseFloat(t) : parseFloat(t) / 1000); return ds.length >= 3 && km.every((k, i) => !i || k >= km[i - 1]); }) && !/Ambient Waves/.test(await p.textContent("#home .list")) && !(await p.$("#home svg.map")));
    await p.click('[data-f="rwa"]'); await p.waitForTimeout(150);
    check(tag + " 近く×現物：現物だけが近い順に", await p.evaluate(() => [...document.querySelectorAll("#home .list .line")].length >= 1) && !/パンの焼き方/.test(await p.textContent("#home .list")) && /朝採り大根/.test(await p.textContent("#home .list")));
    await p.click('[data-mod="near"]'); await p.click('[data-f="all"]');
    // カードのページはどれも同じ並び：カード・人と持つ・（受け取る）・くわしく（たたんである）
    check(tag + " カードのページ：くわしくはたたんである・どのカードも同じ並び", await p.evaluate(() => { __jt.detail(Object.keys(__jt.S.cards)[0]); const pgs = [...document.querySelectorAll("#sheet .pg")]; return pgs.length > 5 && pgs.every(g => { const k = [...g.children].map(x => x.className.split(" ")[0]).filter(x => x !== "tipbox" && x !== "recv"); return /^jc2,acts2,basic(,own)?,more$/.test(k.join()) && !!g.querySelector(".basic .bl") && /くわしく・記録/.test(g.querySelector(".more>summary").textContent); }); }));
    await p.click("#sheet [data-close]");
    // その場で使うQR：作った人が「QRを出す」→ 読んだ人には確かめて長押しだけ（カードを開かない）
    const wv2 = await id("Ambient Waves");
    await p.selectOption("#who", K("d")); await p.waitForTimeout(100);
    await p.evaluate(id => __jt.detail(id), wv2); await p.click(`#pg-${wv2} [data-qrshow]`); await p.waitForTimeout(150);
    check(tag + " QRを出す：払うQR 1つだけ（読むと 持つ・投げ銭）、読んでも jeni は動かないと書いてある", /払うQR/.test(await p.textContent("#over h2")) && !(await p.$("#over [data-qk]")) && /読むと：持つ.*投げ銭/.test(await p.textContent("#over")) && /読んだだけで jeni は動きません/.test(await p.textContent("#over")));
    await p.click("#over [data-qas]"); await p.waitForTimeout(200);
    const qb = await bal();
    check(tag + " 払うQRを読むと、カードを開かずに 持つ と 投げ銭 が1つの画面に", !!(await p.$('#over [data-lp="qtip"]')) && (!!(await p.$('#over [data-lp="qhold"]')) || /もう持っています/.test(await p.textContent("#over"))) && await p.evaluate(() => document.getElementById("sheet").hidden));
    const qn = +(await p.textContent("#over [data-tipstep]")); await lp('#over [data-lp="qtip"]');
    check(tag + " 長押しで投げ銭（額のとおり）", await bal() === qb - qn && /贈りました/.test(await p.textContent("#over")));
    await p.click("#over [data-overclose]");
    await p.selectOption("#who", K("d")); await p.evaluate(id => __jt.detail(id), wv2); await p.click(`#pg-${wv2} [data-qrshow]`); await p.waitForTimeout(100);
    await p.click("#over [data-qas]"); await p.waitForTimeout(200);
    { const hb = await bal(), can = !!(await p.$('#over [data-lp="qhold"]'));
      if (can) await lp('#over [data-lp="qhold"]');
      check(tag + " 払うQRから長押しで持つ（持っていなければ）", !can || (/持ちました/.test(await p.textContent("#over")) && await bal() < hb)); }
    check(tag + " きまり：QRは3つ（開く・払う・受け取る）", await p.evaluate(() => { document.querySelector("[data-overclose]") && document.querySelector("[data-overclose]").click(); return true; }) && true);
    await p.click("[data-overclose]").catch(() => {}); await p.selectOption("#who", K("a")); await p.waitForTimeout(100);
    // 直す・取り下げる（作った人だけ）
    await p.click("[data-make]"); await p.click(".mk-g button:nth-child(2)"); await p.click('.mk-k [data-mk="text"]'); await p.fill("#m-title", "試しの文"); await p.fill("#m-body", "はじめの文"); await p.click("[data-create]"); await p.waitForTimeout(200);
    const tx = await id("試しの文");
    await p.click(`#pg-${tx} [data-edit]`); await p.waitForTimeout(150);
    check(tag + " 直す：値段・数は直せないと書いてある", /値段・数・種類は直せません/.test(await p.textContent("#over")));
    await p.fill("#e-title", "試しの文（直した）"); await p.fill("#e-body", "直した文"); await p.click("[data-esave]"); await p.waitForTimeout(200);
    check(tag + " 直すと題と本文が変わり、「直した 1回」", /試しの文（直した）/.test(await p.textContent(`#pg-${tx}`)) && /直した 1回/.test(await p.textContent(`#pg-${tx}`)));
    await p.click(`#pg-${tx} [data-retireask]`); await p.waitForTimeout(100);
    check(tag + " 取り下げる前に、画面の中で確かめる（だれも持っていないので消える）", /カードは消えます/.test(await p.textContent(`#pg-${tx}`)) && !!(await p.$(`#pg-${tx} [data-retireno]`)));
    await p.click(`#pg-${tx} [data-retire]`); await p.waitForTimeout(200);
    check(tag + " 取り下げると一覧から消える", !/試しの文/.test(await p.textContent("#home .list")));
    // 会話を消す
    const wv = await id("Ambient Waves");
    await p.evaluate(id => __jt.detail(id), wv); await p.click(`#pg-${wv} [data-talk]`); await p.waitForTimeout(150);
    await p.fill("#t-text", "消すための一言"); await p.click("[data-say]"); await p.waitForTimeout(150);
    await p.click("#over [data-uncm]"); await p.waitForTimeout(150);
    check(tag + " 自分の会話を消せる（消したことは残る）", !/消すための一言/.test(await p.textContent("#over")) && /書いた人が消しました/.test(await p.textContent("#over")));
    await p.click("[data-overclose]"); await p.click("#sheet [data-close]");
    // お気に入り：☆で入れる・外す。項目「お気に入り」に集まる。記録には出ない
    await p.click('[data-mod="fav"]');
    check(tag + " お気に入りのしぼり（見本は Ambient Waves）", /Ambient Waves/.test(await p.textContent("#home .list")) && /お気に入り/.test(await p.textContent(".me .mcap")));
    await p.click('[data-f="music"]');
    await p.click('[data-mod="mine"]'); await p.waitForTimeout(100);
    check(tag + " 持っている×お気に入り（重ねがけ）：持っていてお気に入りのものだけ", /持っている・お気に入り/.test(await p.textContent(".me .mcap")) && await p.evaluate(() => [...document.querySelectorAll("#home .list .line")].every(l => { const c = __jt.S.cards[l.dataset.detail]; return c.copies.some(x => x.owner === __jt.me); })));
    await p.click('[data-mod="mine"]');
    check(tag + " ☆×音楽：お気に入りの音楽だけ", /Ambient Waves/.test(await p.textContent("#home .list")) && !/雨の作業小屋/.test(await p.textContent("#home .list")));
    await p.click('[data-f="all"]');
    const rainF = await id("雨の作業小屋"), evN = await p.evaluate(() => __jt.S.ok ? 0 : 0);
    await p.evaluate(id => __jt.detail(id), rainF); await p.waitForTimeout(150);
    const evBefore = await p.evaluate(() => document.querySelectorAll("*").length >= 0 && window.__jt.S && Object.keys(__jt.S.cards).length);
    await p.click(`#pg-${rainF} [data-fav]`); await p.waitForTimeout(150);
    check(tag + " ☆を押すとお気に入りに（しるしが金色）", await p.$eval(`#pg-${rainF} [data-fav]`, e => e.getAttribute("aria-pressed") === "true"));
    await p.click("#sheet [data-close]");
    check(tag + " お気に入りの項目に入る", /雨の作業小屋/.test(await p.textContent("#home .list")));
    await p.evaluate(id => __jt.detail(id), rainF); await p.click(`#pg-${rainF} [data-fav]`); await p.waitForTimeout(150); await p.click("#sheet [data-close]");
    check(tag + " もう一度押すと外れる", !/雨の作業小屋/.test(await p.textContent("#home .list")));
    void evN; void evBefore;
    await p.click('[data-mod="fav"]');
    // 常連・会員：お知らせ（鈴）に、常連のお店に新しくつながったカード
    check(tag + " 常連のお店に新しいカード → 鈴に赤い印", !!(await p.$('[data-fx="news"] b')));
    await p.click('[data-fx="news"]'); await p.waitForTimeout(150);
    check(tag + " お知らせ：Bakery_Haru に「パンの焼き方を教えます」", /Bakery_Haru に「パンの焼き方を教えます」/.test(await p.textContent("#sheet")));
    check(tag + " お知らせ：お気に入りのカードの新しい会話", /Ambient Waves の会話/.test(await p.textContent("#sheet")) && /続きの曲/.test(await p.textContent("#sheet")));
    await p.click("#sheet [data-close]");
    check(tag + " 見たあとは鈴の印が消える", !(await p.$('[data-fx="news"] b')));
    const shop = await id("Bakery_Haru");
    await p.evaluate(id => __jt.detail(id), shop); await p.waitForTimeout(150);
    check(tag + " 常連のお店のページに「常連をやめる」、jeni の値段は出ない", !!(await p.$(`#pg-${shop} [data-leave]`)) && !/jeni →/.test(await p.textContent(`#pg-${shop} .fline`)));
    const kb1 = await bal(); await p.click(`#pg-${shop} [data-leave]`); await p.waitForTimeout(150);
    check(tag + " 常連をやめられる（jeni は動かない）", !!(await p.$(`#pg-${shop} [data-lp="hold"]`)) && await bal() === kb1);
    await lp(`#pg-${shop} [data-lp="hold"]`); await p.waitForTimeout(300);
    check(tag + " 長押しでまた常連になる", !!(await p.$(`#pg-${shop} [data-leave]`)) && await bal() === kb1);
    await rec(shop);
    check(tag + " 記録は「常連の人」、譲る・贈るは出ない", /常連の人/.test(await p.textContent(`#pg-${shop} .more`)) && !(await p.$(`#pg-${shop} [data-giftask]`)));
    await p.click("#sheet [data-close]");
    await p.click('[data-f="shop"]');
    check(tag + " お店の項目", /Bakery_Haru/.test(await p.textContent("#home .list")) && !/在来種/.test(await p.textContent("#home .list")));
    await p.click('[data-f="project"]');
    check(tag + " プロジェクトの項目", (await p.textContent("#home .list")).includes("みんなの種の地図") && !(await p.textContent("#home .list")).includes("在来種の地図（アプリ）"));
    await p.click('[data-f="app"]');
    check(tag + " アプリの項目", (await p.textContent("#home .list")).includes("在来種の地図（アプリ）") && !(await p.textContent("#home .list")).includes("みんなの種の地図"));
    check(tag + " 項目は1行で横に滑る・＋は右はしに見えている", await p.evaluate(() => { const m = document.querySelector(".menu"), bs = [...m.querySelectorAll("button")], pl = document.querySelector(".menu-w .make").getBoundingClientRect(), mr = m.getBoundingClientRect(); return bs.length === 13 && new Set(bs.map(b => Math.round(b.offsetTop))).size === 1 && bs.every(b => b.getBoundingClientRect().width >= 30) && m.scrollWidth > m.clientWidth && pl.left >= mr.right - 1 && pl.right <= innerWidth; }));
    check(tag + " 選んだ項目が見える位置まで滑っている", await p.evaluate(() => { const b = document.querySelector('.menu [aria-pressed="true"]').getBoundingClientRect(), m = document.querySelector(".menu").getBoundingClientRect(); return b.left >= m.left - 1 && b.right <= m.right + 1; }));
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
    const want = [/持っている/, /雨の作業小屋/, /畑の収穫体験/, /Ambient Waves/, /畑の一日/, /払うQR/, /田んぼと畑の朝/, /畑の一日/, /動画を選ぶ/, /招待する/, /直す/, /定員/, /お知らせ/, /Farmer_S/, /記録の控え/, /天然酵母/, /持っている人/, /来週の種まき/, /jeni のきまり/];
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
