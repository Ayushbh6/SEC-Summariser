import { useEffect, useState, useCallback } from 'react';
import { getConversationTokens } from '@/lib/conversations';
import { createClient } from '@supabase/supabase-js';

interface TokenLimitStatus {
  currentTokens: number;
  isWarning: boolean; // 400k+ tokens
  isLimitReached: boolean; // 480k+ tokens
  percentageUsed: number;
  remainingTokens: number;
}

const TOKEN_WARNING_THRESHOLD = 400000; // 80% of 500k
const TOKEN_HARD_LIMIT = 480000; // 96% of 500k
const MODEL_MAX_TOKENS = 500000;

export function useTokenLimit(conversationId: string | null) {
  const [status, setStatus] = useState<TokenLimitStatus>({
    currentTokens: 0,
    isWarning: false,
    isLimitReached: false,
    percentageUsed: 0,
    remainingTokens: MODEL_MAX_TOKENS,
  });

  const fetchTokenStatus = useCallback(async () => {
    if (!conversationId) {
      setStatus({
        currentTokens: 0,
        isWarning: false,
        isLimitReached: false,
        percentageUsed: 0,
        remainingTokens: MODEL_MAX_TOKENS,
      });
      return;
    }

    try {
      const tokens = await getConversationTokens(conversationId);
      
      setStatus({
        currentTokens: tokens,
        isWarning: tokens >= TOKEN_WARNING_THRESHOLD,
        isLimitReached: tokens >= TOKEN_HARD_LIMIT,
        percentageUsed: (tokens / MODEL_MAX_TOKENS) * 100,
        remainingTokens: Math.max(0, TOKEN_HARD_LIMIT - tokens),
      });
    } catch (error) {
      console.error('Error fetching token status:', error);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    // Initial fetch
    fetchTokenStatus();

    // Subscribe to conversation changes for real-time updates
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const channel = supabase
      .channel(`conversation_tokens_${conversationId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${conversationId}`,
      }, (payload) => {
        if (payload.new && 'tokens' in payload.new) {
          const newTokens = payload.new.tokens as number;
          setStatus({
            currentTokens: newTokens,
            isWarning: newTokens >= TOKEN_WARNING_THRESHOLD,
            isLimitReached: newTokens >= TOKEN_HARD_LIMIT,
            percentageUsed: (newTokens / MODEL_MAX_TOKENS) * 100,
            remainingTokens: Math.max(0, TOKEN_HARD_LIMIT - newTokens),
          });
        }
      })
      .subscribe();

    // Poll every 10 seconds as backup
    const interval = setInterval(fetchTokenStatus, 10000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchTokenStatus]);

  return {
    ...status,
    refetch: fetchTokenStatus,
  };
}