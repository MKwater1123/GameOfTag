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
}

// =====================
// プレイヤー監視
// =====================
function watchPlayers() {
    firebaseService.watchPlayers(
        (players) => {
            if (!players) return;

            const user = gameService.getCurrentUser();

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
        },
        (error) => console.error('Players watch error:', error)
    );
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
            screensUI.showCountdownScreen(data.countdownStart);
            break;

        case GAME_STATUS.ACTIVE:
            screensUI.hideWaitingOverlay();
            screensUI.updateOutsideWarning(null);
            gameService.startLocationSending((seconds) => {
                screensUI.updateRunnerCountdown(seconds);
            });
            screensUI.startGameTimer(data.endTime);
            break;

        case GAME_STATUS.ENDED:
            gameService.stopLocationSending();
            screensUI.stopGameTimer();
            firebaseService.getPlayersOnce().then((players) => {
                screensUI.showGameEndScreen(players);
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
            eventsUI.addEvent(`${user.username}が${username}を確保しました`, EVENT_TYPES.IMPORTANT);
            mapUI.removePlayerMarker(playerId);
        })
        .catch(error => {
            console.error('Capture error:', error);
            alert('確保に失敗しました: ' + error.message);
        });
};

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
