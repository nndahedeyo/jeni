# jeni（試験運用）

すべてをカードで表し、カードを持つ・投げ銭する・受け取ることで、お金に結びつかない jeni（貝）がめぐる仕組みの試験運用です。

- 開く：https://nndahedeyo.github.io/jeni/ （身内での試験運用。招待のリンクから参加します）
- 運営のサーバーはありません。出来事は各自の鍵で署名して、だれでも立てられる複数の中継（Nostr のリレー）に置き、各自の端末にも写しを持ちます
- 2人だけの会話・通話のつなぎ・仲間の輪の中身は、鍵で封をしてから置きます（中継からは読めません）
- 写真・音・動画は、各自の端末の中で軽くしてから、Nostr 用の無料の置き場（Blossom：blossom.nostr.build と blossom.primal.net の2か所）に、各自の鍵で署名した許可で置きます。動画は10分・音は60分まで。1ファイル20MBの上限に合わせて長いものは時間で分けて置き、再生では続けて1本として流します。置いたものはだれでも見られます
- 毎日1回、すべての出来事の番号を OpenTimestamps でビットコインに刻みます（`stamps/`・`.github/workflows/stamp.yml`）
- jeni は円や暗号資産と交換できません。カードの裏の「ウォレット」は開発中です（開発者を募集しています）

## 中身

| ファイル | 役目 |
|---|---|
| `app/rules.js` | jeni のきまり（だれが計算しても同じ結果になる） |
| `app/test.tpl.html` | 画面（見本の版とつなぐ版で同じもの） |
| `app/live.js` | つなぐ版の土台：鍵・中継への読み書き・封 |
| `app/media.js` | 写真・音・動画の下ごしらえ（変換は [Mediabunny](https://mediabunny.dev/) 1.65.2・MPL-2.0 を、使うときだけ jsDelivr から読み込む）と置き場（Blossom）への送り |
| `app/sig.js` `app/seal.js` | 署名（BIP340）と封（AES-GCM・ECDH）。外の部品を使わずに書いている |
| `index.html` | つなぐ版（`python3 tools/build_live.py` で組み立てる） |
| `app/test.html` | 見本の版（どこにもつながない。`python3 tools/build_test.py`） |

## 確かめ

```
node --test tests/rules.test.js tests/seal.test.js && node tests/sig.test.js
python3 tools/build_test.py && MB_DIST=… node tests/test.e2e.js   # MB_DIST：Mediabunny を tsc で組み立てた dist（なければ変換の確かめはとばす）
python3 tools/build_live.py && GENESIS=… MB_DIST=… node tests/live.e2e.js   # 中継と置き場のまねで確かめる（本物には送らない）
```

元の構想と最初の試作（Asset-card の app30）は参考にするだけで、ここで一から簡素に作り直しています。
