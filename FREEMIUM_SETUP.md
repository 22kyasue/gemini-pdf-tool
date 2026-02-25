# Freemium Backend Setup Guide

This document walks you through activating the Supabase + Stripe backend.

---

## 1. Rotate the Exposed API Key (Do This First)

The old Gemini API key was hardcoded in the repo and must be revoked:

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Find the key `AIzaSyBIOqIAjDuOJ-2pyJ2T6KDsmB7xCx13EhE` and **delete it**
3. Create a new key — keep it safe for step 4

---

## 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Note your **Project URL** and **anon/public key** (Settings → API)
3. Run the schema in **SQL Editor**:
   - Open `supabase/schema.sql` from this repo
   - Paste the entire contents → Run

---

## 3. Enable Google OAuth (optional but recommended)

1. Supabase Dashboard → Authentication → Providers → Google
2. Enable it, set your **Client ID** and **Client Secret** from Google Cloud Console
3. Add `https://your-project.supabase.co/auth/v1/callback` as an authorized redirect URI in Google Cloud

---

## 4. Install Supabase CLI & Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_ID

# Deploy all three edge functions
supabase functions deploy gemini-proxy
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook

# Set secrets (server-side only — never in browser)
supabase secrets set GEMINI_API_KEY=AIzaSy...YOUR_NEW_KEY
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 5. Configure Stripe

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Create a **Product** → Add a **Price** (recurring, $7/month)
3. Copy the **Price ID** (looks like `price_1abc...`)
4. Go to **Webhooks** → Add endpoint:
   - URL: `https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
5. Copy the **Webhook Secret** (`whsec_...`) → add to Supabase secrets (step 4)

---

## 6. Update .env.local

Fill in your real values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhb...your_anon_key
VITE_STRIPE_PRICE_ID=price_1abc...
```

---

## 7. Test Locally

```bash
npm run dev
```

Verify:
- [ ] Sign up with email works (check email for confirmation)
- [ ] Sign in with Google works
- [ ] Paste a non-Gemini chat → AI split triggers → usage counter increments
- [ ] After 15 calls → UpgradeModal appears
- [ ] Enter own API key in Settings → unlimited usage (BYOK)
- [ ] Click "Upgrade" → Stripe checkout opens (use card `4242 4242 4242 4242`)
- [ ] After test payment → plan shows "Pro"

---

## 8. Security Verification

After building for production:

```bash
npm run build
grep -r "AIzaSy" dist/   # Should return nothing
```

---

## Architecture Summary

```
Browser                     Supabase                    External
  │                           │                            │
  ├─ Supabase Auth ──────────►│ JWT                        │
  │                           │                            │
  ├─ /gemini-proxy ──────────►│ Check limits              Gemini API
  │   (JWT in header)         │ Call Gemini ─────────────►│
  │                           │ Update usage               │
  │◄── response ──────────────│◄─ response ───────────────┤
  │                           │                            │
  ├─ /create-checkout ───────►│ Create Stripe customer    Stripe
  │                           │ Create checkout ─────────►│
  │◄── { url } ───────────────│◄─ session url ────────────┤
  │                           │                            │
  │                          Stripe webhook ──────────────►│
  │                           │◄─ subscription events ─────┤
  │                           │ Update plan in DB          │
```
