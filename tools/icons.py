# ホーム画面のアイコン：jeni を持ったとき・買ったときに出る印と同じ色・形（墨色の貝に金の光・生成りの地）
import os
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
svg = open(os.path.join(here, "app", "shell.svg"), encoding="utf-8").read()
with sync_playwright() as p:
    b = p.chromium.launch()
    for n in (180, 192, 512):
        pg = b.new_page(viewport={"width": n, "height": n})
        pg.set_content(f'<body style="margin:0;width:{n}px;height:{n}px;background:#efe9dc;display:grid;place-items:center;color:#2b261c">'
                       + svg.replace("<svg ", f'<svg style="width:{int(n*.66)}px;height:auto;filter:drop-shadow(0 0 {max(2, n*.035):.1f}px rgba(226,182,78,.95))" ', 1) + "</body>")
        pg.screenshot(path=os.path.join(here, f"icon-{n}.png"))
    b.close()
