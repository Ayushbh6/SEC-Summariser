// src/app/api/summarize-reports/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Initialize Supabase client safely with the public anon key.
// This is the ONLY client we will use.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function summarizeContent(reportId: string, content: string) {
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
}

export async function POST() {
  try {
    // 1. Call the secure database function to get reports needing summarization
    const { data: reports, error: fetchError } = await supabase.rpc('get_reports_needing_summary');

    if (fetchError) {
      console.error('Error fetching reports to summarize:', fetchError);
      return NextResponse.json({ success: false, error: 'Failed to fetch reports.' }, { status: 500 });
    }

    if (!reports || reports.length === 0) {
      return NextResponse.json({ success: true, message: 'No new reports to summarize.' });
    }

    console.log(`Found ${reports.length} reports to summarize.`);

    // 2. Loop through them, call the summarizer, and update the database
    for (const report of reports) {
      console.log(`Calling summarizer for report ${report.report_id}...`);
      const summary = await summarizeContent(report.report_id, report.filing_content);

      if (summary) {
        console.log(`Received summary of length ${summary.length} for report ${report.report_id}`);
        
        // 3. Use the SECURITY DEFINER function to update the summary
        // This bypasses RLS in a controlled way
        const { data: updateResult, error: updateError } = await supabase
          .rpc('update_report_summary', {
            p_report_id: report.report_id,
            p_summary: summary
          });

        if (updateError) {
          console.error(`Error updating summary for report ${report.report_id}:`, updateError);
        } else if (updateResult?.success) {
          console.log(`Successfully summarized and updated report ${report.report_id}.`);
        } else {
          console.error(`Failed to update summary for report ${report.report_id}:`, updateResult?.error || 'Unknown error');
        }
      } else {
        console.log(`No summary returned for report ${report.report_id}`);
      }
    }

    return NextResponse.json({ success: true, message: `Processed ${reports.length} reports.` });

  } catch (error) {
    console.error('An unexpected error occurred in the summarize-reports endpoint:', error);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
