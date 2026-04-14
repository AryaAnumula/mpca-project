/**
 * api.js — REST API client for the Smart Parking System backend.
 * All methods return Promises.
 */

const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Dashboard ───
export function getDashboard() {
  return request('/dashboard');
}

// ─── Users ───
export function getUsers(search = '') {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  return request(`/users${q}`);
}

export function createUser(userData) {
  return request('/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
}

export function updateUser(id, userData) {
  return request(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(userData),
  });
}

export function deleteUser(id) {
  return request(`/users/${id}`, { method: 'DELETE' });
}

// ─── Logs ───
export function getLogs(filters = {}) {
  const params = new URLSearchParams();
  if (filters.uid) params.set('uid', filters.uid);
  if (filters.event_type) params.set('event_type', filters.event_type);
  if (filters.status) params.set('status', filters.status);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.limit) params.set('limit', filters.limit);
  if (filters.offset) params.set('offset', filters.offset);
  const q = params.toString();
  return request(`/logs${q ? '?' + q : ''}`);
}

export function exportLogs() {
  // This returns a file download, not JSON
  window.location.href = BASE + '/logs/export';
}

// ─── Slots ───
export function getSlots() {
  return request('/slots');
}

export function updateSlot(location, data) {
  return request(`/slots/${location}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Simulate ───
export function simulateScan(uid, location, event_type) {
  return request('/simulate', {
    method: 'POST',
    body: JSON.stringify({ uid, location, event_type }),
  });
}
