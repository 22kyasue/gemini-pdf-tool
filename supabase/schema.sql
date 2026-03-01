-- ══════════════════════════════════════════════════════════════
-- Gemini PDF Tool — Supabase Database Schema
-- Run this in your Supabase project → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── Profiles table ──────────────────────────────────────────
-- Auto-created for every new auth user via trigger below.
CREATE TABLE IF NOT EXISTS profiles (
  id                      UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  plan                    TEXT         NOT NULL DEFAULT 'free',  -- 'free' | 'pro'
  api_calls_used          INTEGER      NOT NULL DEFAULT 0,
  words_used              INTEGER      NOT NULL DEFAULT 0,
  usage_period_start      TIMESTAMPTZ  DEFAULT NOW(),
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  created_at              TIMESTAMPTZ  DEFAULT NOW()
);

-- RLS: users can only read/update their own row
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile read"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "own profile update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ── Subscriptions table ─────────────────────────────────────
-- Written by the Stripe webhook edge function; frontend reads for plan status.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                   TEXT        PRIMARY KEY,  -- Stripe subscription ID
  user_id              UUID        REFERENCES auth.users ON DELETE CASCADE,
  status               TEXT,        -- 'active' | 'canceled' | 'past_due' | 'trialing'
  current_period_end   TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- ── Auto-create profile on signup ──────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Share link import: rate-limit column ──────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS share_last_fetched_at TIMESTAMPTZ;
