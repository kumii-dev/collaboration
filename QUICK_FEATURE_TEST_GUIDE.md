# 🧪 Quick Test Guide - Advanced Features

## ✅ Features Ready to Test:

1. **Solution Marking** ✓
2. **Edit Post** ✓
3. **Delete Post** ✓
4. **Bookmark Thread** ✓

---

## 🎯 Test Scenario 1: Solution Marking

**Prerequisites:**
- You must be the author of the thread
- Thread must have at least one reply

**Steps:**
1. Navigate to: `http://localhost:5173/forum/threads/0a48e380-9c44-4a44-b6d2-9d1b2a2963af`
2. Find a reply in the thread
3. Click the ⋮ (three dots) menu on that reply
4. Click "Mark as Solution"

**Expected Result:**
- ✅ Reply gets green left border
- ✅ Light green background appears
- ✅ Green "✓ Solution" badge shows next to author name
- ✅ Pulse animation on the badge
- ✅ Menu now shows "Unmark Solution"

**Test Unmark:**
1. Click ⋮ menu on the same reply
2. Click "Unmark Solution"

**Expected Result:**
- ✅ Green styling removes
- ✅ Solution badge disappears
- ✅ Menu shows "Mark as Solution" again

---

## 🎯 Test Scenario 2: Edit Post

**Prerequisites:**
- You must be the author of the post you're trying to edit

**Steps:**
1. Navigate to a thread with your own reply
2. Find YOUR post (not someone else's)
3. Click the ⋮ menu on your post
4. Click "Edit"
5. Modify the text in the prompt dialog
6. Click "OK"

**Expected Result:**
- ✅ Post content updates immediately
- ✅ "(edited)" text appears next to timestamp
- ✅ Post remains in same position
- ✅ Page refreshes to show changes

**Test Unauthorized Edit:**
1. Try clicking "Edit" on someone else's post
2. Modify text and click OK

**Expected Result:**
- ✅ Error alert: "You can only edit your own posts"
- ✅ Post doesn't change

---

## 🎯 Test Scenario 3: Delete Post

**Prerequisites:**
- You must be the author of the post you're trying to delete

**Steps:**
1. Navigate to a thread with your own reply
2. Find YOUR post
3. Click the ⋮ menu
4. Click "Delete" (red text)
5. Confirm deletion

**Expected Result:**
- ✅ Confirmation dialog appears
- ✅ After confirming, post disappears from thread
- ✅ Reply count decreases
- ✅ Cannot be undone

**Test Unauthorized Delete:**
1. Try clicking "Delete" on someone else's post
2. Confirm

**Expected Result:**
- ✅ Error alert: "You can only delete your own posts"
- ✅ Post remains

---

## 🎯 Test Scenario 4: Bookmark Thread

### Method 1: Breadcrumb Button

**Steps:**
1. Navigate to any thread
2. Look for the 🔖 icon in the top-right breadcrumb area
3. Click it

**Expected Result:**
- ✅ Alert: "Thread bookmarked"
- ✅ Button shows loading state briefly

**Test Unbookmark:**
1. Click the 🔖 icon again

**Expected Result:**
- ✅ Alert: "Bookmark removed"

### Method 2: Thread Header Dropdown

**Steps:**
1. In the thread header (below title)
2. Click the ⋮ "More" dropdown menu
3. Click "Bookmark"

**Expected Result:**
- ✅ Alert: "Thread bookmarked"
- ✅ Same behavior as Method 1

---

## 🎯 Test Scenario 5: View Bookmarks (API Test)

**Using Browser DevTools:**
1. Open DevTools → Console
2. Run this code:
```javascript
fetch('http://localhost:3001/api/forum/bookmarks', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
  }
})
.then(r => r.json())
.then(console.log)
```

**Expected Result:**
```json
{
  "success": true,
  "data": [
    {
      "id": "bookmark-id",
      "created_at": "2026-02-02T12:00:00Z",
      "thread": {
        "id": "thread-id",
        "title": "Thread Title",
        ...
      }
    }
  ]
}
```

---

## 🔍 Debugging Tips

### Check Browser Console:
- Open DevTools → Console
- Look for error messages
- Check Network tab for API calls

### Check Server Logs:
- Look at terminal running `npm run dev`
- Server logs all API requests with 🔵
- Success logs show ✅
- Errors show ❌

### Common Issues:

**"Failed to mark solution"**
- ❌ You're not the thread author
- Solution: Use a thread you created

**"Failed to edit post"**
- ❌ You're not the post author
- Solution: Edit only your own posts

**"Failed to bookmark"**
- ❌ Not authenticated
- Solution: Log in first

---

## 📸 What You Should See

### Solution Post:
```
┌─────────────────────────────────────────────┐
│ 👍  │  [JD]  Jane Doe  ✓ Solution           │
│  5  │  2 hours ago                           │
│ 👎  │                                        │
│     │  This is a great answer! Here's how... │
│     │  [Reply] [Share]                       │
└─────────────────────────────────────────────┘
  ↑ Green border  ↑ Green badge with pulse
```

### Edited Post:
```
[JD]  John Doe  Entrepreneur
3 hours ago (edited)  ← Shows edited marker
```

### Dropdown Menu (Your Post):
```
┌───────────────────────┐
│ ✏️  Edit              │
│ 🚩 Report             │
│ ✓ Mark as Solution    │
├───────────────────────┤
│ 🗑️  Delete            │ ← Red text
└───────────────────────┘
```

---

## ✅ Full Test Checklist

**Solution Marking:**
- [ ] Mark reply as solution (as author)
- [ ] See green border and badge
- [ ] Unmark solution
- [ ] Try marking on thread you didn't create (should fail)

**Edit:**
- [ ] Edit your own post
- [ ] See "(edited)" marker
- [ ] Try editing someone else's post (should fail)

**Delete:**
- [ ] Delete your own post
- [ ] Post disappears
- [ ] Try deleting someone else's post (should fail)

**Bookmark:**
- [ ] Bookmark thread (breadcrumb button)
- [ ] See "Thread bookmarked" alert
- [ ] Unbookmark thread
- [ ] See "Bookmark removed" alert
- [ ] Bookmark via dropdown menu (same result)

---

## 🎊 Success Criteria

All features working if:
- ✅ Solution marking highlights post correctly
- ✅ Only thread author can mark solutions
- ✅ Edit updates post with "(edited)" marker
- ✅ Delete removes post from thread
- ✅ Only post author can edit/delete
- ✅ Bookmark shows success alerts
- ✅ All actions show proper errors for unauthorized users

---

## 🚀 You're Ready!

Navigate to: `http://localhost:5173/forum/threads/0a48e380-9c44-4a44-b6d2-9d1b2a2963af`

Start testing! 🎉
