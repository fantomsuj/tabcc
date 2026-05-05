const FIELDS = [
  'nudgeOnDownload',
  'nudgeOnNewTab',
  'tabSoftThreshold',
  'tabMediumThreshold',
  'tabHardThreshold',
  'downloadSoftThreshold',
  'downloadMediumThreshold',
  'downloadHardThreshold',
  'reviewIntervalHours',
  'reviewEnabled'
];

async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  const s = settings || {};
  for (const k of FIELDS) {
    const el = document.getElementById(k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!s[k];
    else el.value = s[k] ?? '';
  }
}

async function save() {
  const { settings } = await chrome.storage.local.get('settings');
  const next = { ...(settings || {}) };
  for (const k of FIELDS) {
    const el = document.getElementById(k);
    if (!el) continue;
    if (el.type === 'checkbox') next[k] = el.checked;
    else next[k] = Number(el.value);
  }
  await chrome.storage.local.set({ settings: next });
  await chrome.runtime.sendMessage({ type: 'rescheduleReview' });
  const saved = document.getElementById('saved');
  saved.classList.add('show');
  setTimeout(() => saved.classList.remove('show'), 1500);
}

document.getElementById('save').addEventListener('click', save);
load();
