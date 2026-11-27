// jeni の決まり（試験版）。署名つきの出来事（イベント）の並びから、だれが計算しても同じ状態になる。
// 運営もサーバーもいない。決まりに合わない出来事は、どの画面でも同じように無視される。
//
// jeni の5つのきまり
//  1 はじまり：認められて参加すると、決まった量の jeni が届く（jeni が新しく生まれるのはここだけ）
//  2 持つ　　：持つと、カードに書かれたものを受け取れる。作った人から持つと、値段の分の jeni が作った人へ。値段はずっと変わらない
//             （デジタルは元のデータを何度でも。現物はそのものを1回。受け取るとなくなるものは「使った」になる）
//  3 譲る　　：数に限りのあるカードは、持っている人から同じ値段で譲り受ける。jeni は手放した人へ
//  4 投げ銭　：半分は作った人へ、半分は持っている人へ（枚数に応じて）。受け取るとなくなるもの（数に限りのあるカード）と、つなぐカードは全額が作った人へ
//  5 上限　　：同じカードは3枚まで（無料のカードは1枚まで）。使うか贈ると、また持てる
"use strict";
(function (root) {
  const R = {
    version: 1,         // きまりの版。出来事には {v: 版} を付ける。版のない出来事は 1 とみなす。知らない（新しすぎる）版は読まない
    start: 1000,        // 参加したときに届く jeni（配る量は使われ方を見て変わることがある。変わるときも全員に同じきまり）
    vouchMax: 3,        // 1人が認められる人数
    capPaid: 3,         // 同じカードを持てる数
    capFree: 1,         // 無料のカードを持てる数
    priceMax: 1000000,
    tipMax: 1000000,
    sendMax: 1000000,   // jeni を直接贈れる額の上限（1回）
    futureSkew: 600,    // 未来の時刻の出来事は、この秒数より先なら無視する
    saleMax: 600,       // その場で売るカードの QR が使える長さ（秒）の上限
    founders: [],       // 最初の人たち（だれにも認められずに参加できる）。試験のはじめに決める
    flagsToHide: 2,     // 危ないカード・会話を隠すのに要る知らせの数（実績のある別々の人から）
    redeemMax: 600,     // 現物を引き換える QR が使える長さ（秒）の上限
    commentMax: 500,
    inviteMax: 7 * 86400,   // 招待のリンク・QR が使える長さ（秒）の上限
  };
  const KINDS = ["rwa", "event", "service", "music", "video", "picture", "text", "app", "shop", "org", "project", "other"];
  // つなぐカード：ほかのカードを束ねる。プロジェクトはだれでも自分のカードをつなげる。お店・会社や団体は、作った人だけが自分のカードをつなぐ
  const BUNDLE = ["project", "shop", "org"], OPEN_BUNDLE = ["project"];
  const COUNTED = ["rwa", "event", "service"];   // 数があるもの（持った人に1回）。イベントの定員・サービスの枠もいる
  const AT = ["rwa", "event", "service", "shop"];   // 日時・場所・地図の点（受け取る場所・会場・お店）を持てるもの
  // カードの裏の QR は、いつも「そのカードを開く」だけ（外のリンクや支払いにはしない：にせの画面へ誘う悪用を防ぎ、読んだだけで jeni が動かないように）
  const isHex = (s, n) => typeof s === "string" && new RegExp(`^[0-9a-f]{${n}}$`).test(s);
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const str = (v, n) => typeof v === "string" ? v.slice(0, n) : "";

  // 小さな SHA-256（その場で売るときの「一度きりの番号」を確かめるため。計算は同期で、どの画面でも同じ）
  function sha256hex(text) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = Array.from(new TextEncoder().encode(text)), len = bytes.length * 8;
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (len >>> (i * 8)) & 255);
    let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bytes.length; o += 64) {
      const w = new Array(64);
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = h.map((v, i) => (v + [a, b, c, d, e, f, g, hh][i]) | 0);
    }
    return h.map(v => (v >>> 0).toString(16).padStart(8, "0")).join("");
  }

  function reduce(events, now, opt = {}) {
    const founders = new Set(opt.founders || R.founders);
    const evs = events.filter(e => e && e.created_at <= now + R.futureSkew).slice()
      .sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1));
    const S = {users: {}, cards: {}, circles: {}, comments: {}, log: [], genesis: null, sends: [], sealed: []};
    const U = pk => S.users[pk] || (S.users[pk] = {pk, name: "", member: false, bal: 0, vouchedBy: null, vouched: [], joinedAt: null, deals: 0, friends: [], invites: []});
    // 実績：持った・持たれた・譲った・譲られたことが1回でもある人（知らせを出せるのはこの人たち）
    const trusted = pk => S.users[pk] && S.users[pk].member && S.users[pk].deals >= 1;
    const flagsOf = (o, pk) => { o.flags = o.flags || []; if (o.flags.includes(pk)) return false; o.flags.push(pk); if (o.flags.length >= R.flagsToHide) o.hidden = true; return true; };
    // カード1枚ずつ（copy）を持ち主ごとに数える。used：使った（受け取った）もの。from：作った人から持ったか、譲り受けたか
    const holdsOf = (c, pk) => c.copies.filter(x => x.owner === pk && !x.used);
    const cap = c => c.price ? R.capPaid : R.capFree;
    // 残り＝作った数から、作った人が渡した数を引いたもの（譲ったり贈ったりしても戻らない。返したときだけ戻る）
    const left = c => c.supply == null ? Infinity : c.supply - c.issued;
    const pay = (from, to, n) => { U(from).bal -= n; U(to).bal += n; };
    const join = (pk, at, by) => { const u = U(pk); u.member = true; u.bal += R.start; u.joinedAt = at; u.vouchedBy = by; };
    const ok = (e, what) => S.log.push({at: e.created_at, id: e.id, by: e.pubkey, what});

    for (const e of evs) {
      let c; try { c = JSON.parse(e.content); } catch (x) { continue; }
      if (!c || typeof c !== "object" || (c.v !== undefined && !(Number.isInteger(c.v) && c.v >= 1 && c.v <= R.version))) continue;
      const me = U(e.pubkey), t = e.created_at;
      // 最初の人たちは、何か出来事を出した時点で参加
      if (!me.member && founders.has(e.pubkey)) join(e.pubkey, t, null);
      // はじまりの人（つなぐ版）：始める人だけが知っている番号（の要約が決まりに書いてある）を最初に出した1人が参加する。だれにも認められずに参加できるのはこの1人だけ
      if (c.t === "genesis") {
        if (!opt.genesis || S.genesis || me.member || typeof c.code !== "string" || sha256hex(c.code) !== opt.genesis) continue;
        S.genesis = e.pubkey; join(e.pubkey, t, null); ok(e, "genesis"); continue;
      }

      if (c.t === "profile") { me.name = str(c.name, 40); me.line = str(c.line, 60); continue; }

      // 1 はじまり：参加している人が、まだの人を認める（1人3人まで）
      if (c.t === "vouch") {
        if (!me.member || !isHex(c.who, 64) || c.who === e.pubkey || me.vouched.length >= R.vouchMax) continue;
        if (U(c.who).member) continue;
        me.vouched.push(c.who); join(c.who, t, e.pubkey); ok(e, "vouch"); continue;
      }

      // 招待：参加している人が、一度きりの番号（の要約）と期限を出す。リンクや QR で番号を受け取った人が「参加」を出すと、認めたのと同じになる
      // （認められるのは1人3人まで。まだ使われていない招待も数に入れる）
      if (c.t === "invite") {
        const open = me.invites.filter(x => !x.used && x.until >= t).length;
        if (!me.member || !isHex(c.lock, 64) || !int(c.until, t, t + R.inviteMax) || me.vouched.length + open >= R.vouchMax) continue;
        me.invites.push({id: e.id, lock: c.lock, until: c.until, used: null}); ok(e, "invite"); continue;
      }
      if (c.t === "join") {
        if (me.member || !isHex(c.by, 64) || typeof c.code !== "string") continue;
        const inv = U(c.by), x = inv.invites.find(y => y.id === c.invite);
        if (!inv.member || !x || x.used || t > x.until || sha256hex(c.code) !== x.lock || inv.vouched.length >= R.vouchMax) continue;
        x.used = e.pubkey; inv.vouched.push(e.pubkey); join(e.pubkey, t, c.by); ok(e, "join"); continue;
      }

      // 友達：相手のプロフィールカードを持つ（無料・1人1枚）。お互いに友達なら、2人だけで話せる
      if (c.t === "friend" || c.t === "unfriend") {
        if (!me.member || !isHex(c.who, 64) || c.who === e.pubkey || !U(c.who).member) continue;
        me.friends = me.friends.filter(x => x !== c.who); if (c.t === "friend") me.friends.push(c.who);
        ok(e, c.t); continue;
      }
      // 会話：カードの公開の会話（コメント）。参加している人だけ。輪のカードは輪の人だけ
      if (c.t === "comment") {
        const card = S.cards[c.card], text = str(c.text, R.commentMax).trim();
        if (!card || card.hidden || card.gone || !me.member || !text) continue;
        if (card.circle && !S.circles[card.circle].members.includes(e.pubkey)) continue;
        const cm = {id: e.id, card: card.id, by: e.pubkey, at: t, text, holder: holdsOf(card, e.pubkey).length > 0, flags: [], hidden: false};
        S.comments[e.id] = cm; (card.talk = card.talk || []).push(e.id); ok(e, "comment"); continue;
      }
      // 危ないものを知らせる：実績のある別々の人2人で、カードや会話が隠れる。自分のものには出せない
      if (c.t === "flag") {
        if (!trusted(e.pubkey)) continue;
        const target = c.card ? S.cards[c.card] : c.comment ? S.comments[c.comment] : null;
        if (!target || target.by === e.pubkey) continue;
        if (flagsOf(target, e.pubkey)) ok(e, "flag"); continue;
      }
      // 自分の書いた会話を消す（記録には「消した」ことが残る）
      if (c.t === "uncomment") { const cm = S.comments[c.comment]; if (!cm || cm.by !== e.pubkey || cm.removed) continue; cm.removed = true; cm.hidden = true; ok(e, "uncomment"); continue; }

      // 仲間の輪：作った人と、選ばれた人たち。輪の中のカードの中身は、輪の鍵で封をして置く（外からは読めない）
      if (c.t === "circle") {
        if (!Array.isArray(c.members) || c.members.length > 50 || !c.members.every(m => isHex(m, 64))) continue;
        S.circles[e.id] = {id: e.id, by: e.pubkey, name: str(c.name, 40), members: [...new Set([e.pubkey, ...c.members])], at: t};
        ok(e, "circle"); continue;
      }
      if (c.t === "circle-add") {
        const ci = S.circles[c.circle]; if (!ci || ci.by !== e.pubkey || !isHex(c.who, 64)) continue;
        if (!ci.members.includes(c.who)) ci.members.push(c.who); continue;
      }
      // 輪から抜ける（本人）・外す（輪を作った人）。作った人は抜けられない
      if (c.t === "circle-leave" || c.t === "circle-remove") {
        const ci = S.circles[c.circle]; if (!ci) continue;
        const who = c.t === "circle-leave" ? e.pubkey : c.who;
        if (c.t === "circle-remove" && ci.by !== e.pubkey) continue;
        if (who === ci.by || !ci.members.includes(who)) continue;
        ci.members = ci.members.filter(m => m !== who); ok(e, c.t); continue;
      }

      // カードを作る：参加している人だけ（だれでも鍵を作れるので、認められた人だけにしてばらまきを防ぐ）
      if (c.t === "card") {
        if (!me.member || !KINDS.includes(c.kind) || !int(c.price, 0, R.priceMax)) continue;
        const supply = c.supply == null ? null : (int(c.supply, 1, 100000) ? c.supply : undefined);
        if (supply === undefined) continue;
        const card = {id: e.id, by: e.pubkey, at: t, kind: c.kind, title: str(c.title, 80), body: str(c.body, 2000), media: str(c.media, 300),
          price: c.price, supply, copies: [], queue: [], tips: 0, tipped: 0, refunds: 0, circle: null, issued: 0, talk: [], items: [], flags: [], hidden: false};
        if (c.circle !== undefined) { const ci = S.circles[c.circle]; if (!ci || !ci.members.includes(e.pubkey)) continue; card.circle = ci.id; }
        // その場で売る：一度きりの番号（の要約）と期限。番号を知っている人（QR を読んだ人）だけが持てる。持つと同時に受け取り済み
        if (c.kind === "project") { card.want = str(c.want, 200); card.state = "doing"; }
        if ((c.kind === "event" || c.kind === "service") && supply == null) continue;
        if (BUNDLE.includes(c.kind) && (c.price !== 0 || supply != null)) continue;   // つなぐカードは無料・数なし。持つ＝常連・会員・仲間になる（知らせが届く）   // イベントは定員、サービスは枠がいる。持つ＝参加券・受ける券
        if (AT.includes(c.kind)) {
          card.when = str(c.when, 60); card.place = str(c.place, 100);
          if (c.geo !== undefined) { const g = c.geo; if (!Array.isArray(g) || g.length !== 2 || !g.every(Number.isFinite) || Math.abs(g[0]) > 90 || Math.abs(g[1]) > 180) continue; card.geo = [Math.round(g[0] * 1e5) / 1e5, Math.round(g[1] * 1e5) / 1e5]; }
        }
        if (c.lock !== undefined) {
          if (!isHex(c.lock, 64) || !int(c.until, t, t + R.saleMax) || supply !== 1) continue;
          card.lock = c.lock; card.until = c.until; card.handover = true;
        }
        S.cards[e.id] = card; ok(e, "card"); continue;
      }

      // プロジェクトを育てる：自分のカードを、プロジェクトのカードにつなぐ。外すのは、つないだ人かプロジェクトを作った人
      if (c.t === "attach" || c.t === "detach") {
        const pj = S.cards[c.project], it = S.cards[c.card];
        if (!pj || !it || !BUNDLE.includes(pj.kind) || pj.hidden || it.hidden || pj.gone || it.gone || !me.member || pj.id === it.id) continue;
        if (c.t === "attach" && !OPEN_BUNDLE.includes(pj.kind) && pj.by !== e.pubkey) continue;
        if (pj.circle && !S.circles[pj.circle].members.includes(e.pubkey)) continue;
        if (c.t === "attach") { if (it.by !== e.pubkey || pj.items.some(x => x.card === it.id)) continue; pj.items.push({card: it.id, by: e.pubkey, at: t}); }
        else { const i = pj.items.findIndex(x => x.card === it.id); if (i < 0 || (pj.by !== e.pubkey && pj.items[i].by !== e.pubkey)) continue; pj.items.splice(i, 1); }
        ok(e, c.t); continue;
      }

      // プロジェクトの状態（準備中・進行中・できた）は、作った人だけが変えられる
      if (c.t === "pjstate") { const pj = S.cards[c.project]; if (pj && pj.kind === "project" && pj.by === e.pubkey && ["prep", "doing", "done"].includes(c.state)) pj.state = c.state; continue; }

      // jeni を贈る：参加している人へ、直接（カードはいらない）。だれからだれへ何 jeni かは記録に残る
      if (c.t === "send") {
        const to = c.to;
        if (!me.member || !isHex(to, 64) || to === e.pubkey || !U(to).member || !int(c.amount, 1, R.sendMax) || me.bal < c.amount) continue;
        pay(e.pubkey, to, c.amount); S.sends.push({id: e.id, from: e.pubkey, to, amount: c.amount, at: t}); ok(e, "send"); continue;
      }
      // 鍵をかけて持つ（つなぐ版）：どのカードかは、持った人と作った人だけが読める封の中。記録に出るのは「だれが、だれに、いくら払ったか」だけ。
      // 封の中は2人の画面だけで開いて「持っている」に足す（数に限りのないカードだけ・投げ銭の分け前は受け取らない、なので残高はどの画面でも同じ）
      if (c.t === "phold") {
        const to = c.to;
        if (!me.member || !isHex(to, 64) || to === e.pubkey || !U(to).member || !int(c.amount, 0, R.priceMax) || me.bal < c.amount || typeof c.sealed !== "string" || c.sealed.length > 2000) continue;
        pay(e.pubkey, to, c.amount); if (c.amount) { me.deals++; U(to).deals++; }
        S.sealed.push({id: e.id, from: e.pubkey, to, amount: c.amount, sealed: c.sealed, at: t}); ok(e, "phold"); continue;
      }
      const card = S.cards[c.card];
      if (!card || card.gone) continue;   // 取り下げたカードには、もう何もできない
      if (card.hidden && ["hold", "want", "tip"].includes(c.t)) continue;   // 隠されたカードは、新しく持てない・投げ銭できない
      if (card.closed && ["hold", "want"].includes(c.t)) continue;           // 受付を終えたカードは、新しく持てない・順番を待てない

      // 直す：作った人だけ。題・説明・日時・場所・地図の点・求めているもの。値段・数・種類は直せない（持った人との約束なので）
      if (c.t === "edit") {
        if (card.by !== e.pubkey) continue;
        (card.history = card.history || []).push({at: t, title: card.title, body: card.body});   // 直す前の題と説明を残す（持った人が確かめられるように）
        if (c.title !== undefined) card.title = str(c.title, 80);
        if (c.body !== undefined) card.body = str(c.body, 2000);
        if (AT.includes(card.kind)) {
          if (c.when !== undefined) card.when = str(c.when, 60);
          if (c.place !== undefined) card.place = str(c.place, 100);
          if (c.geo === null) delete card.geo;
          else if (c.geo !== undefined) { const g = c.geo; if (Array.isArray(g) && g.length === 2 && g.every(Number.isFinite) && Math.abs(g[0]) <= 90 && Math.abs(g[1]) <= 180) card.geo = [Math.round(g[0] * 1e5) / 1e5, Math.round(g[1] * 1e5) / 1e5]; }
        }
        if (card.kind === "project" && c.want !== undefined) card.want = str(c.want, 200);
        card.edits = (card.edits || 0) + 1; ok(e, "edit"); continue;
      }
      // 取り下げる：作った人だけ。まだだれも持っていなければ消える。持っている人がいれば「受付を終える」（持っている人のものはそのまま）
      if (c.t === "retire") {
        if (card.by !== e.pubkey) continue;
        if (!card.copies.length) card.gone = true; else card.closed = true;
        card.queue = []; ok(e, "retire"); continue;
      }

      // 2 持つ：作った人から（数に限りがあるときは残りがあるあいだ）
      if (c.t === "hold") {
        if (!me.member || e.pubkey === card.by || left(card) <= 0) continue;
        if (holdsOf(card, e.pubkey).length >= cap(card) || me.bal < card.price) continue;
        if (card.lock && (t > card.until || typeof c.code !== "string" || sha256hex(c.code) !== card.lock)) continue;
        if (card.circle && !S.circles[card.circle].members.includes(e.pubkey)) continue;
        // 持ち方：show＝みんなに見せる、hide＝画面に出さない（記録を調べれば分かる）、lock＝何を持ったかに鍵（数に限りのないカードだけ。投げ銭の分け前は受け取らない）
        const vis = ["show", "hide", "lock"].includes(c.vis) ? c.vis : "show";
        if (vis === "lock" && card.supply != null) continue;
        pay(e.pubkey, card.by, card.price); me.deals++; U(card.by).deals++;
        card.copies.push({owner: e.pubkey, fromCreator: true, paid: card.price, at: t, used: card.handover ? t : null, vis}); card.issued++;
        card.queue = card.queue.filter(p => p !== e.pubkey);
        ok(e, "hold"); continue;
      }

      // 3 譲る：残りのないカードがほしい人は順番を待ち、持ち主が待っている人に譲る（同じ値段、jeni は手放した人へ）
      if (c.t === "want") {
        if (!me.member || card.supply == null || e.pubkey === card.by || card.queue.includes(e.pubkey)) continue;
        if (holdsOf(card, e.pubkey).length >= cap(card)) continue;
        card.queue.push(e.pubkey); continue;
      }
      if (c.t === "unwant") { card.queue = card.queue.filter(p => p !== e.pubkey); continue; }
      if (c.t === "pass") {
        const to = c.to, mine = holdsOf(card, e.pubkey);
        if (!mine.length || !card.queue.includes(to) || !U(to).member) continue;
        if (holdsOf(card, to).length >= cap(card) || U(to).bal < card.price) continue;
        pay(to, e.pubkey, card.price); me.deals++; U(to).deals++;
        Object.assign(mine[0], {owner: to, fromCreator: false, paid: card.price, at: t, vis: "show", redeem: null});
        card.queue = card.queue.filter(p => p !== to); ok(e, "pass"); continue;
      }

      // 見せ方を変える：みんなに見せる ⇔ 画面に出さない（鍵をかけて持ったものは変えられない。鍵を外すと何を持ったかが分かってしまうため）
      if (c.t === "vis") {
        if (!["show", "hide"].includes(c.vis)) continue;
        const xs = holdsOf(card, e.pubkey).filter(x => x.vis !== "lock"); if (!xs.length) continue;
        for (const x of xs) x.vis = c.vis; continue;
      }

      // 贈る：持っているカードを、参加している人へ（jeni は動かない）
      if (c.t === "gift") {
        const to = c.to, mine = holdsOf(card, e.pubkey);
        if (!mine.length || !isHex(to, 64) || to === e.pubkey || to === card.by || !U(to).member) continue;
        if (holdsOf(card, to).length >= cap(card)) continue;
        Object.assign(mine[0], {owner: to, fromCreator: false, paid: 0, at: t, vis: "show", redeem: null}); S.sends.push({id: e.id, from: e.pubkey, to, card: card.id, at: t}); ok(e, "gift"); continue;
      }

      // 使う：現物を受け取ったことを、作った人が記録する（その1枚は「使った」になり、上限が空く）
      // 現物の引き換え：持っている人が、その場限りの QR（番号の要約と期限）を出す。作った人がそれを読んだときだけ「使った」になる
      // （作った人が勝手に「渡した」ことにして、持っている人の受け取りを消せないように）
      if (c.t === "redeem") {
        if (card.supply == null || card.handover) continue;
        const x = holdsOf(card, e.pubkey)[0]; if (!x || !isHex(c.lock, 64) || !int(c.until, t, t + R.redeemMax)) continue;
        x.redeem = {lock: c.lock, until: c.until}; continue;
      }
      if (c.t === "used") {
        if (e.pubkey !== card.by || typeof c.code !== "string") continue;
        const x = holdsOf(card, c.holder).find(y => y.redeem && t <= y.redeem.until && sha256hex(c.code) === y.redeem.lock); if (!x) continue;
        x.used = t; x.redeem = null; ok(e, "used"); continue;
      }

      // 返す：売った人だけが、作った人から持った人へ、その人がまだ持っているあいだだけ、払った額を返す
      if (c.t === "refund") {
        if (e.pubkey !== card.by) continue;
        const i = card.copies.findIndex(x => x.owner === c.holder && x.fromCreator && (!x.used || card.handover));
        if (i < 0 || me.bal < card.copies[i].paid) continue;
        pay(e.pubkey, c.holder, card.copies[i].paid);
        card.copies.splice(i, 1); card.issued--; card.refunds++; ok(e, "refund"); continue;
      }

      // つなぐカード（常連・会員・仲間）はいつでもやめられる
      if (c.t === "leave") {
        if (!BUNDLE.includes(card.kind)) continue;
        const i = card.copies.findIndex(x => x.owner === e.pubkey); if (i < 0) continue;
        card.copies.splice(i, 1); ok(e, "leave"); continue;
      }

      // 4 投げ銭：半分は作った人へ、半分は持っている人へ（枚数に応じて）。数に限りのあるカードと、つなぐカード（常連・会員）は全額が作った人へ
      if (c.t === "tip") {
        if (!me.member || e.pubkey === card.by || !int(c.amount, 1, R.tipMax) || me.bal < c.amount) continue;   // 自分のカードには投げ銭しない
        const holders = {};
        if (card.supply == null && !BUNDLE.includes(card.kind)) for (const x of card.copies) if (!x.used && x.vis !== "lock") holders[x.owner] = (holders[x.owner] || 0) + 1;
        const n = Object.values(holders).reduce((a, b) => a + b, 0);
        me.bal -= c.amount;
        let toCreator = c.amount;
        if (n) {
          const share = Math.floor(c.amount / 2); let given = 0;
          // 端数は作った人へ。順番は持ち主の番号順（どの画面でも同じ）
          for (const pk of Object.keys(holders).sort()) { const g = Math.floor(share * holders[pk] / n); U(pk).bal += g; given += g; }
          toCreator = c.amount - given;
        }
        U(card.by).bal += toCreator; card.tips += c.amount; card.tipped++; ok(e, "tip"); continue;
      }
    }
    // まとめ：カードごとの残り・持っている人数
    for (const card of Object.values(S.cards)) {
      card.left = card.supply == null ? null : left(card);
      card.holders = new Set(card.copies.filter(x => !x.used && x.vis !== "lock").map(x => x.owner)).size;
    }
    return S;
  }

  // 記録の要約（マークルの根）：出来事の番号を並べ、2つずつ合わせて1つになるまで要約する。根だけをビットコインに刻めば、
  // その中のどの出来事も「この時より前にあった」と、短い証明（となりの要約の並び）で確かめられる
  const pairHash = (a, b) => sha256hex(a < b ? a + b : b + a);
  function merkleRoot(ids) {
    let lv = [...ids].sort(); if (!lv.length) return sha256hex("");
    while (lv.length > 1) { const nx = []; for (let i = 0; i < lv.length; i += 2) nx.push(i + 1 < lv.length ? pairHash(lv[i], lv[i + 1]) : lv[i]); lv = nx; }
    return lv[0];
  }
  function merkleProof(ids, id) {
    let lv = [...ids].sort(), i = lv.indexOf(id); if (i < 0) return null; const path = [];
    while (lv.length > 1) { const nx = []; for (let k = 0; k < lv.length; k += 2) nx.push(k + 1 < lv.length ? pairHash(lv[k], lv[k + 1]) : lv[k]);
      const sib = i % 2 ? i - 1 : i + 1; if (sib < lv.length) path.push(lv[sib]); i = Math.floor(i / 2); lv = nx; }
    return path;
  }
  const merkleCheck = (id, path, root) => path.reduce((h, s) => pairHash(h, s), id) === root;
  const api = {R, merkleRoot, merkleProof, merkleCheck, KINDS, BUNDLE, COUNTED, AT, reduce, sha256hex};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.JeniRules = api;
})(typeof self !== "undefined" ? self : this);
