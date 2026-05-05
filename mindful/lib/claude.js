// lib/claude.js
// Format items as a prompt for claude.ai and open a new chat.
// claude.ai doesn't accept prefilled messages via URL, so we copy to clipboard
// and open a new chat — user pastes manually. Reliable, no API surface dependency.

export function formatTabsForClaude(tabs, intent = 'triage') {
  const lines = tabs.map((t, i) => `${i + 1}. ${t.title || '(untitled)'}\n   ${t.url}`);
  const intro = {
    triage: "I have these tabs open and want to decide what to do with each. Help me triage — for each one, suggest: keep open, bookmark (where?), save to read-later, or close.",
    summarize: "I came across these pages and want a quick summary of what each is about, plus whether any are worth saving long-term.",
    cluster: "These are tabs I had open during a session. Help me cluster them by topic and suggest where each cluster should live (Notion page, bookmark folder, etc.)."
  }[intent] || intent;
  return `${intro}\n\n${lines.join('\n\n')}`;
}

export function formatDownloadsForClaude(downloads) {
  const lines = downloads.map((d, i) => {
    const name = d.filename ? d.filename.split(/[\\/]/).pop() : '(unnamed)';
    return `${i + 1}. ${name}\n   from: ${d.url}`;
  });
  return `I downloaded these files and need to decide where each should live (specific folder, project, archive, or delete). Help me categorize them:\n\n${lines.join('\n\n')}`;
}

export async function copyAndOpenClaude(text) {
  // Service workers can't access navigator.clipboard directly.
  // We open claude.ai/new first, then inject a content script that writes to clipboard.
  const tab = await chrome.tabs.create({ url: 'https://claude.ai/new' });
  // Stash the text keyed by tab id; a one-shot listener will inject it once the page loads.
  await chrome.storage.session.set({ [`claudePayload_${tab.id}`]: text });
  return tab.id;
}
