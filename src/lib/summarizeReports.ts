import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with anon key for RPC calls
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function summarizeContent(reportId: string, content: string): Promise<string | null> {
  try {
    const response = await fetch('https://simple-summary-production.up.railway.app/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        report_id: reportId,
        content: content,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Failed to summarize content for report ${reportId}: ${errorBody}`);
      return null;
    }

    const result = await response.json();
    return result.summary;
  } catch (error) {
    console.error(`Error calling summarization service for report ${reportId}:`, error);
    return null;
  }
}

export async function summarizeReports(): Promise<{ success: boolean; message: string; processedCount: number }> {
  try {
    console.log('[SummarizeReports] Starting background summarization...');
    
    // 1. Call the secure database function to get reports needing summarization
    const { data: reports, error: fetchError } = await supabase.rpc('get_reports_needing_summary');

    if (fetchError) {
      console.error('[SummarizeReports] Error fetching reports to summarize:', fetchError);
      return { success: false, message: 'Failed to fetch reports', processedCount: 0 };
    }

    if (!reports || reports.length === 0) {
      console.log('[SummarizeReports] No new reports to summarize');
      return { success: true, message: 'No new reports to summarize', processedCount: 0 };
    }

    console.log(`[SummarizeReports] Found ${reports.length} reports to summarize`);

    // 2. Loop through them, call the summarizer, and update the database
    let successCount = 0;
    for (const report of reports) {
      console.log(`[SummarizeReports] Processing report ${report.report_id}...`);
      const summary = await summarizeContent(report.report_id, report.filing_content);

      if (summary) {
        console.log(`[SummarizeReports] Received summary of length ${summary.length} for report ${report.report_id}`);
        
        // 3. Use the SECURITY DEFINER function to update the summary
        const { data: updateResult, error: updateError } = await supabase
          .rpc('update_report_summary', {
            p_report_id: report.report_id,
            p_summary: summary
          });

        if (updateError) {
          console.error(`[SummarizeReports] Error updating summary for report ${report.report_id}:`, updateError);
        } else if (updateResult?.success) {
          console.log(`[SummarizeReports] Successfully summarized and updated report ${report.report_id}`);
          successCount++;
        } else {
          console.error(`[SummarizeReports] Failed to update summary for report ${report.report_id}:`, updateResult?.error || 'Unknown error');
        }
      } else {
        console.log(`[SummarizeReports] No summary returned for report ${report.report_id}`);
      }
    }

    console.log(`[SummarizeReports] Completed. Processed ${successCount}/${reports.length} reports successfully`);
    return { 
      success: true, 
      message: `Processed ${successCount}/${reports.length} reports`, 
      processedCount: successCount 
    };

  } catch (error) {
    console.error('[SummarizeReports] Unexpected error:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error', 
      processedCount: 0 
    };
  }
}