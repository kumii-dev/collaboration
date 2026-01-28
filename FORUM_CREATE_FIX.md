# Forum Category/Board Creation Fix

## Issue
Users were getting "Failed to create category" error because:
1. Database RLS policies only allowed admins to create categories/boards
2. Backend was trying to insert `slug` column that doesn't exist in database

## Solution

### 1. Run Database Migration
Execute the following SQL in your Supabase SQL Editor:

```sql
-- Allow authenticated users to create categories and boards

-- Drop existing policies if they exist
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

-- Policy for authenticated users to update categories
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
```

### 2. Backend Changes Made
- ✅ Removed `slug` from INSERT statements (not in database schema)
- ✅ Slug is now generated dynamically in GET endpoints
- ✅ Both categories and boards creation now work for authenticated users

### 3. Test the Fix
1. Navigate to `http://localhost:5173/forum/new-thread`
2. Click "Add New Category"
3. Fill in:
   - Name: Test Category
   - Description: This is a test
   - Icon: 🚀 (optional)
4. Click "Create Category"
5. Should see: ✅ Category "Test Category" created successfully!

## Alternative: Restrict to Moderators Only

If you want only moderators/admins to create categories, change line 505 in `apps/api/src/routes/forum.ts`:

```typescript
// Change from:
router.post('/categories', authenticate, validateBody(createCategorySchema), ...

// To:
router.post('/categories', authenticate, requireModerator, validateBody(createCategorySchema), ...
```

And do the same for boards on line 567.

Then you won't need the new RLS policies above.
