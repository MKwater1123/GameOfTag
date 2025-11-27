/**
 * ユーティリティ関数
 * レイヤードアーキテクチャ: Utils Layer
 */

/**
 * 2点間の距離を計算（Haversine公式）
 * @param {number} lat1 - 地点1の緯度
 * @param {number} lng1 - 地点1の経度
 * @param {number} lat2 - 地点2の緯度
 * @param {number} lng2 - 地点2の経度
 * @returns {number} 距離（メートル）
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // 地球の半径（メートル）
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * タイムスタンプを時刻文字列にフォーマット
 * @param {number} timestamp - UNIXタイムスタンプ（ミリ秒）
 * @returns {string} フォーマットされた時刻文字列 (HH:MM:SS)
 */
export function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

/**
 * 秒数を MM:SS 形式にフォーマット
 * @param {number} seconds - 秒数
 * @returns {string} フォーマットされた時間文字列
 */
export function formatCountdown(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * ミリ秒を MM:SS 形式にフォーマット
 * @param {number} ms - ミリ秒
 * @returns {string} フォーマットされた時間文字列
 */
export function formatMillisecondsToMMSS(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * ユニークなIDを生成
 * @param {string} prefix - IDのプレフィックス
 * @returns {string} ユニークなID
 */
export function generateUniqueId(prefix = 'id') {
    return `${prefix}_${Date.now()}`;
}

/**
 * 現在時刻をローカル時刻文字列で取得
 * @returns {string} ローカル時刻文字列
 */
export function getCurrentTimeString() {
    return new Date().toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * 点がエリア内にあるかチェック
 * @param {number} lat - チェックする点の緯度
 * @param {number} lng - チェックする点の経度
 * @param {number} centerLat - 中心点の緯度
 * @param {number} centerLng - 中心点の経度
 * @param {number} radiusMeter - 半径（メートル）
 * @returns {boolean} エリア内ならtrue
 */
export function isInsideArea(lat, lng, centerLat, centerLng, radiusMeter) {
    const distance = calculateDistance(lat, lng, centerLat, centerLng);
    return distance <= radiusMeter;
}

/**
 * デバウンス関数
 * @param {Function} func - デバウンスする関数
 * @param {number} wait - 待機時間（ミリ秒）
 * @returns {Function} デバウンスされた関数
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * コンソールログ（デバッグ用プレフィックス付き）
 * @param {string} category - ログカテゴリ
 * @param {string} message - ログメッセージ
 * @param {any} data - 追加データ（オプション）
 */
export function logDebug(category, message, data = null) {
    const timestamp = getCurrentTimeString();
    const prefix = `[${timestamp}][${category}]`;

    if (data !== null) {
        console.log(prefix, message, data);
    } else {
        console.log(prefix, message);
    }
}
