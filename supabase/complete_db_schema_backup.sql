-- ============================================================================
-- SEC SUMMARISER - COMPLETE DATABASE SCHEMA BACKUP
-- ============================================================================
-- Generated: September 30, 2025
-- Database: https://ovgmwusuhfhywepghpra.supabase.co
-- 
-- This file contains the COMPLETE database structure including:
-- - Extensions
-- - Tables with all columns, types, defaults, constraints
-- - Indexes
-- - Foreign Keys
-- - Row Level Security (RLS) Policies
-- - Functions
-- - Triggers
-- 
-- To recreate the database, simply run this SQL file in order.
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_graphql" SCHEMA graphql;
CREATE EXTENSION IF NOT EXISTS "pg_net" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "supabase_vault" SCHEMA vault;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: conversations
-- Stores user conversations with the SEC research assistant
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Conversation'::text,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    tokens INTEGER DEFAULT 0,
    report_fetch_count INTEGER DEFAULT 0
);

COMMENT ON TABLE public.conversations IS 'Stores user conversations with the SEC research assistant';
COMMENT ON COLUMN public.conversations.report_fetch_count IS 'Tracks the total number of reports fetched in this conversation. Maximum allowed is 30 per conversation to prevent system overload.';

-- Table: messages
-- Stores individual messages within conversations
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.messages IS 'Stores individual messages within conversations';

-- Table: reports
-- Stores SEC report metadata and processing status
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    message_id UUID,
    tool_name TEXT NOT NULL DEFAULT 'research'::text,
    tool_parameters JSONB NOT NULL,
    tool_status TEXT NOT NULL CHECK (tool_status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'needs_clarification'::text])),
    company_cik TEXT,
    company_ticker TEXT,
    company_title TEXT,
    filing_accession_number TEXT,
    filing_date DATE,
    report_date DATE,
    form_type TEXT,
    filing_url TEXT,
    content_size INTEGER DEFAULT 0,
    has_content BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.reports IS 'Stores SEC report metadata and processing status';

-- Table: report_content
-- Stores the actual filing content and AI-generated summaries
CREATE TABLE IF NOT EXISTS public.report_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL,
    filing_content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'markdown'::text,
    content_size INTEGER GENERATED ALWAYS AS (length(filing_content)) STORED,
    created_at TIMESTAMPTZ DEFAULT now(),
    summary TEXT
);

COMMENT ON TABLE public.report_content IS 'Stores the actual filing content and AI-generated summaries';

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

ALTER TABLE public.messages
    ADD CONSTRAINT messages_conversation_id_fkey 
    FOREIGN KEY (conversation_id) 
    REFERENCES public.conversations(id) 
    ON DELETE CASCADE;

ALTER TABLE public.reports
    ADD CONSTRAINT reports_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

ALTER TABLE public.reports
    ADD CONSTRAINT reports_conversation_id_fkey 
    FOREIGN KEY (conversation_id) 
    REFERENCES public.conversations(id) 
    ON DELETE CASCADE;

ALTER TABLE public.reports
    ADD CONSTRAINT reports_message_id_fkey 
    FOREIGN KEY (message_id) 
    REFERENCES public.messages(id) 
    ON DELETE SET NULL;

ALTER TABLE public.report_content
    ADD CONSTRAINT report_content_report_id_fkey 
    FOREIGN KEY (report_id) 
    REFERENCES public.reports(id) 
    ON DELETE CASCADE;

-- ============================================================================
-- UNIQUE CONSTRAINTS
-- ============================================================================

-- Prevent duplicate filings per user
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_filing 
    ON public.reports (user_id, filing_accession_number);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Conversations indexes
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON public.conversations (user_id);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON public.conversations (updated_at DESC);

-- Messages indexes
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON public.messages (created_at);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at);

-- Reports indexes
CREATE INDEX IF NOT EXISTS reports_user_id_idx ON public.reports (user_id);
CREATE INDEX IF NOT EXISTS reports_conversation_id_idx ON public.reports (conversation_id);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON public.reports (created_at DESC);
CREATE INDEX IF NOT EXISTS reports_tool_status_idx ON public.reports (tool_status);
CREATE INDEX IF NOT EXISTS reports_company_cik_idx ON public.reports (company_cik);
CREATE INDEX IF NOT EXISTS reports_form_type_idx ON public.reports (form_type);
CREATE INDEX IF NOT EXISTS reports_filing_date_idx ON public.reports (filing_date DESC);

-- Report content indexes
CREATE INDEX IF NOT EXISTS report_content_report_id_idx ON public.report_content (report_id);
CREATE INDEX IF NOT EXISTS report_content_content_type_idx ON public.report_content (content_type);
CREATE INDEX IF NOT EXISTS report_content_size_idx ON public.report_content (content_size);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: update_conversations_updated_at
-- Automatically updates the updated_at timestamp for conversations
CREATE OR REPLACE FUNCTION public.update_conversations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Function: update_reports_updated_at
-- Automatically updates the updated_at timestamp for reports
CREATE OR REPLACE FUNCTION public.update_reports_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Function: update_conversation_on_message_change
-- Updates conversation timestamp when messages are added/updated/deleted
CREATE OR REPLACE FUNCTION public.update_conversation_on_message_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE conversations 
    SET updated_at = NOW() 
    WHERE id = COALESCE(NEW.conversation_id, OLD.conversation_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Function: update_report_content_tracking
-- Updates report metadata when content is added
CREATE OR REPLACE FUNCTION public.update_report_content_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE reports 
    SET 
        has_content = true,
        content_size = NEW.content_size,
        updated_at = NOW()
    WHERE id = NEW.report_id;
    
    RETURN NEW;
END;
$$;

-- Function: handle_report_content_deletion
-- Updates report metadata when content is deleted
CREATE OR REPLACE FUNCTION public.handle_report_content_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM report_content WHERE report_id = OLD.report_id) THEN
        UPDATE reports 
        SET 
            has_content = false,
            content_size = 0,
            updated_at = NOW()
        WHERE id = OLD.report_id;
    END IF;
    
    RETURN OLD;
END;
$$;

-- Function: create_conversation
-- Helper function to create a new conversation
CREATE OR REPLACE FUNCTION public.create_conversation(
    user_uuid UUID, 
    conversation_title TEXT DEFAULT 'New Conversation'::text
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_conversation_id UUID;
BEGIN
    INSERT INTO conversations (user_id, title)
    VALUES (user_uuid, conversation_title)
    RETURNING id INTO new_conversation_id;
    
    RETURN new_conversation_id;
END;
$$;

-- Function: add_message
-- Helper function to add a message to a conversation with security checks
CREATE OR REPLACE FUNCTION public.add_message(
    conversation_uuid UUID, 
    message_role TEXT, 
    message_content TEXT, 
    message_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_message_id UUID;
    conversation_owner UUID;
BEGIN
    -- Verify the conversation belongs to the current user
    SELECT user_id INTO conversation_owner
    FROM conversations
    WHERE id = conversation_uuid;
    
    IF conversation_owner != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: conversation does not belong to current user';
    END IF;
    
    -- Insert the message
    INSERT INTO messages (conversation_id, role, content, metadata)
    VALUES (conversation_uuid, message_role, message_content, message_metadata)
    RETURNING id INTO new_message_id;
    
    RETURN new_message_id;
END;
$$;

-- Function: auto_title_conversation
-- Automatically generates a conversation title from the first user message
CREATE OR REPLACE FUNCTION public.auto_title_conversation(conversation_uuid UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    first_user_message TEXT;
    new_title TEXT;
BEGIN
    -- Get the first user message
    SELECT content INTO first_user_message
    FROM messages
    WHERE conversation_id = conversation_uuid 
      AND role = 'user'
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF first_user_message IS NOT NULL THEN
        -- Create a title from first 50 characters
        new_title := LEFT(first_user_message, 50);
        IF LENGTH(first_user_message) > 50 THEN
            new_title := new_title || '...';
        END IF;
        
        -- Update the conversation title
        UPDATE conversations
        SET title = new_title
        WHERE id = conversation_uuid AND user_id = auth.uid();
        
        RETURN new_title;
    END IF;
    
    RETURN NULL;
END;
$$;

-- Function: get_user_conversations
-- Retrieves all conversations for a user with message counts and last message
CREATE OR REPLACE FUNCTION public.get_user_conversations(user_uuid UUID)
RETURNS TABLE(
    id UUID, 
    title TEXT, 
    created_at TIMESTAMPTZ, 
    updated_at TIMESTAMPTZ, 
    message_count BIGINT, 
    last_message_content TEXT, 
    last_message_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        COALESCE(msg_count.count, 0) as message_count,
        last_msg.content as last_message_content,
        last_msg.created_at as last_message_created_at
    FROM conversations c
    LEFT JOIN (
        SELECT 
            conversation_id, 
            COUNT(*) as count
        FROM messages 
        GROUP BY conversation_id
    ) msg_count ON c.id = msg_count.conversation_id
    LEFT JOIN (
        SELECT DISTINCT ON (conversation_id)
            conversation_id,
            content,
            created_at
        FROM messages
        ORDER BY conversation_id, created_at DESC
    ) last_msg ON c.id = last_msg.conversation_id
    WHERE c.user_id = user_uuid
    ORDER BY c.updated_at DESC;
END;
$$;

-- Function: create_report_with_content
-- Creates a report with optional content in a single transaction
CREATE OR REPLACE FUNCTION public.create_report_with_content(
    p_user_id UUID,
    p_conversation_id UUID,
    p_message_id UUID,
    p_tool_parameters JSONB,
    p_company_cik TEXT DEFAULT NULL,
    p_company_ticker TEXT DEFAULT NULL,
    p_company_title TEXT DEFAULT NULL,
    p_filing_accession_number TEXT DEFAULT NULL,
    p_filing_date DATE DEFAULT NULL,
    p_report_date DATE DEFAULT NULL,
    p_form_type TEXT DEFAULT NULL,
    p_filing_url TEXT DEFAULT NULL,
    p_filing_content TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    report_id UUID;
BEGIN
    -- Insert the report metadata
    INSERT INTO reports (
        user_id,
        conversation_id,
        message_id,
        tool_parameters,
        tool_status,
        company_cik,
        company_ticker,
        company_title,
        filing_accession_number,
        filing_date,
        report_date,
        form_type,
        filing_url
    ) VALUES (
        p_user_id,
        p_conversation_id,
        p_message_id,
        p_tool_parameters,
        CASE WHEN p_filing_content IS NOT NULL THEN 'completed' ELSE 'pending' END,
        p_company_cik,
        p_company_ticker,
        p_company_title,
        p_filing_accession_number,
        p_filing_date,
        p_report_date,
        p_form_type,
        p_filing_url
    )
    RETURNING id INTO report_id;
    
    -- Insert content if provided
    IF p_filing_content IS NOT NULL THEN
        INSERT INTO report_content (
            report_id,
            filing_content
        ) VALUES (
            report_id,
            p_filing_content
        );
    END IF;
    
    RETURN report_id;
END;
$$;

-- Function: get_report_with_content
-- Retrieves a report with its content (with security check)
CREATE OR REPLACE FUNCTION public.get_report_with_content(p_report_id UUID)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    conversation_id UUID,
    message_id UUID,
    tool_name TEXT,
    tool_parameters JSONB,
    tool_status TEXT,
    company_cik TEXT,
    company_ticker TEXT,
    company_title TEXT,
    filing_accession_number TEXT,
    filing_date DATE,
    report_date DATE,
    form_type TEXT,
    filing_url TEXT,
    has_content BOOLEAN,
    content_size INTEGER,
    filing_content TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.user_id,
        r.conversation_id,
        r.message_id,
        r.tool_name,
        r.tool_parameters,
        r.tool_status,
        r.company_cik,
        r.company_ticker,
        r.company_title,
        r.filing_accession_number,
        r.filing_date,
        r.report_date,
        r.form_type,
        r.filing_url,
        r.has_content,
        r.content_size,
        rc.filing_content,
        r.created_at,
        r.updated_at
    FROM reports r
    LEFT JOIN report_content rc ON r.id = rc.report_id
    WHERE r.id = p_report_id
    AND r.user_id = auth.uid();
END;
$$;

-- Function: get_reports_needing_summary
-- Retrieves reports that need AI summarization
CREATE OR REPLACE FUNCTION public.get_reports_needing_summary(p_user_id UUID)
RETURNS TABLE(
    report_id UUID, 
    filing_content TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT rc.report_id, rc.filing_content
    FROM public.report_content rc
    INNER JOIN public.reports r ON rc.report_id = r.id
    WHERE rc.summary IS NULL
      AND r.user_id = p_user_id
    LIMIT 10; -- Process max 10 at a time to avoid timeouts
END;
$$;

-- Function: update_report_summary
-- Updates the summary for a report (called by external service)
CREATE OR REPLACE FUNCTION public.update_report_summary(
    p_report_id UUID, 
    p_summary TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result JSON;
    v_rows_updated INTEGER;
BEGIN
    -- Validate inputs
    IF p_report_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'report_id cannot be null'
        );
    END IF;
    
    IF p_summary IS NULL OR trim(p_summary) = '' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'summary cannot be null or empty'
        );
    END IF;
    
    -- Update the summary
    UPDATE report_content
    SET summary = p_summary
    WHERE report_id = p_report_id
      AND summary IS NULL;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    -- Build result
    IF v_rows_updated > 0 THEN
        v_result := json_build_object(
            'success', true,
            'message', 'Summary updated successfully',
            'report_id', p_report_id,
            'rows_updated', v_rows_updated
        );
    ELSE
        IF EXISTS (SELECT 1 FROM report_content WHERE report_id = p_report_id) THEN
            v_result := json_build_object(
                'success', false,
                'error', 'Report already has a summary',
                'report_id', p_report_id
            );
        ELSE
            v_result := json_build_object(
                'success', false,
                'error', 'Report not found',
                'report_id', p_report_id
            );
        END IF;
    END IF;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error updating summary for report %: %', p_report_id, SQLERRM;
        RETURN json_build_object(
            'success', false,
            'error', 'An error occurred while updating the summary',
            'details', SQLERRM
        );
END;
$$;

-- Function: test_generate_summary (for testing)
CREATE OR REPLACE FUNCTION public.test_generate_summary(target_record_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  record_data RECORD;
  result TEXT;
BEGIN
  SELECT * INTO record_data FROM report_content WHERE id = target_record_id;
  
  IF NOT FOUND THEN
    RETURN 'Record not found';
  END IF;
  
  SELECT content INTO result FROM net.http_post(
    url := 'https://ovgmwusuhfhywepghpra.supabase.co/functions/v1/generate-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := jsonb_build_object(
      'record', to_jsonb(record_data)
    )
  );
  
  RETURN coalesce(result, 'Function called successfully');
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: conversations_update_updated_at
-- Updates the updated_at timestamp when a conversation is modified
CREATE TRIGGER conversations_update_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversations_updated_at();

-- Trigger: reports_update_updated_at
-- Updates the updated_at timestamp when a report is modified
CREATE TRIGGER reports_update_updated_at
    BEFORE UPDATE ON public.reports
    FOR EACH ROW
    EXECUTE FUNCTION update_reports_updated_at();

-- Trigger: messages_update_conversation_timestamp
-- Updates conversation timestamp when messages change
CREATE TRIGGER messages_update_conversation_timestamp
    AFTER INSERT OR UPDATE OR DELETE ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_on_message_change();

-- Trigger: report_content_update_tracking
-- Updates report metadata when content is added/updated
CREATE TRIGGER report_content_update_tracking
    AFTER INSERT OR UPDATE ON public.report_content
    FOR EACH ROW
    EXECUTE FUNCTION update_report_content_tracking();

-- Trigger: report_content_handle_deletion
-- Updates report metadata when content is deleted
CREATE TRIGGER report_content_handle_deletion
    AFTER DELETE ON public.report_content
    FOR EACH ROW
    EXECUTE FUNCTION handle_report_content_deletion();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_content ENABLE ROW LEVEL SECURITY;

-- Conversations Policies
CREATE POLICY "Users can view their own conversations"
    ON public.conversations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations"
    ON public.conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
    ON public.conversations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
    ON public.conversations FOR DELETE
    USING (auth.uid() = user_id);

-- Messages Policies
CREATE POLICY "Users can view messages from their own conversations"
    ON public.messages FOR SELECT
    USING (conversation_id IN (
        SELECT id FROM conversations WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert messages to their own conversations"
    ON public.messages FOR INSERT
    WITH CHECK (conversation_id IN (
        SELECT id FROM conversations WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update messages in their own conversations"
    ON public.messages FOR UPDATE
    USING (conversation_id IN (
        SELECT id FROM conversations WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can delete messages from their own conversations"
    ON public.messages FOR DELETE
    USING (conversation_id IN (
        SELECT id FROM conversations WHERE user_id = auth.uid()
    ));

-- Reports Policies
CREATE POLICY "Users can view their own reports"
    ON public.reports FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reports"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reports"
    ON public.reports FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports"
    ON public.reports FOR DELETE
    USING (auth.uid() = user_id);

-- Report Content Policies
CREATE POLICY "Users can view content for their own reports"
    ON public.report_content FOR SELECT
    USING (report_id IN (
        SELECT id FROM reports WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert content for their own reports"
    ON public.report_content FOR INSERT
    WITH CHECK (report_id IN (
        SELECT id FROM reports WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update their own report content"
    ON public.report_content FOR UPDATE
    USING (report_id IN (
        SELECT id FROM reports WHERE user_id = auth.uid()
    ))
    WITH CHECK (report_id IN (
        SELECT id FROM reports WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can delete content for their own reports"
    ON public.report_content FOR DELETE
    USING (report_id IN (
        SELECT id FROM reports WHERE user_id = auth.uid()
    ));

-- Service Policies (for external summary generation service)
CREATE POLICY "Service can read records for summary generation"
    ON public.report_content FOR SELECT
    USING (summary IS NULL);

CREATE POLICY "Service can update summaries"
    ON public.report_content FOR UPDATE
    USING (summary IS NULL)
    WITH CHECK (true);

-- ============================================================================
-- REALTIME (Enable realtime for report_content table)
-- ============================================================================

-- Enable realtime for report_content updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.report_content;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

-- Summary:
-- ✓ 4 Tables (conversations, messages, reports, report_content)
-- ✓ 20 Indexes (for query performance)
-- ✓ 6 Foreign Key Constraints (with CASCADE deletes)
-- ✓ 13 Functions (helper and trigger functions)
-- ✓ 5 Triggers (auto-updating timestamps and tracking)
-- ✓ 18 RLS Policies (complete security)
-- ✓ Realtime enabled on report_content
-- ✓ All extensions configured
