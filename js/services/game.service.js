/**
 * ゲームロジックサービス
 * レイヤードアーキテクチャ: Service Layer
 * 
 * ゲームの状態管理とビジネスロジック
 */

import {
    GAME_STATUS,
    GAME_CONFIG,
    ROLES,
    SEND_INTERVALS
} from '../config/constants.js';
import { generateUniqueId, logDebug } from '../utils/helpers.js';
import { firebaseService } from './firebase.service.js';
import { locationService } from './location.service.js';

class GameService {
    constructor() {
        this.gameState = {
            status: GAME_STATUS.WAITING,
            startTime: null,
            endTime: null,
            duration: GAME_CONFIG.DEFAULT_DURATION_MS
        };

        this.currentUser = {
            id: null,
            username: '',
            role: '',
            lat: null,
            lng: null,
            captured: false,
            capturedBy: null,
            disqualified: false
        };

        this.sendTimer = null;
        this.outsideTimer = null;
        this.outsideStartTime = null;
        this.lastRunnerUpdateTime = 0;
        this.gameTimers = [];

        // コールバック
        this.onCaptured = null;
        this.onDisqualified = null;
        this.onOutsideAreaWarning = null;
        this.onGameStatusChange = null;
    }

    // =====================
    // ユーザー管理
    // =====================

    /**
     * ゲームに参加
     * @param {string} username - ユーザー名
     * @param {string} role - 役割 (oni/runner)
     * @returns {Object} currentUser
     */
    joinGame(username, role) {
        this.currentUser.id = generateUniqueId('user');
        this.currentUser.username = username;
        this.currentUser.role = role;
        this.currentUser.captured = false;
        this.currentUser.disqualified = false;

        logDebug('Game', 'User joined', { username, role, id: this.currentUser.id });

        return this.currentUser;
    }

    /**
     * 現在のユーザー情報を取得
     * @returns {Object}
     */
    getCurrentUser() {
        return { ...this.currentUser };
    }

    /**
     * ユーザーの位置を更新
     * @param {number} lat - 緯度
     * @param {number} lng - 経度
     */
    updateUserPosition(lat, lng) {
        this.currentUser.lat = lat;
        this.currentUser.lng = lng;
    }

    /**
     * ユーザーが鬼かチェック
     * @returns {boolean}
     */
    isOni() {
        return this.currentUser.role === ROLES.ONI;
    }

    /**
     * ユーザーが逃走者かチェック
     * @returns {boolean}
     */
    isRunner() {
        return this.currentUser.role === ROLES.RUNNER;
    }

    // =====================
    // ゲーム状態管理
    // =====================

    /**
     * ゲーム状態を更新
     * @param {Object} data - ゲームステータスデータ
     */
    updateGameState(data) {
        if (!data) return;

        this.gameState.status = data.status;
        this.gameState.startTime = data.startTime;
        this.gameState.endTime = data.endTime;
        this.gameState.duration = data.duration;

        if (this.onGameStatusChange) {
            this.onGameStatusChange(this.gameState);
        }
    }

    /**
     * 現在のゲーム状態を取得
     * @returns {Object}
     */
    getGameState() {
        return { ...this.gameState };
    }

    /**
     * ゲームがアクティブかチェック
     * @returns {boolean}
     */
    isGameActive() {
        return this.gameState.status === GAME_STATUS.ACTIVE;
    }

    // =====================
    // 位置送信管理
    // =====================

    /**
     * 位置送信を開始
     * @param {Function} onCountdownUpdate - 逃走者用カウントダウン更新コールバック
     */
    startLocationSending(onCountdownUpdate) {
        if (this.sendTimer) return;

        if (this.isOni()) {
            this._startOniSending();
        } else if (this.isRunner()) {
            this._startRunnerSending(onCountdownUpdate);
        }
    }

    /**
     * 位置送信を停止
     */
    stopLocationSending() {
        if (this.sendTimer) {
            clearInterval(this.sendTimer);
            this.sendTimer = null;
        }

        this.gameTimers.forEach(timer => clearInterval(timer));
        this.gameTimers = [];

        logDebug('Game', 'Location sending stopped');
    }

    _startOniSending() {
        this._sendCurrentLocation();
        this.sendTimer = setInterval(
            () => this._sendCurrentLocation(),
            SEND_INTERVALS.ONI_MS
        );
        logDebug('Game', 'Oni sending started', { interval: SEND_INTERVALS.ONI_MS });
    }

    _startRunnerSending(onCountdownUpdate) {
        const now = Date.now();
        const elapsed = now - this.gameState.startTime;
        const intervalMs = SEND_INTERVALS.RUNNER_MS;
        const nextSendIn = intervalMs - (elapsed % intervalMs);

        logDebug('Game', 'Runner sync', { elapsed, nextSendIn });

        // カウントダウン更新
        if (onCountdownUpdate) {
            const countdownInterval = setInterval(() => {
                const now = Date.now();
                const elapsed = now - this.gameState.startTime;
                const remaining = Math.ceil((intervalMs - (elapsed % intervalMs)) / 1000);
                onCountdownUpdate(remaining);
            }, 1000);
            this.gameTimers.push(countdownInterval);
        }

        // 初回送信
        if (elapsed < 1000) {
            this._sendCurrentLocation();
        }

        // 次の同期タイミングで送信開始
        setTimeout(() => {
            this._sendCurrentLocation();
            this.sendTimer = setInterval(
                () => this._sendCurrentLocation(),
                intervalMs
            );
        }, nextSendIn);
    }

    _sendCurrentLocation() {
        if (this.currentUser.captured || !this.currentUser.lat) return;

        const data = {
            username: this.currentUser.username,
            role: this.currentUser.role,
            lat: this.currentUser.lat,
            lng: this.currentUser.lng,
            updated_at: Date.now()
        };

        firebaseService.updatePlayerLocation(this.currentUser.id, data)
            .catch(error => console.error('Firebase write error:', error));
    }

    // =====================
    // 確保処理
    // =====================

    /**
     * プレイヤーを確保
     * @param {string} playerId - 確保するプレイヤーID
     * @param {string} username - 確保するプレイヤー名
     * @returns {Promise}
     */
    capturePlayer(playerId, username) {
        if (!this.isOni()) {
            return Promise.reject(new Error('Only oni can capture'));
        }

        logDebug('Game', 'Capturing player', { playerId, username });

        return firebaseService.capturePlayer(playerId, this.currentUser.username)
            .then(() => {
                logDebug('Game', `Captured ${username}`);
            });
    }

    /**
     * 自分が確保されたことを処理
     * @param {string} capturedBy - 確保したプレイヤー名
     */
    handleCaptured(capturedBy) {
        this.currentUser.captured = true;
        this.currentUser.capturedBy = capturedBy;

        this.stopLocationSending();
        locationService.stopTracking();

        if (this.onCaptured) {
            this.onCaptured(capturedBy);
        }

        logDebug('Game', 'Captured by', capturedBy);
    }

    // =====================
    // エリア外判定
    // =====================

    /**
     * エリア外チェックを実行
     */
    checkOutsideArea() {
        const isInside = locationService.isInsideGameArea();
        if (isInside === null) return;

        if (!isInside) {
            this._handleOutsideArea();
        } else {
            this._handleInsideArea();
        }
    }

    _handleOutsideArea() {
        if (!this.outsideStartTime) {
            this.outsideStartTime = Date.now();
            logDebug('Area', 'Outside area - timer started');

            this.outsideTimer = setInterval(() => {
                const elapsed = Math.floor((Date.now() - this.outsideStartTime) / 1000);
                const remaining = GAME_CONFIG.OUTSIDE_AREA_LIMIT_SECONDS - elapsed;

                if (remaining > 0) {
                    if (this.onOutsideAreaWarning) {
                        this.onOutsideAreaWarning(remaining);
                    }
                } else {
                    clearInterval(this.outsideTimer);
                    this._disqualify();
                }
            }, 1000);

            // バイブレーション
            if (navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }
        }
    }

    _handleInsideArea() {
        if (this.outsideStartTime) {
            this.outsideStartTime = null;
            if (this.outsideTimer) {
                clearInterval(this.outsideTimer);
                this.outsideTimer = null;
            }
            logDebug('Area', 'Back inside area');
        }
    }

    _disqualify() {
        this.currentUser.disqualified = true;

        this.stopLocationSending();
        locationService.stopTracking();

        if (this.outsideTimer) {
            clearInterval(this.outsideTimer);
            this.outsideTimer = null;
        }

        firebaseService.disqualifyPlayer(this.currentUser.id, 'out_of_area')
            .then(() => logDebug('Game', 'Disqualification recorded'))
            .catch(error => console.error('Disqualification error:', error));

        if (this.onDisqualified) {
            this.onDisqualified();
        }

        logDebug('Game', 'Player disqualified - out of area');
    }

    // =====================
    // クリーンアップ
    // =====================

    /**
     * 全てのリソースを解放
     */
    cleanup() {
        this.stopLocationSending();

        if (this.outsideTimer) {
            clearInterval(this.outsideTimer);
            this.outsideTimer = null;
        }

        firebaseService.unwatchPlayers();
        locationService.stopTracking();

        logDebug('Game', 'Cleanup completed');
    }
}

// シングルトンインスタンスをエクスポート
export const gameService = new GameService();
