/**
 * users.js — User management page with CRUD operations.
 */
import * as api from '../api.js';
import { showToast } from '../socket.js';

export function render() {
  return `
    <div class="page-header">
      <h2>User Management</h2>
      <p>Register and manage RFID-linked users</p>
    </div>

    <!-- Add User Card -->
    <div class="card mb-md">
      <div class="card-header">
        <h3>Register New User</h3>
      </div>
      <form id="add-user-form">
        <div class="form-row">
          <div class="form-group">
            <label for="input-uid">RFID UID</label>
            <input type="text" id="input-uid" placeholder="e.g. A1B2C3D4" required maxlength="20" style="text-transform: uppercase; font-family: 'JetBrains Mono', monospace;">
          </div>
          <div class="form-group">
            <label for="input-name">Full Name</label>
            <input type="text" id="input-name" placeholder="e.g. Charan Kumar" required>
          </div>
          <div class="form-group">
            <label for="input-vehicle">Vehicle Number</label>
            <input type="text" id="input-vehicle" placeholder="e.g. KA-01-AB-1234">
          </div>
          <div class="form-group">
            <label for="input-phone">Phone</label>
            <input type="text" id="input-phone" placeholder="e.g. 9876543210">
          </div>
          <div class="form-group">
            <label for="input-balance">Balance / Credits</label>
            <input type="number" id="input-balance" placeholder="e.g. 100" min="0" step="1" value="0">
          </div>
        </div>
        <button type="submit" class="btn btn-primary" id="btn-add-user">
          Register User
        </button>
      </form>
    </div>

    <!-- Search -->
    <div class="flex gap-md mb-md" style="align-items: center;">
      <input type="text" id="user-search" placeholder="Search by name, UID, or vehicle..." style="flex:1; max-width: 400px;">
      <span class="text-muted" id="user-count" style="font-size: 0.85rem;"></span>
    </div>

    <!-- Users Table -->
    <div class="card">
      <div class="table-container">
        <table id="users-table">
          <thead>
            <tr>
              <th>UID</th>
              <th>Name</th>
              <th>Vehicle</th>
              <th>Phone</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Last IN</th>
              <th>Last OUT</th>
              <th>Registered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="users-tbody">
            <tr><td colspan="10" class="empty-state"><p>Loading users...</p></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Modal (hidden) -->
    <div class="modal-overlay hidden" id="edit-modal">
      <div class="modal">
        <h3>Edit User</h3>
        <input type="hidden" id="edit-id">
        <div class="form-row">
          <div class="form-group">
            <label>UID</label>
            <input type="text" id="edit-uid" disabled style="font-family: 'JetBrains Mono', monospace;">
          </div>
          <div class="form-group">
            <label>Name</label>
            <input type="text" id="edit-name" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Vehicle Number</label>
            <input type="text" id="edit-vehicle">
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input type="text" id="edit-phone">
          </div>
          <div class="form-group">
            <label>Balance / Credits</label>
            <input type="number" id="edit-balance" min="0" step="1">
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="btn-cancel-edit">Cancel</button>
          <button class="btn btn-primary" id="btn-save-edit">Save Changes</button>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  await loadUsers();

  // Add user form
  document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = document.getElementById('input-uid').value.trim();
    const name = document.getElementById('input-name').value.trim();
    const vehicle_number = document.getElementById('input-vehicle').value.trim();
    const phone = document.getElementById('input-phone').value.trim();
    const balance = document.getElementById('input-balance').value;

    if (!uid || !name) {
      showToast('UID and Name are required', 'error');
      return;
    }

    try {
      await api.createUser({ uid, name, vehicle_number, phone, balance: balance || 0 });
      showToast(`User "${name}" registered successfully!`, 'success');
      document.getElementById('add-user-form').reset();
      document.getElementById('input-balance').value = '0';
      await loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Search
  let searchTimer;
  document.getElementById('user-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadUsers(e.target.value), 300);
  });

  // Edit modal close
  document.getElementById('btn-cancel-edit').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') closeEditModal();
  });

  // Save edit
  document.getElementById('btn-save-edit').addEventListener('click', async () => {
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('edit-name').value.trim();
    const vehicle_number = document.getElementById('edit-vehicle').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const balance = document.getElementById('edit-balance').value;

    try {
      await api.updateUser(id, { name, vehicle_number, phone, balance });
      showToast('User updated!', 'success');
      closeEditModal();
      await loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

export function destroy() {}

async function loadUsers(search = '') {
  try {
    const users = await api.getUsers(search);
    const tbody = document.getElementById('users-tbody');
    const countEl = document.getElementById('user-count');

    if (countEl) countEl.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10">
        <div class="empty-state">
          <h3>No users found</h3>
          <p>Register a new user using the form above</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      return `
      <tr>
        <td class="uid-cell">${u.uid}</td>
        <td style="font-weight:500;">${u.name}</td>
        <td>${u.vehicle_number || '—'}</td>
        <td>${u.phone || '—'}</td>
        <td class="text-mono">${Number(u.balance || 0)}</td>
        <td>
          <span class="badge ${u.is_active ? 'active' : 'blocked'}" style="cursor:pointer;" data-toggle-id="${u.id}" data-active="${u.is_active}">
            ${u.is_active ? 'Active' : 'Blocked'}
          </span>
        </td>
        <td class="text-muted" style="font-size:0.8rem;">${formatDateTime(u.last_in_time)}</td>
        <td class="text-muted" style="font-size:0.8rem;">${formatDateTime(u.last_out_time)}</td>
        <td class="text-muted">${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" data-edit-id="${u.id}" data-uid="${u.uid}" data-name="${u.name}" data-vehicle="${u.vehicle_number}" data-phone="${u.phone}" data-balance="${Number(u.balance || 0)}" title="Edit">Edit</button>
            <button class="btn btn-ghost btn-sm text-danger" data-delete-id="${u.id}" data-delete-name="${u.name}" title="Delete">Delete</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');

    // Bind action event listeners
    bindTableActions();
  } catch (err) {
    showToast('Failed to load users: ' + err.message, 'error');
  }
}

function bindTableActions() {
  // Toggle active/blocked
  document.querySelectorAll('[data-toggle-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.toggleId;
      const currentlyActive = el.dataset.active === '1';
      try {
        await api.updateUser(id, { is_active: !currentlyActive });
        showToast(currentlyActive ? 'User blocked' : 'User activated', 'info');
        await loadUsers(document.getElementById('user-search').value);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Edit
  document.querySelectorAll('[data-edit-id]').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('edit-id').value = el.dataset.editId;
      document.getElementById('edit-uid').value = el.dataset.uid;
      document.getElementById('edit-name').value = el.dataset.name;
      document.getElementById('edit-vehicle').value = el.dataset.vehicle || '';
      document.getElementById('edit-phone').value = el.dataset.phone || '';
      document.getElementById('edit-balance').value = el.dataset.balance || '0';
      document.getElementById('edit-modal').classList.remove('hidden');
    });
  });

  // Delete
  document.querySelectorAll('[data-delete-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const name = el.dataset.deleteName;
      if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
      try {
        await api.deleteUser(el.dataset.deleteId);
        showToast(`User "${name}" deleted`, 'info');
        await loadUsers(document.getElementById('user-search').value);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
