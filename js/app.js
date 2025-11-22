// メインアプリケーションロジック
import { firebaseConfig } from './firebase-config.js';

// グローバル変数
let map;
let userMarker;
let playerMarkers = {};
let currentUser = {
    id: null,
    username: '',
    role: '', // 'oni' or 'runner'
    lat: null,
    lng: null
};

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
            console.log('✅ Firebase初期化成功');
            console.log('📍 Database URL:', firebaseConfig.databaseURL);
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

    joinOniBtn.addEventListener('click', () => joinGame('oni'));
    joinRunnerBtn.addEventListener('click', () => joinGame('runner'));

    // Enterキーでも参加可能
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && usernameInput.value.trim()) {
            joinGame('runner'); // デフォルトは逃走者
        }
    });
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

    // 位置情報取得開始
    startLocationTracking();

    // Firebase監視開始
    watchPlayers();

    // 鬼の場合、定期的に位置を送信
    if (currentUser.role === 'oni') {
        console.log('鬼モード: 5秒ごとに位置を送信開始');
        locationSendTimer = setInterval(() => {
            if (currentUser.lat && currentUser.lng) {
                updateFirebaseLocation(Date.now());
                console.log('鬼の位置を送信:', currentUser.lat, currentUser.lng);
            }
        }, 5000); // 5秒ごと
    }
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
