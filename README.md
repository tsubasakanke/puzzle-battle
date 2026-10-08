# Puzzle Battle 🧱🟢🍉

テトリス・ぷよぷよ・スイカゲームが1つのサイトで遊べるブラウザゲーム。

- **ひとりで遊ぶ**：3ゲームのエンドレス（ハイスコア保存）
- **チュートリアル**：ゲームごとのステップ式レッスン
- **NPC対戦**：かんたん / ふつう / むずかしい / 鬼。NPC に別のゲームを遊ばせる「異種対戦」もできる
- **オンライン対戦**：部屋を作ってリンクを送るだけ。同じゲーム同士も、違うゲーム同士も対戦できる（2本先取）

## 異種対戦のしくみ

攻撃はすべて共通の「AP（攻撃ポイント）」になって、相手のゲームのおじゃまに変換される。

| ゲーム | AP の出し方 | 1AP を受けると |
|---|---|---|
| テトリス | 2列=1, 3列=2, 4列=4, Tスピン, REN, B2B | おじゃま1列 |
| ぷよぷよ | 連鎖（おじゃま6個 = 1AP） | おじゃまぷよ6個 |
| スイカ | 大きいフルーツの合体・連続合体 | おじゃま石1個 |

数値は `src/core/balance.ts` にまとまっている。

## 自分のパソコンで動かす

Node.js 20 以上が必要。

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173/puzzle-battle/` を開く。

- `npm test`：テスト
- `npm run check`：型チェック + テスト + ビルド

## オンライン対戦の設定（Firebase）

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを作る
2. 「Authentication」→「ログイン方法」で **匿名** を有効にする
3. 「Realtime Database」を作る（ロケーションはどこでも OK）→「ルール」タブに `database.rules.json` の中身を貼って公開
4. 「プロジェクトの設定」→「マイアプリ」で Web アプリを追加し、表示された `firebaseConfig` を `src/net/firebaseConfig.ts` に貼る

`firebaseConfig` が `null` のままでも、オンライン以外は全部遊べる。

## 公開

`main` に push すると GitHub Actions が `npm run check` を通したうえで GitHub Pages に公開する（Settings → Pages の Source を「GitHub Actions」にしておく）。
