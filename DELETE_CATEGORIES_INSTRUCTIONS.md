# Delete Forum Categories - Instructions

## Categories to Delete
- ❌ General
- ❌ Funding  
- ❌ Innovation
- ❌ Market Insights

## Steps to Delete Categories in Supabase

### Option 1: Using Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Select your project: `lphdjsdufwioeeoselcg`

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Run the Deletion Script**
   - Copy the contents of `DELETE_CATEGORIES.sql`
   - Paste into the SQL Editor
   - Click "Run" or press `Ctrl/Cmd + Enter`

4. **Verify Deletion**
   - The script will show remaining categories at the end
   - Or go to Table Editor → `forum_categories` to verify

### Option 2: Using Supabase Table Editor

**⚠️ WARNING:** This method requires manual deletion in order due to foreign key constraints.

1. **Delete Posts First**
   - Go to: Table Editor → `forum_posts`
   - Filter by threads from boards in these categories
   - Delete all matching posts

2. **Delete Threads**
   - Go to: Table Editor → `forum_threads`
   - Filter by boards in these categories
   - Delete all matching threads

3. **Delete Boards**
   - Go to: Table Editor → `forum_boards`
   - Filter by: `category_id` matching the category IDs below
   - Delete all matching boards

4. **Delete Categories**
   - Go to: Table Editor → `forum_categories`
   - Find and delete these rows:
     - `11111111-1111-1111-1111-111111111111` (General)
     - `22222222-2222-2222-2222-222222222222` (Funding)
     - `33333333-3333-3333-3333-333333333333` (Innovation)
     - `44444444-4444-4444-4444-444444444444` (Market Insights)

## Category IDs Reference

```
General:         11111111-1111-1111-1111-111111111111
Funding:         22222222-2222-2222-2222-222222222222
Innovation:      33333333-3333-3333-3333-333333333333
Market Insights: 44444444-4444-4444-4444-444444444444
```

## What Gets Deleted

✅ The 4 categories listed above  
✅ All boards under these categories (10 boards total)  
✅ All threads in those boards  
✅ All posts in those threads  

## After Deletion

- The frontend will show an empty state: "No Categories Yet"
- Users can create new categories via the "Create Category" button
- The seed file has been updated to prevent recreation
- Only user-created categories will appear going forward

## Rollback (If Needed)

To restore the categories:
1. Uncomment the seed data in `packages/db/seeds/001_demo_data.sql`
2. Run the INSERT statements manually in Supabase SQL Editor

---

**Status:** Ready to execute  
**Created:** $(date)  
**Safe to run:** Yes (only affects demo categories)
