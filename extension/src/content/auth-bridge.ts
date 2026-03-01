// ══════════════════════════════════════════════════════════
// AUTH BRIDGE — runs on chatsource.app to sync auth state
//
// When the user visits chatsource.app (to log in, upgrade, etc.),
// this content script reads their Supabase session from localStorage
// and stores it in chrome.storage.local so the export modal on
// Gemini/ChatGPT can check auth + plan status.
// ══════════════════════════════════════════════════════════

const SUPABASE_PROJECT_REF = 'asdytgguhlkqlpqikfhm';
const STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email?: string;
    is_anonymous?: boolean;
  };
}

function syncAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // User is not logged in — clear extension auth state
      chrome.storage.local.set({ authSession: null, plan: 'free' });
      return;
    }

    const session: SupabaseSession = JSON.parse(raw);

    // Skip anonymous sessions
    if (session.user?.is_anonymous) {
      chrome.storage.local.set({ authSession: null, plan: 'free' });
      return;
    }

    // Store the session for use by the export modal
    chrome.storage.local.set({
      authSession: {
        accessToken: session.access_token,
        userId: session.user.id,
        email: session.user.email || null,
      },
    });

    // Check plan from Supabase profiles table
    fetch(
      `https://${SUPABASE_PROJECT_REF}.supabase.co/rest/v1/profiles?id=eq.${session.user.id}&select=plan`,
      {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzZHl0Z2d1aGxrcWxwcWlrZmhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzQ2NTIsImV4cCI6MjA4NzYxMDY1Mn0.IFmXTkev3GYfon444Qz-AB0IlbTxmBLP8RmoNUwpiSQ',
          'Authorization': `Bearer ${session.access_token}`,
        },
      },
    )
      .then(res => res.json())
      .then((rows: Array<{ plan: string }>) => {
        const plan = rows?.[0]?.plan === 'pro' ? 'pro' : 'free';
        chrome.storage.local.set({ plan });
      })
      .catch(() => {
        // Network error — keep existing plan state
      });
  } catch {
    // JSON parse error or storage error — ignore
  }
}

// Sync on page load
syncAuth();

// Re-sync when localStorage changes (e.g., user logs in/out)
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    syncAuth();
  }
});

// Also re-sync periodically (catches auth state changes within the same tab)
setInterval(syncAuth, 5000);
