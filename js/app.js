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

// ゲーム設定（鹿児島高専を中心に半径1km）
const GAME_SETTINGS = {
    center_lat: 31.731222,
    center_lng: 130.728778,
    radius_meter: 1000
};

// 逃走者の位置送信間隔（ミリ秒）
// const RUNNER_UPDATE_INTERVAL = 10 * 60 * 1000; // 10分
const RUNNER_UPDATE_INTERVAL = 30 * 1000; // 30秒（テスト用）
let updateTimer = null;
let nextUpdateTime = null;

// Firebase参照（CDN版を想定）
let database;
let playersRef;
let locationSendTimer = null;

// ====================
// 初期化
// ====================
console.log('🚀 GPS Tag アプリ起動');
console.log('📅 読み込み時刻:', new Date().toLocaleString());

document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM読み込み完了');
    initFirebase();
    setupLoginScreen();
});

function initFirebase() {
    console.log('🔧 Firebase初期化開始...');
    // Firebase CDN使用時の初期化
    if (typeof window.firebase !== 'undefined') {
        console.log('✅ Firebase CDN読み込み確認');
        try {
            window.firebase.initializeApp(firebaseConfig);
            database = window.firebase.database();
            playersRef = database.ref('game_session_v1/players');
            gameStatusRef = database.ref('game_session_v1/game_status');
            console.log('✅ Firebase初期化成功');
            console.log('📍 Database URL:', firebaseConfig.databaseURL);

            // ゲーム状態を監視
            watchGameStatus();
        } catch (error) {
            console.error('❌ Firebase初期化エラー:', error);
        }
    } else {
        console.error('❌ Firebase CDNが読み込まれていません');
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

    console.log('🎮 ゲーム参加:', {
        username: username,
        role: role,
        id: currentUser.id
    });

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
    console.log('⚠️ ゲーム開始待機中...');
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
    console.log('📍 位置情報取得開始...');
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
            console.log('📍 位置取得:', currentUser.lat.toFixed(6), currentUser.lng.toFixed(6));

            // 自分のマーカー更新
            updateSelfMarker();

            // エリア判定
            checkGeofence();

            // Firebaseへ送信（役割により条件分岐）
            sendLocationToFirebase();
        },
        (error) => {
            console.error('❌ 位置情報取得エラー:', error.message);
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
        console.log('🟢 自分のマーカー作成: 緑色');
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
    if (!database || !currentUser.lat) return;

    const now = Date.now();

    // 鬼：初回のみ送信（以降は定期タイマーで送信）
    if (currentUser.role === 'oni') {
        if (!currentUser.lastSent) {
            updateFirebaseLocation(now);
            currentUser.lastSent = now;
            console.log('鬼: 初回位置送信完了');
        }
    }
    // 逃走者：30秒に1回
    else if (currentUser.role === 'runner') {
        if (!nextUpdateTime || now >= nextUpdateTime) {
            updateFirebaseLocation(now);
            nextUpdateTime = now + RUNNER_UPDATE_INTERVAL;
            startCountdown();
            console.log('逃走者: 位置送信完了', currentUser.lat, currentUser.lng);
        }
    }
}

function updateFirebaseLocation(timestamp) {
    const data = {
        username: currentUser.username,
        role: currentUser.role,
        lat: currentUser.lat,
        lng: currentUser.lng,
        updated_at: timestamp
    };

    playersRef.child(currentUser.id).set(data)
        .then(() => {
            console.log('Firebase送信成功:', data);
        })
        .catch((error) => {
            console.error('Firebase送信失敗:', error);
        });
}

// ====================
// カウントダウンタイマー（逃走者用）
// ====================
function startCountdown() {
    if (updateTimer) clearInterval(updateTimer);

    updateTimer = setInterval(() => {
        const remaining = nextUpdateTime - Date.now();

        if (remaining <= 0) {
            document.getElementById('countdown').textContent = '00:00';
            clearInterval(updateTimer);
        } else {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            document.getElementById('countdown').textContent =
                `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }, 1000);
}

// ====================
// 他プレイヤー監視
// ====================
function watchPlayers() {
    console.log('🔍 watchPlayers関数呼び出し');
    console.log('playersRef状態:', playersRef ? '✅初期化済み' : '❌未初期化');
    console.log('database状態:', database ? '✅初期化済み' : '❌未初期化');

    if (!playersRef) {
        console.error('❌ playersRefが初期化されていません');
        console.error('再初期化を試みます...');

        // 再初期化を試みる
        if (database) {
            playersRef = database.ref('game_session_v1/players');
            console.log('✅ playersRefを再初期化しました');
        } else {
            console.error('❌ databaseがないため再初期化できません');
            return;
        }
    }

    console.log('👀 Firebaseのプレイヤーデータ監視開始');
    console.log('Firebaseパス:', 'game_session_v1/players');

    playersRef.on('value', (snapshot) => {
        console.log('📡 Firebaseイベント発火！');
        const players = snapshot.val();
        console.log('📬 Firebase受信:', players);
        console.log('📊 プレイヤー数:', players ? Object.keys(players).length : 0);

        if (!players) {
            console.log('⚠️ プレイヤーデータがありません');
            return;
        }

        // 既存マーカークリア
        const oldMarkerCount = Object.keys(playerMarkers).length;
        Object.values(playerMarkers).forEach(marker => marker.remove());
        playerMarkers = {};
        console.log('🧹 既存マーカーを削除:', oldMarkerCount, '個');

        let addedCount = 0;
        let skippedCount = 0;

        Object.entries(players).forEach(([playerId, playerData]) => {
            console.log('🔍 プレイヤーチェック:', {
                playerId,
                username: playerData.username,
                role: playerData.role,
                自分: playerId === currentUser.id,
                自分のID: currentUser.id
            });

            // 自分は除外
            if (playerId === currentUser.id) {
                console.log('⏭️ 自分なのでスキップ');
                skippedCount++;
                return;
            }

            // 逃走者の場合、鬼は表示しない
            if (currentUser.role === 'runner' && playerData.role === 'oni') {
                console.log('🏃 逃走者モード: 鬼を非表示', playerData.username);
                skippedCount++;
                return;
            }

            // マーカー追加
            addPlayerMarker(playerId, playerData);
            addedCount++;
        });

        console.log('🎯 マーカー更新完了: 追加', addedCount, '個 / スキップ', skippedCount, '個');
    }, (error) => {
        console.error('❌ Firebase監視エラー:', error);
    });
}

function addPlayerMarker(playerId, playerData) {
    const { username, role, lat, lng, updated_at } = playerData;

    console.log('📍 マーカー追加試行:', {
        playerId,
        username,
        role,
        lat,
        lng,
        map初期化: map ? '✅' : '❌'
    });

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
        console.log(`✅ マーカー追加成功 ${colorEmoji}:`, username, 'role:', role, '位置:', lat.toFixed(6), lng.toFixed(6));
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
        console.log('📊 ゲームステータス更新:', data);

        if (data) {
            gameState.status = data.status;
            gameState.startTime = data.startTime;
            gameState.endTime = data.endTime;
            gameState.duration = data.duration;

            // ステータスに応じて処理
            if (data.status === 'active') {
                console.log('✅ ゲーム開始を検知');
                startLocationSending();
                updateGameTimer();
            } else if (data.status === 'ended') {
                console.log('🏁 ゲーム終了を検知');
                stopLocationSending();
                showGameEndMessage();
            } else if (data.status === 'waiting') {
                console.log('⏳ ゲーム待機中');
                stopLocationSending();
                showWaitingMessage();
            }
        }
    });
}

function checkGameStatus() {
    gameStatusRef.once('value')
        .then((snapshot) => {
            const data = snapshot.val();
            console.log('🔍 現在のゲームステータス:', data);

            if (data) {
                gameState.status = data.status;
                gameState.startTime = data.startTime;
                gameState.endTime = data.endTime;
                gameState.duration = data.duration;

                if (data.status === 'active') {
                    console.log('✅ ゲームは既に開始されています');
                    startLocationSending();
                    updateGameTimer();
                } else if (data.status === 'ended') {
                    console.log('🏁 ゲームは既に終了しています');
                    showGameEndMessage();
                } else {
                    console.log('⏳ ゲーム開始待機中...');
                    showWaitingMessage();
                }
            } else {
                console.log('⚠️ ゲームステータスが未設定です');
                showWaitingMessage();
            }
        })
        .catch((error) => {
            console.error('❌ ゲームステータス取得エラー:', error);
        });
}

function startLocationSending() {
    // 既に送信中の場合は何もしない
    if (sendTimer) {
        console.log('⚠️ 既に位置情報送信中です');
        return;
    }

    console.log('📡 位置情報送信開始:', currentPlayer.role);

    if (currentPlayer.role === 'oni') {
        // 鬼は5秒ごとに位置情報を送信
        sendLocationToFirebase(); // 即座に最初の送信
        sendTimer = setInterval(() => {
            sendLocationToFirebase();
        }, 5000);
        console.log('👹 鬼モード: 5秒ごとに位置情報を送信');
    } else if (currentPlayer.role === 'runner') {
        // 逃走者は30秒ごとに位置情報を送信
        sendLocationToFirebase(); // 即座に最初の送信

        let countdown = 30;
        updateCountdown(countdown);

        const countdownInterval = setInterval(() => {
            countdown--;
            updateCountdown(countdown);

            if (countdown <= 0) {
                countdown = 30;
            }
        }, 1000);

        sendTimer = setInterval(() => {
            sendLocationToFirebase();
        }, 30000);

        // タイマーIDを保存（終了時にクリアするため）
        if (!window.gameTimers) {
            window.gameTimers = [];
        }
        window.gameTimers.push(countdownInterval);

        console.log('🏃 逃走者モード: 30秒ごとに位置情報を送信');
    }
}

function stopLocationSending() {
    if (sendTimer) {
        clearInterval(sendTimer);
        sendTimer = null;
        console.log('🛑 位置情報送信を停止');
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
    const bottomBar = document.querySelector('.bottom-bar');
    if (bottomBar) {
        bottomBar.textContent = '⏳ ゲーム開始待機中...';
        bottomBar.style.backgroundColor = '#ffa500';
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

    const gameData = {
        status: 'active',
        startTime: Date.now(),
        endTime: Date.now() + durationMs,
        duration: durationMs
    };

    gameStatusRef.set(gameData)
        .then(() => {
            console.log('✅ ゲーム開始:', gameData);
            alert(`ゲームを開始しました！（${duration}分間）`);
        })
        .catch((error) => {
            console.error('❌ ゲーム開始エラー:', error);
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

