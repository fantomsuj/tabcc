document.addEventListener('DOMContentLoaded', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'getReviewData' });
  document.getElementById('tab-num').textContent = res.tabPressure?.count ?? 0;
  document.getElementById('dl-num').textContent = res.downloads.length;
  if (res.tabPressure?.level && res.tabPressure.level !== 'none') {
    document.getElementById('tab-stat').classList.add(res.tabPressure.level);
  }
  if (res.downloadPressure?.level && res.downloadPressure.level !== 'none') {
    document.getElementById('dl-stat').classList.add(res.downloadPressure.level);
  }

  document.getElementById('open-review').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openReview' });
    window.close();
  });

  document.getElementById('claude-tabs').addEventListener('click', async () => {
    if (res.tabs.length === 0) return;
    await chrome.runtime.sendMessage({
      type: 'sendTabsToClaude',
      tabs: res.tabs,
      intent: 'triage'
    });
    window.close();
  });

  document.getElementById('open-options').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await chrome.runtime.openOptionsPage();
    } catch (err) {
      await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
    window.close();
  });
});
