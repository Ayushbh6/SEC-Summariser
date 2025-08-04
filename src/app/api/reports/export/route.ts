import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get('Authorization');
    const token = authorization?.split(' ')[1];
    
    // Get conversation_id from query params
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversation_id');

    if (!token) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });
    }

    const authenticatedSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const { data: { user } } = await authenticatedSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Invalid user token' }, { status: 401 });
    }

    // Build query for reports with summaries
    let query = authenticatedSupabase
      .from('reports')
      .select(`
        company_title,
        report_date,
        filing_accession_number,
        filing_url,
        form_type,
        filing_date,
        company_ticker,
        conversation_id,
        report_content!inner(summary)
      `)
      .eq('user_id', user.id)
      .not('report_content.summary', 'is', null);
    
    // Filter by conversation if provided
    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    }
    
    const { data: reports, error } = await query.order('filing_date', { ascending: false });

    if (error) {
      console.error('Error fetching reports:', error);
      return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
    }

    if (!reports || reports.length === 0) {
      return NextResponse.json({ message: 'No reports with summaries found' }, { status: 404 });
    }

    // Transform data for Excel export
    const excelData = reports.map((report) => ({
      'Company Name': report.company_title || '',
      'Ticker': report.company_ticker || '',
      'Form Type': report.form_type || '',
      'Report Date': report.report_date || '',
      'Filing Date': report.filing_date || '',
      'Filing Number': report.filing_accession_number || '',
      'Summary': report.report_content[0]?.summary || '',
      'URL': report.filing_url || ''
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(excelData[0]).map((key) => {
      const maxLength = Math.max(
        key.length,
        ...excelData.map(row => String(row[key as keyof typeof row]).length)
      );
      return { wch: Math.min(maxLength + 2, maxWidth) };
    });
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'SEC Reports Summary');

    // Generate Excel buffer
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // Generate filename with current date and optional conversation context
    const today = new Date().toISOString().split('T')[0];
    const filename = conversationId 
      ? `SEC_Reports_Conversation_${today}.xlsx`
      : `SEC_Reports_Summary_${today}.xlsx`;

    // Return Excel file as download
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('Error in export endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}