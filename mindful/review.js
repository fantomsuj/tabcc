// review.js
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let state = {
  tabs: [],
  downloads: [],
  savedTabs: { active: [], archived: [] },
  tabPressure: null,
  downloadPressure: null
};

async function load() {
  const res = await chrome.runtime.sendMessage({ type: 'getReviewData' });
  state = res;
  render();
}

function render() {
  renderHeader();
  renderDownloads();
  renderTabs();
  renderSavedTabs();
}

function renderHeader() {
  $('#now').textContent = formatNow();
  const dCount = state.downloads.length;
  const tCount = state.tabs.length;
  $('#counts').innerHTML =
    `${dCount} download${dCount === 1 ? '' : 's'}` +
    pressurePill(state.downloadPressure) +
    ' &nbsp;·&nbsp; ' +
    `${tCount} tab${tCount === 1 ? '' : 's'}` +
    pressurePill(state.tabPressure);
}

function pressurePill(p) {
  if (!p || p.level === 'none') return '';
  return ` <span class="pressure-pill ${p.level}">${p.level}</span>`;
}

function renderDownloads() {
  const list = $('#downloads-list');
  const empty = $('#downloads-empty');
  list.innerHTML = '';
  if (state.downloads.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  state.downloads
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((d, i) => list.appendChild(downloadRow(d, i + 1)));
}

function renderTabs() {
  const list = $('#tabs-list');
  const empty = $('#tabs-empty');
  list.innerHTML = '';
  if (state.tabs.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  let idx = 1;
  groupTabs(state.tabs).forEach((group) => {
    list.appendChild(tabGroup(group, idx));
    idx += group.tabs.length;
  });
}

function downloadRow(d, idx) {
  const row = el('div', 'row');
  const filename = (d.filename || '').split(/[\\/]/).pop() || '(unnamed)';
  row.innerHTML = `
    <div class="num">${String(idx).padStart(2, '0')}</div>
    <div class="body">
      <p class="title">${escapeHtml(filename)}</p>
      <div class="meta">
        <span>${escapeHtml(hostOf(d.url))}</span>
        <span class="age">${ago(d.createdAt)}</span>
        ${d.bytes ? `<span>${formatBytes(d.bytes)}</span>` : ''}
      </div>
      <div class="note"><input type="text" placeholder="note (optional, e.g. ‘Q3 partner deck’)" /></div>
    </div>
    <div class="actions">
      <button class="primary" data-act="filed">Filed</button>
      <button class="ghost" data-act="delete-later">Delete later</button>
      <button class="ghost" data-act="claude">→ Claude</button>
      <button class="danger" data-act="dismiss">Dismiss</button>
    </div>
  `;
  const noteInput = row.querySelector('input');
  row.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      if (act === 'claude') {
        await chrome.runtime.sendMessage({
          type: 'sendDownloadsToClaude',
          downloads: [d]
        });
        await chrome.runtime.sendMessage({
          type: 'triageDownload',
          id: d.id,
          action: 'sent-to-claude',
          note: noteInput.value
        });
      } else {
        await chrome.runtime.sendMessage({
          type: 'triageDownload',
          id: d.id,
          action: act,
          note: noteInput.value
        });
      }
      row.classList.add('triaged');
      setTimeout(() => load(), 220);
    });
  });
  return row;
}

function tabGroup(group, startIdx) {
  const wrap = el('div', 'tab-group');
  const duplicateEntries = Object.entries(group.urlCounts).filter(([, count]) => count > 1);
  const duplicateExtras = duplicateEntries.reduce((sum, [, count]) => sum + count - 1, 0);

  wrap.innerHTML = `
    <div class="tab-group-head">
      <div>
        <h3>${escapeHtml(group.label)}</h3>
        <p>${group.tabs.length} tab${group.tabs.length === 1 ? '' : 's'}${duplicateExtras ? ` · ${duplicateExtras} duplicate${duplicateExtras === 1 ? '' : 's'}` : ''}</p>
      </div>
      ${duplicateExtras ? `<button class="ghost" data-act="close-dupes">Close duplicates</button>` : ''}
    </div>
    <div class="tab-group-rows"></div>
  `;

  const rows = wrap.querySelector('.tab-group-rows');
  group.tabs
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((t, i) => rows.appendChild(tabRow(t, startIdx + i, group.urlCounts[t.url] || 1)));

  const closeDupes = wrap.querySelector('[data-act="close-dupes"]');
  if (closeDupes) {
    closeDupes.addEventListener('click', async () => {
      const urls = duplicateEntries.map(([url]) => url);
      closeDupes.disabled = true;
      await chrome.runtime.sendMessage({ type: 'closeDuplicateTabs', urls });
      setTimeout(() => load(), 220);
    });
  }

  return wrap;
}

function tabRow(t, idx, duplicateCount = 1) {
  const row = el('div', 'row');
  row.innerHTML = `
    <div class="num">${String(idx).padStart(2, '0')}</div>
    <div class="body">
      <p class="title">${escapeHtml(t.title || '(untitled)')}</p>
      <div class="meta">
        <span>${escapeHtml(hostOf(t.url))}</span>
        <span class="age">${ago(t.createdAt)}</span>
        ${duplicateCount > 1 ? `<span class="duplicate-pill">${duplicateCount}x duplicate</span>` : ''}
      </div>
      <div class="note"><input type="text" placeholder="note (optional)" /></div>
    </div>
    <div class="actions">
      <button class="primary" data-act="keep">Keep</button>
      <button class="ghost" data-act="save-later">Save for later</button>
      <button class="ghost" data-act="claude">→ Claude</button>
      <button class="danger" data-act="close">Close tab</button>
    </div>
  `;
  const noteInput = row.querySelector('input');
  row.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      if (act === 'claude') {
        await chrome.runtime.sendMessage({
          type: 'sendTabsToClaude',
          tabs: [t],
          intent: 'triage'
        });
        await chrome.runtime.sendMessage({
          type: 'triageTab',
          id: t.id,
          action: 'sent-to-claude',
          note: noteInput.value
        });
      } else if (act === 'save-later') {
        await chrome.runtime.sendMessage({
          type: 'saveTabForLater',
          tab: t,
          note: noteInput.value
        });
      } else {
        await chrome.runtime.sendMessage({
          type: 'triageTab',
          id: t.id,
          action: act,
          note: noteInput.value
        });
      }
      row.classList.add('triaged');
      setTimeout(() => load(), 220);
    });
  });
  return row;
}

function renderSavedTabs() {
  const savedTabs = state.savedTabs || { active: [], archived: [] };
  const active = savedTabs.active || [];
  const archived = savedTabs.archived || [];
  const list = $('#saved-list');
  const empty = $('#saved-empty');
  const count = $('#saved-count');
  const archive = $('#saved-archive');
  const archiveCount = $('#saved-archive-count');
  const archiveList = $('#saved-archive-list');

  list.innerHTML = '';
  archiveList.innerHTML = '';
  count.textContent = active.length
    ? `${active.length} item${active.length === 1 ? '' : 's'} waiting`
    : '';

  if (active.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    active.forEach((item) => list.appendChild(savedRow(item)));
  }

  if (archived.length === 0) {
    archive.classList.add('hidden');
  } else {
    archive.classList.remove('hidden');
    archiveCount.textContent = `(${archived.length})`;
    archived.forEach((item) => archiveList.appendChild(archivedSavedRow(item)));
  }
}

function savedRow(item) {
  const row = el('div', 'saved-item');
  row.innerHTML = `
    <label class="saved-check">
      <input type="checkbox" data-act="complete-saved" />
    </label>
    ${item.favicon ? `<img class="saved-favicon" src="${escapeHtml(item.favicon)}" alt="" />` : '<span class="saved-favicon placeholder"></span>'}
    <div class="saved-body">
      <a class="saved-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title || item.url || '(untitled)')}</a>
      <div class="saved-meta">
        <span>${escapeHtml(hostOf(item.url))}</span>
        <span>${ago(item.savedAt)}</span>
      </div>
      ${item.note ? `<p class="saved-note">${escapeHtml(item.note)}</p>` : ''}
    </div>
    <button class="saved-dismiss" data-act="dismiss-saved" aria-label="Dismiss saved tab">×</button>
  `;

  row.querySelector('[data-act="complete-saved"]').addEventListener('change', async () => {
    row.classList.add('triaged');
    await chrome.runtime.sendMessage({ type: 'completeSavedTab', id: item.id });
    setTimeout(() => load(), 180);
  });
  row.querySelector('[data-act="dismiss-saved"]').addEventListener('click', async () => {
    row.classList.add('triaged');
    await chrome.runtime.sendMessage({ type: 'dismissSavedTab', id: item.id });
    setTimeout(() => load(), 180);
  });

  return row;
}

function archivedSavedRow(item) {
  const row = el('div', 'saved-archive-item');
  row.innerHTML = `
    <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title || item.url || '(untitled)')}</a>
    <span>${ago(item.completedAt || item.savedAt)}</span>
  `;
  return row;
}

function groupTabs(tabs) {
  const groups = new Map();
  tabs
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((tab) => {
      const key = groupKey(tab.url);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: groupLabel(key, tab.url),
          tabs: [],
          urlCounts: {},
          newest: 0
        });
      }
      const group = groups.get(key);
      group.tabs.push(tab);
      group.urlCounts[tab.url] = (group.urlCounts[tab.url] || 0) + 1;
      group.newest = Math.max(group.newest, tab.createdAt || 0);
    });

  return Array.from(groups.values()).sort((a, b) => {
    if (a.key === '__homepages__') return -1;
    if (b.key === '__homepages__') return 1;
    if (b.tabs.length !== a.tabs.length) return b.tabs.length - a.tabs.length;
    return b.newest - a.newest;
  });
}

function groupKey(url) {
  if (isHomepage(url)) return '__homepages__';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return 'local-files';
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function groupLabel(key, url) {
  if (key === '__homepages__') return 'Homepages';
  if (key === 'local-files') return 'Local files';
  if (key === 'unknown') return 'Unknown';
  return friendlyDomain(key || hostOf(url));
}

function friendlyDomain(domain) {
  const host = (domain || '').replace(/^www\./, '');
  if (!host) return 'Unknown';
  if (host === 'mail.google.com') return 'Gmail';
  if (host === 'x.com' || host === 'twitter.com') return 'X';
  if (host === 'github.com') return 'GitHub';
  if (host === 'youtube.com') return 'YouTube';
  if (host === 'linkedin.com') return 'LinkedIn';
  if (host === 'docs.google.com') return 'Google Docs';
  if (host === 'drive.google.com') return 'Google Drive';
  if (host === 'localhost') return 'Localhost';
  return host
    .split('.')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('.');
}

function isHomepage(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname;
    const hash = parsed.hash || '';
    if (host === 'mail.google.com') return !hash.startsWith('#inbox/') && !hash.startsWith('#sent/') && !hash.startsWith('#search/');
    if (host === 'x.com' || host === 'twitter.com') return path === '/home';
    if (host === 'linkedin.com') return path === '/';
    if (host === 'github.com') return path === '/';
    if (host === 'youtube.com') return path === '/';
  } catch {}
  return false;
}

// ---------- Bulk actions ----------
$('#downloads-claude').addEventListener('click', async () => {
  if (state.downloads.length === 0) return;
  await chrome.runtime.sendMessage({
    type: 'sendDownloadsToClaude',
    downloads: state.downloads
  });
});

$('#downloads-clear').addEventListener('click', async () => {
  if (state.downloads.length === 0) return;
  if (!confirm(`Mark all ${state.downloads.length} downloads as reviewed?`)) return;
  for (const d of state.downloads) {
    await chrome.runtime.sendMessage({ type: 'triageDownload', id: d.id, action: 'reviewed-bulk' });
  }
  load();
});

$('#tabs-claude').addEventListener('click', async () => {
  if (state.tabs.length === 0) return;
  await chrome.runtime.sendMessage({
    type: 'sendTabsToClaude',
    tabs: state.tabs,
    intent: 'triage'
  });
});

$('#tabs-cluster').addEventListener('click', async () => {
  if (state.tabs.length === 0) return;
  await chrome.runtime.sendMessage({
    type: 'sendTabsToClaude',
    tabs: state.tabs,
    intent: 'cluster'
  });
});

// ---------- Helpers ----------
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; }
}
function ago(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function formatNow() {
  const d = new Date();
  return d.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

load();
// Refresh every 30s in case user opens new tabs while review is open
setInterval(load, 30000);
