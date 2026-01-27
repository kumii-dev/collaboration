-- =====================================================
-- SEED DATA FOR DEVELOPMENT/DEMO
-- =====================================================

-- Note: In production, user profiles are created via Supabase Auth
-- This seed assumes some test users exist in auth.users

-- =====================================================
-- FORUM CATEGORIES
-- =====================================================

INSERT INTO forum_categories (id, name, description, icon, sort_order) VALUES
    ('11111111-1111-1111-1111-111111111111', 'General', 'General discussions about business and networking', '💬', 1),
    ('22222222-2222-2222-2222-222222222222', 'Funding', 'Discussions about funding, investment, and capital', '💰', 2),
    ('33333333-3333-3333-3333-333333333333', 'Innovation', 'Share and discuss innovative ideas and technologies', '💡', 3),
    ('44444444-4444-4444-4444-444444444444', 'Market Insights', 'Industry trends, market analysis, and insights', '📊', 4);

-- =====================================================
-- FORUM BOARDS
-- =====================================================

INSERT INTO forum_boards (id, category_id, name, description, is_private, required_role, sort_order) VALUES
    -- General Category
    ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Introductions', 'Introduce yourself to the community', false, NULL, 1),
    ('b2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Networking Events', 'Upcoming events and meetups', false, NULL, 2),
    ('b3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Business Tips', 'Share tips and best practices', false, NULL, 3),
    
    -- Funding Category
    ('b4444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Seeking Investment', 'Entrepreneurs looking for funding', false, NULL, 1),
    ('b5555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'Investor Lounge', 'Private board for verified funders', true, 'funder', 2),
    ('b6666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'Funding News', 'Latest funding rounds and news', false, NULL, 3),
    
    -- Innovation Category
    ('b7777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'Tech Showcase', 'Showcase your innovative solutions', false, NULL, 1),
    ('b8888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', 'Advisor Corner', 'Expert advice and mentorship', true, 'advisor', 2),
    
    -- Market Insights Category
    ('b9999999-9999-9999-9999-999999999999', '44444444-4444-4444-4444-444444444444', 'Industry Trends', 'Discuss industry trends and predictions', false, NULL, 1),
    ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'Market Analysis', 'In-depth market analysis and reports', false, NULL, 2);

-- =====================================================
-- DEMO NOTES
-- =====================================================

-- To create demo users, profiles, conversations, and messages,
-- you'll need to:
-- 1. Sign up users via Supabase Auth UI or API
-- 2. Their profiles will be auto-created via trigger or manual insert
-- 3. Then you can insert sample conversations, messages, threads, posts

-- Example profile insert (after auth user exists):
-- INSERT INTO profiles (id, email, full_name, role, verified, sector, company, bio, reputation_score)
-- VALUES 
--     ('user-uuid-1', 'entrepreneur@example.com', 'Alice Johnson', 'entrepreneur', false, 'FinTech', 'Alice Ventures', 'Passionate entrepreneur in fintech', 50),
--     ('user-uuid-2', 'funder@example.com', 'Bob Smith', 'funder', true, 'Venture Capital', 'Smith Capital', 'Active investor seeking innovative startups', 100);

-- Example conversation:
-- INSERT INTO conversations (id, type, created_by)
-- VALUES ('conv-uuid-1', 'direct', 'user-uuid-1');

-- INSERT INTO conversation_participants (conversation_id, user_id)
-- VALUES 
--     ('conv-uuid-1', 'user-uuid-1'),
--     ('conv-uuid-1', 'user-uuid-2');

-- INSERT INTO messages (conversation_id, sender_id, content)
-- VALUES 
--     ('conv-uuid-1', 'user-uuid-1', 'Hi Bob, I saw your profile and would love to discuss potential investment opportunities.');

-- For a complete seed with real data, run this after creating auth users in your environment.
