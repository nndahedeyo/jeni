// jeni の決まり（試験版）。署名つきの出来事（イベント）の並びから、だれが計算しても同じ状態になる。
// 運営もサーバーもいない。決まりに合わない出来事は、どの画面でも同じように無視される。
//
// jeni の5つのきまり
//  1 はじまり：認められて参加すると、決まった量の jeni が届く（jeni が新しく生まれるのはここだけ）
//  2 持つ　　：作った人から持つと、値段の分の jeni が作った人へ。値段はずっと変わらない
//  3 譲る　　：数に限りのあるカードは、持っている人から同じ値段で譲り受ける。jeni は手放した人へ
//  4 投げ銭　：半分は作った人へ、半分は持っている人へ（枚数に応じて）。数に限りのあるカードは全額が作った人へ
//  5 上限　　：同じカードは3枚まで（無料のカードは1枚まで）。使うか贈ると、また持てる
"use strict";
(function (root) {
  const R = {
    start: 1000,        // 参加したときに届く jeni（配る量は使われ方を見て変わることがある。変わるときも全員に同じきまり）
    vouchMax: 3,        // 1人が認められる人数
    capPaid: 3,         // 同じカードを持てる数
    capFree: 1,         // 無料のカードを持てる数
    priceMax: 1000000,
    tipMax: 1000000,
    futureSkew: 600,    // 未来の時刻の出来事は、この秒数より先なら無視する
    saleMax: 600,       // その場で売るカードの QR が使える長さ（秒）の上限
    founders: [],       // 最初の人たち（だれにも認められずに参加できる）。試験のはじめに決める
  };
  const KINDS = ["rwa", "music", "video", "picture", "text", "other"];
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
    const S = {users: {}, cards: {}, circles: {}, log: []};
    const U = pk => S.users[pk] || (S.users[pk] = {pk, name: "", member: false, bal: 0, vouchedBy: null, vouched: [], joinedAt: null});
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
      if (!c || typeof c !== "object") continue;
      const me = U(e.pubkey), t = e.created_at;
      // 最初の人たちは、何か出来事を出した時点で参加
      if (!me.member && founders.has(e.pubkey)) join(e.pubkey, t, null);

      if (c.t === "profile") { me.name = str(c.name, 40); me.line = str(c.line, 60); continue; }

      // 1 はじまり：参加している人が、まだの人を認める（1人3人まで）
      if (c.t === "vouch") {
        if (!me.member || !isHex(c.who, 64) || c.who === e.pubkey || me.vouched.length >= R.vouchMax) continue;
        if (U(c.who).member) continue;
        me.vouched.push(c.who); join(c.who, t, e.pubkey); ok(e, "vouch"); continue;
      }

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

      // カードを作る（参加していなくても作れる。持つには jeni が要る）
      if (c.t === "card") {
        if (!KINDS.includes(c.kind) || !int(c.price, 0, R.priceMax)) continue;
        const supply = c.supply == null ? null : (int(c.supply, 1, 100000) ? c.supply : undefined);
        if (supply === undefined) continue;
        const card = {id: e.id, by: e.pubkey, at: t, kind: c.kind, title: str(c.title, 80), body: str(c.body, 2000), media: str(c.media, 300),
          price: c.price, supply, copies: [], queue: [], tips: 0, tipped: 0, refunds: 0, circle: null, issued: 0};
        if (c.circle !== undefined) { const ci = S.circles[c.circle]; if (!ci || !ci.members.includes(e.pubkey)) continue; card.circle = ci.id; }
        // その場で売る：一度きりの番号（の要約）と期限。番号を知っている人（QR を読んだ人）だけが持てる。持つと同時に受け取り済み
        if (c.lock !== undefined) {
          if (!isHex(c.lock, 64) || !int(c.until, t, t + R.saleMax) || supply !== 1) continue;
          card.lock = c.lock; card.until = c.until; card.handover = true;
        }
        S.cards[e.id] = card; ok(e, "card"); continue;
      }

      const card = S.cards[c.card];
      if (!card) continue;

      // 2 持つ：作った人から（数に限りがあるときは残りがあるあいだ）
      if (c.t === "hold") {
        if (!me.member || e.pubkey === card.by || left(card) <= 0) continue;
        if (holdsOf(card, e.pubkey).length >= cap(card) || me.bal < card.price) continue;
        if (card.lock && (t > card.until || typeof c.code !== "string" || sha256hex(c.code) !== card.lock)) continue;
        if (card.circle && !S.circles[card.circle].members.includes(e.pubkey)) continue;
        // 持ち方：show＝みんなに見せる、hide＝画面に出さない（記録を調べれば分かる）、lock＝何を持ったかに鍵（数に限りのないカードだけ。投げ銭の分け前は受け取らない）
        const vis = ["show", "hide", "lock"].includes(c.vis) ? c.vis : "show";
        if (vis === "lock" && card.supply != null) continue;
        pay(e.pubkey, card.by, card.price);
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
        pay(to, e.pubkey, card.price);
        Object.assign(mine[0], {owner: to, fromCreator: false, paid: card.price, at: t, vis: "show"});
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
        Object.assign(mine[0], {owner: to, fromCreator: false, paid: 0, at: t, vis: "show"}); ok(e, "gift"); continue;
      }

      // 使う：現物を受け取ったことを、作った人が記録する（その1枚は「使った」になり、上限が空く）
      if (c.t === "used") {
        if (e.pubkey !== card.by) continue;
        const x = holdsOf(card, c.holder)[0]; if (!x) continue;
        x.used = t; ok(e, "used"); continue;
      }

      // 返す：売った人だけが、作った人から持った人へ、その人がまだ持っているあいだだけ、払った額を返す
      if (c.t === "refund") {
        if (e.pubkey !== card.by) continue;
        const i = card.copies.findIndex(x => x.owner === c.holder && x.fromCreator && (!x.used || card.handover));
        if (i < 0 || me.bal < card.copies[i].paid) continue;
        pay(e.pubkey, c.holder, card.copies[i].paid);
        card.copies.splice(i, 1); card.issued--; card.refunds++; ok(e, "refund"); continue;
      }

      // 4 投げ銭：半分は作った人へ、半分は持っている人へ（枚数に応じて）。数に限りのあるカードは全額が作った人へ
      if (c.t === "tip") {
        if (!me.member || !int(c.amount, 1, R.tipMax) || me.bal < c.amount) continue;
        const holders = {};
        if (card.supply == null) for (const x of card.copies) if (!x.used && x.vis !== "lock") holders[x.owner] = (holders[x.owner] || 0) + 1;
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

  const api = {R, KINDS, reduce, sha256hex};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.JeniRules = api;
})(typeof self !== "undefined" ? self : this);
