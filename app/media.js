// 音・動画・写真の下ごしらえと置き場（JeniMedia）
// ・この端末の中で軽くする（Mediabunny：端末の部品で変換。必要になったときだけ読み込む）
// ・無料の置き場（Blossom）の1ファイルの上限に合わせて、長いものは時間で分けて置く
// ・写真は描き直して位置情報などを消す
// ・置き場へは、その人の鍵で署名した許可（kind 24242）だけで送る。運営の鍵もサーバーもない
"use strict";
(function (root) {
  const MB_URL = "https://cdn.jsdelivr.net/npm/mediabunny@1.65.2/dist/bundles/mediabunny.min.mjs";
  const AAC_URL = "https://cdn.jsdelivr.net/npm/@mediabunny/aac-encoder@1.65.2/dist/bundles/mediabunny-aac-encoder.min.js";
  const MiB = 1024 * 1024;
  const LIM = {
    part: 17.5 * MiB,        // 1つに置く大きさ（無料の置き場は 20MiB まで。余裕をもって）
    videoSec: 600,           // 動画は10分まで
    audioSec: 3600,          // 音は1時間まで
    pics: 20,                // アルバムは20枚まで
    srcBytes: 4096 * MiB,    // 元のファイルの大きさ（この端末で読める目安）
  };
  // 画質：短い動画（75秒まで）は 720p、長いものは 540p。音は音楽として十分な 128kbps
  const PLAN = {
    short: {sec: 75, long: 1280, v: 2000000, a: 96000},
    long: {long: 960, v: 1100000, a: 96000},
    music: {a: 128000},
  };
  // 置き場：はじめの1つに送り、もう1つへ写す（同じ中身は同じ番号＝SHA-256 なので、片方が消えても、もう片方から取れる）
  const SERVERS = ["https://blossom.nostr.build", "https://blossom.primal.net"];

  let MB = null, aac = null;
  async function lib() {
    if (MB) return MB;
    const M = await import(MB_URL);
    root.Mediabunny = M; MB = M; return M;
  }
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  async function aacOK(M) {
    if (aac != null) return aac;
    try { if (await M.canEncodeAudio("aac")) return (aac = true); } catch (e) {}
    try { await loadScript(AAC_URL); root.MediabunnyAacEncoder.registerAacEncoder(); aac = await M.canEncodeAudio("aac"); } catch (e) { aac = false; }
    return aac;
  }
  const even = n => Math.max(2, Math.round(n / 2) * 2);
  const fmtLen = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };

  // 音・動画を、置ける形（MP4 / M4A）に。返すもの：{parts:[{blob, d}], dur, poster(Blob|null), w, h, note}
  async function prepare(file, kind, onp = () => {}) {
    if (file.size > LIM.srcBytes) throw new Error("ファイルが大きすぎます");
    const M = await lib();
    const open = () => new M.Input({source: new M.BlobSource(file), formats: M.ALL_FORMATS});
    const input = open();
    const dur = await input.computeDuration();
    if (!dur || !isFinite(dur)) throw new Error("長さが読めませんでした");
    const max = kind === "music" ? LIM.audioSec : LIM.videoSec;
    if (dur > max + 1) throw new Error(kind === "music" ? "音は60分までです" : "動画は10分までです");
    const vt = kind === "video" ? await input.getPrimaryVideoTrack() : null;
    const at = await input.getPrimaryAudioTrack();
    if (kind === "video" && !vt) throw new Error("動画が入っていません");
    if (kind === "music" && !at) throw new Error("音が入っていません");
    const useAac = at ? await aacOK(M) : false;
    const acodec = useAac ? "aac" : "opus";
    const plan = kind === "music" ? PLAN.music : dur <= PLAN.short.sec ? PLAN.short : PLAN.long;
    let w = 0, h = 0, poster = null;
    if (vt) {
      const W = vt.displayWidth, H = vt.displayHeight, k = Math.min(1, plan.long / Math.max(W, H));
      w = even(W * k); h = even(H * k);
      if (!(await M.canEncodeVideo("avc", {width: w, height: h, bitrate: plan.v}))) throw new Error("この端末では動画を変換できません");
      try { const sink = new M.CanvasSink(vt, {width: Math.min(640, w)}); const fr = await sink.getCanvas(Math.min(1, dur / 10));
        if (fr) poster = await new Promise(r => { const cv = fr.canvas; cv.convertToBlob ? cv.convertToBlob({type: "image/jpeg", quality: .8}).then(r, () => r(null)) : cv.toBlob(r, "image/jpeg", .8); }); } catch (e) {}
    }
    // そのまま置ける小さなファイル（もとから MP4/M4A の H.264・AAC で、上限より小さい）は、包み直すだけ（速い・画質も音もそのまま）
    const ac = at ? at.codec : null;
    const srcRate = file.size * 8 / dur;
    const copyOK = file.size <= LIM.part && (!vt || (vt.codec === "avc" && Math.max(vt.displayWidth, vt.displayHeight) <= 1920)) && (!at || ac === "aac") && srcRate <= ((plan.v || 0) + plan.a) * 2.2;
    const rate = (plan.v || 0) + (at ? plan.a : 0);
    const n = copyOK ? 1 : Math.max(1, Math.ceil(dur / Math.floor(LIM.part * 8 / (rate * 1.08))));
    const seg = dur / n, parts = [];
    for (let i = 0; i < n; i++) {
      const out = new M.Output({format: new M.Mp4OutputFormat({fastStart: "in-memory"}), target: new M.BufferTarget()});
      const start = i * seg, end = i === n - 1 ? dur : (i + 1) * seg;
      const opts = {input: i === 0 ? input : open(), output: out, tags: {}, showWarnings: false};
      if (n > 1) opts.trim = {start, end};
      if (copyOK) {
        opts.video = kind === "music" ? {discard: true} : undefined;
      } else {
        opts.copy = false;
        opts.video = kind === "music" ? {discard: true} : {codec: "avc", width: w, height: h, fit: "contain", quality: new M.Quality({bitrate: plan.v}), keyFrameInterval: 2};
        opts.audio = {codec: acodec, quality: new M.Quality({bitrate: plan.a}), numberOfChannels: 2, sampleRate: 48000};
      }
      if (!at && kind === "video") opts.audio = {discard: true};
      const conv = await M.Conversion.init(opts);
      if (!conv.isValid) throw new Error("この形のファイルは変換できません");
      conv.onProgress = p => onp((i + p) / n);
      await conv.execute();
      const blob = new Blob([out.target.buffer], {type: kind === "music" ? "audio/mp4" : "video/mp4"});
      if (blob.size > 19.5 * MiB) throw new Error("分けても大きすぎました");
      parts.push({blob, d: Math.round((end - start) * 100) / 100});
    }
    onp(1);
    return {parts, dur, poster, w, h, codec: acodec, copied: copyOK};
  }

  // 写真：長い辺 2048 まで、描き直して位置情報などを消す。表に使う小さい写し（640）も作る
  function imageOf(file, max = 2048, q = .82) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const draw = (mx, qq, type) => { const k = Math.min(1, mx / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement("canvas");
          cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k); cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); return cv; };
        const big = draw(max), small = draw(640);
        const thumb = small.toDataURL("image/jpeg", .72);
        big.toBlob(b => { URL.revokeObjectURL(u); b ? res({blob: b, thumb, w: big.width, h: big.height}) : rej(new Error("写真を読めませんでした")); }, "image/jpeg", q);
      };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("写真を読めませんでした")); };
      im.src = u;
    });
  }

  // ---- 置き場（Blossom）へ送る ----
  async function sha256(blob) { const b = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join(""); }
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  function put(url, body, headers, onp) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest(); x.open("PUT", url);
      for (const k in headers) x.setRequestHeader(k, headers[k]);
      if (x.upload && onp) x.upload.onprogress = e => e.lengthComputable && onp(e.loaded / e.total);
      x.onload = () => { if (x.status >= 200 && x.status < 300) { try { res(JSON.parse(x.responseText)); } catch (e) { res({}); } } else rej(new Error(x.getResponseHeader("X-Reason") || ("置き場が受け取りませんでした（" + x.status + "）"))); };
      x.onerror = () => rej(new Error("置き場につながりませんでした")); x.ontimeout = x.onerror; x.send(body);
    });
  }
  // sign(kind, content, tags) → 署名した出来事（その人の鍵で）
  async function upload(blob, sign, onp = () => {}) {
    const x = await sha256(blob), now = Math.floor(Date.now() / 1000);
    const auth = async t => "Nostr " + b64(JSON.stringify(await sign(24242, "jeni に置く", [["t", t], ["x", x], ["expiration", String(now + 900)]])));
    let got = null, used = null, err = null;
    for (const s of SERVERS) {
      try { got = await put(s + "/upload", blob, {"Authorization": await auth("upload"), "Content-Type": blob.type || "application/octet-stream", "X-SHA-256": x}, onp); used = s; break; }
      catch (e) { err = e; }
    }
    if (!got) throw err || new Error("置けませんでした");
    const url = got.url || `${used}/${x}`;
    const mir = [];
    for (const s of SERVERS) if (s !== used) {
      try { await put(s + "/mirror", JSON.stringify({url}), {"Authorization": await auth("upload"), "Content-Type": "application/json"}); mir.push(s); } catch (e) {}
    }
    const ext = (url.match(/\.[a-z0-9]{2,4}$/i) || [""])[0];
    return {u: url, x, m: mir, e: ext};
  }
  // 同じ中身を、写しのある置き場からも取れるように
  const urlsOf = p => [p.u, ...((p.m || []).map(b => `${b}/${p.x}${p.e || ""}`))].filter(Boolean);

  // ---- リンク：YouTube などはその場で、ファイルのリンクはそのまま流す ----
  function linkOf(url) {
    const s = String(url || ""); let m;
    if ((m = s.match(/^https:\/\/(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/)([\w-]{11})/) || s.match(/^https:\/\/youtu\.be\/([\w-]{11})/))) return {yt: m[1]};
    if ((m = s.match(/^https:\/\/(?:www\.)?vimeo\.com\/(\d+)/))) return {vimeo: m[1]};
    return null;
  }

  root.JeniMedia = {LIM, PLAN, SERVERS, MB_URL, lib, prepare, imageOf, upload, urlsOf, linkOf, fmtLen, sha256};
})(typeof globalThis !== "undefined" ? globalThis : this);
