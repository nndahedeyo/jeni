// 画面に出た日本語を集める（英語の言い換え表を作る・抜けを確かめるため）
(() => {
  const JA = /[぀-ヿ一-鿿]/, S0 = window.__ja = new Set(), S = {add: x => { if (S0.has(x)) return; S0.add(x); try { window.__jaRec && window.__jaRec(x); } catch (e) {} }};
  const scan = n => {
    if (!n) return;
    if (n.nodeType === 3) { if (n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) return; const t = n.nodeValue.trim(); if (t && JA.test(t)) S.add("T\t" + t); return; }
    if (n.nodeType !== 1 || n.tagName === "SCRIPT" || n.tagName === "STYLE") return;
    for (const a of ["aria-label", "title", "placeholder", "alt"]) { const v = n.getAttribute(a); if (v && JA.test(v)) S.add("A\t" + v.trim()); }
    for (const c of n.childNodes) scan(c);
  };
  new MutationObserver(ms => { for (const m of ms) { if (m.type === "characterData") scan(m.target); else m.addedNodes.forEach(scan); if (m.type === "attributes") scan(m.target); } })
    .observe(document, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "title", "placeholder", "alt"]});
  document.addEventListener("DOMContentLoaded", () => { scan(document.body); if (JA.test(document.title)) S.add("T\t" + document.title); });
})();
