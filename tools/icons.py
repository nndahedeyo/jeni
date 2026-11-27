# ホーム画面のアイコン（貝の印・金色・生成りの地）を描く
import os
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
svg = open(os.path.join(here, "app", "shell.svg"), encoding="utf-8").read()
with sync_playwright() as p:
    b = p.chromium.launch()
    for n in (180, 192, 512):
        pg = b.new_page(viewport={"width": n, "height": n})
        pg.set_content(f'<body style="margin:0;width:{n}px;height:{n}px;background:#f3ecdd;display:grid;place-items:center;color:#a8811f">'
                       + svg.replace("<svg ", f'<svg style="width:{int(n*.68)}px;height:auto" ', 1) + "</body>")
        pg.screenshot(path=os.path.join(here, f"icon-{n}.png"))
    b.close()
