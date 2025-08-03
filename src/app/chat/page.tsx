'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, signOut } from '@/lib/supabase';
import { getConversationMessages, addMessage, autoTitleConversation, subscribeToMessages, createConversation, getUserConversations } from '@/lib/conversations';
import ConversationSidebar from '@/components/ConversationSidebar';
import type { User } from '@supabase/supabase-js';
import type { Message } from '@/types/conversation';

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const router = useRouter();
  
  const { messages, sendMessage, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
    onFinish: async ({ message }) => {
      // Save AI response to database
      if (currentConversationId && message.parts) {
        const textContent = message.parts
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join('');
        
        if (textContent) {
          try {
            await addMessage({
              conversation_id: currentConversationId,
              role: 'assistant',
              content: textContent,
            });
          
            // Auto-title conversation if this is the first exchange
            if (isFirstMessage) {
              await autoTitleConversation(currentConversationId);
              setIsFirstMessage(false);
            }
          } catch (error) {
            console.error('Error saving AI response:', error);
          }
        }
      }
    },
  });

  // Initialize conversation state management
  useEffect(() => {
    const initializeConversation = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          router.push('/signin?message=Please sign in to access the chat');
          return;
        }
        setUser(currentUser);
        
        // Load conversations to determine state
        const conversations = await getUserConversations();
        setConversationsLoaded(true);
        
        // Check for persisted conversation in sessionStorage (survives refresh/tab switch)
        const persistedConversationId = sessionStorage.getItem('currentConversationId');
        
        if (persistedConversationId && conversations.some((c: any) => c.id === persistedConversationId)) {
          // Continue with existing conversation if it exists and is valid
          setCurrentConversationId(persistedConversationId);
        } else if (conversations.length === 0) {
          // No conversations exist - auto-create new one
          const newConversationId = await createConversation();
          setCurrentConversationId(newConversationId);
          sessionStorage.setItem('currentConversationId', newConversationId);
        } else {
          // User has conversations but no valid persisted one - start fresh
          const newConversationId = await createConversation();
          setCurrentConversationId(newConversationId);
          sessionStorage.setItem('currentConversationId', newConversationId);
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

  // Load conversation messages when conversation changes
  useEffect(() => {
    if (!currentConversationId) return;

    const loadMessages = async () => {
      try {
        const dbMessages = await getConversationMessages(currentConversationId);
        setConversationMessages(dbMessages);
        
        // Convert DB messages to chat format
        const chatMessages = dbMessages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          parts: [{ type: 'text' as const, text: msg.content }],
        }));
        setMessages(chatMessages as any);
        
        setIsFirstMessage(dbMessages.length === 0);
      } catch (error) {
        console.error('Error loading messages:', error);
      }
    };

    loadMessages();

    // Subscribe to real-time message updates
    const unsubscribe = subscribeToMessages(currentConversationId, (updatedMessages) => {
      setConversationMessages(updatedMessages);
    });

    return unsubscribe;
  }, [currentConversationId, setMessages]);

  const handleSignOut = async () => {
    try {
      // Clear conversation state on sign out
      sessionStorage.removeItem('currentConversationId');
      localStorage.removeItem('currentConversationId'); // Also clear any localStorage if used
      
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Create new conversation if needed
    let conversationId = currentConversationId;
    if (!conversationId) {
      try {
        conversationId = await createConversation();
        setCurrentConversationId(conversationId);
      } catch (error) {
        console.error('Error creating conversation:', error);
        return;
      }
    }

    // Save user message to database
    try {
      await addMessage({
        conversation_id: conversationId,
        role: 'user',
        content: input,
      });
    } catch (error) {
      console.error('Error saving user message:', error);
    }

    // Send message to AI
    sendMessage({ text: input });
    setInput('');
  };

  const handleConversationSelect = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    // Persist conversation selection across refresh/tab switch
    sessionStorage.setItem('currentConversationId', conversationId);
  };

  const handleNewConversation = async () => {
    try {
      // Create new conversation immediately
      const newConversationId = await createConversation();
      setCurrentConversationId(newConversationId);
      sessionStorage.setItem('currentConversationId', newConversationId);
      
      // Clear current messages
      setMessages([]);
      setConversationMessages([]);
      setIsFirstMessage(true);
    } catch (error) {
      console.error('Error creating new conversation:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#e8e8e8] to-[#d4d4d4] flex items-center justify-center">
        <div className="neumorphic-container p-8">
          <div className="flex items-center space-x-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="text-gray-700">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to signin
  }

  return (
    <div className="h-screen bg-gradient-to-br from-[#e8e8e8] to-[#d4d4d4] flex flex-col">
      {/* Header */}
      <header className="bg-white/50 backdrop-blur-sm border-b border-gray-300 px-6 py-4">
        <nav className="flex justify-between items-center">
          <Link href="/">
            <div className="neumorphic-container px-6 py-3 cursor-pointer">
              <h1 className="text-2xl font-bold text-gray-700">SEC Summariser</h1>
            </div>
          </Link>
          
          <div className="flex items-center space-x-4">
            <div className="neumorphic-container px-4 py-2">
              <span className="text-sm text-gray-600">Welcome, {user.user_metadata?.first_name || user.email}</span>
            </div>
            <button 
              onClick={handleSignOut}
              className="neumorphic-button px-6 py-3 text-gray-700 font-medium transition-all duration-200 hover:neumorphic-pressed"
            >
              Sign Out
            </button>
          </div>
        </nav>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <ConversationSidebar
          currentConversationId={currentConversationId}
          onConversationSelect={handleConversationSelect}
          onNewConversation={handleNewConversation}
        />

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-6 max-w-2xl">
                  <div className="neumorphic-icon w-20 h-20 mx-auto flex items-center justify-center">
                    <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-3">SEC Filing Assistant</h3>
                    <p className="text-gray-600 mb-6">
                      Ask questions about SEC filings, get detailed company information, and analyze regulatory documents.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button 
                      onClick={() => setInput("Get me the latest 10-K for Apple")}
                      className="neumorphic-button p-4 text-left text-gray-700 hover:text-blue-600"
                    >
                      <div className="font-medium">Apple 10-K Report</div>
                      <div className="text-sm text-gray-500">Latest annual filing</div>
                    </button>
                    <button 
                      onClick={() => setInput("Show me Microsoft's recent 10-Q filings")}
                      className="neumorphic-button p-4 text-left text-gray-700 hover:text-blue-600"
                    >
                      <div className="font-medium">Microsoft Quarterly Reports</div>
                      <div className="text-sm text-gray-500">Recent 10-Q filings</div>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 max-w-4xl mx-auto">
                {messages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 rounded-2xl ${
                      message.role === 'user' 
                        ? 'bg-blue-600 text-white' 
                        : 'neumorphic-card bg-white'
                    }`}>
                      {message.parts?.map((part: any, i: number) => {
                        switch (part.type) {
                          case 'text':
                            return (
                              <div key={`${message.id}-text`} className="whitespace-pre-wrap">
                                {part.text}
                              </div>
                            );
                          case 'tool-research':
                            return (
                              <div key={`${message.id}-research-${i}`} className="mt-4">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                  <h4 className="font-semibold text-gray-800 mb-2">SEC Filing Results:</h4>
                                  <pre className="text-sm overflow-x-auto text-gray-600">
                                    {JSON.stringify(part, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            );
                          default:
                            return null;
                        }
                      }) || (
                        <div className="whitespace-pre-wrap">
                          {message.parts?.filter(part => part.type === 'text').map(part => part.text).join('') || ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-6 border-t border-gray-300 bg-white/30 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto flex space-x-4">
              <div className="flex-1 neumorphic-container p-4">
                <input
                  className="w-full bg-transparent outline-none text-gray-800 placeholder-gray-500"
                  placeholder="Ask about SEC filings... (e.g., 'Get Apple's latest 10-K')"
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={async event => {
                    if (event.key === 'Enter' && input.trim()) {
                      await handleSendMessage();
                    }
                  }}
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!input.trim()}
                className="neumorphic-button-primary px-6 py-4 text-white font-medium transition-all duration-200 hover:neumorphic-pressed disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}