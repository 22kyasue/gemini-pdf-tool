import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export const FREE_CALL_LIMIT = 10;
export const FREE_WORD_LIMIT = 50_000;
export const ANON_CALL_LIMIT = 1;
export const ANON_WORD_LIMIT = 10_000;
const USAGE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface UsageState {
  plan: 'free' | 'pro';
  callsUsed: number;
  wordsUsed: number;
  isOverLimit: boolean;
  daysUntilReset: number;
  refresh: () => Promise<'free' | 'pro'>;
}

export function useUsage(user: User | null, isAnonymous = false): UsageState {
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [callsUsed, setCallsUsed] = useState(0);
  const [wordsUsed, setWordsUsed] = useState(0);
  const [daysUntilReset, setDaysUntilReset] = useState(7);

  const refresh = useCallback(async (): Promise<'free' | 'pro'> => {
    if (!user) {
      setPlan('free');
      setCallsUsed(0);
      setWordsUsed(0);
      setDaysUntilReset(7);
      return 'free';
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('plan, api_calls_used, words_used, usage_period_start')
      .eq('id', user.id)
      .single();

    if (!error && data) {
      const p = data.plan as 'free' | 'pro';
      setPlan(p);

      // Check if period has expired client-side (server resets on next call)
      const periodStart = data.usage_period_start
        ? new Date(data.usage_period_start as string).getTime()
        : 0;
      const elapsed = Date.now() - periodStart;

      if (p === 'free' && elapsed >= USAGE_PERIOD_MS) {
        setCallsUsed(0);
        setWordsUsed(0);
        setDaysUntilReset(7);
      } else {
        setCallsUsed(data.api_calls_used as number);
        setWordsUsed(data.words_used as number);
        const remaining = Math.ceil((USAGE_PERIOD_MS - elapsed) / (24 * 60 * 60 * 1000));
        setDaysUntilReset(Math.max(1, Math.min(7, remaining)));
      }
      return p;
    }
    return 'free';
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const callLimit = isAnonymous ? ANON_CALL_LIMIT : FREE_CALL_LIMIT;
  const wordLimit = isAnonymous ? ANON_WORD_LIMIT : FREE_WORD_LIMIT;

  const isOverLimit =
    plan === 'free' &&
    (callsUsed >= callLimit || wordsUsed >= wordLimit);

  return { plan, callsUsed, wordsUsed, isOverLimit, daysUntilReset, refresh };
}
