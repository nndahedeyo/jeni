// 言葉の切り替え：端末の言葉が日本語なら何もしない。日本語以外なら、画面に出た日本語を英語の言い換え表（en.js）で置き換える。
// 置き換えるのは、表にある言葉と型（名前や数が入るもの）だけ。人が書いたカードや会話は、そのまま出す。
"use strict";
(function (root) {
  const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "ja"]).map(x => String(x).toLowerCase());
  const lang = /^ja\b/.test(langs[0]) ? "ja" : "en";
  const I = root.JeniI18n = {lang, t: s => s};
  if (lang === "ja") return;
  const JA = /[぀-ヿ㐀-鿿！-｠]/;
  const exact = new Map(), pats = [];
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function add(list) {
    for (const [ja, en] of list || []) {
      if (!/\{[#*]\}/.test(ja)) { exact.set(ja, en); continue; }
      const re = esc(ja).replace(/\\\{#\\\}/g, "([\\d][\\d,.:]*)").replace(/\\\{\\\*\\\}/g, "(.+?)");
      pats.push([new RegExp("^" + re + "$", "s"), en]);
    }
  }
  add(root.JENI_EN); if (!root.JENI_LIVE) add(root.JENI_EN_SAMPLE);
  pats.sort((a, b) => b[0].source.length - a[0].source.length);   // 長い（くわしい）型から
  const inner = x => (x != null && exact.has(x.trim())) ? exact.get(x.trim()) : (x == null ? "" : x);
  function tr(s) {
    if (!s || !JA.test(s)) return null;
    const k = s.trim(); if (!k) return null;
    const lead = s.slice(0, s.indexOf(k)), tail = s.slice(s.indexOf(k) + k.length);
    if (exact.has(k)) return lead + exact.get(k) + tail;
    for (const [re, en] of pats) { const m = k.match(re); if (m) return lead + en.replace(/\$(\d)/g, (_, i) => inner(m[+i])) + tail; }
    return null;
  }
  I.t = s => { const r = tr(s); return r == null ? s : r; };
  const ATTR = ["aria-label", "title", "placeholder", "alt"];
  function walk(n) {
    if (!n) return;
    if (n.nodeType === 3) { if (n.parentNode && /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)) return; const r = tr(n.nodeValue); if (r != null && r !== n.nodeValue) n.nodeValue = r; return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.nodeName)) return;
    for (const a of ATTR) { const v = n.getAttribute(a); if (v) { const r = tr(v); if (r != null && r !== v) n.setAttribute(a, r); } }
    if (n.nodeName === "INPUT" && /^(button|submit)$/.test(n.type) && n.value) { const r = tr(n.value); if (r != null) n.value = r; }
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
  }
  function start() {
    document.documentElement.lang = "en";
    walk(document.body); const t = tr(document.title); if (t) document.title = t;
    new MutationObserver(ms => { for (const m of ms) {
      if (m.type === "characterData") walk(m.target);
      else if (m.type === "attributes") walk(m.target);
      else m.addedNodes.forEach(walk);
    } }).observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR});
    new MutationObserver(() => { const t = tr(document.title); if (t) document.title = t; }).observe(document.querySelector("title") || document.head, {subtree: true, childList: true, characterData: true});
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})(typeof globalThis !== "undefined" ? globalThis : this);
