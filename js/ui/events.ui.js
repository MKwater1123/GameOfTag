/**
 * イベント表示管理
 * レイヤードアーキテクチャ: UI Layer
 * 
 * ゲームイベントの表示と管理
 */

import { GAME_CONFIG, EVENT_TYPES } from '../config/constants.js';
import { getCurrentTimeString, logDebug } from '../utils/helpers.js';

class EventsUI {
    constructor() {
        this.eventList = [];
    }

    /**
     * イベントエリアを初期化
     */
    initialize() {
        const eventHeader = document.querySelector('.event-header');
        const eventToggle = document.getElementById('event-toggle');
        const eventContent = document.getElementById('event-content');

        if (eventHeader && eventToggle && eventContent) {
            eventHeader.addEventListener('click', () => {
                eventContent.classList.toggle('collapsed');
                eventToggle.classList.toggle('collapsed');
            });

            logDebug('EventsUI', 'Initialized');
        }
    }

    /**
     * イベントを追加
     * @param {string} message - イベントメッセージ
     * @param {string} type - イベントタイプ ('normal' or 'important')
     */
    addEvent(message, type = EVENT_TYPES.NORMAL) {
        const timestamp = Date.now();
        const event = {
            id: timestamp,
            message: message,
            type: type,
            time: getCurrentTimeString()
        };

        this.eventList.unshift(event);

        // 最大件数制限
        if (this.eventList.length > GAME_CONFIG.MAX_EVENTS) {
            this.eventList = this.eventList.slice(0, GAME_CONFIG.MAX_EVENTS);
        }

        this._updateDisplay();
        logDebug('EventsUI', 'Event added', message);
    }

    /**
     * イベントをクリア
     */
    clearEvents() {
        this.eventList = [];
        this._updateDisplay();
        logDebug('EventsUI', 'Events cleared');
    }

    /**
     * イベントリストを取得
     * @returns {Array}
     */
    getEvents() {
        return [...this.eventList];
    }

    // =====================
    // プライベートメソッド
    // =====================

    _updateDisplay() {
        const eventListEl = document.getElementById('event-list');
        if (!eventListEl) return;

        if (this.eventList.length === 0) {
            eventListEl.innerHTML = '<p class="no-events">イベントはありません</p>';
            return;
        }

        let html = '';
        this.eventList.forEach(event => {
            const importantClass = event.type === EVENT_TYPES.IMPORTANT ? ' important' : '';
            html += `
                <div class="event-item${importantClass}">
                    <div class="event-item-time">${event.time}</div>
                    <div class="event-item-message">${event.message}</div>
                </div>
            `;
        });

        eventListEl.innerHTML = html;
    }
}

// シングルトンインスタンスをエクスポート
export const eventsUI = new EventsUI();

// グローバルスコープに公開（HTMLのonclick用）
window.addEvent = (message, type) => eventsUI.addEvent(message, type);
window.clearEvents = () => eventsUI.clearEvents();
