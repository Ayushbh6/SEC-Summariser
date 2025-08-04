import { supabase } from './supabase';
import type { Conversation, Message, CreateConversationRequest, AddMessageRequest } from '@/types/conversation';

// Get all conversations for the current user
export async function getUserConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  
  return data || [];
}

// Get token count for a specific conversation
export async function getConversationTokens(conversationId: string): Promise<number> {
  const { data, error } = await supabase
    .from('conversations')
    .select('tokens')
    .eq('id', conversationId)
    .single();
  
  if (error) {
    console.error('Error fetching conversation tokens:', error);
    return 0;
  }
  
  return data?.tokens || 0;
}

// Create a new conversation
export async function createConversation(request: CreateConversationRequest = {}): Promise<string> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: user.user.id,
      title: request.title || 'New Conversation'
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

// Get messages for a conversation
export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Add a message to a conversation
export async function addMessage(request: AddMessageRequest): Promise<string> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: request.conversation_id,
      role: request.role,
      content: request.content,
      metadata: request.metadata || {}
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

// Update conversation title
export async function updateConversationTitle(conversationId: string, title: string): Promise<void> {
  // Ensure we have an authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('conversations')
    .update({ 
      title,
      updated_at: new Date().toISOString()
    })
    .eq('id', conversationId)
    .eq('user_id', user.id) // Ensure we're updating our own conversation
    .select()
    .single();

  if (error) {
    console.error('Error updating conversation title:', error);
    throw error;
  }
  
  if (!data) {
    console.error('No conversation found or not authorized to update');
    throw new Error('Failed to update conversation title');
  }
  
  console.log('Successfully updated conversation title:', data);
}

// Delete a conversation
export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (error) throw error;
}

// Auto-generate conversation title from first message
export async function autoTitleConversation(conversationId: string): Promise<string | null> {
  // Get the first user message
  const { data: messages, error: messageError } = await supabase
    .from('messages')
    .select('content')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .order('created_at', { ascending: true })
    .limit(1);

  if (messageError) throw messageError;
  
  if (messages && messages.length > 0) {
    const firstMessage = messages[0].content;
    let newTitle = firstMessage.substring(0, 50);
    if (firstMessage.length > 50) {
      newTitle += '...';
    }
    
    // Update the conversation title
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ title: newTitle })
      .eq('id', conversationId);
    
    if (updateError) throw updateError;
    return newTitle;
  }
  
  return null;
}

// Subscribe to conversation changes
export function subscribeToConversations(callback: (conversations: Conversation[]) => void) {
  let timeoutId: NodeJS.Timeout;
  
  const channel = supabase
    .channel('conversations_changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'conversations'
    }, async (payload) => {
      console.log('🔄 Conversation change detected:', payload.eventType, payload.new || payload.old);
      
      // Debounce rapid changes
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        try {
          const conversations = await getUserConversations();
          console.log('✅ Updated conversations list:', conversations.length, 'conversations');
          callback(conversations);
        } catch (error) {
          console.error('Error fetching conversations:', error);
        }
      }, 100); // 100ms debounce
    })
    .subscribe((status) => {
      console.log('📡 Conversations subscription status:', status);
    });

  return () => {
    console.log('🔌 Unsubscribing from conversations changes');
    clearTimeout(timeoutId);
    supabase.removeChannel(channel);
  };
}

// Subscribe to messages in a conversation
export function subscribeToMessages(conversationId: string, callback: (messages: Message[]) => void) {
  const channel = supabase
    .channel(`messages_${conversationId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`
    }, async () => {
      try {
        const messages = await getConversationMessages(conversationId);
        callback(messages);
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}