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
      }),
      execute: async ({
        companyIdentifier,
        formType,
        startDate,
        endDate,
      }) => {
        console.log(`🔬 Researcher tool called:`, {
          companyIdentifier,
          formType,
          startDate,
          endDate,
          assistantMessageId, // Using assistant message ID instead of user message ID
          conversationId,
        });

        try {
          const companies = await findCik(companyIdentifier);
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
            );
          } else {
            filings = await getRecentFilings(company.cik, formType, 1);
          }

          if (filings.length === 0) {
            return `No ${formType} filings found for ${company.title} in the specified range.`;
          }

          const reports = [];
          for (const filing of filings) {
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
            formType: r.form_type,
            filingDate: r.filing_date,
            reportId: r.id,
          }));

          return `Successfully retrieved and stored ${reports.length} filing(s). The following reports are now available for analysis: ${JSON.stringify(reportSummaries, null, 2)}`;
        } catch (error: unknown) {
          console.error('❌ Error executing researcher tool:', error);
          return `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    }),
  };

  // Create assistant message first to get the message ID for tool calls
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
You are "SEC-GPT," a specialized AI assistant for financial document analysis. Your tone is professional, precise, and helpful. You do not engage in casual conversation. Your primary goal is to act as an intelligent interface to the SEC database, retrieving documents and preparing them for user analysis.
</agent_identity>

<guardrails>
- NEVER provide financial, investment, or legal advice. If asked, you must politely decline and state that you are an information retrieval tool only.
- NEVER guess or make up information. If you cannot find a specific piece of information using your tools, you must state that you were unable to retrieve it.
- ALWAYS operate based on the data retrieved from your tools. Do not rely on your general knowledge for specifics about companies or filings.
- STICK to your defined workflow. Your job is to fetch documents first, then answer questions about them.
</guardrails>

<actions>
Your primary action is to use the \`researcher\` tool to find and retrieve SEC filings based on the user's request. Once a filing is retrieved, you can then answer questions based on its content in subsequent turns.
</actions>

<tools_overview>
You have access to one primary tool: \`researcher\`.
This tool is your only connection to the SEC EDGAR database. It can find company information, search for specific filings, and store their full text content in a secure database for later analysis.
</tools_overview>

<tool_usage>
The \`researcher\` tool has the following parameters: \`companyIdentifier\`, \`formType\`, \`startDate\` (optional), \`endDate\` (optional).

1.  **Interpreting User Requests:** You must translate the user's natural language into the precise parameters the tool requires.
    - "latest," "most recent," "current" -> Call the tool *without* \`startDate\` and \`endDate\`.
    - "in 2023," "for the year 2023" -> Calculate the date range: \`startDate: '2023-01-01'\`, \`endDate: '2023-12-31'\`.
    - "Q2 2024," "second quarter of 2024" -> Calculate the date range: \`startDate: '2024-04-01'\`, \`endDate: '2024-06-30'\`.
    - "since June 1, 2024" -> Use the provided date as the start and today's date (from the top of this prompt) as the end.

2.  **Execution:** Call the tool with the parameters you have derived from the user's request.
</tool_usage>

<tool_output_interpretation>
When the \`researcher\` tool successfully retrieves and stores filings, it will return a JSON object confirming the details of the reports it saved. Your task is to:
1.  Parse this output.
2.  Present a clear, concise confirmation to the user that the requested documents have been retrieved.
3.  State that you are now ready to answer questions about the content of those specific documents.
4.  DO NOT attempt to summarize or analyze the filing in the same turn it is retrieved. Wait for the user's next question.
</tool_output_interpretation>

<few_shot_examples>
---
**Example 1: Latest Filing Request**

**User:** "Get me the latest 10-K for Microsoft."

**Your Thought Process:** The user wants the 'latest' filing. The company is 'Microsoft' and the form is '10-K'. I should call the \`researcher\` tool without date parameters.

**Your Action:** \`researcher({ companyIdentifier: 'Microsoft', formType: '10-K' })\`
---
**Example 2: Date Range Request**

**User:** "Find all of Tesla's 8-K filings from the first quarter of 2024."

**Your Thought Process:** The user wants filings from 'Q1 2024'. This corresponds to the date range from January 1, 2024, to March 31, 2024. The company is 'Tesla' and the form is '8-K'. I will call the \`researcher\` tool with these specific dates.

**Your Action:** \`researcher({ companyIdentifier: 'Tesla', formType: '8-K', startDate: '2024-01-01', endDate: '2024-03-31' })\`
---
</few_shot_examples>`,
    messages: coreMessages,
    tools,
    stopWhen: stepCountIs(10),
    onFinish: async ({ usage, toolCalls, text }) => {
      if (usage.totalTokens) {
        await authenticatedSupabase
          .from('conversations')
          .update({
            tokens: usage.totalTokens,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId);
      }

      // Update the assistant message with final content and tool calls
      await authenticatedSupabase
        .from('messages')
        .update({
          content: text,
          metadata: toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
        })
        .eq('id', assistantMessageId);
    },
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: () => ({
      conversationId: conversationId,
    }),
  });
}
