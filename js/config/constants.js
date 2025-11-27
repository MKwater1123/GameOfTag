/**
 * ゲーム設定・定数定義
 * レイヤードアーキテクチャ: Config Layer
 */

// ゲームエリア設定（鹿児島高専を中心に半径2km）
export const GAME_AREA = {
    CENTER_LAT: 31.731222,
    CENTER_LNG: 130.728778,
    RADIUS_METER: 2000
};

// 位置情報送信間隔（ミリ秒）
export const SEND_INTERVALS = {
    ONI_MS: 10 * 1000,      // 鬼: 10秒ごと
    RUNNER_MS: 30 * 1000    // 逃走者: 30秒ごと
    // ※本番環境では RUNNER_MS を 10 * 60 * 1000 (10分) に変更可能
};

// ゲーム設定
export const GAME_CONFIG = {
    DEFAULT_DURATION_MS: 30 * 60 * 1000,  // デフォルト: 30分
    COUNTDOWN_SECONDS: 10,                 // カウントダウン: 10秒
    CAPTURE_RADIUS_METER: 20,              // 捕獲可能距離: 20m
    OUTSIDE_AREA_LIMIT_SECONDS: 30,        // エリア外失格までの時間: 30秒
    MAX_EVENTS: 50                         // イベント最大保持数
};

// 安全地帯縮小イベント設定
export const SHRINK_EVENT = {
    TRIGGER_REMAINING_MS: 60 * 60 * 1000,  // 残り1時間で発動
    DURATION_MS: 30 * 60 * 1000,           // 30分かけて縮小
    SHRINK_RATE_PER_SECOND: 1,             // 毎秒1mずつ縮小
    MIN_RADIUS_METER: 500                   // 最小半径500m
};

// 鬼化イベント設定
export const ONIFICATION_EVENT = {
    TRIGGER_REMAINING_MS: 30 * 60 * 1000   // 残り30分で発動
};

// ゲームステータス
export const GAME_STATUS = {
    WAITING: 'waiting',
    COUNTDOWN: 'countdown',
    ACTIVE: 'active',
    ENDED: 'ended'
};

// 役割
export const ROLES = {
    ONI: 'oni',
    RUNNER: 'runner',
    ADMIN: 'admin',
    SPECTATOR: 'spectator'
};

// マーカー色URL
export const MARKER_URLS = {
    RED: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    BLUE: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    GREEN: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    SHADOW: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png'
};

// マーカーアイコンサイズ設定
export const MARKER_CONFIG = {
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
};

// 管理者パスワード（本番環境では変更してください）
export const ADMIN_PASSWORD = 'kotaro1123';

// Firebase パス
export const FIREBASE_PATHS = {
    SESSION: 'game_session_v1',
    PLAYERS: 'game_session_v1/players',
    GAME_STATUS: 'game_session_v1/game_status',
    EVENTS: 'game_session_v1/events'
};

// 位置情報オプション
export const GEOLOCATION_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 5000
};

// イベントタイプ
export const EVENT_TYPES = {
    NORMAL: 'normal',
    IMPORTANT: 'important'
};
