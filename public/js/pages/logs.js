/**
 * logs.js — Access log page with filtering, pagination, and CSV export.
 */
import * as api from '../api.js';
import { on, off, showToast } from '../socket.js';

const PAGE_SIZE = 20;
let currentOffset = 0;
let currentFilters = {};
let eventHandler = null;

export function render() {
  return `
    <div class="page-header">
      <h2>Access Logs</h2>
      <p>Complete entry and exit history</p>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="form-group">
        <label for="log-uid">UID</label>
        <input type="text" id="log-uid" placeholder="Search UID..." style="font-family:'JetBrains Mono',monospace;">
      </div>
      <div class="form-group">
        <label for="log-type">Event Type</label>
        <select id="log-type">
          <option value="">All</option>
          <option value="IN">Entry (IN)</option>
          <option value="OUT">Exit (OUT)</option>
        </select>
      </div>
      <div class="form-group">
        <label for="log-status">Status</label>
        <select id="log-status">
          <option value="">All</option>
          <option value="ALLOWED">Allowed</option>
          <option value="DENIED">Denied</option>
        </select>
      </div>
      <div class="form-group">
        <label for="log-from">From</label>
        <input type="date" id="log-from">
      </div>
      <div class="form-group">
        <label for="log-to">To</label>
        <input type="date" id="log-to">
      </div>
      <div class="form-group" style="justify-content: flex-end;">
        <div class="btn-group">
          <button class="btn btn-primary btn-sm" id="btn-filter">Filter</button>
          <button class="btn btn-outline btn-sm" id="btn-clear">Clear</button>
          <button class="btn btn-success btn-sm" id="btn-export">Export CSV</button>
        </div>
      </div>
    </div>

    <!-- Logs Table -->
    <div class="card">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>UID</th>
              <th>User</th>
              <th>Event</th>
              <th>Zone</th>
              <th>Status</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody id="logs-tbody">
            <tr><td colspan="7"><div class="empty-state"><p>Loading logs...</p></div></td></tr>
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <div class="page-info" id="page-info">&mdash;</div>
        <div class="page-buttons">
          <button class="btn btn-outline btn-sm" id="btn-prev" disabled>&larr; Prev</button>
          <button class="btn btn-outline btn-sm" id="btn-next" disabled>Next &rarr;</button>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  await loadLogs();

  document.getElementById('btn-filter').addEventListener('click', () => {
    currentOffset = 0;
    currentFilters = getFilters();
    loadLogs();
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    document.getElementById('log-uid').value = '';
    document.getElementById('log-type').value = '';
    document.getElementById('log-status').value = '';
    document.getElementById('log-from').value = '';
    document.getElementById('log-to').value = '';
    currentOffset = 0;
    currentFilters = {};
    loadLogs();
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    api.exportLogs();
    showToast('Downloading CSV...', 'info');
  });

  document.getElementById('btn-prev').addEventListener('click', () => {
    currentOffset = Math.max(0, currentOffset - PAGE_SIZE);
    loadLogs();
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    currentOffset += PAGE_SIZE;
    loadLogs();
  });

  // Live updates
  eventHandler = () => {
    if (currentOffset === 0) loadLogs();
  };
  on('parking:event', eventHandler);
}

export function destroy() {
  if (eventHandler) {
    off('parking:event', eventHandler);
    eventHandler = null;
  }
}

function getFilters() {
  return {
    uid: document.getElementById('log-uid').value.trim(),
    event_type: document.getElementById('log-type').value,
    status: document.getElementById('log-status').value,
    date_from: document.getElementById('log-from').value,
    date_to: document.getElementById('log-to').value,
  };
}

async function loadLogs() {
  try {
    const filters = { ...currentFilters, limit: PAGE_SIZE, offset: currentOffset };
    const data = await api.getLogs(filters);
    const tbody = document.getElementById('logs-tbody');

    if (data.logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="empty-state">
          <h3>No logs found</h3>
          <p>Try adjusting your filters or scan an RFID card</p>
        </div>
      </td></tr>`;
    } else {
      tbody.innerHTML = data.logs.map(log => {
        const isIn = log.event_type === 'IN';
        const ts = new Date(log.timestamp);
        const dateStr = ts.toLocaleDateString();
        const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        return `
          <tr>
            <td class="text-muted">${log.id}</td>
            <td class="uid-cell">${log.uid}</td>
            <td style="font-weight:500;">${log.user_name}</td>
            <td><span class="badge ${isIn ? 'in' : 'out'}">${isIn ? 'IN' : 'OUT'}</span></td>
            <td><span class="badge zone">Zone ${log.location}</span></td>
            <td><span class="badge ${log.status === 'ALLOWED' ? 'allowed' : 'denied'}">${log.status}</span></td>
            <td class="text-muted" style="font-size:0.8rem;">${dateStr} ${timeStr}</td>
          </tr>
        `;
      }).join('');
    }

    // Pagination info
    const showing = Math.min(currentOffset + PAGE_SIZE, data.total);
    document.getElementById('page-info').textContent =
      data.total > 0 ? `Showing ${currentOffset + 1}–${showing} of ${data.total}` : 'No records';

    document.getElementById('btn-prev').disabled = currentOffset === 0;
    document.getElementById('btn-next').disabled = currentOffset + PAGE_SIZE >= data.total;

  } catch (err) {
    showToast('Failed to load logs: ' + err.message, 'error');
  }
}
