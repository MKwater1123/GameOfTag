/**
 * メインアプリケーション
 * レイヤードアーキテクチャ: Application Layer (Entry Point)
 * 
 * 各レイヤーを統合し、アプリケーションのフローを制御
 */

// Config
import {
    GAME_STATUS,
    ROLES,
    ADMIN_PASSWORD,
    EVENT_TYPES
} from './config/constants.js';

// Utils
import { formatTime, logDebug } from './utils/helpers.js';

// Services
import { firebaseService } from './services/firebase.service.js';
import { locationService } from './services/location.service.js';
import { gameService } from './services/game.service.js';

// UI
import { mapUI } from './ui/map.ui.js';
import { screensUI } from './ui/screens.ui.js';
import { eventsUI } from './ui/events.ui.js';
import { playerListUI } from './ui/playerList.ui.js';

// =====================
// アプリケーション状態
// =====================
let isAdmin = false;
let lastRunnerUpdateTime = 0;

// =====================
// 初期化
// =====================
console.log('App start (Layered Architecture)');
console.log('Loaded at:', new Date().toLocaleString());

document.addEventListener('DOMContentLoaded', () => {
    logDebug('App', 'DOM loaded');
    initializeApp();
});

function initializeApp() {
    // Firebase初期化
    if (!firebaseService.initialize()) {
        console.error('Firebase initialization failed');
        return;
    }

    // ログイン画面のセットアップ
    setupLoginScreen();

    // ゲーム終了画面のセットアップ
    setupGameEndScreen();

    // ゲーム状態の監視開始
    watchGameStatus();
}

// =====================
// ログイン画面
// =====================
function setupLoginScreen() {
    // 初期選択画面
    const newPlayerBtn = document.getElementById('new-player-btn');
    const returningPlayerBtn = document.getElementById('returning-player-btn');
    const adminLoginBtn = document.getElementById('admin-login-btn');

    if (newPlayerBtn) newPlayerBtn.addEventListener('click', showRegisterForm);
    if (returningPlayerBtn) returningPlayerBtn.addEventListener('click', showLoginForm);
    if (adminLoginBtn) adminLoginBtn.addEventListener('click', showAdminLogin);

    // 新規参加フォーム
    const registerOniBtn = document.getElementById('register-oni');
    const registerRunnerBtn = document.getElementById('register-runner');
    const backToChoiceRegister = document.getElementById('back-to-choice-register');

    if (registerOniBtn) registerOniBtn.addEventListener('click', () => registerNewPlayer(ROLES.ONI));
    if (registerRunnerBtn) registerRunnerBtn.addEventListener('click', () => registerNewPlayer(ROLES.RUNNER));
    if (backToChoiceRegister) backToChoiceRegister.addEventListener('click', showAuthChoice);

    // ログインフォーム
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const backToChoiceLogin = document.getElementById('back-to-choice-login');

    if (loginSubmitBtn) loginSubmitBtn.addEventListener('click', loginExistingPlayer);
    if (backToChoiceLogin) backToChoiceLogin.addEventListener('click', showAuthChoice);

    // Enterキー対応
    const loginUsername = document.getElementById('login-username');
    const loginPassword = document.getElementById('login-password');

    if (loginUsername) {
        loginUsername.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && loginPassword) {
                loginPassword.focus();
            }
        });
    }

    if (loginPassword) {
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loginExistingPlayer();
        });
    }

    setupAdminScreen();
}

function showAuthChoice() {
    document.getElementById('auth-choice').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.add('hidden');
}

function showRegisterForm() {
    document.getElementById('auth-choice').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
}

function showLoginForm() {
    document.getElementById('auth-choice').classList.add('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
}

async function registerNewPlayer(role) {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;

    // バリデーション
    if (!username) {
        alert('名前を入力してください');
        return;
    }

    if (!password || password.length < 4) {
        alert('パスワードは4文字以上で入力してください');
        return;
    }

    if (password !== passwordConfirm) {
        alert('パスワードが一致しません');
        return;
    }

    try {
        await gameService.registerAndJoin(username, role, password);
        logDebug('App', 'New player registered', { username, role });

        // マップ画面へ遷移
        screensUI.showScreen('map');
        initMapScreen();
        checkGameStatus();
    } catch (error) {
        console.error('Registration error:', error);
        alert(error.message || '登録に失敗しました');
    }
}

async function loginExistingPlayer() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username) {
        alert('名前を入力してください');
        return;
    }

    if (!password) {
        alert('パスワードを入力してください');
        return;
    }

    try {
        const user = await gameService.loginAndJoin(username, password);
        logDebug('App', 'Player logged in', { username, role: user.role });

        // 確保済みか失格済みかチェック
        if (user.captured) {
            screensUI.showCapturedScreen(user.capturedBy || '不明');
            return;
        }

        if (user.disqualified) {
            screensUI.showDisqualifiedScreen();
            return;
        }

        // マップ画面へ遷移
        screensUI.showScreen('map');
        initMapScreen();
        checkGameStatus();
    } catch (error) {
        console.error('Login error:', error);
        alert(error.message || 'ログインに失敗しました');
    }
}

// =====================
// マップ画面
// =====================
function initMapScreen() {
    const user = gameService.getCurrentUser();

    // ステータスバー更新
    screensUI.updateRoleDisplay(user.role);

    // 地図初期化
    mapUI.initialize();

    // 位置情報取得開始
    startLocationTracking();

    // Firebase監視開始
    watchPlayers();
    watchGameEvents();

    // UI初期化
    playerListUI.initialize();
    eventsUI.initialize();
    eventsUI.addEvent('ゲームに参加しました', EVENT_TYPES.NORMAL);

    // コールバック設定
    setupGameCallbacks();

    logDebug('App', 'Map screen initialized');
}

function startLocationTracking() {
    locationService.startTracking(
        (lat, lng) => {
            // 位置更新時
            gameService.updateUserPosition(lat, lng);

            const user = gameService.getCurrentUser();
            mapUI.updateSelfMarker(lat, lng, user.username, user.role);

            // エリアチェック
            const isInside = locationService.isInsideGameArea();
            screensUI.updateAreaStatus(isInside);

            if (gameService.isGameActive()) {
                gameService.checkOutsideArea();
            }
        },
        (error) => {
            alert('位置情報の取得に失敗しました: ' + error.message);
        }
    );
}

function setupGameCallbacks() {
    // 確保されたとき
    gameService.onCaptured = (capturedBy) => {
        eventsUI.addEvent(`${capturedBy}に確保されました`, EVENT_TYPES.IMPORTANT);
        screensUI.showCapturedScreen(capturedBy);
    };

    // 失格になったとき
    gameService.onDisqualified = () => {
        screensUI.showDisqualifiedScreen();
    };

    // エリア外警告
    gameService.onOutsideAreaWarning = (remainingSeconds) => {
        screensUI.updateOutsideWarning(remainingSeconds);
    };

    // 縮小イベント開始
    gameService.onShrinkStart = () => {
        mapUI.setAreaShrinkingStyle(true);
        screensUI.showShrinkWarning(true);

        // 現在の半径を取得
        const currentRadius = locationService.getCurrentRadius();

        // ローカルでイベント表示（Firebaseには保存しない - 全員が同時に検知するため）
        eventsUI.addEvent(
            `⚠️ 安全地帯が縮小を開始しました！現在の半径${currentRadius}mから、30分かけて毎秒1mずつ縮小します。最小半径は500mです。`,
            EVENT_TYPES.IMPORTANT
        );

        // ポップアップ表示
        screensUI.showEventPopup(
            '⚠️',
            '安全地帯の縮小開始',
            `現在の半径${currentRadius}mから、30分かけて毎秒1mずつ縮小します。最小半径は500mです。エリア内に留まりましょう！`,
            'shrink'
        );
    };

    // 縮小イベント更新
    gameService.onShrinkUpdate = (newRadius, remainingTime) => {
        mapUI.updateAreaRadius(newRadius);
        screensUI.updateShrinkInfo(newRadius, remainingTime);
    };

    // 縮小イベント終了
    gameService.onShrinkEnd = (finalRadius) => {
        mapUI.setAreaShrinkingStyle(false);
        screensUI.showShrinkWarning(false);

        // ローカルでイベント表示（Firebaseには保存しない - 全員が同時に検知するため）
        eventsUI.addEvent(
            `✅ 安全地帯の縮小が完了しました。現在の安全地帯は半径${finalRadius}mです。`,
            EVENT_TYPES.IMPORTANT
        );
    };

    // 鬼化イベント開始
    gameService.onOnificationStart = () => {
        eventsUI.addEvent(
            `👹 鬼化イベント発動！確保済み・失格のプレイヤーが鬼として復活します！`,
            EVENT_TYPES.IMPORTANT
        );

        // ポップアップ表示
        screensUI.showEventPopup(
            '👹',
            '鬼化イベント発動',
            '確保済み・失格のプレイヤーが鬼として復活します！逃走者は注意してください！',
            'onification'
        );
    };

    // 自分が鬼化された時
    gameService.onBecomeOni = () => {
        eventsUI.addEvent(
            `👹 あなたは鬼になりました！逃走者を捕まえましょう！`,
            EVENT_TYPES.IMPORTANT
        );

        // ポップアップ表示
        screensUI.showEventPopup(
            '👹',
            'あなたは鬼になりました！',
            '復活しました！逃走者を捕まえて仲間を増やしましょう！',
            'become-oni'
        );

        screensUI.updateRoleDisplay(ROLES.ONI);
        // 確保・失格画面から復帰
        screensUI.showScreen('map');
    };
}

// =====================
// プレイヤー監視
// =====================
function watchPlayers() {
    firebaseService.watchPlayers(
        (players) => {
            if (!players) return;

            const user = gameService.getCurrentUser();

            // 自分が鬼化されたかチェック
            if (user.id && players[user.id] && players[user.id].onified) {
                const myData = players[user.id];
                // 自分がまだ鬼化処理をしていない場合
                if ((user.captured || user.disqualified) && myData.role === ROLES.ONI) {
                    gameService.handleBecomeOni();
                    return;
                }
            }

            // 自分が確保されたかチェック
            if (user.id && players[user.id] &&
                players[user.id].captured && !user.captured) {
                gameService.handleCaptured(players[user.id].capturedBy);
                return;
            }

            // マーカー更新
            mapUI.clearAllPlayerMarkers();

            let latestRunnerUpdate = 0;

            Object.entries(players).forEach(([playerId, playerData]) => {
                if (playerId === user.id) return;
                if (user.role === ROLES.RUNNER && playerData.role === ROLES.ONI) return;
                if (playerData.captured) return;

                mapUI.addPlayerMarker(playerId, playerData);

                // 鬼の場合、逃走者の最新更新時刻を追跡
                if (user.role === ROLES.ONI && playerData.role === ROLES.RUNNER) {
                    if (playerData.updated_at > latestRunnerUpdate) {
                        latestRunnerUpdate = playerData.updated_at;
                    }
                }
            });

            // 鬼の場合、更新時刻表示
            if (user.role === ROLES.ONI && latestRunnerUpdate > 0) {
                if (latestRunnerUpdate > lastRunnerUpdateTime) {
                    lastRunnerUpdateTime = latestRunnerUpdate;
                    screensUI.updateOniLastUpdate(latestRunnerUpdate);
                }
            }

            // 参加者リスト更新
            playerListUI.update(players, user);

            // 逃走者が0人になったかチェック（ゲームアクティブ時のみ）
            if (gameService.isGameActive()) {
                checkAllRunnersCaptured(players);
            }
        },
        (error) => console.error('Players watch error:', error)
    );
}

// =====================
// イベント監視
// =====================
function watchGameEvents() {
    firebaseService.watchEvents((event) => {
        if (!event) return;

        logDebug('App', 'New event received', event);

        // 全プレイヤーにイベントを表示
        eventsUI.addEvent(event.message, event.type || EVENT_TYPES.NORMAL);
    });
}

// =====================
// ゲームステータス管理
// =====================
function watchGameStatus() {
    firebaseService.watchGameStatus((data) => {
        if (!data) return;

        logDebug('App', 'Game status changed', data);
        gameService.updateGameState(data);

        handleGameStatusChange(data);
    });
}

function checkGameStatus() {
    firebaseService.getGameStatusOnce()
        .then((data) => {
            if (!data) {
                screensUI.showWaitingOverlay();
                return;
            }

            gameService.updateGameState(data);
            handleGameStatusChange(data);
        })
        .catch(err => console.error('Game status read error:', err));
}

function handleGameStatusChange(data) {
    switch (data.status) {
        case GAME_STATUS.COUNTDOWN:
            // 観戦者でなければカウントダウン画面を表示
            if (!gameService.isSpectatorMode()) {
                screensUI.showCountdownScreen(data.countdownStart);
            }
            break;

        case GAME_STATUS.ACTIVE:
            // 観戦者モードでなければ通常の処理
            if (!gameService.isSpectatorMode()) {
                screensUI.hideWaitingOverlay();
                screensUI.updateOutsideWarning(null);
                gameService.startLocationSending((seconds) => {
                    screensUI.updateRunnerCountdown(seconds);
                });
            }
            screensUI.startGameTimer(data.endTime);
            // 縮小イベントの監視を開始
            gameService.startShrinkEventMonitoring();
            // 鬼化イベントの監視を開始
            gameService.startOnificationEventMonitoring();
            break;

        case GAME_STATUS.ENDED:
            gameService.stopLocationSending();
            screensUI.stopGameTimer();
            // 観戦モードをリセット
            gameService.setSpectatorMode(false);
            firebaseService.getPlayersOnce().then((players) => {
                // winnerを取得して渡す
                const winner = data.winner || null;
                screensUI.showGameEndScreen(players, winner);
                // 管理者の場合はリセットセクションを表示
                showAdminResetSection(isAdmin);
            });
            break;

        case GAME_STATUS.WAITING:
        default:
            gameService.stopLocationSending();
            screensUI.showWaitingOverlay();
            break;
    }
}

// =====================
// 確保処理（グローバル公開）
// =====================
window.capturePlayer = function (playerId, username) {
    logDebug('App', 'Capture button clicked', { playerId, username });

    gameService.capturePlayer(playerId, username)
        .then(() => {
            alert(`${username} を確保しました！`);
            const user = gameService.getCurrentUser();

            // Firebaseにイベントを保存（全プレイヤーに共有）
            firebaseService.addEvent({
                type: EVENT_TYPES.IMPORTANT,
                message: `${user.username}が${username}を確保しました`,
                capturedBy: user.username,
                capturedPlayer: username
            }).catch(err => console.error('Event save error:', err));

            mapUI.removePlayerMarker(playerId);
        })
        .catch(error => {
            console.error('Capture error:', error);
            alert('確保に失敗しました: ' + error.message);
        });
};

// =====================
// ゲーム終了画面
// =====================
function setupGameEndScreen() {
    // ログイン画面に戻るボタン（ゲーム終了画面）
    const backToLoginBtn = document.getElementById('back-to-login-btn');
    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', backToLoginScreen);
    }

    // ログイン画面に戻るボタン（確保画面）
    const capturedBackBtn = document.getElementById('captured-back-to-login-btn');
    if (capturedBackBtn) {
        capturedBackBtn.addEventListener('click', backToLoginScreen);
    }

    // 観戦モードボタン（確保画面）
    const capturedSpectateBtn = document.getElementById('captured-spectate-btn');
    if (capturedSpectateBtn) {
        capturedSpectateBtn.addEventListener('click', enterSpectatorMode);
    }

    // ログイン画面に戻るボタン（失格画面）
    const disqualifiedBackBtn = document.getElementById('disqualified-back-to-login-btn');
    if (disqualifiedBackBtn) {
        disqualifiedBackBtn.addEventListener('click', backToLoginScreen);
    }

    // 観戦モードボタン（失格画面）
    const disqualifiedSpectateBtn = document.getElementById('disqualified-spectate-btn');
    if (disqualifiedSpectateBtn) {
        disqualifiedSpectateBtn.addEventListener('click', enterSpectatorMode);
    }

    // 管理者用リセットボタン
    const resetGameBtn = document.getElementById('reset-game-btn');
    const clearAllDataBtn = document.getElementById('clear-all-data-btn');

    if (resetGameBtn) {
        resetGameBtn.addEventListener('click', resetGameForContinue);
    }

    if (clearAllDataBtn) {
        clearAllDataBtn.addEventListener('click', clearAllGameData);
    }
}

/**
 * ログイン画面に戻る
 */
function backToLoginScreen() {
    // ゲームサービスをクリーンアップ
    gameService.cleanup();
    // ログイン画面に戻る
    screensUI.showScreen('login');
    showAuthChoice();
}

/**
 * 観戦モードに入る
 */
function enterSpectatorMode() {
    logDebug('App', 'Entering spectator mode');

    // 観戦者としてマーク
    gameService.setSpectatorMode(true);

    // マップ画面を表示
    screensUI.showScreen('map');

    // 観戦者用の役割表示
    screensUI.updateRoleDisplay(ROLES.SPECTATOR);

    // ゲームタイマーを表示（ゲームがアクティブな場合）
    const gameState = gameService.getGameState();
    if (gameState.status === GAME_STATUS.ACTIVE && gameState.endTime) {
        screensUI.startGameTimer(gameState.endTime);
    }

    // プレイヤー監視を再開（観戦者モードで）
    watchPlayersAsSpectator();

    logDebug('App', 'Spectator mode activated');
}

/**
 * 観戦者としてプレイヤーを監視
 */
function watchPlayersAsSpectator() {
    firebaseService.watchPlayers(
        (players) => {
            if (!players) return;

            const user = gameService.getCurrentUser();

            // 自分が鬼化されたかチェック（鬼化イベント対応）
            if (user.id && players[user.id] && players[user.id].onified) {
                const myData = players[user.id];
                if ((user.captured || user.disqualified) && myData.role === ROLES.ONI) {
                    gameService.handleBecomeOni();
                    return;
                }
            }

            // マーカー更新（観戦者は全員のマーカーを見れる）
            mapUI.clearAllPlayerMarkers();

            Object.entries(players).forEach(([playerId, playerData]) => {
                // 確保・失格済みのプレイヤーはスキップ
                if (playerData.captured || playerData.disqualified) return;
                // 位置情報がない場合はスキップ
                if (!playerData.lat || !playerData.lng) return;

                mapUI.addPlayerMarker(playerId, playerData, true); // 観戦者モードフラグ
            });

            // 参加者リスト更新
            playerListUI.update(players, user);
        },
        (error) => console.error('Players watch error (spectator):', error)
    );
}

/**
 * 管理者リセットセクションの表示/非表示
 * @param {boolean} show - 表示するかどうか
 */
function showAdminResetSection(show) {
    const adminSection = document.getElementById('admin-reset-section');
    if (adminSection) {
        if (show) {
            adminSection.classList.remove('hidden');
        } else {
            adminSection.classList.add('hidden');
        }
    }
}

/**
 * ゲームをリセット（プレイヤーデータ保持、ステータスのみリセット）
 */
function resetGameForContinue() {
    if (!confirm('ゲームをリセットして新しいゲームを開始しますか？\n（プレイヤーデータは保持されます）')) {
        return;
    }

    // プレイヤーの確保・失格状態をリセット
    firebaseService.getPlayersOnce()
        .then((players) => {
            if (!players) return Promise.resolve();

            const resetPromises = Object.keys(players).map(playerId => {
                return firebaseService.updatePlayerLocation(playerId, {
                    ...players[playerId],
                    captured: false,
                    capturedBy: null,
                    capturedAt: null,
                    disqualified: false,
                    disqualifiedReason: null,
                    disqualifiedAt: null,
                    updated_at: Date.now()
                });
            });

            return Promise.all(resetPromises);
        })
        .then(() => {
            // ゲームステータスを待機中に戻す
            return firebaseService.setGameStatus({
                status: GAME_STATUS.WAITING,
                startTime: null,
                endTime: null,
                duration: null
            });
        })
        .then(() => {
            // イベントをクリア
            return firebaseService.clearEvents();
        })
        .then(() => {
            logDebug('App', 'Game reset for continue');
            alert('ゲームをリセットしました。管理画面から新しいゲームを開始できます。');
            screensUI.showScreen('admin');
        })
        .catch(error => {
            console.error('Reset error:', error);
            alert('リセットに失敗しました: ' + error.message);
        });
}

/**
 * 全データを削除（完全リセット）
 */
function clearAllGameData() {
    if (!confirm('全てのゲームデータを削除しますか？\n（プレイヤーデータも全て削除されます）')) {
        return;
    }

    if (!confirm('本当に削除しますか？この操作は取り消せません。')) {
        return;
    }

    // プレイヤーデータを削除
    firebaseService.clearAllPlayers()
        .then(() => {
            // イベントを削除
            return firebaseService.clearEvents();
        })
        .then(() => {
            // ゲームステータスを待機中に戻す
            return firebaseService.setGameStatus({
                status: GAME_STATUS.WAITING,
                startTime: null,
                endTime: null,
                duration: null
            });
        })
        .then(() => {
            logDebug('App', 'All game data cleared');
            alert('全データを削除しました。');
            screensUI.showScreen('admin');
        })
        .catch(error => {
            console.error('Clear all data error:', error);
            alert('削除に失敗しました: ' + error.message);
        });
}

// =====================
// 管理者機能
// =====================
function showAdminLogin() {
    screensUI.showScreen('admin');
    logDebug('App', 'Admin login screen');
}

function setupAdminScreen() {
    const adminAuthBtn = document.getElementById('admin-auth-btn');
    const adminBackBtn = document.getElementById('admin-back-btn');
    const adminLogoutBtn = document.getElementById('admin-logout-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    const endGameBtn = document.getElementById('end-game-btn');
    const clearPlayersBtn = document.getElementById('clear-players-btn');
    const passwordInput = document.getElementById('admin-password');

    if (adminAuthBtn) adminAuthBtn.addEventListener('click', authenticateAdmin);
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') authenticateAdmin();
        });
    }

    if (adminBackBtn) {
        adminBackBtn.addEventListener('click', () => screensUI.showScreen('login'));
    }

    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', () => {
            isAdmin = false;
            document.getElementById('admin-panel').classList.add('hidden');
            document.getElementById('admin-login').classList.remove('hidden');
            document.getElementById('admin-password').value = '';
        });
    }

    if (startGameBtn) startGameBtn.addEventListener('click', startGame);
    if (endGameBtn) endGameBtn.addEventListener('click', endGame);
    if (clearPlayersBtn) clearPlayersBtn.addEventListener('click', clearAllPlayers);
}

function authenticateAdmin() {
    const password = document.getElementById('admin-password').value;

    if (password === ADMIN_PASSWORD) {
        isAdmin = true;
        logDebug('App', 'Admin authenticated');
        document.getElementById('admin-login').classList.add('hidden');
        document.getElementById('admin-panel').classList.remove('hidden');
        watchPlayersForAdmin();
    } else {
        alert('パスワードが違います');
    }
}

function watchPlayersForAdmin() {
    firebaseService.watchPlayers((players) => {
        updateAdminStats(players);
        updateAdminPlayerList(players);
    });
}

function updateAdminStats(players) {
    const totalEl = document.getElementById('total-players');
    const oniEl = document.getElementById('oni-count');
    const runnerEl = document.getElementById('runner-count');

    if (!players) {
        if (totalEl) totalEl.textContent = '0';
        if (oniEl) oniEl.textContent = '0';
        if (runnerEl) runnerEl.textContent = '0';
        return;
    }

    const playerArray = Object.values(players);
    if (totalEl) totalEl.textContent = playerArray.length;
    if (oniEl) oniEl.textContent = playerArray.filter(p => p.role === ROLES.ONI).length;
    if (runnerEl) runnerEl.textContent = playerArray.filter(p => p.role === ROLES.RUNNER).length;
}

function updateAdminPlayerList(players) {
    const listContent = document.getElementById('player-list-content');
    if (!listContent) return;

    if (!players) {
        listContent.innerHTML = '<p>プレイヤーがいません</p>';
        return;
    }

    let html = '';
    Object.entries(players).forEach(([playerId, playerData]) => {
        const roleEmoji = playerData.role === ROLES.ONI ? '●' : '●';
        const roleText = playerData.role === ROLES.ONI ? '鬼' : '逃走者';
        const lastUpdate = new Date(playerData.updated_at).toLocaleTimeString();

        html += `
            <div class="player-item">
                <div class="player-info">
                    <div class="player-name">${roleEmoji} ${playerData.username}</div>
                    <div class="player-role">${roleText} - 最終更新: ${lastUpdate}</div>
                </div>
                <div class="player-actions">
                    <button class="btn-small btn-kick" onclick="kickPlayer('${playerId}')">削除</button>
                </div>
            </div>
        `;
    });

    listContent.innerHTML = html;
}

window.kickPlayer = function (playerId) {
    if (!confirm('このプレイヤーを削除しますか？')) return;

    firebaseService.removePlayer(playerId)
        .then(() => {
            logDebug('App', 'Player kicked', playerId);
            alert('プレイヤーを削除しました');
        })
        .catch(error => {
            console.error('Kick error:', error);
            alert('削除に失敗しました');
        });
};

function startGame() {
    const duration = parseInt(document.getElementById('game-duration').value) || 30;
    const durationMs = duration * 60 * 1000;
    const countdownStart = Date.now();

    const countdownData = {
        status: GAME_STATUS.COUNTDOWN,
        countdownStart: countdownStart,
        duration: durationMs
    };

    firebaseService.setGameStatus(countdownData)
        .then(() => {
            logDebug('App', 'Countdown started');
            alert(`10秒後にゲームを開始します！（${duration}分間）`);

            setTimeout(() => {
                const actualStartTime = Date.now();
                const gameData = {
                    status: GAME_STATUS.ACTIVE,
                    startTime: actualStartTime,
                    endTime: actualStartTime + durationMs,
                    duration: durationMs
                };

                firebaseService.setGameStatus(gameData)
                    .then(() => logDebug('App', 'Game started'))
                    .catch(error => console.error('Game start error:', error));
            }, 10000);
        })
        .catch(error => console.error('Countdown error:', error));
}

function endGame() {
    if (!confirm('ゲームを終了しますか？')) return;

    firebaseService.updateGameStatus({
        status: GAME_STATUS.ENDED,
        endTime: Date.now()
    })
        .then(() => {
            logDebug('App', 'Game ended');
            alert('ゲームを終了しました');
        })
        .catch(error => console.error('End game error:', error));
}

// 逃走者が0人になったかチェック
function checkAllRunnersCaptured(players) {
    if (!players) return;

    // アクティブな逃走者をカウント
    let activeRunners = 0;
    let totalRunners = 0;

    Object.values(players).forEach(playerData => {
        // 元々の逃走者をカウント（鬼化された人は除く）
        if (playerData.role === ROLES.RUNNER && !playerData.onified) {
            totalRunners++;
            // 確保されていない、失格でもない逃走者
            if (!playerData.captured && !playerData.disqualified) {
                activeRunners++;
            }
        }
    });

    logDebug('App', 'Runner check', { activeRunners, totalRunners });

    // 逃走者が1人以上いて、かつ全員確保/失格された場合
    if (totalRunners > 0 && activeRunners === 0) {
        logDebug('App', 'All runners captured - Oni wins!');

        // ゲーム終了（鬼の勝利）
        firebaseService.updateGameStatus({
            status: GAME_STATUS.ENDED,
            endTime: Date.now(),
            winner: 'oni'
        })
            .then(() => {
                logDebug('App', 'Game ended - Oni victory');
            })
            .catch(error => console.error('End game error:', error));
    }
}

function clearAllPlayers() {
    if (!confirm('全プレイヤーのデータを削除しますか？')) return;

    firebaseService.clearAllPlayers()
        .then(() => {
            logDebug('App', 'All players cleared');
            alert('全プレイヤーをクリアしました');
        })
        .catch(error => {
            console.error('Clear players error:', error);
            alert('クリアに失敗しました: ' + error.message);
        });
}
