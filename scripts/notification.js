/*
 * Gnoke Library — notification.js
 * Copyright (C) 2026 Edmund Sparrow <edmundsparrow@gmail.com>
 * Licensed under GNU GPL v3
 *
 * Librarian overdue alert system.
 * - One notification per app launch (if overdue books exist)
 * - Hourly repeat via timestamp gate
 * - Mute for 24 hours via bell button
 * - Gentle in-app permission prompt (not a browser dialog ambush)
 * - Fully self-contained — only hook into app.js is Notify.init()
 *
 * localStorage keys used:
 *   gnoke_notif_permission_asked  — timestamp last asked (throttle re-ask to 7 days)
 *   gnoke_notif_last_fired        — timestamp last notification fired
 *   gnoke_notif_muted_until       — timestamp mute expires
 */

const Notify = (() => {

  const KEYS = {
    ASKED:      'gnoke_notif_permission_asked',
    LAST_FIRED: 'gnoke_notif_last_fired',
    MUTED_UNTIL:'gnoke_notif_muted_until',
  };

  const HOUR_MS    = 60 * 60 * 1000;
  const DAY_MS     = 24 * HOUR_MS;
  const ASK_GAP_MS = 7  * DAY_MS;   // re-ask permission after 7 days

  // ── Public entry point — called once from initApp() ──────────────────────

  function init() {
    _updateBellUI();

    // If notifications not supported, bail silently
    if (!('Notification' in window)) return;

    const perm = Notification.permission;

    if (perm === 'granted') {
      // Already permitted — run the check
      _maybeFireNotification();
    } else if (perm === 'default') {
      // Not yet asked — show gentle in-app prompt (throttled)
      _maybeShowPrompt();
    }
    // perm === 'denied' — user blocked it, respect that, stay silent
  }

  // ── Overdue check ─────────────────────────────────────────────────────────

  function _getOverdueCount() {
    try {
      const stats = DBLib.getStats();
      return stats.overdueCount || 0;
    } catch (e) {
      return 0;
    }
  }

  function _getDueSoonCount() {
    // Books due within the next 3 days (not yet overdue)
    try {
      const today = DB.today();
      const d = new Date(); d.setDate(d.getDate() + 3);
      const soon = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return DB.query(
        `SELECT COUNT(*) AS n FROM borrows
         WHERE return_date IS NULL AND due_date > ? AND due_date <= ?`,
        [today, soon]
      )[0]?.n || 0;
    } catch (e) {
      return 0;
    }
  }

  // ── Fire a browser notification ───────────────────────────────────────────

  function _fireNotification(overdueCount, dueSoonCount) {
    let title, body;

    if (overdueCount > 0 && dueSoonCount > 0) {
      title = `📚 ${overdueCount} overdue · ${dueSoonCount} due soon`;
      body  = 'Open Gnoke Library to review borrowing records.';
    } else if (overdueCount > 0) {
      title = `📚 ${overdueCount} book${overdueCount > 1 ? 's' : ''} overdue`;
      body  = 'Some loans have passed their due date.';
    } else if (dueSoonCount > 0) {
      title = `📚 ${dueSoonCount} book${dueSoonCount > 1 ? 's' : ''} due soon`;
      body  = 'Some loans are due within 3 days.';
    } else {
      return; // Nothing to report — stay silent
    }

    try {
      const n = new Notification(title, {
        body,
        icon: 'assets/icon-192.png',
        badge:'assets/icon-192.png',
        tag:  'gnoke-library-overdue',   // replaces previous notification instead of stacking
        renotify: false,
      });

      // Clicking notification focuses the app
      n.onclick = () => { window.focus(); n.close(); };

      localStorage.setItem(KEYS.LAST_FIRED, Date.now().toString());
    } catch (e) {
      console.warn('[Notify] Failed to fire notification:', e);
    }
  }

  // ── Gate: should we fire right now? ──────────────────────────────────────

  function _maybeFireNotification() {
    // Check mute
    const mutedUntil = parseInt(localStorage.getItem(KEYS.MUTED_UNTIL) || '0');
    if (Date.now() < mutedUntil) return;

    // Check hourly gate
    const lastFired = parseInt(localStorage.getItem(KEYS.LAST_FIRED) || '0');
    const elapsed   = Date.now() - lastFired;
    if (elapsed < HOUR_MS) return;

    const overdue  = _getOverdueCount();
    const dueSoon  = _getDueSoonCount();

    if (overdue === 0 && dueSoon === 0) return;

    _fireNotification(overdue, dueSoon);
  }

  // ── In-app permission prompt ──────────────────────────────────────────────

  function _maybeShowPrompt() {
    const lastAsked = parseInt(localStorage.getItem(KEYS.ASKED) || '0');
    if (Date.now() - lastAsked < ASK_GAP_MS) return;

    // Only show prompt if there's actually something worth notifying about
    const overdue = _getOverdueCount();
    const dueSoon = _getDueSoonCount();
    if (overdue === 0 && dueSoon === 0) return;

    _showPrompt();
  }

  function _showPrompt() {
    // Don't show twice
    if (document.getElementById('notif-prompt')) return;

    const card = document.createElement('div');
    card.id        = 'notif-prompt';
    card.className = 'notif-prompt';
    card.innerHTML = `
      <span class="notif-prompt-icon">🔔</span>
      <span class="notif-prompt-text">Enable alerts for overdue books?</span>
      <button class="notif-prompt-allow" onclick="Notify.requestPermission()">Allow</button>
      <button class="notif-prompt-later" onclick="Notify.dismissPrompt()">Later</button>
    `;

    // Insert after topbar / tab-bar, before pages
    const pages = document.querySelector('.pages');
    if (pages) pages.parentNode.insertBefore(card, pages);
  }

  // ── Public: called by prompt buttons ─────────────────────────────────────

  async function requestPermission() {
    dismissPrompt();
    localStorage.setItem(KEYS.ASKED, Date.now().toString());
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        _maybeFireNotification();
        _updateBellUI();
      }
    } catch (e) {
      console.warn('[Notify] Permission request failed:', e);
    }
  }

  function dismissPrompt() {
    document.getElementById('notif-prompt')?.remove();
    localStorage.setItem(KEYS.ASKED, Date.now().toString());
  }

  // ── Mute toggle ───────────────────────────────────────────────────────────

  function toggleMute() {
    const mutedUntil = parseInt(localStorage.getItem(KEYS.MUTED_UNTIL) || '0');
    const isMuted    = Date.now() < mutedUntil;

    if (isMuted) {
      // Unmute
      localStorage.removeItem(KEYS.MUTED_UNTIL);
    } else {
      // Mute for 24 hours
      localStorage.setItem(KEYS.MUTED_UNTIL, (Date.now() + DAY_MS).toString());
    }
    _updateBellUI();
  }

  function _updateBellUI() {
    const btn      = document.getElementById('notif-mute-btn');
    if (!btn) return;

    const mutedUntil = parseInt(localStorage.getItem(KEYS.MUTED_UNTIL) || '0');
    const isMuted    = Date.now() < mutedUntil;

    btn.textContent = isMuted ? '🔕' : '🔔';
    btn.title       = isMuted
      ? 'Notifications muted — tap to unmute'
      : 'Mute notifications for 24 hours';
    btn.classList.toggle('muted', isMuted);

    // Hide bell entirely if permission denied or not supported
    if (!('Notification' in window) || Notification.permission === 'denied') {
      btn.style.display = 'none';
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { init, requestPermission, dismissPrompt, toggleMute };

})();
