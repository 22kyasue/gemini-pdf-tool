import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export const FREE_CALL_LIMIT = 15;
export const FREE_WORD_LIMIT = 100_000;

export interface UsageState {
  plan: 'free' | 'pro';
  callsUsed: number;
  wordsUsed: number;
  isOverLimit: boolean;
  refresh: () => void;
}

export function useUsage(user: User | null): UsageState {
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [callsUsed, setCallsUsed] = useState(0);
  const [wordsUsed, setWordsUsed] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setPlan('free');
      setCallsUsed(0);
      setWordsUsed(0);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('plan, api_calls_used, words_used')
      .eq('id', user.id)
      .single();

    if (!error && data) {
      setPlan(data.plan as 'free' | 'pro');
      setCallsUsed(data.api_calls_used as number);
      setWordsUsed(data.words_used as number);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isOverLimit =
    plan === 'free' &&
    (callsUsed >= FREE_CALL_LIMIT || wordsUsed >= FREE_WORD_LIMIT);

  return { plan, callsUsed, wordsUsed, isOverLimit, refresh };
}
