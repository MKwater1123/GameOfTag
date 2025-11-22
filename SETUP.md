# Firebase セットアップガイド

## 📋 必要なもの

- Googleアカウント
- 現代的なWebブラウザ（Chrome, Firefox, Safari等）

## 🔧 詳細セットアップ手順

### ステップ1: Firebaseプロジェクトの作成

1. **Firebase Consoleにアクセス**
   - https://console.firebase.google.com/ を開く
   - Googleアカウントでログイン

2. **新規プロジェクトを作成**
   - 「プロジェクトを追加」ボタンをクリック
   - プロジェクト名: `gps-tag-game`（任意の名前でOK）
   - 「続行」をクリック

3. **Google Analyticsの設定**（オプション）
   - 不要な場合は無効にしても問題なし
   - 「プロジェクトを作成」をクリック
   - プロジェクト作成完了まで待つ

### ステップ2: Realtime Databaseの有効化

1. **データベースを選択**
   - 左側メニューから「構築」→「Realtime Database」を選択
   - 「データベースを作成」をクリック

2. **ロケーションを選択**
   - 推奨: `asia-southeast1 (シンガポール)`
   - 日本に近いため低レイテンシ

3. **セキュリティルールを設定**
   - **開発中**: 「テストモードで開始」を選択
     ```json
     {
       "rules": {
         ".read": true,
         ".write": true
       }
     }
     ```
   - ⚠️ **注意**: これは全員が読み書き可能な状態です
   - テストが終わったら必ずセキュリティを強化してください

4. **「有効にする」をクリック**

### ステップ3: Webアプリの登録

1. **プロジェクト設定を開く**
   - 左上の⚙️アイコン → 「プロジェクトの設定」

2. **アプリを追加**
   - 「全般」タブを選択
   - 下にスクロールして「マイアプリ」セクションを見つける
   - Webアイコン（`</>`）をクリック

3. **アプリ情報を入力**
   - アプリのニックネーム: `GPS Tag Web`
   - Firebase Hostingは設定しない（チェック不要）
   - 「アプリを登録」をクリック

4. **設定情報をコピー**
   - 表示されるFirebase SDKスニペットから以下の情報をコピー:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     databaseURL: "https://your-project-default-rtdb.firebaseio.com",
     projectId: "your-project",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc..."
   };
   ```

### ステップ4: アプリに設定を反映

1. **firebase-config.jsを編集**
   - `js/firebase-config.js` ファイルを開く
   - コピーした設定情報で`YOUR_API_KEY`などを置き換える

   ```javascript
   export const firebaseConfig = {
       apiKey: "AIzaSyC...",  // ここに実際の値を貼り付け
       authDomain: "gps-tag-game.firebaseapp.com",
       databaseURL: "https://gps-tag-game-default-rtdb.asia-southeast1.firebasedatabase.app",
       projectId: "gps-tag-game",
       storageBucket: "gps-tag-game.appspot.com",
       messagingSenderId: "123456789012",
       appId: "1:123456789012:web:abcdef123456"
   };
   ```

2. **保存**

### ステップ5: データベース構造の準備（オプション）

Firebase Realtime Databaseの「データ」タブで初期構造を作成できます：

```
game_session_v1/
  ├── status: "active"
  ├── settings/
  │   ├── center_lat: 35.6895
  │   ├── center_lng: 139.6917
  │   └── radius_meter: 500
  └── players/
      (ここに自動的にプレイヤーデータが追加される)
```

手動で追加する必要はありませんが、構造を理解するために参照してください。

## 🔒 本番環境用セキュリティルール

開発が完了したら、以下のルールに変更してください：

### オプション1: シンプルな認証なしルール

```json
{
  "rules": {
    "game_session_v1": {
      "status": {
        ".read": true,
        ".write": false
      },
      "settings": {
        ".read": true,
        ".write": false
      },
      "players": {
        "$player_id": {
          ".read": true,
          ".write": true,
          ".validate": "newData.hasChildren(['username', 'role', 'lat', 'lng', 'updated_at'])"
        }
      }
    }
  }
}
```

### オプション2: より厳密なルール（推奨）

```json
{
  "rules": {
    "game_session_v1": {
      "players": {
        "$player_id": {
          ".read": true,
          ".write": true,
          ".validate": "newData.hasChildren(['username', 'role', 'lat', 'lng', 'updated_at']) && 
                        newData.child('username').isString() && 
                        newData.child('username').val().length > 0 && 
                        newData.child('username').val().length <= 20 && 
                        (newData.child('role').val() == 'oni' || newData.child('role').val() == 'runner') && 
                        newData.child('lat').isNumber() && 
                        newData.child('lng').isNumber() && 
                        newData.child('updated_at').isNumber()"
        }
      }
    }
  }
}
```

## 🧪 動作確認

1. **ローカルサーバーを起動**
   ```bash
   python3 -m http.server 8000
   ```

2. **ブラウザで開く**
   - `http://localhost:8000` にアクセス

3. **複数タブで開く**
   - 1つのタブで「鬼」として参加
   - 別のタブで「逃走者」として参加
   - それぞれの位置が地図に表示されることを確認

4. **Firebase Consoleで確認**
   - Realtime Databaseの「データ」タブで
   - `game_session_v1/players/` 配下にデータが追加されていることを確認

## ❗ トラブルシューティング

### エラー: "Firebase not defined"
- Firebase CDNスクリプトが読み込まれていません
- `index.html`にFirebase CDNが含まれているか確認

### エラー: "Permission denied"
- Realtime Databaseのセキュリティルールを確認
- テストモードになっているか確認

### 位置情報が取得できない
- HTTPSまたはlocalhostで開いているか確認
- ブラウザの位置情報許可を確認
- デバイスの位置情報サービスがONか確認

### 地図が表示されない
- インターネット接続を確認
- Leaflet CDNが読み込まれているか確認
- ブラウザのコンソールでエラーを確認

## 📞 サポート

問題が解決しない場合は、ブラウザのデベロッパーツール（F12）でコンソールを確認し、
エラーメッセージを参照してください。

---

最終更新: 2025-11-22
