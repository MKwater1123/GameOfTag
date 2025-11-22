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
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    setupLoginScreen();
});

function initFirebase() {
    // Firebase CDN使用時の初期化
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        playersRef = database.ref('game_session_v1/players');
        console.log('Firebase initialized');
    } else {
        console.error('Firebase CDN not loaded. Add Firebase scripts to index.html');
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

    // マップ画面へ遷移
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('map-screen').classList.remove('hidden');

    initMapScreen();
}

// ====================
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
    if (!navigator.geolocation) {
        alert('このブラウザは位置情報に対応していません');
        return;
    }

    // 常時追跡
    navigator.geolocation.watchPosition(
        (position) => {
            currentUser.lat = position.coords.latitude;
            currentUser.lng = position.coords.longitude;

            // 自分のマーカー更新
            updateSelfMarker();

            // エリア判定
            checkGeofence();

            // Firebaseへ送信（役割により条件分岐）
            sendLocationToFirebase();
        },
        (error) => {
            console.error('位置情報取得エラー:', error);
            alert('位置情報の取得に失敗しました');
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
        // 青い矢印アイコン（自分）
        const blueIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        userMarker = L.marker([currentUser.lat, currentUser.lng], { icon: blueIcon })
            .addTo(map)
            .bindPopup(`<b>${currentUser.username}</b><br>${currentUser.role === 'oni' ? '鬼' : '逃走者'}`);

        map.setView([currentUser.lat, currentUser.lng], 15);
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
    if (!playersRef) return;

    playersRef.on('value', (snapshot) => {
        const players = snapshot.val();
        console.log('Firebase受信:', players);

        if (!players) {
            console.log('プレイヤーデータがありません');
            return;
        }

        // 既存マーカークリア
        Object.values(playerMarkers).forEach(marker => marker.remove());
        playerMarkers = {};

        Object.entries(players).forEach(([playerId, playerData]) => {
            // 自分は除外
            if (playerId === currentUser.id) return;

            // 逃走者の場合、鬼は表示しない
            if (currentUser.role === 'runner' && playerData.role === 'oni') {
                console.log('逃走者モード: 鬼を非表示', playerData.username);
                return;
            }

            // マーカー追加
            console.log('マーカー追加:', playerData.username, playerData.role);
            addPlayerMarker(playerId, playerData);
        });
    });
}

function addPlayerMarker(playerId, playerData) {
    const { username, role, lat, lng, updated_at } = playerData;

    // アイコン色選択
    const colorUrl = role === 'oni'
        ? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png'
        : 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png';

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
        .bindPopup(`<b>${username}</b><br>${role === 'oni' ? '鬼' : '逃走者'}<br>更新: ${formatTime(updated_at)}`);

    playerMarkers[playerId] = marker;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}
