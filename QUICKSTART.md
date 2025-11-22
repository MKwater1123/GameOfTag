# 🚀 クイックスタートガイド

GPS Tagアプリを5分で起動する手順です。

## 📝 事前準備（5分）

### 1. Firebase設定（3分）

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクト作成
2. Realtime Database を有効化（テストモードで開始）
3. Webアプリを登録して設定情報をコピー
4. `js/firebase-config.js` に設定を貼り付け

詳細は [SETUP.md](SETUP.md) を参照してください。

### 2. ローカルサーバー起動（1分）

```bash
# ターミナルでプロジェクトディレクトリに移動
cd /path/to/GameOfTag

# Pythonでサーバー起動
python3 -m http.server 8000
```

### 3. アプリを開く（1分）

ブラウザで `http://localhost:8000` にアクセス

## 🧪 動作確認（推奨）

まずテストページで動作確認：

```
http://localhost:8000/test.html
```

✅ すべてのチェック項目が緑色になればOK

## 🎮 使い方

### 複数デバイスでテスト

1. **デバイス1（鬼役）**
   - 名前を入力: 例「タナカ」
   - 「鬼で参加」をクリック
   - 位置情報を許可

2. **デバイス2（逃走者役）**
   - 名前を入力: 例「サトウ」
   - 「逃走者で参加」をクリック
   - 位置情報を許可

3. **確認**
   - 鬼の画面：全員の位置が見える
   - 逃走者の画面：鬼の位置は見えない、10分カウントダウンが表示

## ⚙️ カスタマイズ

### エリア設定を変更

`js/app.js` の19行目あたり：

```javascript
const GAME_SETTINGS = {
    center_lat: 35.6895,     // ← あなたの場所の緯度
    center_lng: 139.6917,    // ← あなたの場所の経度
    radius_meter: 500        // ← エリア半径（メートル）
};
```

### 位置送信間隔を変更

`js/app.js` の25行目あたり：

```javascript
const RUNNER_UPDATE_INTERVAL = 10 * 60 * 1000; // 10分
// ↓ 例：5分に変更
const RUNNER_UPDATE_INTERVAL = 5 * 60 * 1000;
```

## 💡 ヒント

### スマートフォンでテスト

1. PCとスマホを同じWi-Fiに接続
2. PCのローカルIPアドレスを確認：
   ```bash
   # Mac/Linux
   ifconfig | grep "inet "
   # Windows
   ipconfig
   ```
3. スマホのブラウザで `http://[PCのIP]:8000` にアクセス

### 位置情報が取れない場合

- HTTPSまたは`localhost`でアクセスしているか確認
- ブラウザの位置情報許可を確認
- デバイスの位置情報サービスがONか確認

## 🐛 トラブルシューティング

### Firebase接続エラー
→ `js/firebase-config.js` の設定を確認

### 地図が表示されない
→ インターネット接続を確認（Leaflet CDNが必要）

### 他のプレイヤーが見えない
→ Firebase Realtime Databaseのセキュリティルールを確認

詳細は [SETUP.md](SETUP.md) のトラブルシューティングを参照。

## 📚 次のステップ

- [ ] セキュリティルールを本番用に変更
- [ ] Firebase Hostingでデプロイ
- [ ] カスタムアイコンを追加
- [ ] 終了条件の実装

---

楽しいゲームを！🎉
