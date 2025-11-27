/**
 * 画面遷移・表示管理
 * レイヤードアーキテクチャ: UI Layer
 * 
 * 各画面の表示/非表示とUI更新
 */

import { ROLES } from '../config/constants.js';
import { formatCountdown, formatMillisecondsToMMSS, logDebug } from '../utils/helpers.js';

class ScreensUI {
    constructor() {
        this.screens = {
            login: 'login-screen',
            map: 'map-screen',
            admin: 'admin-screen',
            captured: 'captured-screen',
            disqualified: 'disqualified-screen',
            gameEnd: 'game-end-screen'
        };

        this.gameTimerInterval = null;
        this.countdownInterval = null;
    }

    // =====================
    // 画面遷移
    // =====================

    /**
     * 指定画面に遷移
     * @param {string} screenName - 画面名
     */
    showScreen(screenName) {
        // 全画面を非表示
        Object.values(this.screens).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        // 指定画面を表示
        const targetId = this.screens[screenName];
        if (targetId) {
            const el = document.getElementById(targetId);
            if (el) el.classList.remove('hidden');
            logDebug('ScreensUI', `Show screen: ${screenName}`);
        }
    }

    /**
     * 待機オーバーレイを表示
     */
    showWaitingOverlay() {
        const overlay = document.getElementById('waiting-overlay');
        const title = document.getElementById('waiting-title');
        const message = document.getElementById('waiting-message');
        const countdownDisplay = document.getElementById('countdown-display');

        if (overlay) {
            overlay.classList.remove('hidden');
            if (title) title.textContent = '⏳ ゲーム開始を待っています';
            if (message) {
                message.textContent = '管理者がゲームを開始するまでお待ちください';
                message.classList.remove('hidden');
            }
            if (countdownDisplay) countdownDisplay.classList.add('hidden');
        }
    }

    /**
     * 待機オーバーレイを非表示
     */
    hideWaitingOverlay() {
        const overlay = document.getElementById('waiting-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }

        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }

    /**
     * カウントダウン画面を表示
     * @param {number} countdownStart - カウントダウン開始時刻
     */
    showCountdownScreen(countdownStart) {
        const overlay = document.getElementById('waiting-overlay');
        const title = document.getElementById('waiting-title');
        const message = document.getElementById('waiting-message');
        const countdownDisplay = document.getElementById('countdown-display');
        const countdownNumber = document.getElementById('countdown-number');

        if (!overlay) return;

        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }

        overlay.classList.remove('hidden');
        if (title) title.textContent = '🎮 まもなくゲーム開始！';
        if (message) message.classList.add('hidden');
        if (countdownDisplay) countdownDisplay.classList.remove('hidden');

        const updateCountdown = () => {
            const elapsed = Math.floor((Date.now() - countdownStart) / 1000);
            const remaining = 10 - elapsed;

            if (countdownNumber) {
                countdownNumber.textContent = remaining > 0 ? remaining : 'START!';
            }
        };

        updateCountdown();
        this.countdownInterval = setInterval(updateCountdown, 100);
    }

    /**
     * 確保画面を表示
     * @param {string} capturedBy - 確保したプレイヤー名
     */
    showCapturedScreen(capturedBy) {
        const nameEl = document.getElementById('captured-by-name');
        if (nameEl) {
            nameEl.textContent = capturedBy || '不明';
        }
        this.showScreen('captured');
    }

    /**
     * 失格画面を表示
     */
    showDisqualifiedScreen() {
        this.showScreen('disqualified');
    }

    /**
     * ゲーム終了画面を表示
     * @param {Object} players - プレイヤーデータ
     */
    showGameEndScreen(players) {
        this._displayGameResults(players);
        this.showScreen('gameEnd');
    }

    // =====================
    // ステータスバー更新
    // =====================

    /**
     * 役割表示を更新
     * @param {string} role - 役割
     */
    updateRoleDisplay(role) {
        const roleDisplay = document.getElementById('role-display');
        const roleInfo = document.getElementById('role-info');

        if (roleDisplay) {
            roleDisplay.textContent = role === ROLES.ONI ? '● 鬼' : '● 逃走者';
            roleDisplay.style.color = role === ROLES.ONI ? '#ff3b30' : '#00e5ff';
        }

        if (roleInfo) {
            roleInfo.classList.remove('hidden');
            if (role === ROLES.RUNNER) {
                roleInfo.textContent = '次の送信: --:--';
                roleInfo.id = 'runner-countdown-display';
            } else if (role === ROLES.ONI) {
                roleInfo.textContent = '最終更新: --';
                roleInfo.id = 'oni-update-display';
            }
        }
    }

    /**
     * 逃走者のカウントダウン表示を更新
     * @param {number} seconds - 残り秒数
     */
    updateRunnerCountdown(seconds) {
        const el = document.getElementById('runner-countdown-display');
        if (el) {
            el.textContent = `次の送信: ${formatCountdown(seconds)}`;
        }
    }

    /**
     * 鬼の最終更新時刻を更新
     * @param {number} timestamp - タイムスタンプ
     */
    updateOniLastUpdate(timestamp) {
        const el = document.getElementById('oni-update-display');
        if (el) {
            const date = new Date(timestamp);
            const timeStr = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
            el.textContent = `最終更新: ${timeStr}`;
        }
    }

    /**
     * エリア状態を更新
     * @param {boolean} isInside - エリア内かどうか
     */
    updateAreaStatus(isInside) {
        const areaStatus = document.getElementById('area-status');
        if (areaStatus) {
            areaStatus.textContent = isInside ? 'エリア内' : 'エリア外';
            areaStatus.classList.toggle('outside', !isInside);
        }
    }

    /**
     * エリア外警告を更新
     * @param {number|null} remainingSeconds - 失格までの残り秒数（nullで非表示）
     */
    updateOutsideWarning(remainingSeconds) {
        const warning = document.getElementById('area-warning');
        if (!warning) return;

        if (remainingSeconds === null) {
            warning.classList.add('hidden');
        } else {
            warning.textContent = `⚠️ エリア外 (失格まであと ${remainingSeconds}秒)`;
            warning.classList.remove('hidden');
        }
    }

    // =====================
    // 縮小イベント表示
    // =====================

    /**
     * 縮小警告の表示/非表示
     * @param {boolean} show - 表示するかどうか
     */
    showShrinkWarning(show) {
        let shrinkWarning = document.getElementById('shrink-warning');

        if (!shrinkWarning && show) {
            // 警告要素を動的に作成
            shrinkWarning = document.createElement('div');
            shrinkWarning.id = 'shrink-warning';
            shrinkWarning.className = 'shrink-warning';
            shrinkWarning.innerHTML = `
                <div class="shrink-warning-content">
                    <span class="shrink-icon">⚠️</span>
                    <span class="shrink-text">安全地帯縮小中</span>
                    <span id="shrink-radius" class="shrink-radius"></span>
                </div>
            `;

            const mapScreen = document.getElementById('map-screen');
            if (mapScreen) {
                mapScreen.appendChild(shrinkWarning);
            }
        }

        if (shrinkWarning) {
            if (show) {
                shrinkWarning.classList.remove('hidden');
            } else {
                shrinkWarning.classList.add('hidden');
            }
        }
    }

    /**
     * 縮小情報を更新
     * @param {number} currentRadius - 現在の半径（メートル）
     * @param {number} remainingTime - 縮小終了までの残り時間（ミリ秒）
     */
    updateShrinkInfo(currentRadius, remainingTime) {
        const radiusEl = document.getElementById('shrink-radius');
        if (radiusEl) {
            const remainingMin = Math.ceil(remainingTime / 60000);
            radiusEl.textContent = `半径: ${Math.round(currentRadius)}m (残り${remainingMin}分)`;
        }
    }

    // =====================
    // ゲームタイマー
    // =====================

    /**
     * ゲームタイマーを開始
     * @param {number} endTime - 終了時刻
     */
    startGameTimer(endTime) {
        if (this.gameTimerInterval) {
            clearInterval(this.gameTimerInterval);
        }

        const timerElement = document.getElementById('game-timer');
        if (!timerElement) return;

        timerElement.classList.remove('hidden');

        const updateTimer = () => {
            const remaining = endTime - Date.now();

            if (remaining <= 0) {
                timerElement.textContent = 'TIME UP';
                clearInterval(this.gameTimerInterval);
                this.gameTimerInterval = null;
                return;
            }

            timerElement.textContent = formatMillisecondsToMMSS(remaining);
        };

        updateTimer();
        this.gameTimerInterval = setInterval(updateTimer, 1000);
    }

    /**
     * ゲームタイマーを停止
     */
    stopGameTimer() {
        if (this.gameTimerInterval) {
            clearInterval(this.gameTimerInterval);
            this.gameTimerInterval = null;
        }
    }

    // =====================
    // プライベートメソッド
    // =====================

    _displayGameResults(players) {
        const winnersList = document.getElementById('winners-list');
        const capturedList = document.getElementById('captured-list');
        const disqualifiedList = document.getElementById('disqualified-list');

        if (!winnersList || !capturedList || !disqualifiedList) return;

        const winners = [];
        const captured = [];
        const disqualified = [];

        if (players) {
            Object.entries(players).forEach(([_, playerData]) => {
                if (playerData.role === ROLES.RUNNER) {
                    if (playerData.disqualified) {
                        disqualified.push(playerData.username);
                    } else if (playerData.captured) {
                        captured.push(playerData.username);
                    } else {
                        winners.push(playerData.username);
                    }
                }
            });
        }

        winnersList.innerHTML = winners.length > 0
            ? winners.map(name => `<li>${name}</li>`).join('')
            : '<p class="no-players">逃走成功者なし</p>';

        capturedList.innerHTML = captured.length > 0
            ? captured.map(name => `<li>${name}</li>`).join('')
            : '<p class="no-players">確保されたプレイヤーなし</p>';

        disqualifiedList.innerHTML = disqualified.length > 0
            ? disqualified.map(name => `<li>${name}</li>`).join('')
            : '<p class="no-players">失格者なし</p>';

        logDebug('ScreensUI', 'Game results', {
            winners: winners.length,
            captured: captured.length,
            disqualified: disqualified.length
        });
    }
}

// シングルトンインスタンスをエクスポート
export const screensUI = new ScreensUI();
