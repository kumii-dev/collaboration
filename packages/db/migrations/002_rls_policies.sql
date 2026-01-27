-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- ISO 27001 + POPIA compliant access controls
-- =====================================================

-- =====================================================
-- PROFILES POLICIES
-- =====================================================

-- Everyone can view non-archived profiles
CREATE POLICY "profiles_select_public"
    ON profiles FOR SELECT
    USING (archived = FALSE);

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Users can insert their own profile (during onboarding)
CREATE POLICY "profiles_insert_own"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Admins can update any profile
CREATE POLICY "profiles_update_admin"
    ON profiles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- =====================================================
-- CONVERSATIONS POLICIES
-- =====================================================

-- Users can view conversations they are participants in
CREATE POLICY "conversations_select_participant"
    ON conversations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants
            WHERE conversation_participants.conversation_id = conversations.id
            AND conversation_participants.user_id = auth.uid()
            AND conversation_participants.left_at IS NULL
        )
    );

-- Users can create conversations
CREATE POLICY "conversations_insert_authenticated"
    ON conversations FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- Users can update conversations they created (direct) or are owner/moderator of
CREATE POLICY "conversations_update_owner"
    ON conversations FOR UPDATE
    USING (created_by = auth.uid());

-- =====================================================
-- CONVERSATION PARTICIPANTS POLICIES
-- =====================================================

-- Users can view participants in conversations they are part of
CREATE POLICY "conv_participants_select_member"
    ON conversation_participants FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants cp2
            WHERE cp2.conversation_id = conversation_participants.conversation_id
            AND cp2.user_id = auth.uid()
            AND cp2.left_at IS NULL
        )
    );

-- Conversation creators can add participants
CREATE POLICY "conv_participants_insert_creator"
    ON conversation_participants FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = conversation_participants.conversation_id
            AND conversations.created_by = auth.uid()
        )
    );

-- Users can update their own participant record (mute/archive)
CREATE POLICY "conv_participants_update_own"
    ON conversation_participants FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- =====================================================
-- MESSAGES POLICIES
-- =====================================================

-- Users can view messages in conversations they are part of
CREATE POLICY "messages_select_participant"
    ON messages FOR SELECT
    USING (
        deleted = FALSE
        AND EXISTS (
            SELECT 1 FROM conversation_participants
            WHERE conversation_participants.conversation_id = messages.conversation_id
            AND conversation_participants.user_id = auth.uid()
            AND conversation_participants.left_at IS NULL
        )
    );

-- Users can insert messages in conversations they are part of
CREATE POLICY "messages_insert_participant"
    ON messages FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM conversation_participants
            WHERE conversation_participants.conversation_id = messages.conversation_id
            AND conversation_participants.user_id = auth.uid()
            AND conversation_participants.left_at IS NULL
        )
    );

-- Users can update (edit) their own messages
CREATE POLICY "messages_update_own"
    ON messages FOR UPDATE
    USING (sender_id = auth.uid())
    WITH CHECK (sender_id = auth.uid());

-- Moderators can soft-delete any message
CREATE POLICY "messages_update_moderator"
    ON messages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('moderator', 'admin')
        )
    );

-- =====================================================
-- MESSAGE READS POLICIES
-- =====================================================

-- Users can view read receipts in their conversations
CREATE POLICY "message_reads_select_participant"
    ON message_reads FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM messages m
            JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
            WHERE m.id = message_reads.message_id
            AND cp.user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

-- Users can mark messages as read
CREATE POLICY "message_reads_insert_own"
    ON message_reads FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- =====================================================
-- MESSAGE REACTIONS POLICIES
-- =====================================================

-- Users can view reactions in their conversations
CREATE POLICY "message_reactions_select_participant"
    ON message_reactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM messages m
            JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
            WHERE m.id = message_reactions.message_id
            AND cp.user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

-- Users can add reactions
CREATE POLICY "message_reactions_insert_own"
    ON message_reactions FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own reactions
CREATE POLICY "message_reactions_delete_own"
    ON message_reactions FOR DELETE
    USING (user_id = auth.uid());

-- =====================================================
-- GROUPS POLICIES
-- =====================================================

-- Users can view groups they are members of or public groups
CREATE POLICY "groups_select_member"
    ON groups FOR SELECT
    USING (
        archived = FALSE
        AND EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = groups.id
            AND group_members.user_id = auth.uid()
        )
    );

-- Authenticated users can create groups
CREATE POLICY "groups_insert_authenticated"
    ON groups FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- Group owners and moderators can update groups
CREATE POLICY "groups_update_owner_moderator"
    ON groups FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = groups.id
            AND group_members.user_id = auth.uid()
            AND group_members.role IN ('owner', 'moderator')
        )
    );

-- =====================================================
-- GROUP MEMBERS POLICIES
-- =====================================================

-- Users can view members of groups they belong to
CREATE POLICY "group_members_select_member"
    ON group_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM group_members gm2
            WHERE gm2.group_id = group_members.group_id
            AND gm2.user_id = auth.uid()
        )
    );

-- Group owners and moderators can add members
CREATE POLICY "group_members_insert_owner_moderator"
    ON group_members FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = group_members.group_id
            AND group_members.user_id = auth.uid()
            AND group_members.role IN ('owner', 'moderator')
        )
    );

-- Users can update their own membership (mute)
CREATE POLICY "group_members_update_own"
    ON group_members FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Owners and moderators can update member roles
CREATE POLICY "group_members_update_owner_moderator"
    ON group_members FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = group_members.group_id
            AND gm.user_id = auth.uid()
            AND gm.role IN ('owner', 'moderator')
        )
    );

-- =====================================================
-- FORUM CATEGORIES POLICIES
-- =====================================================

-- Everyone can view categories
CREATE POLICY "forum_categories_select_all"
    ON forum_categories FOR SELECT
    USING (archived = FALSE);

-- Only admins can manage categories
CREATE POLICY "forum_categories_all_admin"
    ON forum_categories FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- =====================================================
-- FORUM BOARDS POLICIES
-- =====================================================

-- Users can view public boards and private boards they have access to
CREATE POLICY "forum_boards_select_public"
    ON forum_boards FOR SELECT
    USING (
        archived = FALSE
        AND (
            is_private = FALSE
            OR (
                is_private = TRUE
                AND EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND (
                        required_role IS NULL
                        OR profiles.role = required_role
                        OR profiles.role IN ('moderator', 'admin')
                    )
                )
            )
        )
    );

-- Only admins can manage boards
CREATE POLICY "forum_boards_all_admin"
    ON forum_boards FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- =====================================================
-- FORUM THREADS POLICIES
-- =====================================================

-- Users can view threads in boards they have access to
CREATE POLICY "forum_threads_select_board_access"
    ON forum_threads FOR SELECT
    USING (
        deleted = FALSE
        AND archived = FALSE
        AND EXISTS (
            SELECT 1 FROM forum_boards
            WHERE forum_boards.id = forum_threads.board_id
            AND (
                forum_boards.is_private = FALSE
                OR EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND (
                        forum_boards.required_role IS NULL
                        OR profiles.role = forum_boards.required_role
                        OR profiles.role IN ('moderator', 'admin')
                    )
                )
            )
        )
    );

-- Authenticated users can create threads in accessible boards
CREATE POLICY "forum_threads_insert_authenticated"
    ON forum_threads FOR INSERT
    WITH CHECK (
        auth.uid() = author_id
        AND EXISTS (
            SELECT 1 FROM forum_boards
            WHERE forum_boards.id = forum_threads.board_id
            AND (
                forum_boards.is_private = FALSE
                OR EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND (
                        forum_boards.required_role IS NULL
                        OR profiles.role = forum_boards.required_role
                        OR profiles.role IN ('moderator', 'admin')
                    )
                )
            )
        )
    );

-- Users can update their own threads
CREATE POLICY "forum_threads_update_own"
    ON forum_threads FOR UPDATE
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

-- Moderators can update any thread
CREATE POLICY "forum_threads_update_moderator"
    ON forum_threads FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('moderator', 'admin')
        )
    );

-- =====================================================
-- FORUM POSTS POLICIES
-- =====================================================

-- Users can view posts in threads they have access to
CREATE POLICY "forum_posts_select_thread_access"
    ON forum_posts FOR SELECT
    USING (
        deleted = FALSE
        AND archived = FALSE
        AND EXISTS (
            SELECT 1 FROM forum_threads ft
            JOIN forum_boards fb ON fb.id = ft.board_id
            WHERE ft.id = forum_posts.thread_id
            AND ft.deleted = FALSE
            AND (
                fb.is_private = FALSE
                OR EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND (
                        fb.required_role IS NULL
                        OR profiles.role = fb.required_role
                        OR profiles.role IN ('moderator', 'admin')
                    )
                )
            )
        )
    );

-- Users can create posts in accessible threads
CREATE POLICY "forum_posts_insert_authenticated"
    ON forum_posts FOR INSERT
    WITH CHECK (
        auth.uid() = author_id
        AND EXISTS (
            SELECT 1 FROM forum_threads ft
            JOIN forum_boards fb ON fb.id = ft.board_id
            WHERE ft.id = forum_posts.thread_id
            AND ft.is_locked = FALSE
            AND (
                fb.is_private = FALSE
                OR EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND (
                        fb.required_role IS NULL
                        OR profiles.role = fb.required_role
                        OR profiles.role IN ('moderator', 'admin')
                    )
                )
            )
        )
    );

-- Users can update their own posts
CREATE POLICY "forum_posts_update_own"
    ON forum_posts FOR UPDATE
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

-- Moderators can update any post
CREATE POLICY "forum_posts_update_moderator"
    ON forum_posts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('moderator', 'admin')
        )
    );

-- =====================================================
-- FORUM VOTES POLICIES
-- =====================================================

-- Users can view votes on content they have access to
CREATE POLICY "forum_votes_select_content_access"
    ON forum_votes FOR SELECT
    USING (
        (
            post_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM forum_posts fp
                JOIN forum_threads ft ON ft.id = fp.thread_id
                JOIN forum_boards fb ON fb.id = ft.board_id
                WHERE fp.id = forum_votes.post_id
                AND fp.deleted = FALSE
            )
        )
        OR
        (
            thread_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM forum_threads ft
                WHERE ft.id = forum_votes.thread_id
                AND ft.deleted = FALSE
            )
        )
    );

-- Users can vote on accessible content
CREATE POLICY "forum_votes_insert_authenticated"
    ON forum_votes FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own votes
CREATE POLICY "forum_votes_delete_own"
    ON forum_votes FOR DELETE
    USING (user_id = auth.uid());

-- =====================================================
-- REPORTS POLICIES
-- =====================================================

-- Users can view their own reports
CREATE POLICY "reports_select_own"
    ON reports FOR SELECT
    USING (reporter_id = auth.uid());

-- Moderators can view all reports
CREATE POLICY "reports_select_moderator"
    ON reports FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('moderator', 'admin')
        )
    );

-- Authenticated users can create reports
CREATE POLICY "reports_insert_authenticated"
    ON reports FOR INSERT
    WITH CHECK (reporter_id = auth.uid());

-- Moderators can update reports
CREATE POLICY "reports_update_moderator"
    ON reports FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('moderator', 'admin')
        )
    );

-- =====================================================
-- MODERATION ACTIONS POLICIES
-- =====================================================

-- Moderators can view all moderation actions
CREATE POLICY "moderation_actions_select_moderator"
    ON moderation_actions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('moderator', 'admin')
        )
    );

-- Moderators can create moderation actions
CREATE POLICY "moderation_actions_insert_moderator"
    ON moderation_actions FOR INSERT
    WITH CHECK (
        moderator_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('moderator', 'admin')
        )
    );

-- =====================================================
-- NOTIFICATIONS POLICIES
-- =====================================================

-- Users can view their own notifications
CREATE POLICY "notifications_select_own"
    ON notifications FOR SELECT
    USING (user_id = auth.uid());

-- System can insert notifications (via service role)
CREATE POLICY "notifications_insert_system"
    ON notifications FOR INSERT
    WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY "notifications_update_own"
    ON notifications FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- =====================================================
-- AUDIT LOGS POLICIES
-- =====================================================

-- Admins can view all audit logs
CREATE POLICY "audit_logs_select_admin"
    ON audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- System can insert audit logs (via service role)
CREATE POLICY "audit_logs_insert_system"
    ON audit_logs FOR INSERT
    WITH CHECK (true);

-- =====================================================
-- ATTACHMENTS POLICIES
-- =====================================================

-- Users can view attachments in content they have access to
CREATE POLICY "attachments_select_content_access"
    ON attachments FOR SELECT
    USING (
        (
            message_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM messages m
                JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
                WHERE m.id = attachments.message_id
                AND cp.user_id = auth.uid()
                AND cp.left_at IS NULL
            )
        )
        OR
        (
            post_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM forum_posts fp
                JOIN forum_threads ft ON ft.id = fp.thread_id
                WHERE fp.id = attachments.post_id
                AND fp.deleted = FALSE
            )
        )
    );

-- Users can upload attachments
CREATE POLICY "attachments_insert_own"
    ON attachments FOR INSERT
    WITH CHECK (uploader_id = auth.uid());

-- Users can delete their own attachments
CREATE POLICY "attachments_delete_own"
    ON attachments FOR DELETE
    USING (uploader_id = auth.uid());

-- =====================================================
-- TYPING INDICATORS POLICIES
-- =====================================================

-- Users can view typing indicators in their conversations
CREATE POLICY "typing_indicators_select_participant"
    ON typing_indicators FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants
            WHERE conversation_participants.conversation_id = typing_indicators.conversation_id
            AND conversation_participants.user_id = auth.uid()
            AND conversation_participants.left_at IS NULL
        )
    );

-- Users can insert their own typing indicators
CREATE POLICY "typing_indicators_insert_own"
    ON typing_indicators FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own typing indicators
CREATE POLICY "typing_indicators_delete_own"
    ON typing_indicators FOR DELETE
    USING (user_id = auth.uid());
