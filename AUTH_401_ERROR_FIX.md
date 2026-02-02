# 401 Unauthorized Error Fix

## 🔴 Issue
When navigating to category detail page, API requests return **401 Unauthorized** errors:
```
GET http://localhost:3001/api/forum/categories 401 (Unauthorized)
GET http://localhost:3001/api/forum/threads?sort=recent&limit=10 401 (Unauthorized)
```

## 🔍 Root Cause Analysis

### Problem: Race Condition
When navigating to CategoryDetailPage, React Query fires API requests immediately when the component mounts. However, the Supabase session might not be fully loaded yet, causing the auth token to be missing from requests.

### Why It Happens:
1. User navigates to `/forum/categories/:slug`
2. CategoryDetailPage component mounts
3. React Query hooks fire immediately
4. API interceptor tries to get session with `supabase.auth.getSession()`
5. **Race condition**: Session might not be ready yet
6. Request sent without auth token
7. Backend returns 401 Unauthorized

### Why It Worked Initially:
- On the forum landing page, the session was already loaded
- But navigating to a new page can trigger this race condition
- The issue is intermittent depending on timing

## ✅ Fixes Applied

### 1. Enhanced API Interceptor with Logging
**File**: `apps/web/src/lib/api.ts`

**Changes**:
- Added detailed console logging to track auth token attachment
- Logs show if token is attached or missing
- Better error visibility

```typescript
api.interceptors.request.use(async (config) => {
  try {
    console.log('🔵 API Request:', config.method?.toUpperCase(), config.url);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
      console.log('✅ Auth token attached to request');
    } else {
      console.warn('⚠️ No session found, request will be unauthenticated');
    }
  } catch (error) {
    console.error('❌ Failed to get session for API request:', error);
  }
  return config;
});
```

**What This Shows**:
- Now you can see in console if auth token is being attached
- If you see "⚠️ No session found", that's the problem
- Helps diagnose timing issues

### 2. Added Retry Logic to CategoryDetailPage
**File**: `apps/web/src/pages/Forum/CategoryDetailPage.tsx`

**Changes**:
- Added retry configuration to all React Query hooks
- Retries 3 times with 1 second delay
- Added stale time to prevent unnecessary refetches
- Added error handling and display
- Added comprehensive console logging

```typescript
const { data: categories, isLoading, error } = useQuery(
  'forum-categories',
  async () => {
    console.log('🔵 Fetching categories for CategoryDetailPage');
    const response = await api.get('/forum/categories');
    console.log('✅ Categories fetched:', response.data);
    return response.data.data as Category[];
  },
  {
    retry: 3,           // Retry failed requests 3 times
    retryDelay: 1000,   // Wait 1 second between retries
    staleTime: 60000,   // Cache for 1 minute
  }
);
```

**Why This Helps**:
- If first request fails due to missing token, it retries
- By the time of retry, session is usually loaded
- 1 second delay gives session time to initialize
- Prevents unnecessary repeated requests with staleTime

### 3. Enhanced Error Display
**Changes**:
- Show error message if categories/boards fail to load
- Show retry button for thread loading errors
- Better user feedback

```typescript
if (categoriesError || boardsError) {
  const error: any = categoriesError || boardsError;
  return (
    <div className="text-center py-5">
      <h3>Error Loading Category</h3>
      <p className="text-muted">
        {error?.response?.data?.error || error?.message || 'Failed to load category data'}
      </p>
      <Button variant="primary" onClick={() => navigate('/forum')}>
        Back to Forum
      </Button>
    </div>
  );
}
```

## 🧪 Testing the Fix

### What to Check in Console:

**Successful Flow**:
```
🔵 API Request: GET /forum/categories
✅ Auth token attached to request
🔵 Fetching categories for CategoryDetailPage
✅ Categories fetched: {success: true, data: [...]}
```

**Failed Flow (Before Retry)**:
```
🔵 API Request: GET /forum/categories
⚠️ No session found, request will be unauthenticated
❌ 401 Unauthorized
🔵 API Request: GET /forum/categories (retry 1/3)
✅ Auth token attached to request
✅ Categories fetched: {success: true, data: [...]}
```

### Test Steps:

1. **Navigate to Forum Page**
   - Go to http://localhost:5173/forum
   - Wait for page to load completely

2. **Click a Category Card**
   - Click any category (e.g., "Startup Huddle")
   - Watch browser console

3. **Expected Results**:
   - ✅ Either loads immediately (token ready)
   - ✅ Or loads after 1-2 retries (token loads during retry)
   - ✅ Category detail page displays correctly
   - ✅ Boards list appears on left
   - ✅ Threads list appears on right

4. **If Still Fails**:
   - Check console for "⚠️ No session found"
   - Check if all 3 retries show no token
   - May indicate deeper session management issue

## 🔧 Alternative Solutions (If Issue Persists)

### Option 1: Wait for Session Before Rendering
Modify App.tsx to ensure session is fully loaded:

```typescript
// In App.tsx
const [sessionReady, setSessionReady] = useState(false);

useEffect(() => {
  supabase.auth.getSession().then(() => {
    setSessionReady(true);
  });
}, []);

if (!sessionReady) {
  return <LoadingSpinner />;
}
```

### Option 2: Disable Queries Until Session Ready
Pass session state to components:

```typescript
const { data, isLoading } = useQuery(
  'forum-categories',
  fetchFunction,
  {
    enabled: !!session, // Only run when session exists
  }
);
```

### Option 3: Increase Retry Delay
If network is slow:

```typescript
{
  retry: 5,
  retryDelay: 2000, // 2 seconds
}
```

## 📊 Current Status

### What's Fixed:
- ✅ Added comprehensive logging to track auth flow
- ✅ Added retry logic (3 attempts, 1 second delay)
- ✅ Added error handling and user feedback
- ✅ Added stale time to prevent unnecessary refetches
- ✅ Better console visibility for debugging

### What to Monitor:
- ⚠️ Check if retries succeed (should see auth token on retry)
- ⚠️ Watch for "No session found" warnings
- ⚠️ Monitor if all 3 retries fail (deeper issue)

### Next Steps if Still Fails:
1. Check browser console for new error patterns
2. Verify session is actually being created (App.tsx logs)
3. Check if token expires quickly (expires_at timestamp)
4. Consider implementing Option 1 or 2 above

## 🎯 Quick Fix Summary

**Before**:
- No retry logic → immediate failure
- No logging → hard to debug
- No error display → confusing for users

**After**:
- 3 retries with delay → handles race condition
- Comprehensive logging → easy to debug
- Error messages → clear user feedback

**Expected Result**: 
Category page should now load successfully, either immediately or after 1-2 quick retries.

---

**Test the fix now by navigating to a category!** Check the console to see the retry logic in action. 🚀
