// background.js
// Service worker. Watches downloads, tabs, accumulation thresholds.
// Schedules batched reviews via chrome.alarms.

import {
  recordDownload,
  recordTab,
  markTabClosed,
  triageDownload,
  triageTab,
  getUntriagedDownloads,
  getUntriagedTabs,
  getMeta,
  setMeta
} from './lib/storage.js';
import { formatTabsForClaude, formatDownloadsForClaude, copyAndOpenClaude } from './lib/claude.js';

// ---------- Settings ----------
const DEFAULTS = {
  nudgeOnDownload: true,
  nudgeOnNewTab: true,
  // Accumulation thresholds for tabs (open at once)
  tabSoftThreshold: 15,
  tabMediumThreshold: 25,
  tabHardThreshold: 40,
  // Accumulation thresholds for untriaged downloads
  downloadSoftThreshold: 5,
  downloadMediumThreshold: 15,
  downloadHardThreshold: 30,
  // Batched review schedule
  reviewIntervalHours: 4,
  reviewEnabled: true,
  // How long after a download/tab opens before we nudge (ms) — small debounce
  nudgeDelayMs: 800
};

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(settings || {}) };
}

// ---------- Initialization ----------
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULTS });
  }
  scheduleReviewAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleReviewAlarm();
});

async function scheduleReviewAlarm() {
  const s = await getSettings();
  await chrome.alarms.clear('batchedReview');
  if (s.reviewEnabled) {
    chrome.alarms.create('batchedReview', {
      periodInMinutes: s.reviewIntervalHours * 60
    });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'batchedReview') {
    await triggerBatchedReview();
  }
});

async function triggerBatchedReview() {
  const tabs = await getUntriagedTabs();
  const downloads = await getUntriagedDownloads();
  if (tabs.length === 0 && downloads.length === 0) return;

  chrome.notifications.create('mindful-review', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Time to triage',
    message: `${tabs.length} tabs and ${downloads.length} downloads waiting for a decision.`,
    priority: 1
  });
}

chrome.notifications.onClicked.addListener((id) => {
  if (id === 'mindful-review') {
    chrome.tabs.create({ url: chrome.runtime.getURL('review.html') });
    chrome.notifications.clear(id);
  }
});

// ---------- Downloads ----------
chrome.downloads.onCreated.addListener(async (item) => {
  // Filter: skip data: URLs, blob: from extensions, etc. Keep most things.
  if (!item.url || item.url.startsWith('data:')) return;

  await recordDownload({
    id: item.id,
    filename: item.filename,
    url: item.url,
    mime: item.mime,
    bytes: item.totalBytes,
    referrer: item.referrer
  });

  const s = await getSettings();
  if (!s.nudgeOnDownload) return;

  // Send a nudge to the active tab's content script
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    sendNudge(tabs[0].id, {
      kind: 'download',
      itemId: item.id,
      title: filenameOnly(item.filename) || 'New download',
      subtitle: hostOf(item.url),
      pressure: await currentDownloadPressure()
    });
  }
});

chrome.downloads.onChanged.addListener(async (delta) => {
  // If user moves/renames within Chrome's API, reflect it.
  if (delta.filename?.current) {
    // Could store updated filename — leaving for v2 unless you want it.
  }
  if (delta.state?.current === 'interrupted') {
    // If download fails, mark triaged-as-cancelled so it doesn't pollute review.
    await triageDownload(delta.id, 'cancelled');
  }
});

// ---------- Tabs ----------
chrome.tabs.onCreated.addListener(async (tab) => {
  // Skip the new-tab-page and chrome:// URLs
  if (!tab.url || tab.url === 'chrome://newtab/' || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    // We'll catch the URL on the first onUpdated event instead
  }
  await recordTab({
    id: tab.id,
    url: tab.url || tab.pendingUrl || '',
    title: tab.title,
    favicon: tab.favIconUrl,
    openerTabId: tab.openerTabId
  });

  const s = await getSettings();
  if (!s.nudgeOnNewTab) return;

  // Don't nudge for blank new tabs — wait until they navigate
  // We'll fire the nudge on first meaningful onUpdated.
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Update stored tab info as title/favicon resolve
  if (changeInfo.title || changeInfo.favIconUrl || changeInfo.url) {
    await recordTab({
      id: tabId,
      url: tab.url || '',
      title: tab.title,
      favicon: tab.favIconUrl,
      openerTabId: tab.openerTabId
    });
  }

  // Fire nudge once the tab has loaded a real URL with a title
  if (changeInfo.status === 'complete' && tab.url && !isInternal(tab.url)) {
    const s = await getSettings();
    if (!s.nudgeOnNewTab) return;

    const nudged = await getMeta(`nudged_tab_${tabId}`, false);
    if (nudged) return;
    await setMeta(`nudged_tab_${tabId}`, true);

    sendNudge(tabId, {
      kind: 'tab',
      itemId: tabId,
      title: tab.title || 'New tab',
      subtitle: hostOf(tab.url),
      pressure: await currentTabPressure()
    });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await markTabClosed(tabId);
  // If the tab was untriaged when closed, mark it as 'closed' so it doesn't sit in review forever
  const tabs = await getUntriagedTabs();
  const found = tabs.find((t) => t.id === tabId);
  if (found) {
    await triageTab(tabId, 'closed-without-triage');
  }
});

// ---------- Pressure (accumulation level) ----------
async function currentTabPressure() {
  const s = await getSettings();
  const allTabs = await chrome.tabs.query({});
  const count = allTabs.length;
  if (count >= s.tabHardThreshold) return { level: 'hard', count, threshold: s.tabHardThreshold };
  if (count >= s.tabMediumThreshold) return { level: 'medium', count, threshold: s.tabMediumThreshold };
  if (count >= s.tabSoftThreshold) return { level: 'soft', count, threshold: s.tabSoftThreshold };
  return { level: 'none', count, threshold: s.tabSoftThreshold };
}

async function currentDownloadPressure() {
  const s = await getSettings();
  const untriaged = await getUntriagedDownloads();
  const count = untriaged.length;
  if (count >= s.downloadHardThreshold) return { level: 'hard', count, threshold: s.downloadHardThreshold };
  if (count >= s.downloadMediumThreshold) return { level: 'medium', count, threshold: s.downloadMediumThreshold };
  if (count >= s.downloadSoftThreshold) return { level: 'soft', count, threshold: s.downloadSoftThreshold };
  return { level: 'none', count, threshold: s.downloadSoftThreshold };
}

// ---------- Messaging from content scripts / review page ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'getReviewData': {
          const tabs = await getUntriagedTabs();
          const downloads = await getUntriagedDownloads();
          const tabPressure = await currentTabPressure();
          const downloadPressure = await currentDownloadPressure();
          sendResponse({ tabs, downloads, tabPressure, downloadPressure });
          break;
        }
        case 'triageTab': {
          await triageTab(msg.id, msg.action, msg.note || '');
          if (msg.action === 'close') {
            try { await chrome.tabs.remove(msg.id); } catch (e) { /* tab may already be closed */ }
          }
          sendResponse({ ok: true });
          break;
        }
        case 'triageDownload': {
          await triageDownload(msg.id, msg.action, msg.note || '');
          sendResponse({ ok: true });
          break;
        }
        case 'sendTabsToClaude': {
          const tabs = msg.tabs || [];
          const text = formatTabsForClaude(tabs, msg.intent || 'triage');
          await copyAndOpenClaude(text);
          sendResponse({ ok: true });
          break;
        }
        case 'sendDownloadsToClaude': {
          const downloads = msg.downloads || [];
          const text = formatDownloadsForClaude(downloads);
          await copyAndOpenClaude(text);
          sendResponse({ ok: true });
          break;
        }
        case 'openReview': {
          chrome.tabs.create({ url: chrome.runtime.getURL('review.html') });
          sendResponse({ ok: true });
          break;
        }
        case 'rescheduleReview': {
          await scheduleReviewAlarm();
          sendResponse({ ok: true });
          break;
        }
        case 'getCurrentCounts': {
          const tabPressure = await currentTabPressure();
          const downloadPressure = await currentDownloadPressure();
          sendResponse({ tabPressure, downloadPressure });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true; // async response
});

// ---------- Helpers ----------
function sendNudge(tabId, payload) {
  chrome.tabs.sendMessage(tabId, { type: 'mindful:nudge', payload }).catch(() => {
    // Content script not ready (e.g., chrome:// page) — silently ignore.
  });
}

function filenameOnly(p) {
  if (!p) return '';
  return p.split(/[\\/]/).pop();
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isInternal(url) {
  return url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('edge://');
}
