/**
 * 位置情報サービス
 * レイヤードアーキテクチャ: Service Layer
 * 
 * GPS 位置情報の取得と管理
 */

import { GEOLOCATION_OPTIONS, GAME_AREA, SHRINK_EVENT } from '../config/constants.js';
import { calculateDistance, logDebug } from '../utils/helpers.js';

class LocationService {
    constructor() {
        this.watchId = null;
        this.currentPosition = {
            lat: null,
            lng: null
        };
        this.onPositionUpdate = null;
        this.onError = null;

        // 動的半径管理
        this.currentRadius = GAME_AREA.RADIUS_METER;
        this.originalRadius = GAME_AREA.RADIUS_METER;
    }

    /**
     * Geolocation API が利用可能かチェック
     * @returns {boolean}
     */
    isAvailable() {
        return 'geolocation' in navigator;
    }

    /**
     * 位置情報の追跡を開始
     * @param {Function} onUpdate - 位置更新時のコールバック(lat, lng)
     * @param {Function} onError - エラー時のコールバック
     * @returns {boolean} 開始成功ならtrue
     */
    startTracking(onUpdate, onError) {
        if (!this.isAvailable()) {
            console.error('Geolocation API not available');
            return false;
        }

        this.onPositionUpdate = onUpdate;
        this.onError = onError;

        logDebug('Location', 'Start tracking');

        this.watchId = navigator.geolocation.watchPosition(
            (position) => this._handlePositionSuccess(position),
            (error) => this._handlePositionError(error),
            GEOLOCATION_OPTIONS
        );

        return true;
    }

    /**
     * 位置情報の追跡を停止
     */
    stopTracking() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
            logDebug('Location', 'Tracking stopped');
        }
    }

    /**
     * 現在の位置を取得
     * @returns {Object} {lat, lng} または null
     */
    getCurrentPosition() {
        if (this.currentPosition.lat === null) return null;
        return { ...this.currentPosition };
    }

    /**
     * 現在位置がゲームエリア内かチェック
     * @returns {boolean|null} エリア内ならtrue、位置不明ならnull
     */
    isInsideGameArea() {
        if (this.currentPosition.lat === null) return null;

        const distance = calculateDistance(
            this.currentPosition.lat,
            this.currentPosition.lng,
            GAME_AREA.CENTER_LAT,
            GAME_AREA.CENTER_LNG
        );

        return distance <= this.currentRadius;
    }

    /**
     * 現在のエリア半径を取得
     * @returns {number} 半径（メートル）
     */
    getCurrentRadius() {
        return this.currentRadius;
    }

    /**
     * エリア半径を設定
     * @param {number} radius - 新しい半径（メートル）
     */
    setCurrentRadius(radius) {
        this.currentRadius = Math.max(radius, SHRINK_EVENT.MIN_RADIUS_METER);
        logDebug('Location', 'Radius updated', { radius: this.currentRadius });
    }

    /**
     * エリア半径を初期値にリセット
     */
    resetRadius() {
        this.currentRadius = this.originalRadius;
        logDebug('Location', 'Radius reset', { radius: this.currentRadius });
    }

    /**
     * ゲームエリア中心からの距離を取得
     * @returns {number|null} 距離（メートル）または null
     */
    getDistanceFromCenter() {
        if (this.currentPosition.lat === null) return null;

        return calculateDistance(
            this.currentPosition.lat,
            this.currentPosition.lng,
            GAME_AREA.CENTER_LAT,
            GAME_AREA.CENTER_LNG
        );
    }

    /**
     * 指定した座標までの距離を計算
     * @param {number} lat - 対象の緯度
     * @param {number} lng - 対象の経度
     * @returns {number|null} 距離（メートル）または null
     */
    getDistanceTo(lat, lng) {
        if (this.currentPosition.lat === null) return null;

        return calculateDistance(
            this.currentPosition.lat,
            this.currentPosition.lng,
            lat,
            lng
        );
    }

    // =====================
    // Private Methods
    // =====================

    _handlePositionSuccess(position) {
        this.currentPosition.lat = position.coords.latitude;
        this.currentPosition.lng = position.coords.longitude;

        if (this.onPositionUpdate) {
            this.onPositionUpdate(
                this.currentPosition.lat,
                this.currentPosition.lng
            );
        }
    }

    _handlePositionError(error) {
        console.error('Geolocation error:', error.message);

        if (this.onError) {
            this.onError(error);
        }
    }
}

// シングルトンインスタンスをエクスポート
export const locationService = new LocationService();
