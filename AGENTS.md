# AGENTS.md -- Mindful Project Guide for Coding Agents

You are working on **Mindful**, the primary project in this repository.

Mindful is a local Chrome extension that nudges the user toward more intentional browsing and download habits. It watches new tabs and downloads, applies escalating nudges as clutter accumulates, and provides a review desk for deciding what to keep, bookmark, close, file, or send to Claude.

## Project Context

- **Main project:** `mindful/`
- **Reference project:** `extension/`

The `mindful/` folder is the product agents should modify, install, test, and describe unless the user explicitly asks for something else.

The `extension/` folder contains a separate Chrome extension, Tab Out. Treat it as inspiration and reference material for interaction ideas, visual ideas, or Chrome extension patterns. Do not assume `extension/` is the main app, the install target, or the place to make product changes unless the user says so directly.

## What Mindful Does

- Nudges the user when they open new tabs or download files.
- Escalates visual friction as tab and download counts pass configured thresholds.
- Provides a batched review desk for triaging accumulated tabs and downloads.
- Stores tab/download metadata locally in IndexedDB.
- Stores settings locally in `chrome.storage.local`.
- Sends nothing to an external service unless the user explicitly invokes the Claude flow.

## Key Facts

- Work in `mindful/` by default.
- Use `extension/` only as a reference or inspiration source.
- Mindful is a Manifest V3 Chrome extension.
- Saved settings live in `chrome.storage.local`.
- Tab and download metadata lives in IndexedDB.
- To update after code changes, reload Mindful from `chrome://extensions`.

## File Map

```text
mindful/manifest.json      MV3 config
mindful/background.js      Service worker for tabs, downloads, alarms, and review scheduling
mindful/nudge.js           Content script for in-page nudges
mindful/nudge.css          Nudge styling
mindful/review.html        Batched review desk
mindful/review.css         Review desk styling
mindful/review.js          Review desk behavior
mindful/options.html       Settings page
mindful/options.js         Threshold/settings behavior
mindful/popup.html         Toolbar popup
mindful/popup.js           Popup behavior
mindful/lib/storage.js     IndexedDB wrapper
mindful/lib/claude.js      Claude prompt formatting and handoff
mindful/icons/             Extension icons
```
