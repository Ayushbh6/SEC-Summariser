import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface SummaryStatus {
  isProcessing: boolean;
  processingCount: number;
  completedCount: number;
  lastCompletedAt: Date | null;
  availableSummaries: number;
}

export function useSummaryStatus(userId: string | undefined, conversationId: string | null = null) {
  const [status, setStatus] = useState<SummaryStatus>({
    isProcessing: false,
    processingCount: 0,
    completedCount: 0,
    lastCompletedAt: null,
    availableSummaries: 0,
  });


  const fetchSummaryCount = useCallback(async () => {
    if (!userId) return;
    
    // If no conversation ID, reset all counts (new conversation)
    if (!conversationId) {
      setStatus({
        isProcessing: false,
        processingCount: 0,
        completedCount: 0,
        lastCompletedAt: null,
        availableSummaries: 0,
      });
      return;
    }

    // Build query for reports with summaries - ONLY for current conversation
    const summaryQuery = supabase
      .from('reports')
      .select(`
        id,
        report_content!inner(summary)
      `)
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .not('report_content.summary', 'is', null);
    
    const { data: reportsWithSummaries, error: summaryError } = await summaryQuery;

    if (summaryError) {
      console.error('Error fetching summary count:', summaryError);
    }

    const summaryCount = reportsWithSummaries?.length || 0;

    // Simplified: Don't count "processing" reports - just show available summaries
    setStatus({
      isProcessing: false,
      processingCount: 0,
      completedCount: 0,
      lastCompletedAt: null,
      availableSummaries: summaryCount || 0,
    });
  }, [userId, conversationId]);

  useEffect(() => {
    if (!userId || !conversationId) return;

    // Initial fetch
    fetchSummaryCount();

    // Simple polling every 5 seconds instead of realtime
    const interval = setInterval(() => {
      fetchSummaryCount();
    }, 5000);

    // Cleanup
    return () => {
      clearInterval(interval);
    };
  }, [userId, conversationId, fetchSummaryCount]);

  const resetCompletedCount = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      completedCount: 0,
    }));
  }, []);

  return {
    ...status,
    resetCompletedCount,
    refetch: fetchSummaryCount,
  };
}