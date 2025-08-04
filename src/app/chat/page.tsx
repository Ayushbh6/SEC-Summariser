'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getCurrentUser, signOut } from '@/lib/supabase';
import {
  getConversationMessages,
  addMessage,
  autoTitleConversation,
  subscribeToMessages,
  createConversation,
  getUserConversations,
} from '@/lib/conversations';
import { createClient } from '@supabase/supabase-js';
import ConversationSidebar from '@/components/ConversationSidebar';
import SummaryNotification from '@/components/SummaryNotification';
import ExportButton from '@/components/ExportButton';
import { useSummaryStatus } from '@/lib/hooks/useSummaryStatus';
import { ExportService } from '@/lib/services/exportService';
import toast from 'react-hot-toast';
import type { User } from '@supabase/supabase-js';
import type { ChatMessage } from '@/app/api/chat/route';

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const initializationRef = useRef(false);
  const router = useRouter();

  // Use summary status hook for realtime updates - pass conversation ID for per-conversation tracking
  const summaryStatus = useSummaryStatus(user?.id, currentConversationId);

  const { messages, sendMessage, setMessages } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
    onFinish: async ({ message }) => {
      setIsThinking(false);

      const conversationId =
        (message.metadata as { conversationId?: string })?.conversationId ||
        currentConversationId;

      // Assistant message is now created and updated in the backend
      // We only need to handle conversation titling here
      if (conversationId && isFirstMessage) {
        try {
          await autoTitleConversation(conversationId);
          setIsFirstMessage(false);
        } catch (error) {
          console.error('❌ Error auto-titling conversation:', error);
        }
      }
    },
  });

  useEffect(() => {
    const initializeConversation = async () => {
      if (initializationRef.current) return;
      initializationRef.current = true;
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          router.push('/signin?message=Please sign in to access the chat');
          return;
        }
        setUser(currentUser);

        const conversations = await getUserConversations();
        const persistedConversationId = sessionStorage.getItem(
          'currentConversationId',
        );

        if (
          persistedConversationId &&
          conversations.some(c => c.id === persistedConversationId)
        ) {
          setCurrentConversationId(persistedConversationId);
        } else if (conversations.length === 0) {
          const newConversationId = await createConversation();
          setCurrentConversationId(newConversationId);
          sessionStorage.setItem('currentConversationId', newConversationId);
        } else {
          sessionStorage.removeItem('currentConversationId');
          setCurrentConversationId(null);
        }
      } catch (error) {
        console.error('Error initializing conversation:', error);
        router.push('/signin');
      } finally {
        setLoading(false);
      }
    };

    initializeConversation();
  }, [router]);

  useEffect(() => {
    if (!currentConversationId) return;

    const loadMessages = async () => {
      const dbMessages = await getConversationMessages(currentConversationId);
      const chatMessages = dbMessages.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: msg.content }],
      }));
      setMessages(chatMessages as ChatMessage[]);
      setIsFirstMessage(dbMessages.length === 0);
    };

    loadMessages();

    const unsubscribe = subscribeToMessages(currentConversationId, updatedMessages => {
      const chatMessages = updatedMessages.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: msg.content }],
      }));
      setMessages(chatMessages as ChatMessage[]);
    });

    return unsubscribe;
  }, [currentConversationId, setMessages]);

  const handleSignOut = async () => {
    sessionStorage.removeItem('currentConversationId');
    await signOut();
    router.push('/');
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = await createConversation();
      setCurrentConversationId(conversationId);
    }

    const messageId = await addMessage({
      conversation_id: conversationId,
      role: 'user',
      content: input,
    });

    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    const userToken = session?.access_token;

    if (!userToken) {
      console.error('❌ No user token available');
      return;
    }

    setIsThinking(true);
    sendMessage(
      { text: input },
      {
        body: { conversationId, messageId },
        headers: { Authorization: `Bearer ${userToken}` },
      },
    );
    setInput('');
  };

  const handleConversationSelect = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    sessionStorage.setItem('currentConversationId', conversationId);
  };

  const handleNewConversation = async () => {
    const newConversationId = await createConversation();
    setCurrentConversationId(newConversationId);
    sessionStorage.setItem('currentConversationId', newConversationId);
    setMessages([]);
    setIsFirstMessage(true);
  };

  const handleExportReports = useCallback(async () => {
    try {
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { session } } = await supabaseClient.auth.getSession();
      const userToken = session?.access_token;

      if (!userToken) {
        toast.error('Please sign in to export reports');
        return;
      }

      await ExportService.exportReportsToExcel(userToken, currentConversationId);
      toast.success(currentConversationId 
        ? 'Conversation reports exported successfully!' 
        : 'All reports exported successfully!');
    } catch (error) {
      toast.error('Failed to export reports. Please try again.');
      console.error('Export error:', error);
    }
  }, [currentConversationId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#e8e8e8] to-[#d4d4d4] flex items-center justify-center">
        <div className="neumorphic-container p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="text-gray-700 ml-4">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-screen bg-gradient-to-br from-[#e8e8e8] to-[#d4d4d4] flex flex-col">
      {/* Summary Notification Component */}
      <SummaryNotification
        isProcessing={summaryStatus.isProcessing}
        processingCount={summaryStatus.processingCount}
        completedCount={summaryStatus.completedCount}
        lastCompletedAt={summaryStatus.lastCompletedAt}
        onExport={handleExportReports}
        resetCompletedCount={summaryStatus.resetCompletedCount}
      />
      
      <header className="bg-white/50 backdrop-blur-sm border-b border-gray-300 px-6 py-4">
        <nav className="flex justify-between items-center">
          <Link href="/">
            <div className="neumorphic-container px-6 py-3 cursor-pointer">
              <h1 className="text-2xl font-bold text-gray-700">
                SEC Summariser
              </h1>
            </div>
          </Link>
          <div className="flex items-center space-x-4">
            <div className="neumorphic-container px-4 py-2">
              <span className="text-sm text-gray-600">
                Welcome, {user.user_metadata?.first_name || user.email}
              </span>
            </div>
            <ExportButton
              availableSummaries={summaryStatus.availableSummaries}
              onExport={handleExportReports}
            />
            <button
              onClick={handleSignOut}
              className="neumorphic-button px-6 py-3 text-gray-700 font-medium"
            >
              Sign Out
            </button>
          </div>
        </nav>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <ConversationSidebar
          currentConversationId={currentConversationId}
          onConversationSelect={handleConversationSelect}
          onNewConversation={handleNewConversation}
        />

        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            {!currentConversationId ? (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <h3 className="text-2xl font-bold text-gray-800">
                    Welcome Back!
                  </h3>
                  <p className="text-gray-600 mt-2">
                    Select or start a conversation to analyze SEC filings.
                  </p>
                  <button
                    onClick={handleNewConversation}
                    className="neumorphic-button mt-6 px-8 py-4"
                  >
                    Start New Conversation
                  </button>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <h3 className="text-2xl font-bold text-gray-800">
                    SEC Filing Assistant
                  </h3>
                  <p className="text-gray-600 mt-2">
                    Ask questions about SEC filings to get started.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 max-w-4xl mx-auto">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] p-4 rounded-2xl ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'neumorphic-card bg-white'
                      }`}
                    >
                      {message.parts.map((part, i) => {
                        switch (part.type) {
                          case 'text':
                            // Enhanced text rendering for special content
                            const text = part.text;
                            
                            // Check if text contains SEC URL
                            const urlMatch = text.match(/(https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\S+)/);
                            
                            if (urlMatch) {
                              return (
                                <div key={`${message.id}-text-${i}`} className="space-y-4">
                                  <div className="prose prose-sm max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {text}
                                    </ReactMarkdown>
                                  </div>
                                  
                                  {/* Apple-simple URL display */}
                                  <div className="bg-white border border-gray-200 rounded-xl p-4 mt-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-4">
                                      <div className="flex-1 min-w-0">
                                        <code className="text-sm text-gray-600 break-all">
                                          {urlMatch[1]}
                                        </code>
                                      </div>
                                      <a
                                        href={urlMatch[1]}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 whitespace-nowrap"
                                      >
                                        Open Filing
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            
                            // Default text rendering
                            return (
                              <div
                                key={`${message.id}-text-${i}`}
                                className="prose prose-sm max-w-none"
                              >
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {part.text}
                                </ReactMarkdown>
                              </div>
                            );
                          case 'tool-researcher':
                            if (part.state === 'output-available') {
                              // Parse the tool output to extract filing information
                              let filingData = null;
                              try {
                                const output = typeof part.output === 'string' ? part.output : '';
                                const outputMatch = output.match(/Successfully retrieved and stored (\d+) filing\(s\).*?(\[.*\])$/);
                                if (outputMatch) {
                                  filingData = JSON.parse(outputMatch[2]);
                                }
                              } catch {
                                // Fallback to raw output
                              }

                              if (filingData && Array.isArray(filingData)) {
                                return (
                                  <div
                                    key={`${message.id}-researcher-${i}`}
                                    className="border-l-4 border-blue-500 bg-gray-50 p-4 my-3"
                                  >
                                    <p className="text-sm text-gray-700 mb-3">
                                      ✅ Retrieved {filingData.length} SEC filing{filingData.length > 1 ? 's' : ''}
                                    </p>
                                    
                                    <div className="space-y-3">
                                      {filingData.map((filing: {
                                        company: string;
                                        ticker?: string;
                                        cik: string;
                                        formType: string;
                                        filingDate: string;
                                        reportDate: string;
                                        accessionNumber?: string;
                                      }, idx: number) => (
                                        <div key={idx} className="bg-white rounded-lg p-4 border border-gray-100 shadow-sm">
                                          <div className="flex justify-between items-start mb-2">
                                            <div>
                                              <h4 className="font-semibold text-gray-900">{filing.company}</h4>
                                              <p className="text-sm text-gray-600">{filing.ticker ? `${filing.ticker} • ` : ''}{filing.cik}</p>
                                            </div>
                                            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                                              {filing.formType}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                              <span className="text-gray-500">Filing Date:</span>
                                              <p className="font-medium">{filing.filingDate}</p>
                                            </div>
                                            <div>
                                              <span className="text-gray-500">Report Date:</span>
                                              <p className="font-medium">{filing.reportDate}</p>
                                            </div>
                                          </div>
                                          {filing.accessionNumber && (
                                            <div className="mt-3 pt-3 border-t border-gray-100">
                                              <span className="text-xs text-gray-500">Accession: </span>
                                              <code className="text-xs bg-gray-100 px-2 py-1 rounded">{filing.accessionNumber}</code>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    
                                    <p className="text-xs text-gray-500 mt-3 italic">
                                      Stored in database for analysis
                                    </p>
                                  </div>
                                );
                              }
                            }
                            
                            // Simple loading state
                            return (
                              <div
                                key={`${message.id}-researcher-${i}`}
                                className="text-sm text-gray-600 italic py-2"
                              >
                                🔍 Searching SEC EDGAR database...
                              </div>
                            );
                          case 'tool-content_retriever':
                            if (part.state === 'output-available') {
                              // Parse the content retriever output to extract filing information
                              let filingInfo = null;
                              try {
                                const output = typeof part.output === 'string' ? part.output : '';
                                const filingMatch = output.match(/Found (\d+) stored report\(s\)\. Here are the details and full content:\s*([\s\S]*)/); 
                                if (filingMatch) {
                                  const jsonData = JSON.parse(filingMatch[2]);
                                  if (Array.isArray(jsonData) && jsonData.length > 0) {
                                    filingInfo = jsonData[0]; // Show first filing for UI
                                  }
                                }
                              } catch {
                                // Fallback to simple success message
                              }

                              return (
                                <div
                                  key={`${message.id}-content_retriever-${i}`}
                                  className="border-l-4 border-green-500 bg-gray-50 p-4 my-3"
                                >
                                  <p className="text-sm text-gray-700 mb-3">
                                    ✅ Content loaded for analysis
                                  </p>
                                  
                                  {filingInfo && (
                                    <div className="bg-white rounded-lg p-4 border border-gray-100 shadow-sm mb-4">
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <h4 className="font-semibold text-gray-900">{filingInfo.company}</h4>
                                          <p className="text-sm text-gray-600">{filingInfo.ticker ? `${filingInfo.ticker} • ` : ''}{filingInfo.cik}</p>
                                        </div>
                                        <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded">
                                          {filingInfo.form_type}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                          <span className="text-gray-500">Filing Date:</span>
                                          <p className="font-medium">{filingInfo.filing_date}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-500">Report Date:</span>
                                          <p className="font-medium">{filingInfo.report_date}</p>
                                        </div>
                                      </div>
                                      {filingInfo.accession_number && (
                                        <div className="mt-3 pt-3 border-t border-gray-100">
                                          <span className="text-xs text-gray-500">Accession: </span>
                                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">{filingInfo.accession_number}</code>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  <p className="text-xs text-gray-500 italic">
                                    Ready for AI analysis
                                  </p>
                                </div>
                              );
                            }
                            
                            return (
                              <div
                                key={`${message.id}-content_retriever-${i}`}
                                className="text-sm text-gray-600 italic py-2"
                              >
                                📄 Searching your database...
                              </div>
                            );
                          default:
                            return null;
                        }
                      })}
                    </div>
                  </div>
                ))}
                {isThinking && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] p-4 rounded-2xl neumorphic-card bg-white">
                      <div className="flex items-center space-x-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                        <span className="text-gray-600 text-sm">
                          AI is thinking...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-300 bg-white/30 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto flex space-x-4">
              <div
                className={`flex-1 neumorphic-container p-4 ${
                  !currentConversationId ? 'opacity-50' : ''
                }`}
              >
                <input
                  className="w-full bg-transparent outline-none text-gray-800"
                  placeholder={
                    currentConversationId
                      ? 'Ask about SEC filings...'
                      : 'Select a conversation'
                  }
                  value={input}
                  disabled={!currentConversationId}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={async event => {
                    if (
                      event.key === 'Enter' &&
                      input.trim() &&
                      currentConversationId
                    ) {
                      await handleSendMessage();
                    }
                  }}
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || !currentConversationId}
                className="neumorphic-button-primary px-6 py-4 text-white font-medium"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
