# 📱 GPS Tag - リアル鬼ごっこアプリ

GPSを利用したリアルタイム鬼ごっこゲームのWebアプリケーションです。

## 🎮 機能

- **リアルタイム位置共有**: FirebaseとGPSを使った位置情報の共有
- **役割システム**: 
  - 👹 **鬼**: 全員の位置をリアルタイムで把握（5秒ごとに位置送信）
  - 🏃 **逃走者**: 30秒に1回だけ位置を送信、鬼の位置は見えない
- **ジオフェンス**: 設定エリア外に出ると警告＆バイブレーション
- **インタラクティブマップ**: Leaflet.jsを使った見やすい地図表示

## 📁 プロジェクト構造

```
GameOfTag/
├── index.html              # メインHTML
├── css/
│   └── style.css          # スタイルシート
├── js/
│   ├── firebase-config.js # Firebase設定
│   └── app.js             # メインロジック
├── 仕様書.md               # 詳細仕様書
└── README.md              # このファイル
```

## 🚀 セットアップ手順

### 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: `gps-tag-game`）
4. Google Analyticsは任意で設定

### 2. Realtime Databaseの有効化

1. Firebase Consoleで「Realtime Database」を選択
2. 「データベースを作成」をクリック
3. ロケーションを選択（例: `asia-southeast1`）
4. セキュリティルールは「テストモードで開始」を選択（開発用）

   **重要**: 本番環境では適切なセキュリティルールを設定してください。

### 3. Firebase設定の取得

1. プロジェクト設定（⚙️アイコン）→「全般」タブ
2. 「マイアプリ」セクションで「ウェブアプリ」を追加
3. アプリのニックネームを入力
4. 表示される設定情報をコピー

### 4. 設定ファイルの更新

`js/firebase-config.js` を開き、取得した設定情報で更新:

```javascript
export const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.firebaseio.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};
```

### 5. index.htmlにFirebase CDNを追加

`index.html` の `</body>` タグ直前に以下を追加:

```html
<!-- Firebase CDN -->
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js"></script>
```

### 6. アプリの起動

#### ローカルサーバーで起動（推奨）

```bash
# Python 3の場合
python3 -m http.server 8000

# Node.jsのhttp-serverを使う場合
npx http-server -p 8000
```

ブラウザで `http://localhost:8000` にアクセス

#### VS Code Live Serverを使う場合

1. VS Codeで「Live Server」拡張機能をインストール
2. `index.html` を右クリック → "Open with Live Server"

## 📱 使い方

1. **名前を入力**: アプリ起動時に表示名を入力
2. **役割選択**: 「鬼」または「逃走者」を選択
3. **位置情報許可**: ブラウザの位置情報許可を承認
4. **ゲーム開始**: 地図上でリアルタイムに他のプレイヤーを確認

### 鬼の場合 👹
- 全員の位置がリアルタイムで表示（5秒ごとに更新）
- 逃走者の位置は最大30秒前の情報

### 逃走者の場合 🏃
- 30秒に1回だけ位置を送信
- カウントダウンタイマーで次の送信時間を確認
- 鬼の位置は見えない

## ⚙️ ゲーム設定のカスタマイズ

`js/app.js` の定数を編集:

### エリア設定
```javascript
const GAME_SETTINGS = {
    center_lat: 31.731222,      // エリア中心の緯度
    center_lng: 130.728778,     // エリア中心の経度
    radius_meter: 1000          // エリア半径（メートル）
};
```

### 位置送信頻度
```javascript
const ONI_SEND_INTERVAL_MS = 5 * 1000;      // 鬼: 5秒ごと
const RUNNER_SEND_INTERVAL_MS = 30 * 1000;  // 逃走者: 30秒ごと（テスト用）
// 本番では 10 * 60 * 1000 (10分) などに変更可能
```

## 🔒 セキュリティ設定（本番環境）

Firebase Realtime Databaseのセキュリティルール例:

```json
{
  "rules": {
    "game_session_v1": {
      "players": {
        "$uid": {
          ".write": "$uid === auth.uid",
          ".read": true
        }
      }
    }
  }
}
```

## 🌐 対応ブラウザ

- Chrome / Edge (推奨)
- Firefox
- Safari (iOS 14以降)

**注意**: HTTPSまたはlocalhostでのみ位置情報APIが動作します。

## 📝 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🤝 貢献

バグ報告や機能提案は、Issueまたはプルリクエストでお願いします。

## 📚 技術スタック

- **フロントエンド**: HTML5, CSS3, Vanilla JavaScript
- **地図**: Leaflet.js
- **バックエンド**: Firebase Realtime Database
- **位置情報**: Geolocation API

---

作成日: 2025-11-22
