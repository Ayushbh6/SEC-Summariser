// Import polyfills first
import '@/lib/polyfills';

import { google } from '@ai-sdk/google';
import {
  streamText,
  convertToModelMessages,
  tool,
  type ToolSet,
  type UIMessage,
  stepCountIs,
} from 'ai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  findCik,
  getRecentFilings,
  getFilingsByDateRange,
  type Filing,
} from '@/lib/sec_api';
import { summarizeReports } from '@/lib/summarizeReports';

export const maxDuration = 30;

export type ChatMessage = UIMessage;

export async function POST(req: Request) {
  const {
    messages,
    conversationId,
  }: { messages: ChatMessage[]; conversationId: string } =
    await req.json();

  const authorization = req.headers.get('Authorization');
  const token = authorization?.split(' ')[1];

  if (!token) {
    return new Response(JSON.stringify({ error: 'Authorization token required' }), {
      status: 401,
    });
  }

  const authenticatedSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  const {
    data: { user },
  } = await authenticatedSupabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid user token' }), {
      status: 401,
    });
  }

  // Define tools with access to current request context
  const tools: ToolSet = {
    content_retriever: tool({
      description:
        'Retrieves stored SEC filing content from the database for analysis. Use this tool to get the actual text content of filings that have been previously fetched.',
      inputSchema: z.object({
        company_ticker: z
          .string()
          .optional()
          .describe('Stock ticker symbol (e.g., "AAPL", "TSLA")'),
        company_cik: z
          .string()
          .optional()
          .describe('SEC CIK number (e.g., "320193")'),
        form_type: z
          .string()
          .optional()
          .describe('SEC form type (e.g., "8-K", "10-K", "10-Q")'),
        filing_accession_number: z
          .string()
          .optional()
          .describe('Specific SEC accession number for direct access'),
        filing_date_start: z
          .string()
          .optional()
          .describe('Start date for filing date range (YYYY-MM-DD)'),
        filing_date_end: z
          .string()
          .optional()
          .describe('End date for filing date range (YYYY-MM-DD)'),
        report_date_start: z
          .string()
          .optional()
          .describe('Start date for report period range (YYYY-MM-DD)'),
        report_date_end: z
          .string()
          .optional()
          .describe('End date for report period range (YYYY-MM-DD)'),
        limit: z
          .number()
          .optional()
          .default(1)
          .describe('Maximum number of reports to return (default: 1, max: 5). Use multiple calls for more.'),
      }),
      execute: async ({
        company_ticker,
        company_cik,
        form_type,
        filing_accession_number,
        filing_date_start,
        filing_date_end,
        report_date_start,
        report_date_end,
        limit,
      }) => {
        try {
          // Hard limit to prevent token explosion
          const maxReportsPerCall = 5;
          if (limit && limit > maxReportsPerCall) {
            return `LIMIT EXCEEDED: Maximum ${maxReportsPerCall} reports per content_retriever call to prevent token overload.
            
SOLUTION: Make multiple calls with specific filters:
- Use filing_accession_number to retrieve specific reports
- Or make multiple calls with limit: ${maxReportsPerCall} or less
- This protects against accidentally consuming millions of tokens.`;
          }

          let query = authenticatedSupabase
            .from('reports')
            .select(`
              id,
              company_cik,
              company_ticker,
              company_title,
              form_type,
              filing_date,
              report_date,
              filing_accession_number,
              filing_url,
              report_content!inner(filing_content)
            `)
            .eq('user_id', user.id)
            .eq('tool_status', 'completed')
            .eq('has_content', true);

          // Apply filters based on provided parameters
          if (company_ticker) query = query.eq('company_ticker', company_ticker);
          if (company_cik) query = query.eq('company_cik', company_cik);
          if (form_type) query = query.eq('form_type', form_type);
          if (filing_accession_number) query = query.eq('filing_accession_number', filing_accession_number);
          
          // Date range filters
          if (filing_date_start) query = query.gte('filing_date', filing_date_start);
          if (filing_date_end) query = query.lte('filing_date', filing_date_end);
          if (report_date_start) query = query.gte('report_date', report_date_start);
          if (report_date_end) query = query.lte('report_date', report_date_end);

          const { data: reports, error } = await query
            .order('filing_date', { ascending: false })
            .limit(Math.min(limit || 1, maxReportsPerCall));

          if (error) throw new Error(error.message);

          if (!reports || reports.length === 0) {
            return `No stored reports found matching your criteria. You may need to use the researcher tool first to fetch filings from the SEC.`;
          }

          // Format reports in a more AI-friendly way
          let output = `Found ${reports.length} stored report(s). Here are the details and full content: ${JSON.stringify(reports.map(r => ({company: r.company_title, ticker: r.company_ticker, cik: r.company_cik, form_type: r.form_type, filing_date: r.filing_date, report_date: r.report_date, accession_number: r.filing_accession_number, filing_url: r.filing_url})))}\n\n`;
          
          reports.forEach((report, index) => {
            output += `=== REPORT ${index + 1} ===\n`;
            output += `Company: ${report.company_title} (${report.company_ticker || 'N/A'})\n`;
            output += `Form Type: ${report.form_type}\n`;
            output += `Filing Date: ${report.filing_date}\n`;
            output += `Report Period: ${report.report_date}\n`;
            output += `Accession Number: ${report.filing_accession_number}\n`;
            output += `Filing URL: ${report.filing_url}\n`;
            output += `Report ID: ${report.id}\n`;
            output += `\n--- CONTENT START ---\n`;
            output += report.report_content[0]?.filing_content || 'Content not available';
            output += `\n--- CONTENT END ---\n\n`;
          });

          return output;
        } catch (error: unknown) {
          return `An error occurred while retrieving content: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    }),
    researcher: tool({
      description:
        'Finds SEC filings for a given company and stores them in the database. Can search by date range or get the most recent filings.',
      inputSchema: z.object({
        companyIdentifier: z
          .string()
          .describe(
            'The name or ticker symbol of the company (e.g., "Apple", "TSLA").',
          ),
        formType: z
          .string()
          .describe('The type of SEC form to search for (e.g., "10-K", "10-Q").'),
        startDate: z
          .string()
          .optional()
          .describe('The start date for the search range (YYYY-MM-DD).'),
        endDate: z
          .string()
          .optional()
          .describe('The end date for the search range (YYYY-MM-DD).'),
        limit: z
          .number()
          .optional()
          .default(1)
          .describe('Number of filings to retrieve (default: 1). Use this for "latest N filings" requests.'),
      }),
      execute: async ({
        companyIdentifier,
        formType,
        startDate,
        endDate,
        limit,
      }) => {
        try {
          // 1. Check per-request report limit
          if (limit && limit > 10) {
            return `LIMIT EXCEEDED: Requested ${limit} reports, but maximum is 10 per request.
            
SOLUTION: Please retry with limit: 10 to fetch the first 10 reports. After successful retrieval, you can make additional requests for remaining reports if needed.

ALTERNATIVE: For bulk report downloads, inform the user about the Export Summary feature for automatic summarization of all reports.`;
          }

          // 2. Check date range span (if both dates provided)
          if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const yearsDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
            
            if (yearsDiff > 2) {
              // Calculate suggested date ranges
              const midPoint = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
              const firstRangeEnd = new Date(midPoint);
              firstRangeEnd.setDate(firstRangeEnd.getDate() - 1);
              
              return `DATE RANGE EXCEEDED: Requested range spans ${yearsDiff.toFixed(1)} years, but maximum is 2 years per request.
              
SOLUTION: Break into smaller periods. Try first with:
- startDate: '${start.toISOString().split('T')[0]}'
- endDate: '${firstRangeEnd.toISOString().split('T')[0]}'

Then make a second request for:
- startDate: '${midPoint.toISOString().split('T')[0]}'
- endDate: '${end.toISOString().split('T')[0]}'

IMPORTANT: Ask the user for confirmation before making the second request.`;
            }
          }

          // 3. Check conversation-level report count
          const { data: conversationStats } = await authenticatedSupabase
            .from('conversations')
            .select('report_fetch_count')
            .eq('id', conversationId)
            .single();

          const currentFetchCount = conversationStats?.report_fetch_count || 0;
          const proposedTotal = currentFetchCount + (limit || 1);

          if (proposedTotal > 30) {
            const remainingInConversation = 30 - currentFetchCount;
            return `CONVERSATION LIMIT: This conversation has already fetched ${currentFetchCount} reports. Maximum is 30 per conversation.
            
IMMEDIATE SOLUTION: ${remainingInConversation > 0 
              ? `You can still fetch up to ${remainingInConversation} more reports in this conversation. Retry with limit: ${Math.min(remainingInConversation, limit || 1)}.`
              : `This conversation has reached its limit.`}

RECOMMENDED ACTIONS:
1. Use the Export Summary button (top-right) to download all ${currentFetchCount} reports as comprehensive summaries
2. If you need additional reports, start a new conversation
3. For specific analysis, ask the user which reports are most important to analyze in detail

This limit helps maintain optimal performance for all users.`;
          }

          const companies = await findCik(companyIdentifier, user.email!);
          if (companies.length === 0) {
            return `Could not find a CIK for "${companyIdentifier}".`;
          }
          const company = companies[0];

          let filings: Filing[];
          if (startDate && endDate) {
            filings = await getFilingsByDateRange(
              company.cik,
              formType,
              startDate,
              endDate,
              user.email!
            );
          } else {
            filings = await getRecentFilings(company.cik, formType, limit || 1, user.email!);
          }

          if (filings.length === 0) {
            return `No ${formType} filings found for ${company.title} in the specified range.`;
          }

          const reports = [];
          for (const filing of filings) {
            // Check if filing already exists for this user
            const { data: existingReport } = await authenticatedSupabase
              .from('reports')
              .select('id, company_title, form_type, filing_date')
              .eq('user_id', user.id)
              .eq('filing_accession_number', filing.accessionNumber)
              .single();

            if (existingReport) {
              return `Filing ${filing.accessionNumber} for ${filing.form} already exists in your database (filed on ${existingReport.filing_date}). Use the content_retriever tool to access the stored content.`;
            }

            const { data: reportData, error: reportError } =
              await authenticatedSupabase
                .from('reports')
                .insert({
                  user_id: user.id,
                  conversation_id: conversationId,
                  message_id: assistantMessageId, // Using assistant message ID
                  tool_name: 'researcher',
                  tool_parameters: {
                    companyIdentifier,
                    formType,
                    startDate,
                    endDate,
                    limit,
                  },
                  tool_status: 'completed',
                  company_cik: company.cik,
                  company_ticker: company.ticker,
                  company_title: company.title,
                  filing_accession_number: filing.accessionNumber,
                  filing_date: filing.filingDate,
                  report_date: filing.reportDate,
                  form_type: filing.form,
                  filing_url: filing.url,
                  has_content: !!filing.fullText,
                })
                .select()
                .single();

            if (reportError) throw new Error(reportError.message);

            if (filing.fullText) {
              await authenticatedSupabase.from('report_content').insert({
                report_id: reportData.id,
                filing_content: filing.fullText,
              });
            }
            reports.push(reportData);
          }

          const reportSummaries = reports.map(r => ({
            company: r.company_title,
            ticker: r.company_ticker,
            cik: r.company_cik,
            formType: r.form_type,
            filingDate: r.filing_date,
            reportDate: r.report_date,
            accessionNumber: r.filing_accession_number,
            filingUrl: r.filing_url,
            reportId: r.id,
          }));

          // Update conversation report fetch count
          await authenticatedSupabase
            .from('conversations')
            .update({ 
              report_fetch_count: currentFetchCount + reports.length,
              updated_at: new Date().toISOString()
            })
            .eq('id', conversationId);

          // After successfully storing reports, trigger background summarization
          // This is non-blocking - we don't await it
          summarizeReports(user.id).catch(error => {
            console.error('[Chat API] Background summarization failed:', error);
          });

          return `Successfully retrieved and stored ${reports.length} filing(s). The following reports are now available in the database (metadata only - use content_retriever tool to get actual content for analysis): ${JSON.stringify(reportSummaries, null, 2)}`;
        } catch (error: unknown) {

          return `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    }),
    get_report_metadata: tool({
      description:
        'Retrieves specific metadata fields from stored SEC reports. Use this to get filing URLs, dates, or other report details without retrieving full content.',
      inputSchema: z.object({
        company_cik: z
          .string()
          .optional()
          .describe('SEC CIK number to search by'),
        company_title: z
          .string()
          .optional()
          .describe('Company name to search by (partial match supported)'),
        company_ticker: z
          .string()
          .optional()
          .describe('Stock ticker symbol to search by'),
        filing_accession_number: z
          .string()
          .optional()
          .describe('SEC accession number to search by'),
        filing_date: z
          .string()
          .optional()
          .describe('Specific filing date (YYYY-MM-DD)'),
        report_date: z
          .string()
          .optional()
          .describe('Specific report period date (YYYY-MM-DD)'),
        form_type: z
          .string()
          .optional()
          .describe('SEC form type to filter by'),
        limit: z
          .number()
          .optional()
          .default(5)
          .describe('Maximum number of results to return (default: 5, max: 10)'),
      }),
      execute: async ({
        company_cik,
        company_title,
        company_ticker,
        filing_accession_number,
        filing_date,
        report_date,
        form_type,
        limit,
      }) => {
        try {
          const maxResults = Math.min(limit || 5, 10);
          
          let query = authenticatedSupabase
            .from('reports')
            .select(`
              company_cik,
              company_title,
              company_ticker,
              filing_accession_number,
              filing_date,
              report_date,
              form_type,
              filing_url
            `)
            .eq('user_id', user.id)
            .eq('tool_status', 'completed');

          // Apply filters based on provided parameters
          if (company_cik) query = query.eq('company_cik', company_cik);
          if (company_ticker) query = query.eq('company_ticker', company_ticker);
          if (filing_accession_number) query = query.eq('filing_accession_number', filing_accession_number);
          if (filing_date) query = query.eq('filing_date', filing_date);
          if (report_date) query = query.eq('report_date', report_date);
          if (form_type) query = query.eq('form_type', form_type);
          if (company_title) query = query.ilike('company_title', `%${company_title}%`);

          const { data: reports, error } = await query
            .order('filing_date', { ascending: false })
            .limit(maxResults);

          if (error) throw new Error(error.message);

          if (!reports || reports.length === 0) {
            // Provide smart error guidance
            const suggestions = [];
            
            if (company_ticker && !company_cik && !company_title) {
              suggestions.push(`Try searching by company name instead of just ticker`);
            }
            
            if (filing_date) {
              suggestions.push(`Try removing the exact date filter or use a date range instead`);
            }
            
            if (filing_accession_number) {
              suggestions.push(`Verify the accession number is correct`);
            }
            
            if (company_cik) {
              suggestions.push(`Verify the CIK number is correct`);
            }
            
            if (form_type && company_title) {
              suggestions.push(`Try searching without the form_type filter to see all available reports`);
            }
            
            return `No reports found matching your search criteria. ${
              suggestions.length > 0 
                ? 'Suggestions: ' + suggestions.join('; ') 
                : 'Try using the researcher tool to fetch new reports first, or broaden your search parameters.'
            }`;
          }

          // Format the metadata in a clear, structured way
          let output = `Found ${reports.length} report(s) matching your criteria:\n\n`;
          
          reports.forEach((report, index) => {
            output += `📄 Report ${index + 1}:\n`;
            output += `   Company: ${report.company_title}${report.company_ticker ? ` (${report.company_ticker})` : ''}\n`;
            output += `   CIK: ${report.company_cik}\n`;
            output += `   Form Type: ${report.form_type}\n`;
            output += `   Filing Date: ${report.filing_date}\n`;
            output += `   Report Date: ${report.report_date}\n`;
            output += `   Accession Number: ${report.filing_accession_number}\n`;
            output += `   Filing URL: ${report.filing_url}\n\n`;
          });

          return output;
        } catch (error: unknown) {
          return `An error occurred while retrieving metadata: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    }),
  };

  // Create assistant message first to get the message ID for tool calls
  // Check current token count before processing
  const { data: currentConversation, error: conversationError } = 
    await authenticatedSupabase
      .from('conversations')
      .select('tokens')
      .eq('id', conversationId)
      .single();

  if (conversationError) {
    throw new Error(`Failed to get conversation: ${conversationError.message}`);
  }

  const currentTokens = currentConversation?.tokens || 0;
  
  // Hard limit at 480k tokens
  if (currentTokens >= 480000) {
    return new Response(JSON.stringify({ 
      error: 'Token limit exceeded. Please start a new conversation.',
      tokenLimitExceeded: true,
      currentTokens 
    }), {
      status: 403,
    });
  }

  const { data: assistantMessage, error: assistantMessageError } =
    await authenticatedSupabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: '', // Will be updated with final content
        metadata: {},
      })
      .select()
      .single();

  if (assistantMessageError) {
    throw new Error(`Failed to create assistant message: ${assistantMessageError.message}`);
  }

  const assistantMessageId = assistantMessage.id;

  const coreMessages = convertToModelMessages(messages);
  
  // Dynamically generate today's date
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
  });

  const result = streamText({
    model: google('gemini-2.5-flash'),
    system:
      `ATTENTION: Today's date is ${formattedDate}. You MUST use this as the absolute source of truth for any and all date-related calculations or user queries about the current date.

<agent_backstory>
You are an expert financial analyst AI, created by PocketFlow. You have been meticulously trained to interact with the U.S. Securities and Exchange Commission (SEC) EDGAR database programmatically. Your entire existence is dedicated to providing users with accurate, timely, and easily accessible information from SEC filings.
</agent_backstory>

<agent_identity>
You are "Eddie," a SMART SEC ANALYST specializing in deep financial document analysis. You are NOT a bulk summarization tool, but rather an expert at providing detailed insights, comparisons, and in-depth analysis of SEC filings. Your tone is professional, precise, and helpful. You excel at focused analysis of 1-3 reports simultaneously.

CRITICAL: You have sophisticated reasoning capabilities. Use them to understand user intent and route queries appropriately. DO NOT rely on keyword matching or patterns.
</agent_identity>

<greeting_response>
When a user greets you with "Hi", "Hello", or similar greeting, respond with:

"Hi! I'm Eddie, your smart SEC analyst. Here's how I can help you:

**My Core Capabilities:**
• **Deep Analysis**: I excel at detailed analysis of 1-3 SEC reports, providing comprehensive insights
• **Report Retrieval**: I can fetch any SEC filing (10-K, 10-Q, 8-K, etc.) from the EDGAR database
• **Comparisons**: I can compare reports across time periods or between companies
• **Smart Summaries**: All reports I fetch are automatically summarized in the background

**Special Feature:**
📊 **Export Summary Button**: After I fetch reports, you can use the Export button (top-right) to download instant AI-generated summaries of all reports as an Excel file.

**How to use me effectively:**
- For quick overviews of many reports → I'll fetch them and you can use Export
- For detailed analysis → I'll dive deep into specific reports
- For bulk requests (>10 reports) → I'll guide you through the best approach

What SEC filings would you like to explore today?"
</greeting_response>

<guardrails>
- NEVER provide financial, investment, or legal advice. If asked, you must politely decline and state that you are an information retrieval tool only.
- NEVER guess or make up information. If you cannot find a specific piece of information using your tools, you must state that you were unable to retrieve it.
- ALWAYS operate based on the data retrieved from your tools. Do not rely on your general knowledge for specifics about companies or filings.
- NEVER automatically loop through multiple requests. Always ask for user confirmation before fetching additional batches.
- When users greet you, ALWAYS respond with your capabilities as described in the greeting_response section.
</guardrails>

<capabilities_awareness>
IMPORTANT SYSTEM FEATURES YOU MUST KNOW:
1. **Automatic Summarization**: Every report you fetch triggers an automatic background summarization process. Users can download these summaries using the "Export Summary" button in the top-right corner.
   
2. **Your Optimal Range**: You excel at deep analysis of 1-3 reports simultaneously. Beyond this, consider whether full content retrieval is necessary.

3. **System Limits**: 
   - Per request: Maximum 10 reports
   - Per conversation: Maximum 30 reports total
   - Date range: Maximum 2 years per request

4. **Bulk Handling**: For bulk requests (>3 reports), guide users to the automatic summary feature or offer to break down the analysis.

5. **Multi-Tool Capability**: You can call tools up to 20 times in a single conversation turn. This allows you to:
   - Make multiple selective content_retriever calls to get specific reports
   - Chain researcher and content_retriever calls as needed
   - Perform complex multi-step analyses
   - Example: Fetch 10 reports with researcher, then make 3 selective content_retriever calls for specific reports the user wants analyzed
</capabilities_awareness>

<query_understanding>
USE YOUR INTELLIGENCE to understand user queries and determine:

1. **Query Scope**: Is this a bulk request or focused analysis?
   - Consider: Number of reports, time range, multiple form types
   - Be aware: You can fetch up to 10 reports per request, 30 per conversation

2. **User Intent**: What does the user really want?
   - Quick overview → Suggest automatic summaries
   - Deep analysis → Focus on fewer reports with full content
   - Historical trends → May need multiple time periods
   - Comparison → Process specific reports in detail

3. **Smart Content Retrieval**:
   - 1-3 reports: Use content_retriever for full analysis
   - 4-10 reports: Inform about automatic summaries, ask which specific ones to analyze
   - >10 reports: Break into chunks, strongly recommend Export feature
   - STRATEGY: You can call content_retriever MULTIPLE TIMES with specific filters to retrieve reports one at a time or in small batches

4. **Selective Retrieval Strategy**:
   - Use specific filters (accession_number, ticker+form_type+date) to retrieve individual reports
   - Set limit: 1 to get one report at a time
   - Make multiple targeted calls instead of one bulk call
   - Example: Instead of retrieving 5 reports at once, make 2-3 calls with specific filters

5. **Prevent Automatic Looping**:
   - NEVER automatically loop through multiple requests
   - Always ask for confirmation before fetching additional chunks
   - Track conversation report count to prevent abuse
</query_understanding>

<actions>
⚠️ CRITICAL TOKEN MANAGEMENT RULE:
When fetching MORE THAN 3 reports, you MUST NOT automatically call content_retriever for all of them. This would waste massive amounts of tokens. ONLY call content_retriever when:
- The user specifically asks for detailed analysis of particular reports
- You're dealing with 3 or fewer reports total

Your workflow depends on the user's request and YOUR INTELLIGENT ASSESSMENT:

1. **For FOCUSED requests (1-3 reports)**: 
   - Use \`researcher\` to fetch from SEC
   - Then use \`content_retriever\` to get full content for detailed analysis

2. **For BULK requests (4+ reports)**:
   - Use \`researcher\` to fetch and store reports
   - STOP after researcher - DO NOT call content_retriever yet
   - Inform user about automatic summarization feature
   - Ask: "Which specific reports would you like me to analyze in detail?"
   - ONLY use content_retriever for the specific reports the user selects

3. **For EXISTING filings**: 
   - First check with \`content_retriever\`
   - Only use \`researcher\` if not found

REMEMBER: Each report's content can be 100,000+ tokens. Retrieving 10 reports would consume 1M+ tokens. BE SELECTIVE.
</actions>

<tools_overview>
You have access to three specialized SEC analysis tools:

1. **\`researcher\`**: Fetches new SEC filings from the EDGAR database and stores them in the database. This tool does NOT return the actual filing content to you, but provides metadata and filing URLs.

2. **\`content_retriever\`**: Retrieves previously stored filing content from the database for analysis. This tool returns the actual text content that you can analyze, along with filing URLs.

3. **\`get_report_metadata\`**: Queries report metadata (URLs, dates, accession numbers) without loading the heavy content. Perfect for URL queries and checking available reports.

**Critical Workflow**: To analyze a filing, you must FIRST use \`researcher\` to fetch and store it, then use \`content_retriever\` to get the actual content. Use \`get_report_metadata\` when you only need URLs or metadata.
</tools_overview>

<tool_usage>
**Three-Tool SEC Analysis System:**

**Tool 1: \`researcher\`** - Fetch NEW filings from SEC EDGAR:
- Parameters: \`companyIdentifier\`, \`formType\`, \`startDate\` (optional), \`endDate\` (optional), \`limit\` (optional, default: 1)
- Purpose: Downloads filing from SEC and stores in database
- Output: Metadata confirmation with filing URLs (NO actual content)
- **NEW**: Now includes direct filing URLs for immediate access

**Tool 2: \`content_retriever\`** - Get stored filing content for analysis:
- Parameters: \`company_ticker\`, \`company_cik\`, \`form_type\`, \`filing_accession_number\`, date ranges, \`limit\`
- Purpose: Retrieves actual filing text from database
- Output: Full filing content with metadata and filing URLs
- **NEW**: Enhanced output includes filing URLs for source verification

**Tool 3: \`get_report_metadata\`** - Query report metadata without content:
- Parameters: \`company_cik\`, \`company_title\`, \`company_ticker\`, \`filing_accession_number\`, \`filing_date\`, \`report_date\`, \`form_type\`, \`limit\` (all optional)
- Purpose: Retrieve filing URLs, dates, and metadata without loading full content
- Output: Structured metadata including direct filing URLs
- **USE CASES**: 
  - User asks for filing URL specifically
  - Re-fetching URLs in long conversations
  - Checking what reports are available
  - Getting filing metadata without token-heavy content

**When to use each tool:**
- **New filings**: \`researcher\` → \`content_retriever\`
- **Previously retrieved filings**: Only \`content_retriever\` (check database first)
- **Filing URLs or metadata only**: Use \`get_report_metadata\` for efficient retrieval
- **Analysis requests**: Always use \`content_retriever\` to get content

**Parameter Usage Examples:**
- "latest," "most recent" → \`researcher\` without dates, limit: 1
- "latest 3 filings" → \`limit: 3\` (no dates)
- "What's the URL of Tesla's 8-K?" → \`get_report_metadata\` with company_ticker: "TSLA", form_type: "8-K"
- "in 2023" → \`startDate: '2023-01-01'\`, \`endDate: '2023-12-31'\`
- "Q2 2024" → \`startDate: '2024-04-01'\`, \`endDate: '2024-06-30'\`
</tool_usage>

<tool_output_interpretation>
**\`researcher\` tool output**: Returns only metadata (company, form type, filing date, report ID). This confirms the filing was successfully fetched and stored. You do NOT receive the actual content.

**\`content_retriever\` tool output**: Returns the complete filing text content that you can analyze, along with metadata.

**Response Patterns Based on YOUR INTELLIGENT ASSESSMENT:**

**For URL or Metadata Queries:**
1. User asks: "What's the URL of..." or "Give me the link to..." → Use \`get_report_metadata\`
2. User asks: "What reports do you have for..." → Use \`get_report_metadata\` to list available reports
3. In long conversations when URLs are needed again → Use \`get_report_metadata\` instead of content_retriever
4. Example: "What's the URL of Tesla's 8-K?" → Use \`get_report_metadata\` with company_ticker: "TSLA", form_type: "8-K"

**For 1-3 Reports (Focused Analysis):**
1. Use \`researcher\` to fetch reports
2. Immediately use \`content_retriever\` for full analysis
3. Provide detailed insights

**For 4-10 Reports (Bulk Request):**
1. Use \`researcher\` to fetch all reports
2. **STOP HERE - DO NOT call content_retriever automatically**
3. Inform: "I've successfully fetched [X] reports which are being automatically summarized in the background. You can download all summaries using the Export button (top-right)."
4. Ask: "Would you like me to analyze any specific reports in detail? Please let me know which ones."
5. **WAIT for user response before using content_retriever**
6. When user specifies reports, use SELECTIVE RETRIEVAL:
   - Call content_retriever with specific accession_number for each requested report
   - Or use ticker+form_type+date filters to get specific reports
   - Make multiple calls with limit:1 rather than one bulk call

**For >10 Reports (Large Request):**
Example: "I see you're looking for comprehensive filings. That would be approximately [X] reports.

I can fetch up to 10 reports at a time (30 per conversation total). Here are your options:

**Option 1: Bulk Export** (Recommended)
I'll fetch the reports in batches, triggering automatic summarization. Use the Export button for comprehensive summaries.

**Option 2: Focused Analysis**
Let's identify the most important periods or reports for detailed analysis.

Which approach would work best?"

**EXAMPLE - What NOT to do (Token Waste):**
User: "Get all 10-K and 10-Q for Apple 2024"
BAD: researcher → fetch 5 reports → content_retriever with limit:5 → 500,000 tokens wasted

**EXAMPLE - What TO do (Smart Token Use):**
User: "Get all 10-K and 10-Q for Apple 2024"
GOOD: researcher → fetch 5 reports → "I've fetched 5 reports. They're being summarized. Use Export button or tell me which specific ones to analyze."
User: "Analyze the 10-K and Q3 report"
GOOD: 
- content_retriever with filing_accession_number="[10-K accession]" limit:1
- content_retriever with filing_accession_number="[Q3 accession]" limit:1
- Now analyze both reports (only ~200k tokens instead of 500k)

**SELECTIVE RETRIEVAL EXAMPLE:**
Instead of: content_retriever(company_ticker="AAPL", limit:5) → Gets ALL 5 reports
Do this: 
- content_retriever(filing_accession_number="specific-number-1", limit:1) → Get 1 report
- content_retriever(filing_accession_number="specific-number-2", limit:1) → Get another
- This gives you control over which reports to analyze

**IMPORTANT**: When presenting filing content, always format it clearly with proper headings, bullet points, and structured sections. Do NOT display raw unformatted text.

**Content Formatting Guidelines:**
- Use clear headings and sections when presenting filing information
- Break down complex information into bullet points
- Highlight key dates, numbers, and important details
- Provide structured summaries rather than raw text dumps
- Format tables and data in readable format
</tool_output_interpretation>

<few_shot_examples>
---
**Example 1: New Filing Request**

**User:** "Get me the latest 10-K for Microsoft."

**Your Actions:** 
1. \`researcher({ companyIdentifier: 'Microsoft', formType: '10-K' })\`
2. After receiving metadata confirmation: \`content_retriever({ company_ticker: 'MSFT', form_type: '10-K', limit: 1 })\`
3. Now analyze the content returned by content_retriever

---
**Example 2: Analysis Request**

**User:** "Analyze Apple's latest 8-K filing."

**Your Actions:**
1. First try: \`content_retriever({ company_ticker: 'AAPL', form_type: '8-K', limit: 1 })\`
2. If found: Analyze the content immediately
3. If not found: Use \`researcher\` first, then \`content_retriever\`

---
**Example 3: Comparison Request**

**User:** "Compare Tesla's last two 10-Q reports."

**Your Actions:**
1. \`content_retriever({ company_ticker: 'TSLA', form_type: '10-Q', limit: 2 })\`
2. Analyze and compare the content from both filings

---
</few_shot_examples>`,
    messages: coreMessages,
    tools,
    stopWhen: stepCountIs(20),
    onFinish: async (result) => {
      if (result.usage?.totalTokens) {
        // Accumulate tokens instead of replacing
        const newTotalTokens = currentTokens + result.usage.totalTokens;
        await authenticatedSupabase
          .from('conversations')
          .update({
            tokens: newTotalTokens,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId);
      }

      // Update the assistant message with final content and tool calls
      await authenticatedSupabase
        .from('messages')
        .update({
          content: result.text,
          metadata: result.response?.messages ? { 
            tool_calls: result.response.messages 
          } : {},
        })
        .eq('id', assistantMessageId);
    },
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: () => ({
      conversationId: conversationId,
      currentTokens: currentTokens,
      tokenWarning: currentTokens >= 400000,
      tokenLimitApproaching: currentTokens >= 480000,
    }),
  });
}
