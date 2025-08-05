'use client';

import { useState, useEffect } from 'react';
import { Conversation } from '@/types/conversation';
import { getUserConversations, updateConversationTitle, deleteConversation, subscribeToConversations } from '@/lib/conversations';

interface ConversationSidebarProps {
  currentConversationId: string | null;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function ConversationSidebar({ 
  currentConversationId, 
  onConversationSelect, 
  onNewConversation,
  isCollapsed = false,
  onToggleCollapse
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    loadConversations();
    
    // Subscribe to real-time updates
    const unsubscribe = subscribeToConversations(setConversations);
    return unsubscribe;
  }, []);

  const loadConversations = async () => {
    try {
      const data = await getUserConversations();
      setConversations(data);
    } catch (error) {
      console.error('Error loading conversations:', error);
      // Set conversations to empty array on error to prevent crash
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewConversation = async () => {
    // Just call the parent handler - it will handle creation and persistence
    onNewConversation();
  };

  const handleRename = async (conversationId: string, newTitle: string) => {
    try {
      await updateConversationTitle(conversationId, newTitle);
      setEditingId(null);
      loadConversations(); // Refresh list
    } catch (error) {
      console.error('Error renaming conversation:', error);
    }
  };

  const handleDelete = async (conversationId: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    
    try {
      await deleteConversation(conversationId);
      if (currentConversationId === conversationId) {
        // Clear session storage if deleting current conversation
        sessionStorage.removeItem('currentConversationId');
        onNewConversation(); // Reset to new conversation
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const startEditing = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div className="w-80 bg-[var(--card-bg)] border-r border-[var(--border-color)] flex items-center justify-center">
        <div className="text-[var(--foreground-secondary)]">Loading...</div>
      </div>
    );
  }

  // Collapsed view - just show a thin sidebar with toggle button
  if (isCollapsed) {
    return (
      <div className="w-12 bg-[var(--card-bg)] border-r border-[var(--border-color)] flex flex-col h-full">
        <button
          onClick={onToggleCollapse}
          className="p-3 hover:bg-[var(--neumorphic-bg)] transition-colors"
          title="Expand sidebar"
        >
          <svg className="w-6 h-6 text-[var(--foreground-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-[var(--card-bg)] border-r border-[var(--border-color)] flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-color)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[var(--foreground)]">Conversations</h2>
          <button
            onClick={onToggleCollapse}
            className="p-1 hover:bg-[var(--neumorphic-bg)] rounded transition-colors"
            title="Collapse sidebar"
          >
            <svg className="w-5 h-5 text-[var(--foreground-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <button
          onClick={handleNewConversation}
          className="w-full neumorphic-button-primary py-3 px-4 text-white font-medium rounded-lg transition-all duration-200 hover:neumorphic-pressed flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Conversation
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-[var(--foreground-secondary)]">
            <p>No conversations yet</p>
            <p className="text-sm mt-1">Start a new conversation to begin</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group relative neumorphic-container p-3 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  currentConversationId === conversation.id
                    ? 'bg-blue-600/10 dark:bg-blue-400/10 border-blue-600 dark:border-blue-400'
                    : 'hover:bg-[var(--neumorphic-bg)]'
                }`}
                onClick={() => !editingId && onConversationSelect(conversation.id)}
              >
                {editingId === conversation.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] text-[var(--foreground)] rounded px-2 py-1 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRename(conversation.id, editTitle);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRename(conversation.id, editTitle)}
                        className="text-xs bg-blue-600 dark:bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-700 dark:hover:bg-blue-600"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs bg-gray-400 dark:bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-500 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-[var(--foreground)] truncate text-sm">
                          {conversation.title}
                        </h3>
                        <p className="text-xs text-[var(--foreground-secondary)] mt-1">
                          {formatDate(conversation.updated_at)}
                        </p>
                        {conversation.last_message_content && (
                          <p className="text-xs text-[var(--foreground-secondary)] opacity-70 mt-1 truncate">
                            {conversation.last_message_content}
                          </p>
                        )}
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(conversation);
                          }}
                          className="p-1 hover:bg-[var(--neumorphic-bg)] rounded text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
                          title="Rename"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(conversation.id);
                          }}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-[var(--foreground-secondary)] hover:text-red-600 dark:hover:text-red-400"
                          title="Delete"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}