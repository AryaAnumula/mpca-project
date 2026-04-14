/**
 * simulate.js — Dev tool page to simulate RFID scans without hardware.
 */
import * as api from '../api.js';
import { showToast } from '../socket.js';

export function render() {
  return `
    <div class="page-header">
      <h2>Simulate Scan</h2>
      <p>Test the system without hardware — simulates RFID card scans through the full pipeline</p>
    </div>

    <div class="simulator-panel">
      <h3>RFID Scan Simulator</h3>
      <p class="text-muted mb-md" style="font-size:0.85rem;">
        Enter a UID (any hex string), pick a zone, and simulate an entry or exit. The scan goes through the same
        backend logic as a real RFID scan — user lookup, access decision, logging, and real-time WebSocket events.
      </p>

      <div class="sim-form" id="sim-form">
        <div class="form-group">
          <label for="sim-uid">RFID UID</label>
          <input type="text" id="sim-uid" placeholder="e.g. A1B2C3D4" value="A1B2C3D4"
                 style="text-transform: uppercase; font-family: 'JetBrains Mono', monospace;" maxlength="20">
        </div>
        <div class="form-group">
          <label for="sim-location">Zone</label>
          <select id="sim-location">
            <option value="1">Zone 1 — A</option>
            <option value="2">Zone 2 — B</option>
            <option value="3">Zone 3 — C</option>
            <option value="4">Zone 4 — D</option>
            <option value="5">Zone 5 — E</option>
          </select>
        </div>
        <div class="form-group" style="justify-content: flex-end;">
          <div class="btn-group">
            <button class="btn btn-success" id="btn-sim-in">Simulate IN</button>
            <button class="btn btn-danger" id="btn-sim-out">Simulate OUT</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick UIDs -->
    <div class="card mb-md">
      <div class="card-header">
        <h3>Quick Test UIDs</h3>
      </div>
      <p class="text-muted mb-md" style="font-size:0.85rem;">
        Click any UID below to auto-fill it. Register these UIDs on the Users page to test ALLOWED responses.
      </p>
      <div class="btn-group" id="quick-uids">
        <button class="btn btn-outline btn-sm text-mono" data-quick-uid="A1B2C3D4">A1B2C3D4</button>
        <button class="btn btn-outline btn-sm text-mono" data-quick-uid="DEADBEEF">DEADBEEF</button>
        <button class="btn btn-outline btn-sm text-mono" data-quick-uid="CAFEBABE">CAFEBABE</button>
        <button class="btn btn-outline btn-sm text-mono" data-quick-uid="1234ABCD">1234ABCD</button>
        <button class="btn btn-outline btn-sm text-mono" data-quick-uid="FF00FF00">FF00FF00</button>
      </div>
    </div>

    <!-- Simulation Log -->
    <div class="card">
      <div class="card-header">
        <h3>Simulation History</h3>
        <button class="btn btn-ghost btn-sm" id="btn-clear-sim-log">Clear</button>
      </div>
      <div id="sim-log" class="activity-feed">
        <div class="empty-state">
          <h3>No simulations yet</h3>
          <p>Use the form above to simulate an RFID scan</p>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  // Simulate IN
  document.getElementById('btn-sim-in').addEventListener('click', () => doSimulate('IN'));
  // Simulate OUT
  document.getElementById('btn-sim-out').addEventListener('click', () => doSimulate('OUT'));

  // Quick UIDs
  document.querySelectorAll('[data-quick-uid]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('sim-uid').value = btn.dataset.quickUid;
      showToast(`UID set to ${btn.dataset.quickUid}`, 'info', 2000);
    });
  });

  // Clear log
  document.getElementById('btn-clear-sim-log').addEventListener('click', () => {
    document.getElementById('sim-log').innerHTML = `
      <div class="empty-state">
        <h3>No simulations yet</h3>
        <p>Use the form above to simulate an RFID scan</p>
      </div>
    `;
  });
}

export function destroy() {}

async function doSimulate(eventType) {
  const uid = document.getElementById('sim-uid').value.trim().toUpperCase();
  const location = document.getElementById('sim-location').value;

  if (!uid) {
    showToast('Please enter a UID', 'error');
    return;
  }

  try {
    const result = await api.simulateScan(uid, parseInt(location), eventType);
    showToast(result.message, 'success');
    addSimLogEntry(uid, location, eventType, result.status);
  } catch (err) {
    showToast('Simulation failed: ' + err.message, 'error');
  }
}

function addSimLogEntry(uid, location, eventType, status) {
  const log = document.getElementById('sim-log');
  if (!log) return;

  const empty = log.querySelector('.empty-state');
  if (empty) empty.remove();

  const isIn = eventType === 'IN';
  const isAllowed = status === 'ALLOWED';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const html = `
    <div class="activity-item">
      <div class="event-icon ${isIn ? 'in' : 'out'}">${isIn ? 'IN' : 'OUT'}</div>
      <div class="event-details">
        <div class="event-uid">${uid} <span class="badge ${isIn ? 'in' : 'out'}">${eventType}</span></div>
        <div class="event-meta">
          <span>Simulated</span>
          <span>&middot;</span>
          <span class="badge ${isAllowed ? 'allowed' : 'denied'}">${status || 'UNKNOWN'}</span>
        </div>
      </div>
      <div class="event-time">${time}</div>
    </div>
  `;

  const div = document.createElement('div');
  div.innerHTML = html;
  log.prepend(div.firstElementChild);
}
