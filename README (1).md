# Mindful

A Chrome extension that nudges you toward intent when you download files or open tabs. Combines three intervention layers — gentle toast nudges, friction-by-accumulation, and a batched review desk — so you can A/B which actually changes your behavior.

## Install (developer mode)

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Select the `mindful/` folder

The extension icon (the "M") will appear in your toolbar. Pin it.

## What it does

**Gentle nudge.** Every download and every new tab gets a small toast in the corner of the page. Soft pressure: auto-dismisses in 5s. Click an action to triage on the spot, or ignore it.

**Friction by accumulation.** As your open-tab count and unfiled-download count climb, the nudges get visually louder — softer paper turns to a cream-with-shadow, then a red banner above the medium threshold, then a hard-line "you're past N, triage before adding more" once you blow past the third threshold. Defaults: tabs at 15 / 25 / 40, downloads at 5 / 15 / 30. Tunable in Settings.

**Batched review.** Every 4 hours (default), Chrome shows a notification: "N tabs and M downloads waiting for a decision." Click it and you land on the review desk — all your untriaged stuff in one editorial-styled page, with per-row actions: keep, bookmark, close, file, send to Claude.

## The Claude integration

On any tab, download, or in the bulk review:

- **→ Claude** copies a structured prompt to your clipboard and opens `claude.ai/new`. Paste with cmd-V.
- The prompt is templated by intent: "triage" (decide what to do with each), "cluster" (group tabs by topic), or "categorize" (file downloads). You can extend these templates in `lib/claude.js`.

## What gets stored, where

- **Browser history**: untouched. Lives in Chrome.
- **Tab + download metadata** (which ones you've seen, what you triaged them as, your notes): IndexedDB inside the extension.
- **Settings**: `chrome.storage.local`.
- **Nothing leaves your machine** unless you click "→ Claude" (which opens a tab) or you wire up Notion later.

## Tuning

`chrome://extensions` → Mindful → **Details** → **Extension options** opens the settings page.

Most likely first tune: lower the soft thresholds if you want to be more aware, raise them if the nudges become noise. The gap between soft and hard matters more than the absolute numbers — too tight and every nudge feels punishing, too wide and the pressure gradient disappears.

## What I'd add next, in priority order

1. **Move-detection for downloads.** Right now a download stays "untriaged" even if you immediately drag it into a folder. The right fix is a small companion script (or rely on `chrome.downloads.onChanged` filename deltas where available) so manually-filed downloads disappear from the review automatically.
2. **Session reconstruction.** Group the review desk by burst — tabs opened within 2 minutes of each other are probably one research thread. Triage the cluster, not the rows.
3. **Pattern detection.** "You visit this domain 12x/week, want a permanent home for it?" Cheap to implement on top of `chrome.history`.
4. **Tab decay.** Configurable TTL — tabs idle for >24h auto-prompt a "save or close" before they get auto-closed.
5. **Notion export.** Pick a database, write triaged items into an inbox row.

## File map

```
manifest.json      MV3 config
background.js      Service worker — watches downloads, tabs, schedules reviews
nudge.js + .css    Content script — draws toast nudges in shadow DOM
review.html/css/js The batched review desk
options.html/js    Settings (threshold tuning)
popup.html/js      Toolbar popup (quick stats + open review)
lib/storage.js     IndexedDB wrapper
lib/claude.js      Prompt formatting + claude.ai integration
icons/             16 / 48 / 128 px icons
```
