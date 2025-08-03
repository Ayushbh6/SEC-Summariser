import { google } from '@ai-sdk/google';
import { streamText, convertToCoreMessages } from 'ai';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 30;

export async function POST(req: Request) {
  console.log('🚀 Chat API route called');
  
  // Get the authorization header with user's JWT token
  const authorization = req.headers.get('Authorization');
  const token = authorization?.split(' ')[1]; // Extract Bearer token
  
  if (!token) {
    return new Response(JSON.stringify({ error: 'Authorization token required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Create authenticated Supabase client using user's JWT token
  const authenticatedSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  );
  
  const { messages, conversationId } = await req.json();
  console.log('📩 Received messages:', messages.length, 'messages');
  console.log('💬 Last message:', messages[messages.length - 1]);
  console.log('🆔 Conversation ID received:', conversationId);

  // Convert UI messages to core messages format
  const coreMessages = convertToCoreMessages(messages);
  console.log('🔄 Converted to core messages format');

  const result = await streamText({
    model: google('gemini-2.5-flash'),
    system: 'You are a helpful AI assistant. You provide clear, accurate, and helpful responses.',
    messages: coreMessages,
    onFinish: async (finishResult) => {
      console.log('✅ Stream finished');
      console.log('📊 Token usage:', finishResult.usage);
      console.log('🔤 Total tokens:', finishResult.usage?.totalTokens || 'Unknown');
      console.log('📝 Final text length:', finishResult.text?.length || 0, 'characters');
      
      // Update conversation token count
      if (conversationId && finishResult.usage?.totalTokens) {
        console.log('🔄 Attempting to update tokens for conversation:', conversationId);
        try {
          const { error } = await authenticatedSupabase
            .from('conversations')
            .update({ 
              tokens: finishResult.usage.totalTokens,
              updated_at: new Date().toISOString()
            })
            .eq('id', conversationId);
          
          if (error) {
            console.error('❌ Error updating conversation tokens:', error);
          } else {
            console.log('✅ Updated conversation tokens:', finishResult.usage.totalTokens);
          }
        } catch (error) {
          console.error('❌ Failed to update conversation tokens:', error);
        }
      }
    },
  });

  console.log('📤 Starting to stream response...');
  return result.toUIMessageStreamResponse({
    messageMetadata: () => ({
      conversationId: conversationId,
    }),
  });
}
