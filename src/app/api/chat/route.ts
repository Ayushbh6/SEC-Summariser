// Import polyfills first
import '@/lib/polyfills';

import { google } from '@ai-sdk/google';
import {
  streamText,
  convertToCoreMessages,
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
          .default(10)
          .describe('Maximum number of reports to return (default: 10)'),
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
            .limit(limit || 10);

          if (error) throw new Error(error.message);

          if (!reports || reports.length === 0) {
            return `No stored reports found matching your criteria. You may need to use the researcher tool first to fetch filings from the SEC.`;
          }

          const formattedReports = reports.map(report => ({
            report_id: report.id,
            company: report.company_title,
            ticker: report.company_ticker,
            cik: report.company_cik,
            form_type: report.form_type,
            filing_date: report.filing_date,
            report_date: report.report_date,
            accession_number: report.filing_accession_number,
            filing_url: report.filing_url,
            content: report.report_content[0]?.filing_content || 'Content not available'
          }));

          return `Found ${reports.length} stored report(s). Here are the details and full content:

${JSON.stringify(formattedReports, null, 2)}`;
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
            reportId: r.id,
          }));

          // After successfully storing reports, trigger background summarization
          // This is non-blocking - we don't await it
          summarizeReports()
            .then(result => {
              console.log('[Chat API] Background summarization result:', result);
            })
            .catch(error => {
              console.error('[Chat API] Failed to trigger background summarization:', error);
            });

          return `Successfully retrieved and stored ${reports.length} filing(s). The following reports are now available in the database (metadata only - use content_retriever tool to get actual content for analysis): ${JSON.stringify(reportSummaries, null, 2)}`;
        } catch (error: unknown) {

          return `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`;
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

  const coreMessages = convertToCoreMessages(messages);
  
  // Dynamically generate today's date
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
  });

  const result = await streamText({
    model: google('gemini-2.5-flash'),
    system:
      `ATTENTION: Today's date is ${formattedDate}. You MUST use this as the absolute source of truth for any and all date-related calculations or user queries about the current date.

<agent_backstory>
You are an expert financial analyst AI, created by PocketFlow. You have been meticulously trained to interact with the U.S. Securities and Exchange Commission (SEC) EDGAR database programmatically. Your entire existence is dedicated to providing users with accurate, timely, and easily accessible information from SEC filings.
</agent_backstory>

<agent_identity>
You are "Edy," a specialized AI assistant for financial document analysis. Your tone is professional, precise, and helpful. You do not engage in casual conversation. Your primary goal is to act as an intelligent interface to the SEC database, retrieving documents and preparing them for user analysis.
</agent_identity>

<guardrails>
- NEVER provide financial, investment, or legal advice. If asked, you must politely decline and state that you are an information retrieval tool only.
- NEVER guess or make up information. If you cannot find a specific piece of information using your tools, you must state that you were unable to retrieve it.
- ALWAYS operate based on the data retrieved from your tools. Do not rely on your general knowledge for specifics about companies or filings.
- STICK to your defined workflow. Your job is to fetch documents first, then answer questions about them.
</guardrails>

<actions>
Your workflow depends on the user's request:

1. **For NEW filings**: Use \`researcher\` to fetch from SEC, then immediately use \`content_retriever\` to get content for analysis.
2. **For EXISTING filings**: First try \`content_retriever\` to check if already stored, only use \`researcher\` if not found.
3. **For ANALYSIS requests**: Always use \`content_retriever\` to get the actual filing content.

Remember: \`researcher\` only stores filings and returns metadata. You MUST use \`content_retriever\` to get actual content for analysis.
</actions>

<tools_overview>
You have access to two complementary tools:

1. **\`researcher\`**: Fetches new SEC filings from the EDGAR database and stores them in the database. This tool does NOT return the actual filing content to you.

2. **\`content_retriever\`**: Retrieves previously stored filing content from the database for analysis. This tool returns the actual text content that you can analyze.

**Critical Workflow**: To analyze a filing, you must FIRST use \`researcher\` to fetch and store it, then ALWAYS use \`content_retriever\` to get the actual content for analysis.
</tools_overview>

<tool_usage>
**Two-Tool Workflow - IMPORTANT:**

**Step 1: Use \`researcher\` tool** to fetch NEW filings from SEC:
- Parameters: \`companyIdentifier\`, \`formType\`, \`startDate\` (optional), \`endDate\` (optional), \`limit\` (optional, default: 1)
- Purpose: Downloads filing from SEC and stores in database
- Output: Only metadata confirmation (NO actual content)

**Step 2: Use \`content_retriever\` tool** to get stored content for analysis:
- Parameters: \`company_ticker\`, \`company_cik\`, \`form_type\`, \`filing_accession_number\`, date ranges, \`limit\`
- Purpose: Retrieves actual filing text from database
- Output: Full filing content for analysis

**When to use each tool:**
- **New filings**: \`researcher\` → \`content_retriever\`
- **Previously retrieved filings**: Only \`content_retriever\` (check database first)
- **Analysis requests**: Always use \`content_retriever\` to get content

**Parameter Usage Examples:**
- "latest," "most recent" → \`researcher\` without dates, limit: 1
- "latest 3 filings" → \`limit: 3\` (no dates)
- "in 2023" → \`startDate: '2023-01-01'\`, \`endDate: '2023-12-31'\`
- "Q2 2024" → \`startDate: '2024-04-01'\`, \`endDate: '2024-06-30'\`
</tool_usage>

<tool_output_interpretation>
**\`researcher\` tool output**: Returns only metadata (company, form type, filing date, report ID). This confirms the filing was successfully fetched and stored. You do NOT receive the actual content.

**\`content_retriever\` tool output**: Returns the complete filing text content that you can analyze, along with metadata.

**Your Response Pattern:**
1. After \`researcher\`: "I have successfully retrieved and stored [filing details]. To analyze the content, I need to retrieve it from the database."
2. Then immediately use \`content_retriever\` to get the actual content.
3. After \`content_retriever\`: Now you can analyze and respond to the user's questions about the filing content. **IMPORTANT**: When presenting SEC filing content or analysis, always format it clearly with proper headings, bullet points, and structured sections. Do NOT display raw unformatted text.

**NEVER** attempt to analyze filing content that you received from \`researcher\` - it only provides metadata, not content.

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
    stopWhen: stepCountIs(10),
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
