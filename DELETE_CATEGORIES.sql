-- =====================================================
-- DELETE CATEGORIES: Market Insights, Funding, General, Innovation
-- =====================================================
-- WARNING: This will also delete all boards, threads, and posts under these categories
-- Run this in Supabase SQL Editor

-- Delete in order: posts → threads → boards → categories (to respect foreign keys)

-- Delete posts from threads in boards under these categories
DELETE FROM forum_posts
WHERE thread_id IN (
    SELECT t.id 
    FROM forum_threads t
    JOIN forum_boards b ON t.board_id = b.id
    JOIN forum_categories c ON b.category_id = c.id
    WHERE c.name IN ('Market Insights', 'Funding', 'General', 'Innovation')
);

-- Delete threads from boards under these categories
DELETE FROM forum_threads
WHERE board_id IN (
    SELECT b.id 
    FROM forum_boards b
    JOIN forum_categories c ON b.category_id = c.id
    WHERE c.name IN ('Market Insights', 'Funding', 'General', 'Innovation')
);

-- Delete boards under these categories
DELETE FROM forum_boards
WHERE category_id IN (
    SELECT id 
    FROM forum_categories 
    WHERE name IN ('Market Insights', 'Funding', 'General', 'Innovation')
);

-- Delete the categories themselves
DELETE FROM forum_categories
WHERE name IN ('Market Insights', 'Funding', 'General', 'Innovation');

-- Verify deletion
SELECT * FROM forum_categories;
