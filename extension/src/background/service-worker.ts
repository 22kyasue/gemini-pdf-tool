// ══════════════════════════════════════════════════════════
// BACKGROUND SERVICE WORKER (Manifest V3)
//
// Responsibilities:
//   1. Open the Chrome side panel when the extension icon is clicked
//   2. Show "ON" badge when the active tab is a supported site
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

// Open the side panel when the user clicks the extension icon
chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) {
    chrome.sidePanel.open({ tabId: tab.id });
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
