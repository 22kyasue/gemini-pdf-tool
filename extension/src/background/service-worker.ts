// ══════════════════════════════════════════════════════════
// BACKGROUND SERVICE WORKER (Manifest V3)
//
// Responsibilities:
//   1. Show "ON" badge when the active tab is a supported site
//   2. Toggle the floating button via extension icon click
// ══════════════════════════════════════════════════════════

const SUPPORTED_ORIGINS = ['gemini.google.com', 'chatgpt.com'];

function isSupportedUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return SUPPORTED_ORIGINS.some(o => hostname.includes(o));
  } catch {
    return false;
  }
}

function updateBadge(tabId: number, url: string | undefined) {
  const supported = isSupportedUrl(url);
  chrome.action.setBadgeText({ text: supported ? 'ON' : '', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#6366f1', tabId });
}

// Toggle floating button when user clicks the extension icon
chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_BUTTON' });
  }
});

// Update badge when a tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    updateBadge(tabId, tab.url);
  }
});

// Update badge when switching between tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    updateBadge(tabId, tab.url);
  } catch {
    // Tab may have been closed
  }
});
