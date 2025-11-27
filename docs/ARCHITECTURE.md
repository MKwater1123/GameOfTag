# GameOfTag アーキテクチャドキュメント

## 概要

このドキュメントでは、GPSタグゲーム「GameOfTag」のレイヤードアーキテクチャについて説明します。

## ディレクトリ構造

```
js/
├── config/
│   └── constants.js          # 定数・設定値
├── utils/
│   └── helpers.js            # ユーティリティ関数
├── services/
│   ├── firebase.service.js   # Firebase通信サービス
│   ├── location.service.js   # 位置情報サービス
│   └── game.service.js       # ゲームロジックサービス
├── ui/
│   ├── map.ui.js             # 地図UI管理
│   ├── screens.ui.js         # 画面遷移管理
│   ├── events.ui.js          # イベント表示管理
│   └── playerList.ui.js      # 参加者リストUI
├── firebase-config.js        # Firebase設定
└── app.layered.js            # メインエントリポイント
```

## レイヤー構成図

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│                     (app.layered.js)                         │
│              アプリケーションのフロー制御                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   UI Layer    │ │ Service Layer │ │  Utils Layer  │
│               │ │               │ │               │
│ • map.ui      │ │ • firebase    │ │ • helpers     │
│ • screens.ui  │ │ • location    │ │               │
│ • events.ui   │ │ • game        │ │               │
│ • playerList  │ │               │ │               │
└───────────────┘ └───────────────┘ └───────────────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
                        ▼
              ┌───────────────────┐
              │   Config Layer    │
              │   (constants.js)  │
              │   定数・設定値     │
              └───────────────────┘
```

## 依存関係の方向

```
Application → UI Layer
Application → Service Layer
Application → Config Layer

UI Layer → Utils Layer
UI Layer → Config Layer

Service Layer → Utils Layer
Service Layer → Config Layer

Utils Layer → (なし)
Config Layer → (なし)
```

---

## レイヤー詳細

### 1. Config Layer (設定レイヤー)

アプリケーション全体で使用する定数と設定値を一元管理します。

#### `js/config/constants.js`

| エクスポート名 | 型 | 説明 |
|---------------|-----|------|
| `GAME_AREA` | Object | ゲームエリア設定（中心座標、半径） |
| `SEND_INTERVALS` | Object | 位置情報送信間隔（鬼/逃走者） |
| `GAME_CONFIG` | Object | ゲーム設定（デフォルト時間、捕獲半径など） |
| `GAME_STATUS` | Object | ゲームステータス定数 |
| `ROLES` | Object | 役割定数（oni/runner/admin） |
| `MARKER_URLS` | Object | Leafletマーカー画像URL |
| `MARKER_CONFIG` | Object | マーカーサイズ設定 |
| `ADMIN_PASSWORD` | string | 管理者パスワード |
| `FIREBASE_PATHS` | Object | Firebaseデータパス |
| `GEOLOCATION_OPTIONS` | Object | GPS取得オプション |
| `EVENT_TYPES` | Object | イベントタイプ定数 |

**定数一覧:**

```javascript
// ゲームエリア（鹿児島高専中心、半径500m）
GAME_AREA = {
    CENTER_LAT: 31.731222,
    CENTER_LNG: 130.728778,
    RADIUS_METER: 500
}

// 送信間隔
SEND_INTERVALS = {
    ONI_MS: 10000,      // 鬼: 10秒
    RUNNER_MS: 30000    // 逃走者: 30秒
}

// ゲーム設定
GAME_CONFIG = {
    DEFAULT_DURATION_MS: 1800000,     // 30分
    COUNTDOWN_SECONDS: 10,             // カウントダウン
    CAPTURE_RADIUS_METER: 10,          // 捕獲距離
    OUTSIDE_AREA_LIMIT_SECONDS: 30,    // エリア外失格時間
    MAX_EVENTS: 50                     // イベント最大数
}
```

---

### 2. Utils Layer (ユーティリティレイヤー)

汎用的なヘルパー関数を提供します。

#### `js/utils/helpers.js`

| 関数名 | 引数 | 戻り値 | 説明 |
|--------|------|--------|------|
| `calculateDistance` | `lat1, lng1, lat2, lng2` | `number` | 2点間の距離を計算（Haversine公式、メートル単位） |
| `formatTime` | `timestamp` | `string` | タイムスタンプを `HH:MM:SS` 形式に変換 |
| `formatCountdown` | `seconds` | `string` | 秒数を `MM:SS` 形式に変換 |
| `formatMillisecondsToMMSS` | `ms` | `string` | ミリ秒を `MM:SS` 形式に変換 |
| `generateUniqueId` | `prefix` | `string` | プレフィックス付きユニークID生成 |
| `getCurrentTimeString` | - | `string` | 現在時刻を日本語形式で取得 |
| `isInsideArea` | `lat, lng, centerLat, centerLng, radiusMeter` | `boolean` | 点がエリア内にあるか判定 |
| `debounce` | `func, wait` | `Function` | デバウンス関数を生成 |
| `logDebug` | `category, message, data?` | `void` | タイムスタンプ付きデバッグログ出力 |

**使用例:**

```javascript
import { calculateDistance, formatTime, logDebug } from './utils/helpers.js';

// 距離計算
const distance = calculateDistance(31.731, 130.728, 31.732, 130.729);
// => 約120メートル

// 時刻フォーマット
const timeStr = formatTime(Date.now());
// => "14:30:45"

// デバッグログ
logDebug('Game', 'Player joined', { username: 'test' });
// => [14:30:45][Game] Player joined { username: 'test' }
```

---

### 3. Service Layer (サービスレイヤー)

ビジネスロジックと外部サービスとの通信を担当します。

#### `js/services/firebase.service.js`

Firebase Realtime Database との全ての通信を抽象化するシングルトンサービス。

**クラス: `FirebaseService`**

| メソッド | 引数 | 戻り値 | 説明 |
|----------|------|--------|------|
| `initialize()` | - | `boolean` | Firebase初期化 |
| `isInitialized()` | - | `boolean` | 初期化状態確認 |
| **プレイヤー操作** |
| `updatePlayerLocation` | `playerId, data` | `Promise` | プレイヤー位置更新 |
| `capturePlayer` | `playerId, capturedBy` | `Promise` | プレイヤー確保 |
| `disqualifyPlayer` | `playerId, reason` | `Promise` | プレイヤー失格 |
| `removePlayer` | `playerId` | `Promise` | プレイヤー削除 |
| `clearAllPlayers` | - | `Promise` | 全プレイヤー削除 |
| `watchPlayers` | `callback, errorCallback` | `void` | プレイヤーデータ監視開始 |
| `unwatchPlayers` | - | `void` | プレイヤーデータ監視停止 |
| `getPlayersOnce` | - | `Promise<Object>` | プレイヤーデータ1回取得 |
| **ゲームステータス操作** |
| `setGameStatus` | `status` | `Promise` | ゲームステータス設定 |
| `updateGameStatus` | `updates` | `Promise` | ゲームステータス更新 |
| `watchGameStatus` | `callback` | `void` | ステータス監視開始 |
| `getGameStatusOnce` | - | `Promise<Object>` | ステータス1回取得 |

**エクスポート:** `firebaseService` (シングルトンインスタンス)

---

#### `js/services/location.service.js`

GPS位置情報の取得と管理を担当するシングルトンサービス。

**クラス: `LocationService`**

| メソッド | 引数 | 戻り値 | 説明 |
|----------|------|--------|------|
| `isAvailable()` | - | `boolean` | Geolocation API利用可否 |
| `startTracking` | `onUpdate, onError` | `boolean` | 位置追跡開始 |
| `stopTracking` | - | `void` | 位置追跡停止 |
| `getCurrentPosition` | - | `Object\|null` | 現在位置取得 `{lat, lng}` |
| `isInsideGameArea` | - | `boolean\|null` | エリア内判定 |
| `getDistanceFromCenter` | - | `number\|null` | 中心からの距離取得 |
| `getDistanceTo` | `lat, lng` | `number\|null` | 指定座標までの距離 |

**プロパティ:**
- `watchId`: GPS監視ID
- `currentPosition`: 現在位置 `{lat, lng}`
- `onPositionUpdate`: 位置更新コールバック
- `onError`: エラーコールバック

**エクスポート:** `locationService` (シングルトンインスタンス)

---

#### `js/services/game.service.js`

ゲームの状態管理とコアロジックを担当するシングルトンサービス。

**クラス: `GameService`**

| メソッド | 引数 | 戻り値 | 説明 |
|----------|------|--------|------|
| **ユーザー管理** |
| `joinGame` | `username, role` | `Object` | ゲーム参加 |
| `getCurrentUser` | - | `Object` | 現在ユーザー情報取得 |
| `updateUserPosition` | `lat, lng` | `void` | 位置更新 |
| `isOni` | - | `boolean` | 鬼かどうか |
| `isRunner` | - | `boolean` | 逃走者かどうか |
| **ゲーム状態** |
| `updateGameState` | `data` | `void` | ゲーム状態更新 |
| `getGameState` | - | `Object` | ゲーム状態取得 |
| `isGameActive` | - | `boolean` | ゲームアクティブ判定 |
| **位置送信** |
| `startLocationSending` | `onCountdownUpdate?` | `void` | 位置送信開始 |
| `stopLocationSending` | - | `void` | 位置送信停止 |
| **確保処理** |
| `capturePlayer` | `playerId, username` | `Promise` | プレイヤー確保 |
| `handleCaptured` | `capturedBy` | `void` | 自分が確保された処理 |
| **エリア判定** |
| `checkOutsideArea` | - | `void` | エリア外チェック |
| **クリーンアップ** |
| `cleanup` | - | `void` | リソース解放 |

**コールバックプロパティ:**
- `onCaptured`: 確保されたときのコールバック
- `onDisqualified`: 失格時のコールバック
- `onOutsideAreaWarning`: エリア外警告コールバック
- `onGameStatusChange`: ゲーム状態変更コールバック

**エクスポート:** `gameService` (シングルトンインスタンス)

---

### 4. UI Layer (UIレイヤー)

DOM操作と画面表示を担当します。

#### `js/ui/map.ui.js`

Leaflet地図の描画とマーカー管理。

**クラス: `MapUI`**

| メソッド | 引数 | 戻り値 | 説明 |
|----------|------|--------|------|
| `initialize` | `containerId?` | `void` | 地図初期化（デフォルト: 'map'） |
| `updateSelfMarker` | `lat, lng, username, role` | `void` | 自分のマーカー更新 |
| `addPlayerMarker` | `playerId, playerData` | `void` | プレイヤーマーカー追加 |
| `removePlayerMarker` | `playerId` | `void` | プレイヤーマーカー削除 |
| `clearAllPlayerMarkers` | - | `void` | 全マーカークリア |
| `setView` | `lat, lng, zoom?` | `void` | 地図中心設定 |
| `isInitialized` | - | `boolean` | 初期化状態確認 |

**プロパティ:**
- `map`: Leaflet Mapインスタンス
- `userMarker`: 自分のマーカー
- `playerMarkers`: プレイヤーマーカー辞書
- `areaCircle`: エリア円

**エクスポート:** `mapUI` (シングルトンインスタンス)

---

#### `js/ui/screens.ui.js`

画面遷移とステータスバー更新を管理。

**クラス: `ScreensUI`**

| メソッド | 引数 | 戻り値 | 説明 |
|----------|------|--------|------|
| **画面遷移** |
| `showScreen` | `screenName` | `void` | 指定画面に遷移 |
| `showWaitingOverlay` | - | `void` | 待機オーバーレイ表示 |
| `hideWaitingOverlay` | - | `void` | 待機オーバーレイ非表示 |
| `showCountdownScreen` | `countdownStart` | `void` | カウントダウン画面表示 |
| `showCapturedScreen` | `capturedBy` | `void` | 確保画面表示 |
| `showDisqualifiedScreen` | - | `void` | 失格画面表示 |
| `showGameEndScreen` | `players` | `void` | ゲーム終了画面表示 |
| **ステータスバー** |
| `updateRoleDisplay` | `role` | `void` | 役割表示更新 |
| `updateRunnerCountdown` | `seconds` | `void` | 逃走者カウントダウン更新 |
| `updateOniLastUpdate` | `timestamp` | `void` | 鬼の最終更新時刻更新 |
| `updateAreaStatus` | `isInside` | `void` | エリア状態更新 |
| `updateOutsideWarning` | `remainingSeconds` | `void` | エリア外警告更新 |
| **タイマー** |
| `startGameTimer` | `endTime` | `void` | ゲームタイマー開始 |
| `stopGameTimer` | - | `void` | ゲームタイマー停止 |

**画面名一覧:**
- `login`: ログイン画面
- `map`: マップ画面
- `admin`: 管理者画面
- `captured`: 確保画面
- `disqualified`: 失格画面
- `gameEnd`: ゲーム終了画面

**エクスポート:** `screensUI` (シングルトンインスタンス)

---

#### `js/ui/events.ui.js`

ゲームイベントの表示と管理。

**クラス: `EventsUI`**

| メソッド | 引数 | 戻り値 | 説明 |
|----------|------|--------|------|
| `initialize` | - | `void` | イベントエリア初期化 |
| `addEvent` | `message, type?` | `void` | イベント追加 |
| `clearEvents` | - | `void` | イベントクリア |
| `getEvents` | - | `Array` | イベントリスト取得 |

**イベントタイプ:**
- `normal`: 通常イベント
- `important`: 重要イベント（ハイライト表示）

**グローバル公開:**
- `window.addEvent(message, type)`
- `window.clearEvents()`

**エクスポート:** `eventsUI` (シングルトンインスタンス)

---

#### `js/ui/playerList.ui.js`

参加者リストパネルの表示と管理。

**クラス: `PlayerListUI`**

| メソッド | 引数 | 戻り値 | 説明 |
|----------|------|--------|------|
| `initialize` | - | `void` | ボタン/パネル初期化 |
| `toggle` | - | `void` | パネル表示切替 |
| `show` | - | `void` | パネル表示 |
| `hide` | - | `void` | パネル非表示 |
| `update` | `players, currentUser` | `void` | リスト更新 |

**機能:**
- 自分を先頭に表示
- 他プレイヤーとの距離表示
- 鬼が10m以内の逃走者に「確保」ボタン表示

**エクスポート:** `playerListUI` (シングルトンインスタンス)

---

### 5. Application Layer (アプリケーションレイヤー)

#### `js/app.layered.js`

アプリケーションのエントリポイント。各レイヤーを統合してフロー制御を行います。

**主要関数:**

| 関数名 | 説明 |
|--------|------|
| **初期化** |
| `initializeApp` | アプリケーション初期化 |
| `setupLoginScreen` | ログイン画面セットアップ |
| `joinGame` | ゲーム参加処理 |
| **マップ画面** |
| `initMapScreen` | マップ画面初期化 |
| `startLocationTracking` | 位置追跡開始 |
| `setupGameCallbacks` | ゲームコールバック設定 |
| **プレイヤー監視** |
| `watchPlayers` | プレイヤーデータ監視 |
| **ゲームステータス** |
| `watchGameStatus` | ゲーム状態監視 |
| `checkGameStatus` | ゲーム状態確認 |
| `handleGameStatusChange` | 状態変更ハンドラ |
| **管理者機能** |
| `showAdminLogin` | 管理者ログイン画面表示 |
| `setupAdminScreen` | 管理者画面セットアップ |
| `authenticateAdmin` | 管理者認証 |
| `watchPlayersForAdmin` | 管理者用プレイヤー監視 |
| `startGame` | ゲーム開始 |
| `endGame` | ゲーム終了 |
| `clearAllPlayers` | 全プレイヤークリア |

**グローバル公開:**
- `window.capturePlayer(playerId, username)`: プレイヤー確保
- `window.kickPlayer(playerId)`: プレイヤー削除（管理者）

---

## データフロー

### 1. ゲーム参加フロー

```
ユーザー入力 → joinGame()
    → gameService.joinGame()
    → screensUI.showScreen('map')
    → initMapScreen()
        → mapUI.initialize()
        → locationService.startTracking()
        → firebaseService.watchPlayers()
```

### 2. 位置情報更新フロー

```
GPS更新 → locationService.startTracking() callback
    → gameService.updateUserPosition()
    → mapUI.updateSelfMarker()
    → gameService.checkOutsideArea()
    → screensUI.updateAreaStatus()
```

### 3. プレイヤー確保フロー

```
確保ボタンクリック → window.capturePlayer()
    → gameService.capturePlayer()
        → firebaseService.capturePlayer()
    → eventsUI.addEvent()
    → mapUI.removePlayerMarker()
```

### 4. ゲーム状態変更フロー

```
Firebase更新 → firebaseService.watchGameStatus() callback
    → gameService.updateGameState()
    → handleGameStatusChange()
        → screensUI.showCountdownScreen() / hideWaitingOverlay()
        → gameService.startLocationSending()
        → screensUI.startGameTimer()
```

---

## 使用方法

### 新アーキテクチャへの切り替え

`index.html` のスクリプト参照を変更:

```html
<!-- 旧バージョン -->
<script type="module" src="js/app.js"></script>

<!-- 新バージョン（レイヤードアーキテクチャ） -->
<script type="module" src="js/app.layered.js"></script>
```

### 設定変更

`js/config/constants.js` を編集:

```javascript
// ゲームエリアの中心を変更
export const GAME_AREA = {
    CENTER_LAT: 35.6812,  // 東京駅
    CENTER_LNG: 139.7671,
    RADIUS_METER: 1000    // 1km
};

// 送信間隔を変更
export const SEND_INTERVALS = {
    ONI_MS: 5 * 1000,         // 5秒
    RUNNER_MS: 60 * 1000      // 1分
};

// 管理者パスワードを変更
export const ADMIN_PASSWORD = 'new_password';
```

---

## 設計原則

1. **単一責任の原則**: 各モジュールは1つの責任のみを持つ
2. **依存性の注入**: サービスはシングルトンとして提供
3. **レイヤー間の分離**: 上位レイヤーのみが下位レイヤーに依存
4. **設定の外部化**: 変更頻度の高い値はConstants層に集約
5. **テスタビリティ**: 各サービスは独立してモック可能
