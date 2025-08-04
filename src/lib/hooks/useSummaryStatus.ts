import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';

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

  const [, setChannel] = useState<RealtimeChannel | null>(null);

  const fetchSummaryCount = useCallback(async () => {
    if (!userId) return;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Build query for reports with summaries
    let summaryQuery = supabase
      .from('reports')
      .select(`
        id,
        report_content!inner(summary)
      `)
      .eq('user_id', userId)
      .not('report_content.summary', 'is', null);
    
    // Filter by conversation if provided
    if (conversationId) {
      summaryQuery = summaryQuery.eq('conversation_id', conversationId);
    }
    
    const { data: reportsWithSummaries, error: summaryError } = await summaryQuery;

    if (summaryError) {
      console.error('Error fetching summary count:', summaryError);
    }

    const summaryCount = reportsWithSummaries?.length || 0;

    // Build query for reports without summaries (being processed)
    let processingQuery = supabase
      .from('reports')
      .select(`
        id,
        report_content!left(summary)
      `)
      .eq('user_id', userId);
    
    // Filter by conversation if provided
    if (conversationId) {
      processingQuery = processingQuery.eq('conversation_id', conversationId);
    }
    
    const { data: reportsWithoutSummaries, error: processingError } = await processingQuery;

    if (processingError) {
      console.error('Error fetching processing count:', processingError);
    }

    // Count reports that either have no content or content without summary
    const processingCount = reportsWithoutSummaries?.filter(
      r => !r.report_content || r.report_content.length === 0 || !r.report_content[0]?.summary
    ).length || 0;

    setStatus(prev => ({
      ...prev,
      availableSummaries: summaryCount || 0,
      processingCount: processingCount || 0,
      isProcessing: (processingCount || 0) > 0,
    }));
  }, [userId, conversationId]);

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    fetchSummaryCount();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Set up realtime subscription
    const newChannel = supabase
      .channel(`summary-updates-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'report_content',
        },
        async (payload) => {
          // Check if summary was just added (was null, now has value)
          const newData = payload.new as { summary: string | null; report_id: string };
          const oldData = payload.old as { summary: string | null };
          if (newData.summary && !oldData.summary) {
            // Check if this update is for a report belonging to the current user and conversation
            const { data: report } = await supabase
              .from('reports')
              .select('user_id, conversation_id')
              .eq('id', newData.report_id)
              .single();

            if (report?.user_id === userId) {
              // If we're filtering by conversation, check if this report belongs to it
              if (!conversationId || report.conversation_id === conversationId) {
                // Refetch counts to ensure accuracy
                fetchSummaryCount();
                
                setStatus(prev => ({
                  ...prev,
                  completedCount: prev.completedCount + 1,
                  processingCount: Math.max(0, prev.processingCount - 1),
                  isProcessing: prev.processingCount > 1,
                  lastCompletedAt: new Date(),
                }));
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reports',
        },
        async (payload) => {
          // Check if new report is for current user and conversation
          const newReport = payload.new as { user_id: string; conversation_id: string };
          if (newReport.user_id === userId) {
            // If we're filtering by conversation, check if this report belongs to it
            if (!conversationId || newReport.conversation_id === conversationId) {
              setStatus(prev => ({
                ...prev,
                processingCount: prev.processingCount + 1,
                isProcessing: true,
              }));
            }
          }
        }
      )
      .subscribe();

    setChannel(newChannel);

    // Cleanup
    return () => {
      if (newChannel) {
        supabase.removeChannel(newChannel);
      }
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