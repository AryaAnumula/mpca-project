/**
 * dashboard.js — Live overview page with stats, activity feed, and zone occupancy.
 */
import * as api from '../api.js';
import { on, off, showToast } from '../socket.js';

let eventHandler = null;

export function render() {
  return `
    <div class="page-header">
      <h2>Dashboard</h2>
      <p>Real-time parking overview and activity</p>
    </div>

    <div class="stats-grid" id="stats-grid">
      <div class="stat-card primary">
        <div class="stat-label">Registered Users</div>
        <div class="stat-value" id="stat-users">&mdash;</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Currently Parked</div>
        <div class="stat-value" id="stat-parked">&mdash;</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Available Slots</div>
        <div class="stat-value" id="stat-available">&mdash;</div>
      </div>
      <div class="stat-card info">
        <div class="stat-label">Today's Events</div>
        <div class="stat-value" id="stat-today">&mdash;</div>
      </div>
    </div>

    <div class="content-grid">
      <div class="card">
        <div class="card-header">
          <h3>Live Activity Feed</h3>
          <span class="badge active" id="live-dot" style="font-size:0.7rem;"><span class="status-dot connected" style="width:6px;height:6px;display:inline-block;margin-right:4px;vertical-align:middle;"></span> LIVE</span>
        </div>
        <div class="activity-feed" id="activity-feed">
          <div class="empty-state">
            <div class="empty-icon" style="font-size:2rem; opacity:0.3;">~</div>
            <h3>Waiting for events...</h3>
            <p>Scan an RFID card or use the Simulate tool</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Zone Occupancy</h3>
        </div>
        <div id="zone-overview">
          <div class="empty-state"><p>Loading zones...</p></div>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  await loadDashboardData();

  // Listen for real-time parking events
  eventHandler = (data) => {
    addActivityItem(data);
    refreshStats();
    showToast(
      `${data.event_type === 'IN' ? 'Entry' : 'Exit'}: ${data.user_name} (${data.uid}) — ${data.status}`,
      data.status === 'ALLOWED' ? 'success' : 'error',
      5000
    );
  };
  on('parking:event', eventHandler);
}

export function destroy() {
  if (eventHandler) {
    off('parking:event', eventHandler);
    eventHandler = null;
  }
}

async function loadDashboardData() {
  try {
    const data = await api.getDashboard();
    document.getElementById('stat-users').textContent = data.totalUsers;
    document.getElementById('stat-parked').textContent = data.currentlyParked;
    document.getElementById('stat-available').textContent = data.availableSlots;
    document.getElementById('stat-today').textContent = data.todayEntries;

    // Render recent logs into activity feed
    const feed = document.getElementById('activity-feed');
    if (data.recentLogs && data.recentLogs.length > 0) {
      feed.innerHTML = data.recentLogs.map(log => activityItemHTML(log)).join('');
    }

    // Load zone overview
    const slots = await api.getSlots();
    renderZoneOverview(slots);

  } catch (err) {
    console.error('Dashboard load error:', err);
    showToast('Failed to load dashboard data', 'error');
  }
}

async function refreshStats() {
  try {
    const data = await api.getDashboard();
    document.getElementById('stat-users').textContent = data.totalUsers;
    document.getElementById('stat-parked').textContent = data.currentlyParked;
    document.getElementById('stat-available').textContent = data.availableSlots;
    document.getElementById('stat-today').textContent = data.todayEntries;

    const slots = await api.getSlots();
    renderZoneOverview(slots);
  } catch (e) { /* silently fail on stat refresh */ }
}

function addActivityItem(log) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  // Remove empty state if present
  const empty = feed.querySelector('.empty-state');
  if (empty) empty.remove();

  // Add new item at the top
  const div = document.createElement('div');
  div.innerHTML = activityItemHTML(log);
  feed.prepend(div.firstElementChild);

  // Keep max 20 items
  while (feed.children.length > 20) {
    feed.removeChild(feed.lastChild);
  }
}

function activityItemHTML(log) {
  const isIn = log.event_type === 'IN';
  const time = formatTime(log.timestamp);
  return `
    <div class="activity-item">
      <div class="event-icon ${isIn ? 'in' : 'out'}">${isIn ? 'IN' : 'OUT'}</div>
      <div class="event-details">
        <div class="event-uid">${log.uid} <span class="badge ${isIn ? 'in' : 'out'}">${log.event_type}</span></div>
        <div class="event-meta">
          <span>${log.user_name}</span>
          <span>&middot;</span>
          <span class="badge zone">Zone ${log.location}</span>
          <span>&middot;</span>
          <span class="badge ${log.status === 'ALLOWED' ? 'allowed' : 'denied'}">${log.status}</span>
        </div>
      </div>
      <div class="event-time">${time}</div>
    </div>
  `;
}

function renderZoneOverview(slots) {
  const container = document.getElementById('zone-overview');
  if (!container) return;

  container.innerHTML = slots.map(slot => {
    const percent = slot.total_capacity > 0
      ? Math.round((slot.occupied / slot.total_capacity) * 100)
      : 0;
    const level = percent < 50 ? 'low' : percent < 80 ? 'medium' : 'high';

    return `
      <div style="margin-bottom: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-weight:600; font-size:0.9rem;">${slot.label || 'Zone ' + slot.location}</span>
          <span class="text-mono" style="font-size:0.82rem; color: var(--text-secondary);">${slot.occupied}/${slot.total_capacity}</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill ${level}" style="width: ${percent}%"></div>
        </div>
        <div style="font-size:0.72rem; color: var(--text-muted);">${slot.available} available &middot; ${percent}% full</div>
      </div>
    `;
  }).join('');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return Math.floor(diffMs / 60000) + 'm ago';
  if (diffMs < 86400000) return Math.floor(diffMs / 3600000) + 'h ago';
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
