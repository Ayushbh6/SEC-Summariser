// src/app/api/summarize-reports/route.ts
import { NextResponse } from 'next/server';
import { summarizeReports } from '@/lib/summarizeReports';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // Use the shared summarization function
    const result = await summarizeReports();
    
    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: result.message,
        processedCount: result.processedCount 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.message 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('An unexpected error occurred in the summarize-reports endpoint:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'An unexpected error occurred.' 
    }, { status: 500 });
  }
}
