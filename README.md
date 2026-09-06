# LINE Tennis

スマホ横持ちで遊ぶ、2〜4人対応のカジュアルWebテニスです。

- 2人: シングルス
- 3人: ダブルス + CPU 1人
- 4人: 2対2ダブルス
- 操作: 左スティック移動 / ストローク / ボレー
- サーブ: ストローク長押し → 離す
- 招待: ルームURLをLINE共有
- フロント: GitHub Pages想定
- リアルタイム通信: Cloudflare Workers + Durable Objects + WebSocket

## 1. Workerをデプロイ

Cloudflareアカウントで Wrangler を利用します。

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

表示された `https://...workers.dev` URLをコピーします。

## 2. フロントの接続先を設定

`src/config.js` のURLを書き換えます。

```js
window.TENNIS_SERVER_URL = "https://line-tennis-worker.<your-account>.workers.dev";
```

## 3. GitHub Pagesを有効化

Public repositoryにpushし、Settings → Pages → Deploy from a branch → `main` / `(root)` を選びます。

## 4. 遊び方

1. GitHub PagesのURLをスマホで開く
2. 「ルームを作る」
3. 招待URLをLINEで送る
4. 2〜4人が入室したらホストが「試合開始」
5. 3人の場合はCPUが自動参加

## MVP上の制限

- 物理演算はカジュアル仕様です。
- ホスト端末がゲーム状態を管理するため、ホスト離脱時の試合継続は未対応です。
- ラリー判定やアウト判定は簡易版です。
- 本格的なタイブレーク、デュース、サーブフォルトは未実装です。

## 次に追加しやすい機能

- ロブ / スマッシュ
- サーブフォルトと2ndサーブ
- キャラクター選択
- コート選択
- 効果音 / 振動
- 戦績保存
- ホスト移行
