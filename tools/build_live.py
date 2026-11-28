# つなぐ版（試験運用）を1つのページにまとめる：test.tpl.html と同じ画面を、本物の中継につなぐ形で組み立てる。
# はじまりの人の番号は入れない。入るのはその要約（SHA-256）だけ（tools/live.json）
import json, re, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import golden
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app = os.path.join(here, "app")
cfg = json.load(open(os.path.join(here, "tools", "live.json")))
tpl = open(os.path.join(app, "test.tpl.html"), encoding="utf-8").read()
coin = open(os.path.join(app, "shell.svg"), encoding="utf-8").read()
coin = re.sub(r"<!--.*?-->", "", coin, flags=re.S)
coin = re.sub(r'\s(width|height)="\d+"', "", coin, count=2)
coin = " ".join(coin.split()).replace("`", "")
gp, _ = golden.golden(n=12)
rd = lambda f: open(os.path.join(app, f), encoding="utf-8").read()
body = (tpl.replace("/*RULES*/", rd("rules.js")).replace("/*QR*/", rd("qr.js")).replace("/*MEDIA*/", rd("media.js")).replace("/*EN*/", rd("en.js") if os.environ.get("EN") else "").replace("/*I18N*/", rd("i18n.js") if os.environ.get("EN") else "")   # 英語は確かめ終わるまで運用版には入れない（EN=1 で入る）
           .replace("/*COIN*/", coin).replace("/*G*/", json.dumps(gp)).replace("/*GENESIS*/", cfg["genesis"]))
body = re.sub(r"^<title>.*?</title>\n", "", body, count=1)
body = body.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
head = ('<!doctype html><html lang="ja"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<title>jeni 試験運用</title><meta name="robots" content="noindex">'
        '<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icon-180.png"><link rel="icon" href="icon-192.png">'
        '<meta name="theme-color" content="#efe9dc"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-title" content="jeni"><meta name="apple-mobile-web-app-status-bar-style" content="default">'
        '<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}[hidden]{display:none!important}img{max-width:100%}</style>'
        # ほかのサイトの枠の中では動かない（見えない枠を重ねて押させる「クリックの乗っ取り」を防ぐ）
        '<script>window.JENI_LIVE = true; if (window.top !== window.self) { document.documentElement.style.display = "none"; try { window.top.location = window.location.href; } catch (e) {} throw new Error("framed"); }</script>'
        f'<script>{rd("sig.js")}</script><script>{rd("seal.js")}</script><script>{rd("live.js")}</script>'
        '</head><body>\n')
out = head + body + "\n</body></html>\n"
# 読み込んでよいものを決める（CSP）：このページの中の決まったスクリプトと、動画の変換の部品（jsDelivr）だけを動かす。
# 人が書いた文字に紛れたスクリプトは動かない。中の各スクリプトは、その中身の指紋（SHA-256）で許す
import base64, hashlib as _h
_sh = sorted({"'sha256-" + base64.b64encode(_h.sha256(m.encode("utf-8")).digest()).decode() + "'" for m in re.findall(r"<script>(.*?)</script>", out, flags=re.S)})
csp = ("default-src 'self'; "
       f"script-src 'self' {' '.join(_sh)} https://cdn.jsdelivr.net 'wasm-unsafe-eval'; "
       "worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; "
       "connect-src 'self' https: wss:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; "
       "font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; manifest-src 'self'")
out = out.replace('<meta charset="utf-8">', f'<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="{csp}">', 1)
# 公開する場所：このリポジトリのいちばん上（index.html）と、作ったものの置き場（nndahedeyo.github.io/jeni/）に同じものを置く
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(out)
print("built index.html", len(out))

# ホーム画面に置く（アプリのように開く）・つながらない場所でも開く：形の決まり・控えの係・アイコン
import hashlib, subprocess
ver = hashlib.sha256(out.encode("utf-8")).hexdigest()[:12]
json.dump({"name": "jeni 試験運用", "short_name": "jeni", "lang": "ja", "start_url": "./", "scope": "./", "display": "standalone",
           "background_color": "#111712", "theme_color": "#111712",
           "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
                     {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]},
          open(os.path.join(here, "manifest.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
sw = open(os.path.join(here, "tools", "sw.tpl.js"), encoding="utf-8").read().replace("/*VER*/", ver)
open(os.path.join(here, "sw.js"), "w", encoding="utf-8").write(sw)
if os.environ.get("ICONS") or not all(os.path.exists(os.path.join(here, f"icon-{n}.png")) for n in (180, 192, 512)):
    subprocess.run([sys.executable, os.path.join(here, "tools", "icons.py")], check=True)
print("built manifest/sw", ver)
