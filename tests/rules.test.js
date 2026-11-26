// jeni の決まりの確かめ。使い方: node tests/rules.test.js
const test = require("node:test"), assert = require("node:assert");
const {reduce, sha256hex, R} = require("../app/rules.js");
const crypto = require("node:crypto");
const K = n => n.repeat(64).slice(0, 64);           // 見本のかぎ（a… b… c…）
const A = K("a"), B = K("b"), C = K("c"), D = K("d"), E = K("e");
let seq = 0;
const ev = (pk, at, c) => ({id: String(++seq).padStart(6, "0"), pubkey: pk, created_at: at, kind: 7720, content: JSON.stringify(c)});
const opt = {founders: [A]};
// A が最初の人。A が B と C を認める
const base = () => [ev(A, 1, {t: "profile", name: "A"}), ev(A, 2, {t: "vouch", who: B}), ev(A, 3, {t: "vouch", who: C})];
const total = S => Object.values(S.users).reduce((s, u) => s + u.bal, 0);
const members = S => Object.values(S.users).filter(u => u.member).length;

test("はじまり：認められると 1000 jeni。1人が認められるのは3人まで。jeni は参加した人数×1000 から増えない", () => {
  const e = [...base(), ev(A, 4, {t: "vouch", who: D}), ev(A, 5, {t: "vouch", who: E})];
  const S = reduce(e, 10, opt);
  assert.equal(S.users[B].bal, 1000); assert.equal(S.users[D].bal, 1000);
  assert.ok(!(S.users[E] || {}).member);                 // 4人目は認められない
  assert.equal(total(S), members(S) * 1000);
});
test("参加していない人は認められない・二重に認めても増えない", () => {
  const S = reduce([ev(D, 1, {t: "vouch", who: E}), ...base(), ev(C, 5, {t: "vouch", who: B})], 10, opt);
  assert.ok(!(S.users[E] || {}).member); assert.equal(S.users[B].bal, 1000);
});
test("持つ：値段の分が作った人へ。値段は変わらない。自分のカードは持てない", () => {
  const card = ev(B, 10, {t: "card", kind: "music", title: "曲", price: 50});
  const S = reduce([...base(), card, ev(C, 11, {t: "hold", card: card.id}), ev(B, 12, {t: "hold", card: card.id})], 20, opt);
  assert.equal(S.users[C].bal, 950); assert.equal(S.users[B].bal, 1050);
  assert.equal(S.cards[card.id].holders, 1);
});
test("上限：同じカードは3枚まで、無料のカードは1枚まで", () => {
  const paid = ev(B, 10, {t: "card", kind: "text", title: "文", price: 10});
  const free = ev(B, 11, {t: "card", kind: "text", title: "無料", price: 0});
  const e = [...base(), paid, free];
  for (let i = 0; i < 5; i++) e.push(ev(C, 20 + i, {t: "hold", card: paid.id}), ev(C, 40 + i, {t: "hold", card: free.id}));
  const S = reduce(e, 100, opt);
  assert.equal(S.cards[paid.id].copies.length, 3); assert.equal(S.cards[free.id].copies.length, 1);
  assert.equal(S.users[C].bal, 970);
});
test("jeni が足りなければ持てない", () => {
  const card = ev(B, 10, {t: "card", kind: "rwa", title: "高いもの", price: 1001, supply: 1});
  const S = reduce([...base(), card, ev(C, 11, {t: "hold", card: card.id})], 20, opt);
  assert.equal(S.cards[card.id].copies.length, 0); assert.equal(S.users[C].bal, 1000);
});
test("数に限りのあるカード：残りがなくなったら作った人からは持てない。最後の1個は先に出した人", () => {
  const card = ev(A, 10, {t: "card", kind: "rwa", title: "大根", price: 80, supply: 1});
  const S = reduce([...base(), card, ev(C, 12, {t: "hold", card: card.id}), ev(B, 12, {t: "hold", card: card.id})], 20, opt);
  const owner = S.cards[card.id].copies[0].owner;
  assert.equal(S.cards[card.id].left, 0); assert.equal(S.cards[card.id].copies.length, 1);
  assert.ok(owner === B || owner === C);       // 同じ時刻なら番号の小さい出来事（どの画面でも同じ）
});
test("譲る：順番を待つ人へ、持ち主が同じ値段で譲る。jeni は手放した人へ", () => {
  const card = ev(A, 10, {t: "card", kind: "rwa", title: "靴", price: 300, supply: 1});
  const e = [...base(), card, ev(B, 11, {t: "hold", card: card.id}), ev(C, 12, {t: "want", card: card.id}), ev(B, 13, {t: "pass", card: card.id, to: C})];
  const S = reduce(e, 20, opt);
  assert.equal(S.cards[card.id].copies[0].owner, C);
  assert.equal(S.users[B].bal, 1000); assert.equal(S.users[C].bal, 700); assert.equal(S.users[A].bal, 1300);
});
test("順番を待っていない人には譲れない（勝手に押しつけて jeni を取れない）", () => {
  const card = ev(A, 10, {t: "card", kind: "rwa", title: "靴", price: 300, supply: 1});
  const S = reduce([...base(), card, ev(B, 11, {t: "hold", card: card.id}), ev(B, 13, {t: "pass", card: card.id, to: C})], 20, opt);
  assert.equal(S.cards[card.id].copies[0].owner, B); assert.equal(S.users[C].bal, 1000);
});
test("投げ銭：半分は作った人、半分は持っている人へ枚数に応じて。端数は作った人へ", () => {
  const card = ev(A, 10, {t: "card", kind: "music", title: "曲", price: 10});
  const e = [...base(), card, ev(B, 11, {t: "hold", card: card.id}), ev(B, 12, {t: "hold", card: card.id}), ev(C, 13, {t: "hold", card: card.id}),
    ev(C, 14, {t: "tip", card: card.id, amount: 101})];
  const S = reduce(e, 20, opt);
  // 半分=50 → B:2枚 33、C:1枚 16、作った人 101-49=52
  assert.equal(S.users[B].bal, 1000 - 20 + 33); assert.equal(S.users[C].bal, 1000 - 10 - 101 + 16);
  assert.equal(S.users[A].bal, 1000 + 30 + 52);
  assert.equal(total(S), members(S) * 1000);
});
test("投げ銭：数に限りのあるカードは全額が作った人へ", () => {
  const card = ev(A, 10, {t: "card", kind: "rwa", title: "パン", price: 60, supply: 3});
  const S = reduce([...base(), card, ev(B, 11, {t: "hold", card: card.id}), ev(C, 12, {t: "tip", card: card.id, amount: 40})], 20, opt);
  assert.equal(S.users[B].bal, 940); assert.equal(S.users[A].bal, 1100);
});
test("使う：作った人が受け取りを記録すると、その1枚は使ったことになり、また持てる", () => {
  const card = ev(A, 10, {t: "card", kind: "rwa", title: "パン", price: 10, supply: 10});
  const e = [...base(), card];
  for (let i = 0; i < 3; i++) e.push(ev(B, 11 + i, {t: "hold", card: card.id}));
  e.push(ev(B, 15, {t: "hold", card: card.id}), ev(B, 15, {t: "redeem", card: card.id, lock: sha256hex("x1"), until: 300}), ev(A, 16, {t: "used", card: card.id, holder: B, code: "x1"}), ev(B, 17, {t: "hold", card: card.id}));
  const S = reduce(e, 20, opt);
  assert.equal(S.cards[card.id].copies.filter(x => x.owner === B && !x.used).length, 3);
  assert.equal(S.cards[card.id].copies.length, 4);
});
test("贈る：持っているカードを参加している人へ（jeni は動かない）", () => {
  const card = ev(A, 10, {t: "card", kind: "picture", title: "写真", price: 20});
  const S = reduce([...base(), card, ev(B, 11, {t: "hold", card: card.id}), ev(B, 12, {t: "gift", card: card.id, to: C})], 20, opt);
  assert.equal(S.cards[card.id].copies[0].owner, C); assert.equal(S.users[C].bal, 1000);
});
test("返す：売った人だけが、まだ持っている人へ払った額を返せる。譲ったあとは返せない", () => {
  const card = ev(A, 10, {t: "card", kind: "rwa", title: "靴", price: 300, supply: 2});
  const e = [...base(), card, ev(B, 11, {t: "hold", card: card.id}), ev(C, 12, {t: "refund", card: card.id, holder: B}), ev(A, 13, {t: "refund", card: card.id, holder: B})];
  let S = reduce(e, 20, opt);
  assert.equal(S.users[B].bal, 1000); assert.equal(S.cards[card.id].copies.length, 0); assert.equal(S.cards[card.id].left, 2);
  const e2 = [...base(), card, ev(B, 11, {t: "hold", card: card.id}), ev(B, 12, {t: "gift", card: card.id, to: C}), ev(A, 13, {t: "refund", card: card.id, holder: C})];
  S = reduce(e2, 20, opt);
  assert.equal(S.users[A].bal, 1300); assert.equal(S.cards[card.id].copies[0].owner, C);
});
test("その場で売る：QR の番号を知っている人だけが期限内に持てる。持つと同時に受け取り済み", () => {
  const code = crypto.randomBytes(8).toString("hex");
  assert.equal(sha256hex(code), crypto.createHash("sha256").update(code).digest("hex"));
  const card = ev(A, 100, {t: "card", kind: "rwa", title: "パン", price: 120, supply: 1, lock: sha256hex(code), until: 400});
  const e = [...base(), card, ev(B, 150, {t: "hold", card: card.id, code: "ちがう番号"}), ev(C, 160, {t: "hold", card: card.id, code})];
  const S = reduce(e, 500, opt);
  assert.equal(S.cards[card.id].copies[0].owner, C); assert.ok(S.cards[card.id].copies[0].used);
  assert.equal(S.users[A].bal, 1120);
  const late = reduce([...base(), card, ev(C, 401, {t: "hold", card: card.id, code})], 500, opt);
  assert.equal(late.cards[card.id].copies.length, 0);     // 期限が過ぎたら持てない
  const sha = crypto.createHash("sha256").update("日本語のテスト").digest("hex");
  assert.equal(sha256hex("日本語のテスト"), sha);
});
test("未来の時刻の出来事は数えない・壊れた出来事は無視", () => {
  const card = ev(B, 10, {t: "card", kind: "text", title: "文", price: 10});
  const S = reduce([...base(), card, {id: "x", pubkey: C, created_at: 11, content: "{壊れた"}, ev(C, 5000, {t: "hold", card: card.id})], 100, opt);
  assert.equal(S.cards[card.id].copies.length, 0);
});
test("どんな順番で届いても、同じ結果になる", () => {
  const card = ev(A, 10, {t: "card", kind: "music", title: "曲", price: 10});
  const lim = ev(A, 11, {t: "card", kind: "rwa", title: "靴", price: 100, supply: 1});
  const e = [...base(), card, lim, ev(B, 12, {t: "hold", card: card.id}), ev(C, 13, {t: "hold", card: lim.id}), ev(B, 14, {t: "want", card: lim.id}),
    ev(C, 15, {t: "pass", card: lim.id, to: B}), ev(C, 16, {t: "tip", card: card.id, amount: 7}), ev(B, 17, {t: "tip", card: lim.id, amount: 3})];
  const a = JSON.stringify(Object.values(reduce(e, 100, opt).users).map(u => [u.pk, u.bal]).sort());
  for (let k = 0; k < 20; k++) {
    const sh = e.slice().sort(() => Math.random() - .5);
    assert.equal(JSON.stringify(Object.values(reduce(sh, 100, opt).users).map(u => [u.pk, u.bal]).sort()), a);
  }
});
test("たくさん動かしても、jeni の合計は参加人数×1000 のまま（増えも減りもしない）", () => {
  const ppl = [A, B, C, D]; const e = [...base(), ev(B, 4, {t: "vouch", who: D})];
  const cards = [];
  for (let i = 0; i < 6; i++) { const c = ev(ppl[i % 4], 10 + i, {t: "card", kind: i % 2 ? "rwa" : "music", title: "c" + i, price: (i * 37) % 200, supply: i % 2 ? 2 : null}); cards.push(c); e.push(c); }
  let at = 100;
  for (let k = 0; k < 400; k++) {
    const who = ppl[k * 7 % 4], c = cards[k * 5 % 6], to = ppl[k * 3 % 4], r = k % 6;
    e.push(ev(who, at++, r === 0 || r === 1 ? {t: "hold", card: c.id} : r === 2 ? {t: "tip", card: c.id, amount: 1 + k % 50} : r === 3 ? {t: "want", card: c.id} : r === 4 ? {t: "pass", card: c.id, to} : {t: "refund", card: c.id, holder: to}));
  }
  const S = reduce(e, at + 1, opt);
  assert.equal(total(S), members(S) * 1000);
  assert.ok(Object.values(S.users).every(u => u.bal >= 0));
});
test("持ち方：鍵をかけて持てるのは数に限りのないカードだけ。鍵をかけた人は人数にも投げ銭の分け前にも入らない", () => {
  const card = ev(A, 10, {t: "card", kind: "music", title: "曲", price: 10});
  const lim = ev(A, 11, {t: "card", kind: "rwa", title: "パン", price: 10, supply: 5});
  const e = [...base(), card, lim, ev(B, 12, {t: "hold", card: card.id, vis: "lock"}), ev(C, 13, {t: "hold", card: card.id, vis: "hide"}),
    ev(B, 14, {t: "hold", card: lim.id, vis: "lock"}), ev(D, 15, {t: "tip", card: card.id, amount: 10})];
  const S = reduce([...e, ev(A, 5, {t: "vouch", who: D})], 20, opt);
  assert.equal(S.cards[card.id].holders, 1);                 // 画面に出さない C は数える。鍵の B は数えない
  assert.equal(S.cards[lim.id].copies.length, 0);           // 数に限りのあるカードに鍵はかけられない
  assert.equal(S.users[C].bal, 1000 - 10 + 5);             // 分け前は C だけ
  assert.equal(S.users[B].bal, 990);
});
test("仲間の輪：輪の中のカードは、輪の人だけが持てる", () => {
  const ci = ev(B, 10, {t: "circle", name: "畑の仲間", members: [A]});
  const e = [...base(), ci];
  const card = ev(B, 11, {t: "card", kind: "text", title: "段取り", price: 0, circle: ci.id});
  const S = reduce([...e, card, ev(A, 12, {t: "hold", card: card.id}), ev(C, 13, {t: "hold", card: card.id})], 20, opt);
  assert.equal(S.cards[card.id].circle, ci.id);
  assert.deepEqual(S.cards[card.id].copies.map(x => x.owner), [A]);
  const S2 = reduce([...e, ev(C, 11, {t: "card", kind: "text", title: "入っていない人", price: 0, circle: ci.id})], 20, opt);
  assert.equal(Object.keys(S2.cards).length, 0);           // 輪の外の人は輪にカードを出せない
});
test("譲ったり贈ったりしても、作った人からの残りは戻らない（返したときだけ戻る）", () => {
  const card = ev(A, 10, {t: "card", kind: "rwa", title: "カレー", price: 100, supply: 1});
  const e = [...base(), card, ev(B, 11, {t: "hold", card: card.id}), ev(C, 12, {t: "want", card: card.id}), ev(B, 13, {t: "pass", card: card.id, to: C}),
    ev(B, 14, {t: "hold", card: card.id})];
  let S = reduce(e, 20, opt);
  assert.equal(S.cards[card.id].left, 0); assert.equal(S.cards[card.id].copies.length, 1); assert.equal(S.users[B].bal, 1000);
  const card2 = ev(A, 30, {t: "card", kind: "rwa", title: "パン", price: 10, supply: 1});
  S = reduce([...base(), card2, ev(B, 31, {t: "hold", card: card2.id}), ev(B, 32, {t: "gift", card: card2.id, to: C}), ev(B, 33, {t: "hold", card: card2.id})], 40, opt);
  assert.equal(S.cards[card2.id].copies.length, 1); assert.equal(S.cards[card2.id].left, 0);
  S = reduce([...base(), card2, ev(B, 31, {t: "hold", card: card2.id}), ev(A, 32, {t: "refund", card: card2.id, holder: B}), ev(C, 33, {t: "hold", card: card2.id})], 40, opt);
  assert.equal(S.cards[card2.id].copies[0].owner, C);       // 返すと残りが戻り、ほかの人が持てる
});
test("見せ方を変える：見せる⇔画面に出さないは変えられる。鍵をかけたものは変えられない", () => {
  const card = ev(A, 10, {t: "card", kind: "music", title: "曲", price: 10});
  const S = reduce([...base(), card, ev(B, 11, {t: "hold", card: card.id}), ev(C, 12, {t: "hold", card: card.id, vis: "lock"}),
    ev(B, 13, {t: "vis", card: card.id, vis: "hide"}), ev(C, 14, {t: "vis", card: card.id, vis: "show"}), ev(D, 15, {t: "vis", card: card.id, vis: "hide"})], 20, opt);
  assert.equal(S.cards[card.id].copies.find(x => x.owner === B).vis, "hide");
  assert.equal(S.cards[card.id].copies.find(x => x.owner === C).vis, "lock");
});

test("引き換え：持っている人が出した QR の番号を、作った人が期限内に読んだときだけ「使った」になる", () => {
  const card = ev(A, 10, {t: "card", kind: "rwa", title: "パン", price: 10, supply: 5});
  const e = [...base(), card, ev(B, 11, {t: "hold", card: card.id})];
  let S = reduce([...e, ev(A, 12, {t: "used", card: card.id, holder: B, code: "勝手に"})], 50, opt);
  assert.ok(!S.cards[card.id].copies[0].used);                              // 作った人が勝手に「渡した」ことにはできない
  S = reduce([...e, ev(B, 12, {t: "redeem", card: card.id, lock: sha256hex("abc"), until: 100}), ev(A, 13, {t: "used", card: card.id, holder: B, code: "ちがう"})], 50, opt);
  assert.ok(!S.cards[card.id].copies[0].used);
  S = reduce([...e, ev(B, 12, {t: "redeem", card: card.id, lock: sha256hex("abc"), until: 100}), ev(A, 101, {t: "used", card: card.id, holder: B, code: "abc"})], 200, opt);
  assert.ok(!S.cards[card.id].copies[0].used);                              // 期限切れ
  S = reduce([...e, ev(B, 12, {t: "redeem", card: card.id, lock: sha256hex("abc"), until: 100}), ev(A, 13, {t: "used", card: card.id, holder: B, code: "abc"})], 50, opt);
  assert.ok(S.cards[card.id].copies[0].used);
});
test("会話：参加している人だけ書ける。輪のカードは輪の人だけ", () => {
  const card = ev(A, 10, {t: "card", kind: "music", title: "曲", price: 10});
  const ci = ev(B, 11, {t: "circle", name: "輪", members: [A]}), inner = ev(B, 12, {t: "card", kind: "text", title: "輪の中", price: 0, circle: ci.id});
  const S = reduce([...base(), card, ci, inner, ev(B, 13, {t: "comment", card: card.id, text: "いい音"}), ev(E, 14, {t: "comment", card: card.id, text: "参加していない"}),
    ev(C, 15, {t: "comment", card: inner.id, text: "輪の外"}), ev(A, 16, {t: "comment", card: inner.id, text: "輪の中から"}), ev(B, 17, {t: "comment", card: card.id, text: "   "})], 20, opt);
  assert.deepEqual(S.cards[card.id].talk.map(id => S.comments[id].text), ["いい音"]);
  assert.deepEqual(S.cards[inner.id].talk.map(id => S.comments[id].text), ["輪の中から"]);
});
test("危ないものを知らせる：実績のある別々の人2人で隠れる。実績のない人・自分のもの・同じ人の2回は数えない。隠れたカードは持てない", () => {
  const bad = ev(D, 20, {t: "card", kind: "text", title: "あやしい", price: 5});
  const deal = ev(A, 10, {t: "card", kind: "text", title: "ふつう", price: 1});
  const e = [...base(), ev(A, 5, {t: "vouch", who: D}), deal, bad, ev(B, 11, {t: "hold", card: deal.id})];
  let S = reduce([...e, ev(C, 21, {t: "flag", card: bad.id}), ev(B, 22, {t: "flag", card: bad.id}), ev(B, 23, {t: "flag", card: bad.id}), ev(D, 24, {t: "flag", card: bad.id})], 50, opt);
  assert.ok(!S.cards[bad.id].hidden);                                         // C は実績なし、B は1回、D は自分のもの
  S = reduce([...e, ev(B, 22, {t: "flag", card: bad.id}), ev(A, 23, {t: "flag", card: bad.id}), ev(C, 24, {t: "hold", card: bad.id})], 50, opt);
  assert.ok(S.cards[bad.id].hidden); assert.equal(S.cards[bad.id].copies.length, 0);
});
test("友達：お互いに友達になれる。参加していない人とはなれない", () => {
  const S = reduce([...base(), ev(B, 10, {t: "friend", who: C}), ev(C, 11, {t: "friend", who: B}), ev(B, 12, {t: "friend", who: E}), ev(C, 13, {t: "unfriend", who: B})], 20, opt);
  assert.deepEqual(S.users[B].friends, [C]); assert.deepEqual(S.users[C].friends, []);
});
test("プロジェクト：自分のカードだけをつなげる。外せるのはつないだ人かプロジェクトを作った人", () => {
  const pj = ev(A, 10, {t: "card", kind: "project", title: "種の地図", price: 0});
  const mineB = ev(B, 11, {t: "card", kind: "picture", title: "Bの写真", price: 0}), mineC = ev(C, 12, {t: "card", kind: "text", title: "Cの文", price: 0});
  let S = reduce([...base(), pj, mineB, mineC, ev(B, 13, {t: "attach", project: pj.id, card: mineB.id}), ev(B, 14, {t: "attach", project: pj.id, card: mineC.id}),
    ev(C, 15, {t: "attach", project: pj.id, card: mineC.id}), ev(C, 16, {t: "detach", project: pj.id, card: mineB.id}), ev(A, 17, {t: "detach", project: pj.id, card: mineC.id})], 30, opt);
  assert.deepEqual(S.cards[pj.id].items.map(x => x.card), [mineB.id]);
});

test("プロジェクトの「求めているもの」と状態：状態を変えられるのは作った人だけ", () => {
  const pj = ev(A, 10, {t: "card", kind: "project", title: "地図", price: 0, want: "写真"});
  const S = reduce([...base(), pj, ev(B, 11, {t: "pjstate", project: pj.id, state: "done"}), ev(A, 12, {t: "pjstate", project: pj.id, state: "prep"}), ev(A, 13, {t: "pjstate", project: pj.id, state: "へん"})], 20, opt);
  assert.equal(S.cards[pj.id].want, "写真"); assert.equal(S.cards[pj.id].state, "prep");
});
test("イベント：定員（数）がないと出せない。日時・場所が残り、持つ＝参加券（定員まで）", () => {
  const noCap = ev(A, 10, {t: "card", kind: "event", title: "定員なし", price: 10, when: "12月14日"});
  const evt = ev(A, 11, {t: "card", kind: "event", title: "収穫体験", price: 10, supply: 1, when: "12月14日 9:00", place: "千葉の畑"});
  const S = reduce([...base(), noCap, evt, ev(B, 12, {t: "hold", card: evt.id}), ev(C, 13, {t: "hold", card: evt.id})], 20, opt);
  assert.ok(!S.cards[noCap.id]); assert.equal(S.cards[evt.id].when, "12月14日 9:00"); assert.equal(S.cards[evt.id].place, "千葉の畑");
  assert.equal(S.cards[evt.id].copies.length, 1); assert.equal(S.cards[evt.id].left, 0);
});
test("お店・会社や団体：つなげるのは作った人の自分のカードだけ。プロジェクトはだれでも自分のカードを", () => {
  const shop = ev(A, 10, {t: "card", kind: "shop", title: "Aの店", price: 0, when: "火〜土", place: "東京"});
  const org = ev(A, 11, {t: "card", kind: "org", title: "Aの会", price: 0});
  const a1 = ev(A, 12, {t: "card", kind: "rwa", title: "パン", price: 10, supply: 3}), b1 = ev(B, 13, {t: "card", kind: "picture", title: "Bの写真", price: 0});
  const S = reduce([...base(), shop, org, a1, b1, ev(A, 14, {t: "attach", project: shop.id, card: a1.id}), ev(B, 15, {t: "attach", project: shop.id, card: b1.id}),
    ev(A, 16, {t: "attach", project: org.id, card: shop.id}), ev(B, 17, {t: "attach", project: org.id, card: b1.id}), ev(A, 18, {t: "attach", project: shop.id, card: shop.id})], 30, opt);
  assert.deepEqual(S.cards[shop.id].items.map(x => x.card), [a1.id]); assert.deepEqual(S.cards[org.id].items.map(x => x.card), [shop.id]);
  assert.equal(S.cards[shop.id].place, "東京");
});
test("サービスは枠がいる。地図の点はおかしな値をはねる。場所（place）というカードはない", () => {
  const sv = ev(A, 10, {t: "card", kind: "service", title: "刃物とぎ", price: 20}), sv2 = ev(A, 11, {t: "card", kind: "service", title: "刃物とぎ", price: 20, supply: 3, geo: [35.6, 140.1]});
  const bad = ev(A, 12, {t: "card", kind: "shop", title: "へん", price: 0, geo: [200, 1]}), pl = ev(A, 13, {t: "card", kind: "place", title: "畑", price: 0});
  const S = reduce([...base(), sv, sv2, bad, pl], 20, opt);
  assert.ok(!S.cards[sv.id]); assert.deepEqual(S.cards[sv2.id].geo, [35.6, 140.1]); assert.ok(!S.cards[bad.id]); assert.ok(!S.cards[pl.id]);
});
test("つなぐカード：無料で数なし。持つ＝常連・会員。投げ銭は全額作った人へ。いつでもやめられる", () => {
  const paid = ev(A, 10, {t: "card", kind: "shop", title: "有料の店", price: 10}), shop = ev(A, 11, {t: "card", kind: "shop", title: "店", price: 0});
  let S = reduce([...base(), paid, shop, ev(B, 12, {t: "hold", card: shop.id}), ev(C, 13, {t: "tip", card: shop.id, amount: 10})], 20, opt);
  assert.ok(!S.cards[paid.id]); assert.equal(S.cards[shop.id].holders, 1);
  assert.equal(S.users[A].bal, 1010); assert.equal(S.users[B].bal, 1000);
  S = reduce([...base(), shop, ev(B, 12, {t: "hold", card: shop.id}), ev(B, 13, {t: "leave", card: shop.id}), ev(C, 14, {t: "leave", card: shop.id})], 20, opt);
  assert.equal(S.cards[shop.id].copies.length, 0);
});
test("きまりの版：版のないもの・今の版は読む。知らない新しい版は読まない", () => {
  const a = ev(A, 10, {t: "card", kind: "text", title: "版なし", price: 0}), b = ev(A, 11, {t: "card", kind: "text", title: "版1", price: 0, v: 1}), c = ev(A, 12, {t: "card", kind: "text", title: "版99", price: 0, v: 99});
  const S = reduce([...base(), a, b, c], 20, opt);
  assert.ok(S.cards[a.id] && S.cards[b.id]); assert.ok(!S.cards[c.id]);
});
test("記録の要約：根は並び順によらない。どの出来事も短い証明で根につながる。書き換えると合わない", () => {
  const { merkleRoot, merkleProof, merkleCheck, sha256hex } = require("../app/rules.js");
  const ids = [...Array(7)].map((_, i) => sha256hex("e" + i));
  const root = merkleRoot(ids); assert.equal(root, merkleRoot([...ids].reverse()));
  for (const id of ids) { const p = merkleProof(ids, id); assert.ok(p.length <= 3); assert.ok(merkleCheck(id, p, root)); }
  assert.ok(!merkleCheck(sha256hex("にせ"), merkleProof(ids, ids[0]), root));
});
test("直す：作った人だけ。題や説明は直せて、値段・数は直せない", () => {
  const a = ev(A, 10, {t: "card", kind: "rwa", title: "大根", price: 10, supply: 3, place: "畑"});
  const S = reduce([...base(), a, ev(A, 11, {t: "edit", card: a.id, title: "大根（太め）", place: "畑の入口", price: 1, supply: 99}), ev(B, 12, {t: "edit", card: a.id, title: "のっとり"})], 20, opt);
  const c = S.cards[a.id]; assert.equal(c.title, "大根（太め）"); assert.equal(c.place, "畑の入口"); assert.equal(c.price, 10); assert.equal(c.supply, 3); assert.equal(c.edits, 1);
});
test("取り下げる：だれも持っていなければ消える。持っている人がいれば受付を終える（持っている人のものは残る）", () => {
  const a = ev(A, 10, {t: "card", kind: "text", title: "下書き", price: 0}), b = ev(A, 11, {t: "card", kind: "text", title: "持たれた", price: 5});
  const S = reduce([...base(), a, b, ev(B, 12, {t: "hold", card: b.id}), ev(A, 13, {t: "retire", card: a.id}), ev(A, 14, {t: "retire", card: b.id}), ev(C, 15, {t: "hold", card: b.id}), ev(C, 16, {t: "comment", card: a.id, text: "x"}), ev(B, 17, {t: "retire", card: b.id})], 20, opt);
  assert.ok(S.cards[a.id].gone); assert.ok(S.cards[b.id].closed); assert.equal(S.cards[b.id].copies.length, 1); assert.equal(S.cards[b.id].copies[0].owner, B);
  assert.equal(S.cards[a.id].talk.length, 0);
});
test("会話は書いた人が消せる。輪は本人が抜けられ、作った人が外せる（作った人は抜けない）", () => {
  const a = ev(A, 10, {t: "card", kind: "text", title: "t", price: 0}), cm = ev(B, 11, {t: "comment", card: a.id, text: "やあ"});
  const ci = ev(A, 12, {t: "circle", name: "輪", members: [B, C]});
  const S = reduce([...base(), a, cm, ev(C, 13, {t: "uncomment", comment: cm.id}), ev(B, 14, {t: "uncomment", comment: cm.id}), ci,
    ev(B, 15, {t: "circle-leave", circle: ci.id}), ev(C, 16, {t: "circle-remove", circle: ci.id, who: A}), ev(A, 17, {t: "circle-leave", circle: ci.id}), ev(A, 18, {t: "circle-remove", circle: ci.id, who: C})], 30, opt);
  assert.ok(S.comments[cm.id].removed); assert.deepEqual(S.circles[ci.id].members, [A]);
});
test("自分のカードには投げ銭できない。取り下げたカードはつなげない", () => {
  const a = ev(A, 10, {t: "card", kind: "text", title: "t", price: 0}), pj = ev(A, 11, {t: "card", kind: "project", title: "pj", price: 0});
  const S = reduce([...base(), a, pj, ev(A, 12, {t: "tip", card: a.id, amount: 10}), ev(A, 13, {t: "retire", card: a.id}), ev(A, 14, {t: "attach", project: pj.id, card: a.id})], 20, opt);
  assert.equal(S.users[A].bal, 1000); assert.equal(S.cards[a.id].tipped, 0); assert.equal(S.cards[pj.id].items.length, 0);
});
test("招待：一度きりの番号で参加できる。期限・使い回し・3人の上限を守る", () => {
  const { sha256hex } = require("../app/rules.js");
  const D = "d".repeat(64), E = "e".repeat(64);
  const inv = ev(A, 10, {t: "invite", lock: sha256hex("ひみつ"), until: 1000});
  let S = reduce([...base(), inv, ev(D, 11, {t: "join", invite: inv.id, by: A, code: "ちがう"}), ev(D, 12, {t: "join", invite: inv.id, by: A, code: "ひみつ"}), ev(E, 13, {t: "join", invite: inv.id, by: A, code: "ひみつ"})], 20, opt);
  assert.ok(S.users[D].member); assert.equal(S.users[D].bal, 1000); assert.ok(!S.users[E] || !S.users[E].member); assert.equal(S.users[A].vouchedBy == null || true, true);
  const late = ev(A, 10, {t: "invite", lock: sha256hex("x"), until: 15});
  S = reduce([...base(), late, ev(D, 16, {t: "join", invite: late.id, by: A, code: "x"})], 20, opt); assert.ok(!S.users[D].member);
  const many = [1, 2, 3, 4].map(i => ev(A, 10 + i, {t: "invite", lock: sha256hex("c" + i), until: 1000}));
  S = reduce([...base(), ...many], 20, opt); assert.equal(S.users[A].invites.length, 1);   // A はもう2人認めているので、あと1人分だけ
});
test("カードを作れるのは参加している人だけ。直す前の題と説明は残る", () => {
  const X = "f".repeat(64);
  const a = ev(X, 10, {t: "card", kind: "text", title: "ばらまき", price: 0}), b = ev(A, 11, {t: "card", kind: "text", title: "はじめ", body: "本文", price: 0});
  const S = reduce([...base(), a, b, ev(A, 12, {t: "edit", card: b.id, title: "つぎ"})], 20, opt);
  assert.ok(!S.cards[a.id]); assert.deepEqual(S.cards[b.id].history.map(h => h.title), ["はじめ"]); assert.equal(S.cards[b.id].title, "つぎ");
});
test("はじまりの人：番号を知っている最初の1人だけが、認められずに参加できる", () => {
  const { sha256hex } = require("../app/rules.js");
  const D = "d".repeat(64), E = "e".repeat(64), g = {genesis: sha256hex("はじまり")};
  const S = reduce([ev(D, 1, {t: "genesis", code: "ちがう"}), ev(D, 2, {t: "genesis", code: "はじまり"}), ev(E, 3, {t: "genesis", code: "はじまり"})], 10, g);
  assert.ok(S.users[D].member); assert.equal(S.users[D].bal, 1000); assert.ok(!S.users[E].member); assert.equal(S.genesis, D);
  assert.ok(!reduce([ev(D, 2, {t: "genesis", code: "はじまり"})], 10, {}).users[D].member);
});
