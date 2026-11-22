# 試作の画面（proto/home.html）を、そのまま開ける1つのページ（index.html）にする
from pathlib import Path
R = Path(__file__).resolve().parent.parent
body = (R / "proto/home.html").read_text(encoding="utf-8")
head = '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
title_end = body.index("</title>") + len("</title>")
page = head + body[:title_end] + "\n</head>\n<body>\n" + body[title_end:] + "\n</body>\n</html>\n"
(R / "index.html").write_text(page, encoding="utf-8")
print("built index.html")
