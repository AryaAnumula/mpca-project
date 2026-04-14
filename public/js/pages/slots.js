/**
 * slots.js — Parking zone visualization with capacity management.
 */
import * as api from '../api.js';
import { on, off, showToast } from '../socket.js';

let eventHandler = null;

export function render() {
  return `
    <div class="page-header">
      <h2>Parking Zones</h2>
      <p>Manage and monitor all 5 parking zones</p>
    </div>

    <div class="zones-grid" id="zones-grid">
      <div class="empty-state"><p>Loading zones...</p></div>
    </div>

    <!-- Edit Zone Modal -->
    <div class="modal-overlay hidden" id="zone-modal">
      <div class="modal">
        <h3>Edit Zone</h3>
        <input type="hidden" id="zone-edit-location">
        <div class="form-row">
          <div class="form-group">
            <label>Zone Label</label>
            <input type="text" id="zone-edit-label" placeholder="e.g. Zone A">
          </div>
          <div class="form-group">
            <label>Total Capacity</label>
            <input type="number" id="zone-edit-capacity" min="1" max="999">
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="btn-zone-cancel">Cancel</button>
          <button class="btn btn-primary" id="btn-zone-save">Save Changes</button>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  await loadZones();

  document.getElementById('btn-zone-cancel').addEventListener('click', closeModal);
  document.getElementById('zone-modal').addEventListener('click', (e) => {
    if (e.target.id === 'zone-modal') closeModal();
  });

  document.getElementById('btn-zone-save').addEventListener('click', async () => {
    const location = document.getElementById('zone-edit-location').value;
    const label = document.getElementById('zone-edit-label').value.trim();
    const total_capacity = parseInt(document.getElementById('zone-edit-capacity').value);

    try {
      await api.updateSlot(location, { label, total_capacity });
      showToast('Zone updated!', 'success');
      closeModal();
      await loadZones();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  eventHandler = () => loadZones();
  on('parking:event', eventHandler);
}

export function destroy() {
  if (eventHandler) {
    off('parking:event', eventHandler);
    eventHandler = null;
  }
}

async function loadZones() {
  try {
    const slots = await api.getSlots();
    const grid = document.getElementById('zones-grid');
    if (!grid) return;

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

    grid.innerHTML = slots.map((slot, i) => {
      const percent = slot.total_capacity > 0
        ? Math.round((slot.occupied / slot.total_capacity) * 100)
        : 0;
      const level = percent < 50 ? 'low' : percent < 80 ? 'medium' : 'high';
      const statusText = percent === 0 ? 'Empty' : percent >= 100 ? 'Full' : `${percent}% Occupied`;
      const color = colors[i % colors.length];

      return `
        <div class="zone-card">
          <div class="zone-header">
            <h3>${slot.label || 'Zone ' + slot.location}</h3>
            <div class="zone-number" style="background: ${color}22; color: ${color};">
              ${slot.location}
            </div>
          </div>

          <div class="zone-stats">
            <div class="zone-stat">
              <div class="zone-stat-value text-success">${slot.available}</div>
              <div class="zone-stat-label">Available</div>
            </div>
            <div class="zone-stat">
              <div class="zone-stat-value text-warning">${slot.occupied}</div>
              <div class="zone-stat-label">Occupied</div>
            </div>
          </div>

          <div class="progress-bar-container">
            <div class="progress-bar-fill ${level}" style="width: ${Math.min(percent, 100)}%"></div>
          </div>

          <div class="zone-footer">
            <span>${statusText} &middot; Capacity: ${slot.total_capacity}</span>
            <button class="btn btn-ghost btn-sm" data-zone-edit="${slot.location}" data-zone-label="${slot.label || ''}" data-zone-cap="${slot.total_capacity}">Edit</button>
          </div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('[data-zone-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('zone-edit-location').value = btn.dataset.zoneEdit;
        document.getElementById('zone-edit-label').value = btn.dataset.zoneLabel;
        document.getElementById('zone-edit-capacity').value = btn.dataset.zoneCap;
        document.getElementById('zone-modal').classList.remove('hidden');
      });
    });

  } catch (err) {
    showToast('Failed to load zones: ' + err.message, 'error');
  }
}

function closeModal() {
  document.getElementById('zone-modal').classList.add('hidden');
}
