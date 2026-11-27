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
body = (tpl.replace("/*RULES*/", rd("rules.js")).replace("/*QR*/", rd("qr.js")).replace("/*MEDIA*/", rd("media.js"))
           .replace("/*COIN*/", coin).replace("/*G*/", json.dumps(gp)).replace("/*GENESIS*/", cfg["genesis"]))
body = re.sub(r"^<title>.*?</title>\n", "", body, count=1)
body = body.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
head = ('<!doctype html><html lang="ja"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<title>jeni 試験運用</title><meta name="robots" content="noindex">'
        '<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}[hidden]{display:none!important}img{max-width:100%}</style>'
        '<script>window.JENI_LIVE = true;</script>'
        f'<script>{rd("sig.js")}</script><script>{rd("seal.js")}</script><script>{rd("live.js")}</script>'
        '</head><body>\n')
out = head + body + "\n</body></html>\n"
# 公開する場所：このリポジトリのいちばん上（index.html）と、作ったものの置き場（nndahedeyo.github.io/jeni/）に同じものを置く
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(out)
print("built index.html", len(out))
