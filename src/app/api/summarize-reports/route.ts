// src/app/api/summarize-reports/route.ts
// NOTE: This endpoint is not currently used. Summarization happens automatically
// when reports are fetched via the chat API route.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({ 
    success: false, 
    error: 'This endpoint is deprecated. Summarization happens automatically via the chat API.' 
  }, { status: 501 });
}
