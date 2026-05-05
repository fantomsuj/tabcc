// review.js
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let state = { tabs: [], downloads: [], tabPressure: null, downloadPressure: null };

async function load() {
  const res = await chrome.runtime.sendMessage({ type: 'getReviewData' });
  state = res;
  render();
}

function render() {
  renderHeader();
  renderDownloads();
  renderTabs();
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
  state.tabs
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((t, i) => list.appendChild(tabRow(t, i + 1)));
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

function tabRow(t, idx) {
  const row = el('div', 'row');
  row.innerHTML = `
    <div class="num">${String(idx).padStart(2, '0')}</div>
    <div class="body">
      <p class="title">${escapeHtml(t.title || '(untitled)')}</p>
      <div class="meta">
        <span>${escapeHtml(hostOf(t.url))}</span>
        <span class="age">${ago(t.createdAt)}</span>
      </div>
      <div class="note"><input type="text" placeholder="note (optional)" /></div>
    </div>
    <div class="actions">
      <button class="primary" data-act="keep">Keep</button>
      <button class="ghost" data-act="bookmark">Bookmark</button>
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
