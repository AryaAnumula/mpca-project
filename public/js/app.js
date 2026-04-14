/**
 * app.js — SPA Router & Page Orchestration
 * Handles hash-based routing and page lifecycle (render → init → destroy).
 */
import { initSocket } from './socket.js';
import * as dashboardPage from './pages/dashboard.js';
import * as usersPage from './pages/users.js';
import * as logsPage from './pages/logs.js';
import * as slotsPage from './pages/slots.js';
import * as simulatePage from './pages/simulate.js';

// Page registry
const pages = {
  dashboard: dashboardPage,
  users: usersPage,
  logs: logsPage,
  slots: slotsPage,
  simulate: simulatePage,
};

let currentPage = null;
let hasBooted = false;

// ─── Initialize App ───
function boot() {
  if (hasBooted) return;
  hasBooted = true;

  initSocket();
  setupNavigation();
  navigateFromHash();

  // Listen for hash changes
  window.addEventListener('hashchange', navigateFromHash);
}

function setupNavigation() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      window.location.hash = '#/' + page;
    });
  });
}

function navigateFromHash() {
  const hash = window.location.hash.replace('#/', '').replace('#', '') || 'dashboard';
  navigateTo(hash);
}

async function navigateTo(pageName) {
  const page = pages[pageName];
  if (!page) {
    console.warn(`Page not found: ${pageName}`);
    navigateTo('dashboard');
    return;
  }

  // Destroy current page if it has a cleanup function
  if (currentPage && currentPage.destroy) {
    currentPage.destroy();
  }

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageName);
  });

  // Render page
  const container = document.getElementById('page-content');
  container.innerHTML = page.render();

  // Re-trigger fade animation
  container.style.animation = 'none';
  container.offsetHeight; // force reflow
  container.style.animation = 'fadeIn 0.3s ease';

  // Initialize page (async event binding, data loading)
  currentPage = page;
  if (page.init) {
    await page.init();
  }
}

// ─── Boot ───
document.addEventListener('DOMContentLoaded', boot);
// Also handle case where DOM is already loaded (module scripts are deferred)
if (document.readyState !== 'loading') {
  boot();
}
