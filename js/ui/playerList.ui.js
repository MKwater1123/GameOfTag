/**
 * 参加者リストUI管理
 * レイヤードアーキテクチャ: UI Layer
 * 
 * プレイヤーリストパネルの表示と管理
 */

import { ROLES, GAME_CONFIG } from '../config/constants.js';
import { calculateDistance, logDebug } from '../utils/helpers.js';

class PlayerListUI {
    constructor() {
        this.isVisible = false;
    }

    /**
     * プレイヤーリストボタンを初期化
     */
    initialize() {
        const listBtn = document.getElementById('player-list-btn');
        const panel = document.getElementById('player-list-panel');
        const closeBtn = document.getElementById('close-player-list');

        if (listBtn && panel) {
            listBtn.addEventListener('click', () => this.toggle());
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        logDebug('PlayerListUI', 'Initialized');
    }

    /**
     * パネルを表示/非表示切り替え
     */
    toggle() {
        const panel = document.getElementById('player-list-panel');
        if (panel) {
            panel.classList.toggle('hidden');
            this.isVisible = !panel.classList.contains('hidden');
        }
    }

    /**
     * パネルを表示
     */
    show() {
        const panel = document.getElementById('player-list-panel');
        if (panel) {
            panel.classList.remove('hidden');
            this.isVisible = true;
        }
    }

    /**
     * パネルを非表示
     */
    hide() {
        const panel = document.getElementById('player-list-panel');
        if (panel) {
            panel.classList.add('hidden');
            this.isVisible = false;
        }
    }

    /**
     * プレイヤーリストを更新
     * @param {Object} players - Firebaseからのプレイヤーデータ
     * @param {Object} currentUser - 現在のユーザー情報
     */
    update(players, currentUser) {
        const listItems = document.getElementById('player-list-items');
        if (!listItems) return;

        const playerArray = this._buildPlayerArray(players, currentUser);
        const html = this._generateHTML(playerArray, currentUser);

        listItems.innerHTML = html || '<p style="text-align:center; padding:20px; color:#999;">参加者がいません</p>';
    }

    // =====================
    // プライベートメソッド
    // =====================

    _buildPlayerArray(players, currentUser) {
        const playerArray = [];

        // 自分を最初に追加
        playerArray.push({
            id: currentUser.id,
            username: currentUser.username,
            role: currentUser.role,
            isSelf: true,
            lat: currentUser.lat,
            lng: currentUser.lng
        });

        // 他のプレイヤーを追加
        if (players) {
            Object.entries(players).forEach(([playerId, playerData]) => {
                if (playerId !== currentUser.id &&
                    !playerData.captured &&
                    !playerData.disqualified) {
                    playerArray.push({
                        id: playerId,
                        username: playerData.username,
                        role: playerData.role,
                        isSelf: false,
                        lat: playerData.lat,
                        lng: playerData.lng
                    });
                }
            });
        }

        return playerArray;
    }

    _generateHTML(playerArray, currentUser) {
        let html = '';

        playerArray.forEach(player => {
            const roleIcon = '●';
            const roleText = player.role === ROLES.ONI ? '鬼' : '逃走者';
            const roleColor = player.role === ROLES.ONI ? '#ff3b30' : '#00e5ff';
            const selfClass = player.isSelf ? ' self' : '';
            const selfLabel = player.isSelf ? ' (自分)' : '';

            // 距離計算
            let distanceInfo = '';
            let captureButton = '';

            if (!player.isSelf && currentUser.lat && player.lat) {
                const distance = calculateDistance(
                    currentUser.lat, currentUser.lng,
                    player.lat, player.lng
                );
                distanceInfo = `<div class="player-distance">${Math.round(distance)}m</div>`;

                // 鬼が逃走者に10m以内に近づいたら確保ボタンを表示
                if (currentUser.role === ROLES.ONI &&
                    player.role === ROLES.RUNNER &&
                    distance <= GAME_CONFIG.CAPTURE_RADIUS_METER) {
                    captureButton = `<button class="capture-btn-list" onclick="window.capturePlayer('${player.id}', '${player.username}')">確保</button>`;
                }
            }

            html += `
                <div class="player-list-item${selfClass}">
                    <span class="player-role-icon" style="color: ${roleColor};">${roleIcon}</span>
                    <div class="player-info-text">
                        <div class="player-name">${player.username}${selfLabel}</div>
                        <div class="player-role-text">${roleText}</div>
                        ${distanceInfo}
                    </div>
                    ${captureButton}
                </div>
            `;
        });

        return html;
    }
}

// シングルトンインスタンスをエクスポート
export const playerListUI = new PlayerListUI();
