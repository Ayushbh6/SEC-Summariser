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
      return null;
    }

    const result = await response.json();
    return result.summary;
  } catch (error) {
    return null;
  }
}

export async function summarizeReports(userId: string): Promise<{ success: boolean; message: string; processedCount: number }> {
  try {
    // Call the secure database function to get reports needing summarization
    const { data: reports, error: fetchError } = await supabase.rpc('get_reports_needing_summary', {
      p_user_id: userId
    });

    if (fetchError) {
      return { success: false, message: 'Failed to fetch reports', processedCount: 0 };
    }

    if (!reports || reports.length === 0) {
      return { success: true, message: 'No new reports to summarize', processedCount: 0 };
    }

    // Loop through reports and summarize them
    let successCount = 0;
    for (const report of reports) {
      const summary = await summarizeContent(report.report_id, report.filing_content);

      if (summary) {
        // Use the SECURITY DEFINER function to update the summary
        const { data: updateResult, error: updateError } = await supabase
          .rpc('update_report_summary', {
            p_report_id: report.report_id,
            p_summary: summary
          });

        if (!updateError && updateResult?.success) {
          successCount++;
        }
      }
    }

    return { 
      success: true, 
      message: `Processed ${successCount}/${reports.length} reports`, 
      processedCount: successCount 
    };

  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error', 
      processedCount: 0 
    };
  }
}