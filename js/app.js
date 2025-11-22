// メインアプリケーションロジック
import { firebaseConfig } from './firebase-config.js';

// グローバル変数
let map;
let userMarker;
let playerMarkers = {};
let currentUser = {
    id: null,
    username: '',
    role: '', // 'oni' or 'runner' or 'admin'
    lat: null,
    lng: null
};

// 管理者設定
const ADMIN_PASSWORD = 'kotaro1123'; // 本番環境では変更してください
let isAdmin = false;

// ゲーム状態管理
let gameState = {
    status: 'waiting', // 'waiting', 'active', 'ended'
    startTime: null,
    endTime: null,
    duration: 30 * 60 * 1000 // デフォルト: 30分
};
let gameStatusRef = null;
let gameTimerInterval = null;
let countdownInterval = null;

// ゲーム設定（鹿児島高専を中心に半径1km）
const GAME_SETTINGS = {
    center_lat: 31.731222,
    center_lng: 130.728778,
    radius_meter: 1000
};

// 位置情報送信頻度（ミリ秒）
const ONI_SEND_INTERVAL_MS = 5 * 1000;      // 鬼: 5秒ごと
const RUNNER_SEND_INTERVAL_MS = 30 * 1000;  // 逃走者: 30秒ごと（テスト用）
// ※本番環境では RUNNER_SEND_INTERVAL_MS を 10 * 60 * 1000 (10分) に変更可能

// Firebase参照（CDN版を想定）
let database;
let playersRef;
let sendTimer = null; // 位置送信用タイマー（鬼/逃走者共通）

// ====================
// 初期化
// ====================
console.log('App start');
console.log('Loaded at:', new Date().toLocaleString());

document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM読み込み完了');
    initFirebase();
    setupLoginScreen();
});

function initFirebase() {
    console.log('Initializing Firebase...');
    // Firebase CDN使用時の初期化
    if (typeof window.firebase !== 'undefined') {
        console.log('Firebase CDN detected');
        try {
            window.firebase.initializeApp(firebaseConfig);
            database = window.firebase.database();
            playersRef = database.ref('game_session_v1/players');
            gameStatusRef = database.ref('game_session_v1/game_status');
            console.log('Firebase init success, DB URL:', firebaseConfig.databaseURL);

            // ゲーム状態を監視
            watchGameStatus();
        } catch (error) {
            console.error('Firebase init error:', error);
        }
    } else {
        console.error('Firebase CDN not loaded');
    }
}

// ====================
// ログイン画面
// ====================
function setupLoginScreen() {
    const usernameInput = document.getElementById('username');
    const joinOniBtn = document.getElementById('join-oni');
    const joinRunnerBtn = document.getElementById('join-runner');
    const adminLoginBtn = document.getElementById('admin-login-btn');

    joinOniBtn.addEventListener('click', () => joinGame('oni'));
    joinRunnerBtn.addEventListener('click', () => joinGame('runner'));
    adminLoginBtn.addEventListener('click', showAdminLogin);

    // Enterキーでも参加可能
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && usernameInput.value.trim()) {
            joinGame('runner'); // デフォルトは逃走者
        }
    });

    // 管理者画面のセットアップ
    setupAdminScreen();
}

function joinGame(role) {
    const username = document.getElementById('username').value.trim();

    if (!username) {
        alert('名前を入力してください');
        return;
    }

    currentUser.username = username;
    currentUser.role = role;
    currentUser.id = 'user_' + Date.now();

    console.log('Join game:', { username, role, id: currentUser.id });

    // マップ画面へ遷移
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('map-screen').classList.remove('hidden');

    initMapScreen();

    // ゲーム状態をチェック
    checkGameStatus();
}// ====================
// マップ画面初期化
// ====================
function initMapScreen() {
    // ステータスバー更新
    const roleDisplay = document.getElementById('role-display');
    roleDisplay.textContent = currentUser.role === 'oni' ? '👹 鬼' : '🏃 逃走者';
    roleDisplay.style.color = currentUser.role === 'oni' ? '#f5576c' : '#00f2fe';

    // ボトムバー表示切替
    if (currentUser.role === 'runner') {
        document.getElementById('timer-display').classList.remove('hidden');
    } else {
        document.getElementById('update-display').classList.remove('hidden');
    }

    // 地図初期化
    initMap();

    // 位置情報取得開始（リアルタイム表示用）
    startLocationTracking();

    // Firebase監視開始
    watchPlayers();

    // 注：位置送信はゲーム開始後に開始
    console.log('Waiting for game start...');
}

// ====================
// 地図初期化
// ====================
function initMap() {
    // Leaflet地図作成
    map = L.map('map').setView([GAME_SETTINGS.center_lat, GAME_SETTINGS.center_lng], 15);

    // タイル追加（OpenStreetMap）
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // エリア円を描画
    L.circle([GAME_SETTINGS.center_lat, GAME_SETTINGS.center_lng], {
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.1,
        radius: GAME_SETTINGS.radius_meter
    }).addTo(map);

    console.log('Map initialized');
}

// ====================
// 位置情報取得
// ====================
function startLocationTracking() {
    console.log('Start geolocation watch');
    if (!navigator.geolocation) {
        console.error('❌ Geolocation API利用不可');
        alert('このブラウザは位置情報に対応していません');
        return;
    }

    // 常時追跡
    navigator.geolocation.watchPosition(
        (position) => {
            currentUser.lat = position.coords.latitude;
            currentUser.lng = position.coords.longitude;
            // 位置取得

            // 自分のマーカー更新
            updateSelfMarker();

            // エリア判定
            checkGeofence();

            // Firebaseへ送信（役割により条件分岐）
            sendLocationToFirebase();
        },
        (error) => {
            console.error('Geolocation error:', error.message);
            alert('位置情報の取得に失敗しました: ' + error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        }
    );
}

function updateSelfMarker() {
    if (!map || !currentUser.lat) return;

    if (!userMarker) {
        // 自分は常に緑色
        const selfIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        userMarker = L.marker([currentUser.lat, currentUser.lng], { icon: selfIcon })
            .addTo(map)
            .bindPopup(`<b>🟢 ${currentUser.username} (自分)</b><br>${currentUser.role === 'oni' ? '鬼' : '逃走者'}`);

        map.setView([currentUser.lat, currentUser.lng], 15);
        console.log('Create self marker');
    } else {
        userMarker.setLatLng([currentUser.lat, currentUser.lng]);
    }
}

// ====================
// ジオフェンス判定
// ====================
function checkGeofence() {
    if (!currentUser.lat) return;

    const distance = getDistance(
        currentUser.lat,
        currentUser.lng,
        GAME_SETTINGS.center_lat,
        GAME_SETTINGS.center_lng
    );

    const areaStatus = document.getElementById('area-status');
    const warning = document.getElementById('area-warning');

    if (distance > GAME_SETTINGS.radius_meter) {
        // エリア外
        areaStatus.textContent = 'エリア外';
        areaStatus.classList.add('outside');
        warning.classList.remove('hidden');

        // バイブレーション
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }
    } else {
        // エリア内
        areaStatus.textContent = 'エリア内';
        areaStatus.classList.remove('outside');
        warning.classList.add('hidden');
    }
}

// 2点間の距離計算（メートル）
function getDistance(lat1, lng1, lat2, lng2) {
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

// ====================
// Firebase送信
// ====================
function sendLocationToFirebase() {
    if (!database || currentUser.lat == null || currentUser.lng == null) return;
    updateFirebaseLocation(Date.now());
}

function updateFirebaseLocation(timestamp) {
    const data = {
        username: currentUser.username,
        role: currentUser.role,
        lat: currentUser.lat,
        lng: currentUser.lng,
        updated_at: timestamp
    };

    playersRef.child(currentUser.id).set(data).catch((error) => {
        console.error('Firebase write error:', error);
    });
}

// 逃走者用カウントダウン更新
function updateRunnerCountdown(seconds) {
    const el = document.getElementById('countdown');
    if (!el) return;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ====================
// 他プレイヤー監視
// ====================
function watchPlayers() {
    if (!playersRef) return;
    playersRef.on('value', (snapshot) => {
        const players = snapshot.val();
        if (!players) return;
        Object.values(playerMarkers).forEach(m => m.remove());
        playerMarkers = {};
        Object.entries(players).forEach(([playerId, playerData]) => {
            if (playerId === currentUser.id) return; // 自分は表示済み
            if (currentUser.role === 'runner' && playerData.role === 'oni') return; // 逃走者は鬼非表示
            addPlayerMarker(playerId, playerData);
        });
    }, (error) => console.error('Players watch error:', error));
}

function addPlayerMarker(playerId, playerData) {
    const { username, role, lat, lng, updated_at } = playerData;


    if (!map) {
        console.error('❌ 地図が初期化されていません');
        return;
    }

    if (!lat || !lng) {
        console.error('❌ 無効な位置情報:', { lat, lng });
        return;
    }

    try {
        // アイコン色選択: 鬼=赤、逃走者=青
        const colorUrl = role === 'oni'
            ? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png'
            : 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png';

        const colorEmoji = role === 'oni' ? '🔴' : '🔵';

        const icon = L.icon({
            iconUrl: colorUrl,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        const marker = L.marker([lat, lng], { icon })
            .addTo(map)
            .bindPopup(`<b>${colorEmoji} ${username}</b><br>${role === 'oni' ? '鬼' : '逃走者'}<br>更新: ${formatTime(updated_at)}`);

        playerMarkers[playerId] = marker;
        // マーカー追加成功
    } catch (error) {
        console.error('❌ マーカー追加エラー:', error);
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ====================
// ゲームステータス管理
// ====================
function watchGameStatus() {
    gameStatusRef.on('value', (snapshot) => {
        const data = snapshot.val();
        console.log('Game status changed:', data);
        if (!data) return;
        gameState.status = data.status;
        gameState.startTime = data.startTime;
        gameState.endTime = data.endTime;
        gameState.duration = data.duration;
        if (data.status === 'countdown') {
            console.log('Showing countdown...');
            showCountdownScreen(data.countdownStart);
        } else if (data.status === 'active') {
            console.log('Game active! Hiding overlay and starting...');
            hideWaitingOverlay();
            startLocationSending();
            updateGameTimer();
        } else if (data.status === 'ended') {
            stopLocationSending();
            showGameEndMessage();
        } else if (data.status === 'waiting') {
            stopLocationSending();
            showWaitingMessage();
        }
    });
}

function checkGameStatus() {
    gameStatusRef.once('value').then((snapshot) => {
        const data = snapshot.val();
        if (!data) { showWaitingMessage(); return; }
        gameState.status = data.status;
        gameState.startTime = data.startTime;
        gameState.endTime = data.endTime;
        gameState.duration = data.duration;
        if (data.status === 'countdown') {
            showCountdownScreen(data.countdownStart);
        } else if (data.status === 'active') {
            hideWaitingOverlay();
            startLocationSending();
            updateGameTimer();
        } else if (data.status === 'ended') {
            showGameEndMessage();
        } else {
            showWaitingMessage();
        }
    }).catch(err => console.error('Game status read error:', err));
}

function startLocationSending() {
    if (sendTimer) return; // 既に開始済み
    if (currentUser.role === 'oni') {
        sendLocationToFirebase();
        sendTimer = setInterval(() => sendLocationToFirebase(), ONI_SEND_INTERVAL_MS);
    } else if (currentUser.role === 'runner') {
        // ゲーム開始時刻からの経過時間を計算して同期
        const now = Date.now();
        const elapsed = now - gameState.startTime;
        const intervalMs = RUNNER_SEND_INTERVAL_MS;
        
        // 次の送信タイミングまでの残り時間を計算
        const nextSendIn = intervalMs - (elapsed % intervalMs);
        let countdown = Math.ceil(nextSendIn / 1000);
        
        console.log(`Runner sync: elapsed=${elapsed}ms, next send in ${countdown}s`);
        
        updateRunnerCountdown(countdown);
        
        // カウントダウン更新
        const countdownInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - gameState.startTime;
            const remaining = Math.ceil((intervalMs - (elapsed % intervalMs)) / 1000);
            
            if (remaining <= 0 || remaining > intervalMs / 1000) {
                updateRunnerCountdown(intervalMs / 1000);
            } else {
                updateRunnerCountdown(remaining);
            }
        }, 1000);
        
        if (!window.gameTimers) window.gameTimers = [];
        window.gameTimers.push(countdownInterval);
        
        // 初回送信（ゲーム開始直後なら送信）
        if (elapsed < 1000) {
            sendLocationToFirebase();
        }
        
        // 次の同期タイミングで送信を開始
        setTimeout(() => {
            sendLocationToFirebase();
            // 以降は30秒ごとに送信
            sendTimer = setInterval(() => sendLocationToFirebase(), intervalMs);
        }, nextSendIn);
    }
}

function stopLocationSending() {
    if (sendTimer) {
        clearInterval(sendTimer);
        sendTimer = null;
        console.log('Stop sending location');
    }

    // カウントダウンタイマーも停止
    if (window.gameTimers) {
        window.gameTimers.forEach(timer => clearInterval(timer));
        window.gameTimers = [];
    }

    // カウントダウン表示をリセット
    const bottomBar = document.querySelector('.bottom-bar');
    if (bottomBar) {
        bottomBar.textContent = 'ゲーム終了';
    }
}

function updateGameTimer() {
    if (gameTimerInterval) {
        clearInterval(gameTimerInterval);
    }

    const statusBar = document.querySelector('.status-bar');
    if (!statusBar) return;

    // タイマー表示要素を作成
    let timerElement = document.getElementById('game-timer');
    if (!timerElement) {
        timerElement = document.createElement('div');
        timerElement.id = 'game-timer';
        timerElement.style.marginLeft = '10px';
        timerElement.style.fontWeight = 'bold';
        timerElement.style.color = '#ff6b6b';
        statusBar.appendChild(timerElement);
    }

    gameTimerInterval = setInterval(() => {
        const now = Date.now();
        const remaining = gameState.endTime - now;

        if (remaining <= 0) {
            timerElement.textContent = '⏰ 時間切れ';
            clearInterval(gameTimerInterval);
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        timerElement.textContent = `⏰ 残り ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function showWaitingMessage() {
    const overlay = document.getElementById('waiting-overlay');
    const title = document.getElementById('waiting-title');
    const message = document.getElementById('waiting-message');
    const countdownDisplay = document.getElementById('countdown-display');

    if (overlay) {
        overlay.classList.remove('hidden');
        title.textContent = '⏳ ゲーム開始を待っています';
        message.textContent = '管理者がゲームを開始するまでお待ちください';
        countdownDisplay.classList.add('hidden');
    }
}

function showCountdownScreen(countdownStart) {
    const overlay = document.getElementById('waiting-overlay');
    const title = document.getElementById('waiting-title');
    const message = document.getElementById('waiting-message');
    const countdownDisplay = document.getElementById('countdown-display');
    const countdownNumber = document.getElementById('countdown-number');

    if (!overlay) return;

    // 既存のカウントダウンをクリア
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }

    overlay.classList.remove('hidden');
    title.textContent = '🎮 まもなくゲーム開始！';
    message.classList.add('hidden');
    countdownDisplay.classList.remove('hidden');

    const updateCountdown = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - countdownStart) / 1000);
        const remaining = 10 - elapsed;

        if (remaining > 0) {
            countdownNumber.textContent = remaining;
        } else if (remaining === 0) {
            countdownNumber.textContent = 'START!';
        }
    };

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 100);
}

function hideWaitingOverlay() {
    const overlay = document.getElementById('waiting-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }

    // カウントダウンインターバルをクリア
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function showGameEndMessage() {
    const bottomBar = document.querySelector('.bottom-bar');
    if (bottomBar) {
        bottomBar.textContent = '🏁 ゲーム終了';
        bottomBar.style.backgroundColor = '#888';
    }

    // タイマーをクリア
    if (gameTimerInterval) {
        clearInterval(gameTimerInterval);
        const timerElement = document.getElementById('game-timer');
        if (timerElement) {
            timerElement.remove();
        }
    }
}

// ====================
// 管理者機能
// ====================
function showAdminLogin() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-screen').classList.remove('hidden');
    console.log('🔒 管理者ログイン画面を表示');
}

function setupAdminScreen() {
    const adminAuthBtn = document.getElementById('admin-auth-btn');
    const adminBackBtn = document.getElementById('admin-back-btn');
    const adminLogoutBtn = document.getElementById('admin-logout-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    const endGameBtn = document.getElementById('end-game-btn');
    const clearPlayersBtn = document.getElementById('clear-players-btn');
    const passwordInput = document.getElementById('admin-password');

    // 認証
    adminAuthBtn.addEventListener('click', () => authenticateAdmin());

    // Enterキーで認証
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            authenticateAdmin();
        }
    });

    // 戻るボタン
    adminBackBtn.addEventListener('click', () => {
        document.getElementById('admin-screen').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    });

    // ログアウト
    adminLogoutBtn.addEventListener('click', () => {
        isAdmin = false;
        document.getElementById('admin-panel').classList.add('hidden');
        document.getElementById('admin-login').classList.remove('hidden');
        document.getElementById('admin-password').value = '';
        console.log('👋 管理者ログアウト');
    });

    // ゲーム開始
    startGameBtn.addEventListener('click', () => startGame());

    // ゲーム終了
    endGameBtn.addEventListener('click', () => endGame());

    // 全プレイヤークリア
    clearPlayersBtn.addEventListener('click', () => clearAllPlayers());
}

function authenticateAdmin() {
    const password = document.getElementById('admin-password').value;

    if (password === ADMIN_PASSWORD) {
        isAdmin = true;
        console.log('✅ 管理者認証成功');
        document.getElementById('admin-login').classList.add('hidden');
        document.getElementById('admin-panel').classList.remove('hidden');

        // プレイヤー情報の監視開始
        watchPlayersForAdmin();
    } else {
        alert('パスワードが違います');
        console.log('❌ 管理者認証失敗');
    }
}

function watchPlayersForAdmin() {
    if (!playersRef) return;

    playersRef.on('value', (snapshot) => {
        const players = snapshot.val();
        updateAdminStats(players);
        updatePlayerList(players);
    });
}

function updateAdminStats(players) {
    if (!players) {
        document.getElementById('total-players').textContent = '0';
        document.getElementById('oni-count').textContent = '0';
        document.getElementById('runner-count').textContent = '0';
        return;
    }

    const playerArray = Object.values(players);
    const totalPlayers = playerArray.length;
    const oniCount = playerArray.filter(p => p.role === 'oni').length;
    const runnerCount = playerArray.filter(p => p.role === 'runner').length;

    document.getElementById('total-players').textContent = totalPlayers;
    document.getElementById('oni-count').textContent = oniCount;
    document.getElementById('runner-count').textContent = runnerCount;
}

function updatePlayerList(players) {
    const listContent = document.getElementById('player-list-content');

    if (!players) {
        listContent.innerHTML = '<p>プレイヤーがいません</p>';
        return;
    }

    let html = '';
    Object.entries(players).forEach(([playerId, playerData]) => {
        const roleEmoji = playerData.role === 'oni' ? '🔴' : '🔵';
        const roleText = playerData.role === 'oni' ? '鬼' : '逃走者';
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

function kickPlayer(playerId) {
    if (!confirm('このプレイヤーを削除しますか？')) return;

    playersRef.child(playerId).remove()
        .then(() => {
            console.log('✅ プレイヤーを削除しました:', playerId);
            alert('プレイヤーを削除しました');
        })
        .catch((error) => {
            console.error('❌ プレイヤー削除エラー:', error);
            alert('削除に失敗しました');
        });
}

function startGame() {
    const duration = parseInt(document.getElementById('game-duration').value) || 30;
    const durationMs = duration * 60 * 1000;
    const countdownStart = Date.now();

    // まずカウントダウン状態に設定
    const countdownData = {
        status: 'countdown',
        countdownStart: countdownStart,
        duration: durationMs
    };

    gameStatusRef.set(countdownData)
        .then(() => {
            console.log('✅ カウントダウン開始');
            alert(`10秒後にゲームを開始します！（${duration}分間）`);

            // 10秒後に実際のゲームを開始
            setTimeout(() => {
                const actualStartTime = Date.now();
                const gameData = {
                    status: 'active',
                    startTime: actualStartTime,
                    endTime: actualStartTime + durationMs,
                    duration: durationMs
                };

                gameStatusRef.set(gameData)
                    .then(() => {
                        console.log('✅ ゲーム開始:', gameData);
                    })
                    .catch((error) => {
                        console.error('❌ ゲーム開始エラー:', error);
                    });
            }, 10000);
        })
        .catch((error) => {
            console.error('❌ カウントダウン開始エラー:', error);
        });
}

function endGame() {
    if (!confirm('ゲームを終了しますか？')) return;

    gameStatusRef.update({
        status: 'ended',
        endTime: Date.now()
    })
        .then(() => {
            console.log('✅ ゲーム終了');
            alert('ゲームを終了しました');
        })
        .catch((error) => {
            console.error('❌ ゲーム終了エラー:', error);
        });
} function clearAllPlayers() {
    if (!confirm('全プレイヤーのデータを削除しますか？この操作は取り消せません。')) return;

    playersRef.remove()
        .then(() => {
            console.log('✅ 全プレイヤーをクリア');
            alert('全プレイヤーをクリアしました');
        })
        .catch((error) => {
            console.error('❌ プレイヤークリアエラー:', error);
            alert('クリアに失敗しました');
        });
}

// グローバルスコープに公開（HTML内のonclick用）
window.kickPlayer = kickPlayer;

