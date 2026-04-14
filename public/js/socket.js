/**
 * socket.js — WebSocket manager for real-time events.
 * Connects to the Socket.IO server and dispatches custom DOM events
 * that page modules can listen to.
 */

let socket = null;
const listeners = new Map();

export function initSocket() {
  if (socket) return socket;

  socket = io();

  socket.on('connect', () => {
    console.log('🌐 WebSocket connected');
    dispatch('ws:connected');
  });

  socket.on('disconnect', () => {
    console.log('🌐 WebSocket disconnected');
    dispatch('ws:disconnected');
  });

  // MQTT broker status
  socket.on('mqtt:status', (data) => {
    updateMqttIndicator(data.connected);
    dispatch('mqtt:status', data);
  });

  // Real-time parking event (entry/exit)
  socket.on('parking:event', (data) => {
    dispatch('parking:event', data);
  });

  return socket;
}

function updateMqttIndicator(connected) {
  const dot = document.getElementById('mqtt-dot');
  const label = document.getElementById('mqtt-label');
  if (dot) {
    dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
  }
  if (label) {
    label.textContent = connected ? 'MQTT Connected' : 'MQTT Disconnected';
  }
}

// ─── Custom Event Bus ───
export function on(event, callback) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(callback);
}

export function off(event, callback) {
  if (!listeners.has(event)) return;
  const cbs = listeners.get(event);
  const idx = cbs.indexOf(callback);
  if (idx > -1) cbs.splice(idx, 1);
}

function dispatch(event, data) {
  if (!listeners.has(event)) return;
  for (const cb of listeners.get(event)) {
    try { cb(data); } catch (e) { console.error(`Event handler error [${event}]:`, e); }
  }
}

// ─── Toast Notifications ───
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  toast.onclick = () => toast.remove();

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
