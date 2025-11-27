/**
 * 地図UI管理
 * レイヤードアーキテクチャ: UI Layer
 * 
 * Leaflet地図の描画とマーカー管理
 */

import {
    GAME_AREA,
    MARKER_URLS,
    MARKER_CONFIG,
    ROLES,
    GAME_CONFIG
} from '../config/constants.js';
import { formatTime, calculateDistance, logDebug } from '../utils/helpers.js';

class MapUI {
    constructor() {
        this.map = null;
        this.userMarker = null;
        this.playerMarkers = {};
        this.areaCircle = null;
    }

    /**
     * 地図を初期化
     * @param {string} containerId - 地図コンテナのID
     */
    initialize(containerId = 'map') {
        this.map = L.map(containerId).setView(
            [GAME_AREA.CENTER_LAT, GAME_AREA.CENTER_LNG],
            15
        );

        // タイル追加（OpenStreetMap）
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        // エリア円を描画
        this.areaCircle = L.circle(
            [GAME_AREA.CENTER_LAT, GAME_AREA.CENTER_LNG],
            {
                color: '#ff4b2b',
                fillColor: '#ff4b2b',
                fillOpacity: 0.15,
                radius: GAME_AREA.RADIUS_METER,
                weight: 3
            }
        ).addTo(this.map);

        logDebug('MapUI', 'Initialized', {
            center: [GAME_AREA.CENTER_LAT, GAME_AREA.CENTER_LNG],
            radius: GAME_AREA.RADIUS_METER
        });
    }

    /**
     * 自分のマーカーを更新
     * @param {number} lat - 緯度
     * @param {number} lng - 経度
     * @param {string} username - ユーザー名
     * @param {string} role - 役割
     */
    updateSelfMarker(lat, lng, username, role) {
        if (!this.map || lat === null) return;

        const roleText = role === ROLES.ONI ? '鬼' : '逃走者';

        if (!this.userMarker) {
            const selfIcon = L.icon({
                iconUrl: MARKER_URLS.GREEN,
                shadowUrl: MARKER_URLS.SHADOW,
                ...MARKER_CONFIG
            });

            this.userMarker = L.marker([lat, lng], { icon: selfIcon })
                .addTo(this.map)
                .bindPopup(`<b>🟢 ${username} (自分)</b><br>${roleText}`);

            this.map.setView([lat, lng], 15);
            logDebug('MapUI', 'Self marker created');
        } else {
            this.userMarker.setLatLng([lat, lng]);
        }
    }

    /**
     * プレイヤーマーカーを追加/更新
     * @param {string} playerId - プレイヤーID
     * @param {Object} playerData - プレイヤーデータ
     * @param {boolean} isSpectator - 観戦者モードかどうか
     */
    addPlayerMarker(playerId, playerData, isSpectator = false) {
        const { username, role, lat, lng, updated_at } = playerData;

        if (!this.map || !lat || !lng) {
            console.error('Invalid marker data');
            return;
        }

        try {
            // 既存のマーカーを削除
            if (this.playerMarkers[playerId]) {
                this.playerMarkers[playerId].remove();
            }

            // アイコン色選択
            const colorUrl = role === ROLES.ONI ? MARKER_URLS.RED : MARKER_URLS.BLUE;
            const colorEmoji = '●';
            const statusText = role === ROLES.ONI ? '鬼' : '逃走者';

            const icon = L.icon({
                iconUrl: colorUrl,
                shadowUrl: MARKER_URLS.SHADOW,
                ...MARKER_CONFIG
            });

            const marker = L.marker([lat, lng], { icon }).addTo(this.map);

            // ポップアップ内容（観戦者モードでは捕獲ボタンなし）
            let popupContent = `<b>${colorEmoji} ${username}</b><br>${statusText}<br>更新: ${formatTime(updated_at)}`;

            // 観戦者モードの場合は追加情報を表示
            if (isSpectator) {
                popupContent = `<b>${colorEmoji} ${username}</b><br>${statusText}<br><small>更新: ${formatTime(updated_at)}</small>`;
            }

            marker.bindPopup(popupContent);
            this.playerMarkers[playerId] = marker;
        } catch (error) {
            console.error('Marker add error:', error);
        }
    }

    /**
     * プレイヤーマーカーを削除
     * @param {string} playerId - プレイヤーID
     */
    removePlayerMarker(playerId) {
        if (this.playerMarkers[playerId]) {
            this.playerMarkers[playerId].remove();
            delete this.playerMarkers[playerId];
        }
    }

    /**
     * 全プレイヤーマーカーをクリア
     */
    clearAllPlayerMarkers() {
        Object.values(this.playerMarkers).forEach(marker => marker.remove());
        this.playerMarkers = {};
    }

    /**
     * 地図の中心を設定
     * @param {number} lat - 緯度
     * @param {number} lng - 経度
     * @param {number} zoom - ズームレベル
     */
    setView(lat, lng, zoom = 15) {
        if (this.map) {
            this.map.setView([lat, lng], zoom);
        }
    }

    /**
     * 地図が初期化されているか
     * @returns {boolean}
     */
    isInitialized() {
        return this.map !== null;
    }

    /**
     * エリア円の半径を更新
     * @param {number} radius - 新しい半径（メートル）
     */
    updateAreaRadius(radius) {
        if (this.areaCircle) {
            this.areaCircle.setRadius(radius);
        }
    }

    /**
     * エリア円の色を変更（縮小中は警告色に）
     * @param {boolean} isShrinking - 縮小中かどうか
     */
    setAreaShrinkingStyle(isShrinking) {
        if (this.areaCircle) {
            if (isShrinking) {
                this.areaCircle.setStyle({
                    color: '#ff0000',
                    fillColor: '#ff0000',
                    fillOpacity: 0.25,
                    weight: 4
                });
            } else {
                this.areaCircle.setStyle({
                    color: '#ff4b2b',
                    fillColor: '#ff4b2b',
                    fillOpacity: 0.15,
                    weight: 3
                });
            }
        }
    }
}

// シングルトンインスタンスをエクスポート
export const mapUI = new MapUI();
