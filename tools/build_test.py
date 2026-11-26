# テスト版（つながない）を1つのページにまとめる：きまり・QR・黄金らせん・コインを中に入れる
import json, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import golden
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app = os.path.join(here, "app")
tpl = open(os.path.join(app, "test.tpl.html"), encoding="utf-8").read()
coin = open(os.path.join(app, "shell.svg"), encoding="utf-8").read()
coin = re.sub(r"<!--.*?-->", "", coin, flags=re.S)
coin = re.sub(r'\s(width|height)="\d+"', "", coin, count=2)
coin = " ".join(coin.split()).replace("`", "")
gp, _ = golden.golden(n=12)
out = (tpl.replace("/*RULES*/", open(os.path.join(app, "rules.js"), encoding="utf-8").read())
          .replace("/*QR*/", open(os.path.join(app, "qr.js"), encoding="utf-8").read())
          .replace("/*COIN*/", coin).replace("/*G*/", json.dumps(gp)))
open(os.path.join(app, "test.html"), "w", encoding="utf-8").write(out)
print("built app/test.html", len(out))
