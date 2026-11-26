// つなぐ版の土台：かぎ（この端末の中だけ）・中継（Nostr のリレー）への読み書き・封（2人だけ／輪だけが読める暗号）。
// 運営のサーバーはない。出来事は署名して、だれでも立てられる複数の中継に置き、この端末にも写しを持つ。
"use strict";
(function (root) {
  const Sig = root.Sig, Seal = root.Seal;
  const Rules = () => root.JeniRules;   // きまりはあとで読み込まれる
  const TAG = "jeni-trial-1";
  // 出来事の種類：決まり（だれでも読める）・カードの中身（画像など）・2人だけの会話・通話のつなぎ・輪のかぎ
  const K = {rule: 7740, media: 7741, dm: 7742, call: 7743, ckey: 7744};
  const RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net", "wss://relay.nostr.band"];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const now = () => Math.floor(Date.now() / 1000);
  let me = store.get("jeni.me", null);          // {sk, pk}
  let events = store.get("jeni.ev", []);         // 受け取った・出した出来事（署名を確かめたもの）
  let outbox = store.get("jeni.outbox", []);     // まだ中継に届けていない出来事
  const known = new Set(events.map(e => e.id));
  let onChange = () => {}, lastAt = 0;
  const sockets = [];

  function save() {
    // 画像の多い出来事が端末の置き場をあふれさせないよう、古い順に削っていく（決まりの出来事は残す）
    for (let i = 0; i < 20 && !store.set("jeni.ev", events); i++) {
      const j = events.findIndex(e => e.kind === K.media); if (j < 0) break; events.splice(j, 1);
    }
  }
  function add(ev) { if (known.has(ev.id)) return false; known.add(ev.id); events.push(ev); save(); return true; }
  let t0; const changed = () => { clearTimeout(t0); t0 = setTimeout(() => onChange(), 120); };

  const ours = ev => ev && Object.values(K).includes(ev.kind) && Array.isArray(ev.tags) && ev.tags.some(t => t[0] === "t" && t[1] === TAG);
  async function accept(ev) {
    if (!ours(ev) || known.has(ev.id)) return;
    if (!(await Sig.verifyEvent(ev))) return;
    if (add(ev)) changed();
  }

  // ---- かぎ ----
  const pkOf = sk => Sig.hex(Sig.pubkey(Sig.unhex(sk)));
  function newMe() { const sk = Sig.newKey(); me = {sk, pk: pkOf(sk)}; store.set("jeni.me", me); return me; }
  function importKey(sk) {
    sk = String(sk || "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sk)) return null;
    try { me = {sk, pk: pkOf(sk)}; } catch (e) { return null; }
    store.set("jeni.me", me); return me;
  }

  // ---- 出す：番号（イベントID）はその場で決まる。署名してから中継へ ----
  function publish(kind, content, tags = []) {
    if (!me) return null;
    const at = Math.max(now(), lastAt + 1); lastAt = at;
    const ev = {kind, created_at: at, tags: [["t", TAG], ...tags], content: typeof content === "string" ? content : JSON.stringify(content), pubkey: me.pk};
    ev.id = Rules().sha256hex(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]));
    add(ev);
    (async () => {
      ev.sig = Sig.hex(await Sig.sign(Sig.unhex(ev.id), Sig.unhex(me.sk), crypto.getRandomValues(new Uint8Array(32))));
      save(); outbox.push(ev); store.set("jeni.outbox", outbox); flush();
    })();
    return ev;
  }
  function flush() {
    const os = sockets.filter(s => s.readyState === 1); if (!os.length) return;
    const ready = outbox.filter(e => e.sig);
    for (const ev of ready) for (const s of os) { try { s.send(JSON.stringify(["EVENT", ev])); } catch (e) {} }
    outbox = outbox.filter(e => !e.sig); store.set("jeni.outbox", outbox);
  }

  // ---- 中継につなぐ（古い出来事もさかのぼって全部読む） ----
  function connectOne(url, wait) {
    let ws; try { ws = new WebSocket(url); } catch (e) { return; }
    const flt = {kinds: Object.values(K), "#t": [TAG]}, pg = {oldest: Infinity, got: 0, page: 0};
    ws.onopen = () => { ws.send(JSON.stringify(["REQ", "j", {...flt, limit: 500}])); flush(); changed(); };
    ws.onmessage = m => { try { const d = JSON.parse(m.data);
      if (d[0] === "EVENT") { pg.got++; if (d[2] && d[2].created_at < pg.oldest) pg.oldest = d[2].created_at; accept(d[2]); }
      if (d[0] === "EOSE" && pg.got >= 500 && pg.page < 60) { pg.page++; pg.got = 0; ws.send(JSON.stringify(["REQ", "j" + pg.page, {...flt, until: pg.oldest - 1, limit: 500}])); }
    } catch (e) {} };
    ws.onclose = () => { const i = sockets.indexOf(ws); if (i >= 0) sockets.splice(i, 1); changed(); setTimeout(() => connectOne(url, Math.min((wait || 2000) * 2, 60000)), wait || 2000); };
    ws.onerror = () => {};
    sockets.push(ws);
  }
  function start(cb) {
    onChange = cb || onChange;
    for (const e of events) if (e.pubkey === (me && me.pk)) lastAt = Math.max(lastAt, e.created_at);
    if ("WebSocket" in root) for (const u of RELAYS) connectOne(u, 2000);
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  }
  const online = () => sockets.some(s => s.readyState === 1);

  // ---- 封：2人のかぎ（ECDH）・輪のかぎ ----
  const pairBytes = pk => Seal.pairKey(me.sk, pk);
  const sealTo = async (pk, obj, ad) => Seal.seal(await pairBytes(pk), obj, ad);
  const openFrom = async (pk, str, ad) => { try { return await Seal.open(await pairBytes(pk), str, ad); } catch (e) { return null; } };
  const sealWith = (keyHex, obj, ad) => Seal.seal(Sig.unhex(keyHex), obj, ad);
  const openWith = (keyHex, str, ad) => Seal.open(Sig.unhex(keyHex), str, ad);

  root.JeniLive = {
    K, TAG, RELAYS, store, now,
    get me() { return me; }, newMe, importKey,
    get events() { return events; }, publish, start, online, flush,
    sealTo, openFrom, sealWith, openWith, randHex: n => Sig.hex(crypto.getRandomValues(new Uint8Array(n))),
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
