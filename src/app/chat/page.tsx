'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useEffect, useRef } from 'react';
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
                            return (
                              <div
                                key={`${message.id}-text`}
                                className="prose prose-sm max-w-none"
                              >
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {part.text}
                                </ReactMarkdown>
                              </div>
                            );
                          case 'tool-researcher':
                            return (
                              <div
                                key={`${message.id}-researcher-${i}`}
                                className="mt-4 bg-gray-50 p-4 rounded-lg"
                              >
                                <h4 className="font-semibold text-gray-800 mb-2">
                                  SEC Filing Results:
                                </h4>
                                <pre className="text-sm overflow-x-auto text-gray-600">
                                  {JSON.stringify(part, null, 2)}
                                </pre>
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
