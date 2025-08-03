'use client';

import { useState, useEffect } from 'react';
import { Conversation } from '@/types/conversation';
import { getUserConversations, createConversation, updateConversationTitle, deleteConversation, subscribeToConversations } from '@/lib/conversations';

interface ConversationSidebarProps {
  currentConversationId: string | null;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
}

export default function ConversationSidebar({ 
  currentConversationId, 
  onConversationSelect, 
  onNewConversation 
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
      <div className="w-80 bg-gray-100 border-r border-gray-300 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-gray-100 border-r border-gray-300 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-300">
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
          <div className="p-4 text-center text-gray-500">
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
                    ? 'bg-blue-50 border-blue-200'
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => !editingId && onConversationSelect(conversation.id)}
              >
                {editingId === conversation.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm"
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
                        className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs bg-gray-400 text-white px-2 py-1 rounded hover:bg-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-800 truncate text-sm">
                          {conversation.title}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDate(conversation.updated_at)}
                        </p>
                        {conversation.last_message_content && (
                          <p className="text-xs text-gray-400 mt-1 truncate">
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
                          className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700"
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
                          className="p-1 hover:bg-red-100 rounded text-gray-500 hover:text-red-600"
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