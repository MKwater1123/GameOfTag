/**
 * Firebase サービス
 * レイヤードアーキテクチャ: Service Layer
 * 
 * Firebase との全ての通信を抽象化
 */

import { firebaseConfig } from '../firebase-config.js';
import { FIREBASE_PATHS } from '../config/constants.js';
import { logDebug } from '../utils/helpers.js';

class FirebaseService {
    constructor() {
        this.database = null;
        this.playersRef = null;
        this.gameStatusRef = null;
        this.eventsRef = null;
        this.initialized = false;
    }

    /**
     * Firebase を初期化
     * @returns {boolean} 初期化成功ならtrue
     */
    initialize() {
        logDebug('Firebase', 'Initializing...');

        if (typeof window.firebase === 'undefined') {
            console.error('Firebase CDN not loaded');
            return false;
        }

        try {
            window.firebase.initializeApp(firebaseConfig);
            this.database = window.firebase.database();
            this.playersRef = this.database.ref(FIREBASE_PATHS.PLAYERS);
            this.gameStatusRef = this.database.ref(FIREBASE_PATHS.GAME_STATUS);
            this.eventsRef = this.database.ref(FIREBASE_PATHS.EVENTS);
            this.initialized = true;

            logDebug('Firebase', 'Init success', { url: firebaseConfig.databaseURL });
            return true;
        } catch (error) {
            console.error('Firebase init error:', error);
            return false;
        }
    }

    /**
     * 初期化されているかチェック
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    // =====================
    // プレイヤー操作
    // =====================

    /**
     * プレイヤーの位置情報を更新
     * @param {string} playerId - プレイヤーID
     * @param {Object} data - プレイヤーデータ
     * @returns {Promise}
     */
    updatePlayerLocation(playerId, data) {
        if (!this.playersRef) return Promise.reject(new Error('Not initialized'));

        return this.playersRef.child(playerId).set(data);
    }

    /**
     * プレイヤーを確保状態に更新
     * @param {string} playerId - 確保されるプレイヤーID
     * @param {string} capturedBy - 確保したプレイヤー名
     * @returns {Promise}
     */
    capturePlayer(playerId, capturedBy) {
        if (!this.playersRef) return Promise.reject(new Error('Not initialized'));

        return this.playersRef.child(playerId).update({
            captured: true,
            capturedBy: capturedBy,
            capturedAt: Date.now()
        });
    }

    /**
     * プレイヤーを失格状態に更新
     * @param {string} playerId - プレイヤーID
     * @param {string} reason - 失格理由
     * @returns {Promise}
     */
    disqualifyPlayer(playerId, reason) {
        if (!this.playersRef) return Promise.reject(new Error('Not initialized'));

        return this.playersRef.child(playerId).update({
            disqualified: true,
            disqualifiedReason: reason,
            disqualifiedAt: Date.now()
        });
    }

    /**
     * プレイヤーを鬼に変換（鬼化イベント用）
     * @param {string} playerId - プレイヤーID
     * @returns {Promise}
     */
    convertToOni(playerId) {
        if (!this.playersRef) return Promise.reject(new Error('Not initialized'));

        return this.playersRef.child(playerId).update({
            role: 'oni',
            captured: false,
            capturedBy: null,
            capturedAt: null,
            disqualified: false,
            disqualifiedReason: null,
            disqualifiedAt: null,
            onified: true,
            onifiedAt: Date.now(),
            updated_at: Date.now()
        });
    }

    /**
     * プレイヤーを削除
     * @param {string} playerId - プレイヤーID
     * @returns {Promise}
     */
    removePlayer(playerId) {
        if (!this.playersRef) return Promise.reject(new Error('Not initialized'));

        return this.playersRef.child(playerId).remove();
    }

    /**
     * 全プレイヤーをクリア
     * @returns {Promise}
     */
    clearAllPlayers() {
        if (!this.playersRef) return Promise.reject(new Error('Not initialized'));

        return this.playersRef.once('value')
            .then((snapshot) => {
                const players = snapshot.val();
                if (!players) return Promise.resolve();

                const deletePromises = Object.keys(players).map(playerId =>
                    this.playersRef.child(playerId).remove()
                );
                return Promise.all(deletePromises);
            });
    }

    /**
     * プレイヤーの変更を監視
     * @param {Function} callback - データ変更時のコールバック
     * @param {Function} errorCallback - エラー時のコールバック
     */
    watchPlayers(callback, errorCallback) {
        if (!this.playersRef) return;

        this.playersRef.on('value', (snapshot) => {
            callback(snapshot.val());
        }, errorCallback);
    }

    /**
     * プレイヤー監視を停止
     */
    unwatchPlayers() {
        if (this.playersRef) {
            this.playersRef.off();
        }
    }

    /**
     * プレイヤーデータを一度だけ取得
     * @returns {Promise<Object>}
     */
    getPlayersOnce() {
        if (!this.playersRef) return Promise.reject(new Error('Not initialized'));

        return this.playersRef.once('value').then(snapshot => snapshot.val());
    }

    /**
     * ユーザー名でプレイヤーを検索
     * @param {string} username - ユーザー名
     * @returns {Promise<Object|null>} プレイヤーデータまたはnull
     */
    findPlayerByUsername(username) {
        if (!this.playersRef) return Promise.reject(new Error('Not initialized'));

        return this.playersRef.orderByChild('username').equalTo(username).once('value')
            .then(snapshot => {
                const data = snapshot.val();
                if (!data) return null;

                // 最初にマッチしたプレイヤーを返す
                const playerId = Object.keys(data)[0];
                return { id: playerId, ...data[playerId] };
            });
    }

    /**
     * プレイヤーを新規登録（パスワード付き）
     * @param {string} playerId - プレイヤーID
     * @param {Object} data - プレイヤーデータ
     * @returns {Promise}
     */
    registerPlayer(playerId, data) {
        if (!this.playersRef) return Promise.reject(new Error('Not initialized'));

        return this.playersRef.child(playerId).set(data);
    }

    /**
     * プレイヤーの認証（パスワード確認）
     * @param {string} username - ユーザー名
     * @param {string} password - パスワード
     * @returns {Promise<Object|null>} 認証成功時はプレイヤーデータ、失敗時はnull
     */
    authenticatePlayer(username, password) {
        if (!this.playersRef) return Promise.reject(new Error('Not initialized'));

        return this.findPlayerByUsername(username)
            .then(player => {
                if (!player) return null;
                if (player.password !== password) return null;
                return player;
            });
    }

    // =====================
    // ゲームステータス操作
    // =====================

    /**
     * ゲームステータスを設定
     * @param {Object} status - ゲームステータス
     * @returns {Promise}
     */
    setGameStatus(status) {
        if (!this.gameStatusRef) return Promise.reject(new Error('Not initialized'));

        return this.gameStatusRef.set(status);
    }

    /**
     * ゲームステータスを更新
     * @param {Object} updates - 更新内容
     * @returns {Promise}
     */
    updateGameStatus(updates) {
        if (!this.gameStatusRef) return Promise.reject(new Error('Not initialized'));

        return this.gameStatusRef.update(updates);
    }

    /**
     * ゲームステータスの変更を監視
     * @param {Function} callback - データ変更時のコールバック
     */
    watchGameStatus(callback) {
        if (!this.gameStatusRef) return;

        this.gameStatusRef.on('value', (snapshot) => {
            callback(snapshot.val());
        });
    }

    /**
     * ゲームステータスを一度だけ取得
     * @returns {Promise<Object>}
     */
    getGameStatusOnce() {
        if (!this.gameStatusRef) return Promise.reject(new Error('Not initialized'));

        return this.gameStatusRef.once('value').then(snapshot => snapshot.val());
    }

    // =====================
    // イベント操作
    // =====================

    /**
     * イベントを追加
     * @param {Object} eventData - イベントデータ
     * @returns {Promise}
     */
    addEvent(eventData) {
        if (!this.eventsRef) return Promise.reject(new Error('Not initialized'));

        const eventId = Date.now().toString();
        return this.eventsRef.child(eventId).set({
            ...eventData,
            timestamp: Date.now()
        });
    }

    /**
     * イベントの変更を監視
     * @param {Function} callback - 新しいイベント時のコールバック
     */
    watchEvents(callback) {
        if (!this.eventsRef) return;

        // 新しいイベントのみを監視（現在時刻以降）
        const now = Date.now();
        this.eventsRef.orderByChild('timestamp').startAt(now).on('child_added', (snapshot) => {
            const event = snapshot.val();
            if (event) {
                callback(event);
            }
        });
    }

    /**
     * イベント監視を停止
     */
    unwatchEvents() {
        if (this.eventsRef) {
            this.eventsRef.off();
        }
    }

    /**
     * 全イベントをクリア
     * @returns {Promise}
     */
    clearEvents() {
        if (!this.eventsRef) return Promise.reject(new Error('Not initialized'));

        return this.eventsRef.remove();
    }
}

// シングルトンインスタンスをエクスポート
export const firebaseService = new FirebaseService();
