// nudge.js
// Renders a small toast in the corner of the page when downloads/tabs happen.
// Three pressure levels: soft (4s auto-dismiss), medium (sticky, click to dismiss),
// hard (sticky + prompts to open review).

(function () {
  if (window.__mindfulInjected) return;
  window.__mindfulInjected = true;

  let host = null;
  let shadow = null;
  const queue = [];
  let active = null;

  function ensureHost() {
    if (host) return;
    host = document.createElement('div');
    host.id = '__mindful_host';
    host.style.cssText = 'position:fixed;bottom:0;right:0;z-index:2147483647;pointer-events:none;';
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host, .container { all: initial; }
      .container {
        font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
        position: fixed;
        bottom: 24px;
        right: 24px;
        max-width: 340px;
        pointer-events: auto;
      }
      .toast {
        background: #f6f1e7;
        color: #1a1a1a;
        border: 1px solid #2b2b2b;
        box-shadow: 4px 4px 0 #2b2b2b;
        padding: 14px 16px 12px;
        position: relative;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 240ms ease, transform 240ms ease;
        margin-top: 10px;
      }
      .toast.show { opacity: 1; transform: translateY(0); }
      .toast.medium { background: #f0e6d2; }
      .toast.hard { background: #e8dcc4; border-width: 2px; box-shadow: 5px 5px 0 #2b2b2b; }
      .label {
        font-family: 'IBM Plex Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
        font-size: 9.5px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #5c4a32;
        margin-bottom: 6px;
      }
      .label .pressure { float: right; color: #8a6d44; }
      .label .pressure.medium { color: #a04923; }
      .label .pressure.hard { color: #8b1a1a; font-weight: 700; }
      .title {
        font-size: 16px;
        line-height: 1.3;
        margin: 0 0 2px;
        font-weight: 500;
        color: #1a1a1a;
        word-break: break-word;
      }
      .subtitle {
        font-family: 'IBM Plex Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
        font-size: 11px;
        color: #5c4a32;
        margin-bottom: 10px;
        word-break: break-all;
      }
      .question {
        font-style: italic;
        font-size: 13.5px;
        color: #2b2b2b;
        margin: 0 0 10px;
      }
      .actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      button {
        font-family: 'IBM Plex Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
        font-size: 10.5px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        background: transparent;
        color: #1a1a1a;
        border: 1px solid #1a1a1a;
        padding: 5px 9px;
        cursor: pointer;
        transition: background 120ms ease, color 120ms ease;
      }
      button:hover { background: #1a1a1a; color: #f6f1e7; }
      button.primary { background: #1a1a1a; color: #f6f1e7; }
      button.primary:hover { background: #5c4a32; border-color: #5c4a32; }
      .close {
        position: absolute;
        top: 6px;
        right: 8px;
        background: transparent;
        border: none;
        font-size: 16px;
        line-height: 1;
        color: #5c4a32;
        cursor: pointer;
        padding: 2px 4px;
      }
      .close:hover { color: #1a1a1a; background: transparent; }
      .pressure-bar {
        height: 2px;
        background: linear-gradient(to right, #8a6d44 var(--pct, 0%), #d8c9a8 var(--pct, 0%));
        margin: 8px -16px -12px;
      }
    `;
    shadow.appendChild(style);

    const container = document.createElement('div');
    container.className = 'container';
    shadow.appendChild(container);

    document.documentElement.appendChild(host);
  }

  function showToast(payload) {
    ensureHost();
    const container = shadow.querySelector('.container');
    const { kind, itemId, title, subtitle, pressure } = payload;
    const level = pressure?.level || 'soft';

    const toast = document.createElement('div');
    toast.className = `toast ${level}`;

    const labelText = kind === 'download' ? 'Download' : 'New tab';
    const pressureText = pressure && pressure.level !== 'none'
      ? `${pressure.count} open · ${level}`
      : pressure ? `${pressure.count}` : '';
    const pct = pressure ? Math.min(100, (pressure.count / pressure.threshold) * 100) : 0;

    const question = kind === 'download'
      ? 'Where is this going?'
      : 'Why this tab?';

    toast.innerHTML = `
      <button class="close" aria-label="Dismiss">×</button>
      <div class="label">
        <span>${escapeHtml(labelText)}</span>
        <span class="pressure ${level}">${escapeHtml(pressureText)}</span>
      </div>
      <p class="title">${escapeHtml(title || '')}</p>
      <p class="subtitle">${escapeHtml(subtitle || '')}</p>
      <p class="question">${escapeHtml(question)}</p>
      <div class="actions">
        ${kind === 'tab' ? `
          <button data-action="keep" class="primary">Keep</button>
          <button data-action="save-later">Save</button>
          <button data-action="close-tab">Close</button>
          <button data-action="claude">→ Claude</button>
          <button data-action="review">Review later</button>
        ` : `
          <button data-action="filed" class="primary">Filed it</button>
          <button data-action="delete-later">Delete later</button>
          <button data-action="claude">→ Claude</button>
          <button data-action="review">Review later</button>
        `}
      </div>
      ${pct > 0 ? `<div class="pressure-bar" style="--pct:${pct}%"></div>` : ''}
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 240);
    };

    toast.querySelector('.close').addEventListener('click', dismiss);
    toast.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        handleAction(kind, itemId, action, payload);
        dismiss();
      });
    });

    // Auto-dismiss for soft pressure only
    if (level === 'soft' || level === 'none') {
      setTimeout(() => {
        if (toast.isConnected) dismiss();
      }, 5000);
    }
    // Hard pressure: prepend a stronger CTA
    if (level === 'hard') {
      const banner = document.createElement('div');
      banner.style.cssText = 'font-family: IBM Plex Mono, monospace; font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:#8b1a1a; margin-bottom:8px; border-bottom:1px solid #8b1a1a; padding-bottom:6px;';
      banner.textContent = `You're past ${pressure.threshold}. Triage before adding more.`;
      toast.insertBefore(banner, toast.querySelector('.label'));
    }
  }

  function handleAction(kind, itemId, action, payload) {
    if (kind === 'tab') {
      if (action === 'keep') {
        chrome.runtime.sendMessage({ type: 'triageTab', id: itemId, action: 'keep' });
      } else if (action === 'save-later') {
        chrome.runtime.sendMessage({
          type: 'saveTabForLater',
          tab: {
            id: itemId,
            url: location.href,
            title: document.title
          }
        });
      } else if (action === 'close-tab') {
        chrome.runtime.sendMessage({ type: 'triageTab', id: itemId, action: 'close' });
      } else if (action === 'claude') {
        chrome.runtime.sendMessage({
          type: 'sendTabsToClaude',
          tabs: [{ id: itemId, url: location.href, title: document.title }],
          intent: 'triage'
        });
        chrome.runtime.sendMessage({ type: 'triageTab', id: itemId, action: 'sent-to-claude' });
      } else if (action === 'review') {
        chrome.runtime.sendMessage({ type: 'openReview' });
      }
    } else if (kind === 'download') {
      if (action === 'filed') {
        chrome.runtime.sendMessage({ type: 'triageDownload', id: itemId, action: 'filed' });
      } else if (action === 'delete-later') {
        chrome.runtime.sendMessage({ type: 'triageDownload', id: itemId, action: 'delete-later' });
      } else if (action === 'claude') {
        chrome.runtime.sendMessage({
          type: 'sendDownloadsToClaude',
          downloads: [{ id: itemId, filename: payload.title, url: payload.subtitle }]
        });
        chrome.runtime.sendMessage({ type: 'triageDownload', id: itemId, action: 'sent-to-claude' });
      } else if (action === 'review') {
        chrome.runtime.sendMessage({ type: 'openReview' });
      }
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'mindful:nudge' && msg.payload) {
      showToast(msg.payload);
    }
  });

  // Special case: when this is the claude.ai/new tab, paste the queued payload
  if (location.hostname.includes('claude.ai')) {
    (async () => {
      const tabIdRes = await chrome.runtime.sendMessage({ type: 'getCurrentCounts' }).catch(() => null);
      // Pull session-stored payload for this tab
      const data = await chrome.storage.session.get(null);
      const key = Object.keys(data).find((k) => k.startsWith('claudePayload_'));
      if (!key) return;
      const text = data[key];
      try {
        await navigator.clipboard.writeText(text);
        // Flash a tiny banner to tell the user it's copied
        ensureHost();
        const c = shadow.querySelector('.container');
        const banner = document.createElement('div');
        banner.className = 'toast soft show';
        banner.innerHTML = `<div class="label"><span>Mindful</span></div><p class="title">Prompt copied</p><p class="subtitle">Paste it into the chat below.</p>`;
        c.appendChild(banner);
        setTimeout(() => banner.remove(), 4500);
      } catch {}
      await chrome.storage.session.remove(key);
    })();
  }
})();
