-- Allow authenticated users to create categories and boards
-- This allows any logged-in user to create categories and boards in the forum

-- Drop existing policies if they exist (in case of re-running)
DROP POLICY IF EXISTS "forum_categories_insert_authenticated" ON forum_categories;
DROP POLICY IF EXISTS "forum_boards_insert_authenticated" ON forum_boards;
DROP POLICY IF EXISTS "forum_categories_update_authenticated" ON forum_categories;
DROP POLICY IF EXISTS "forum_boards_update_authenticated" ON forum_boards;

-- Policy for authenticated users to insert categories
CREATE POLICY "forum_categories_insert_authenticated"
    ON forum_categories FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy for authenticated users to insert boards
CREATE POLICY "forum_boards_insert_authenticated"
    ON forum_boards FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy for authenticated users to update their own categories
CREATE POLICY "forum_categories_update_authenticated"
    ON forum_categories FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy for authenticated users to update boards
CREATE POLICY "forum_boards_update_authenticated"
    ON forum_boards FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
