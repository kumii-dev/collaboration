# 🔧 Troubleshooting Guide - Kumii Collaboration Module

This guide covers common issues and their solutions.

---

## 🚨 Installation Issues

### Issue: `npm install` fails with EACCES error

**Symptoms:**
```
npm ERR! code EACCES
npm ERR! syscall access
npm ERR! path /usr/local/lib/node_modules
```

**Solution:**
```bash
# Fix npm permissions (Mac/Linux)
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

### Issue: `npm install` hangs or is very slow

**Symptoms:**
- Installation seems frozen
- No progress for several minutes

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Use different registry
npm install --registry=https://registry.npmjs.org/

# Or increase timeout
npm install --fetch-timeout=60000
```

### Issue: TypeScript compilation errors after install

**Symptoms:**
```
error TS2307: Cannot find module '@supabase/supabase-js'
```

**Solution:**
```bash
# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install

# If still failing, check Node version
node -v  # Should be 18.x or higher
```

---

## 🗄️ Database Issues

### Issue: Migrations fail with syntax error

**Symptoms:**
```
ERROR: syntax error at or near "CREATE"
```

**Solution:**
1. Ensure you're running migrations in order:
   - First: `001_initial_schema.sql`
   - Second: `002_rls_policies.sql`
2. Check that entire file was copied (not truncated)
3. Run each migration in a separate query
4. Check Supabase status (green indicator in dashboard)

### Issue: RLS policies blocking all access

**Symptoms:**
- Empty results from all queries
- `new row violates row-level security policy` error

**Solution:**
```sql
-- Temporarily disable RLS to test (DO NOT DO IN PRODUCTION)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Check if user is authenticated
SELECT auth.uid();  -- Should return your user ID

-- Verify user's role
SELECT id, email, role FROM profiles WHERE id = auth.uid();

-- Re-enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

### Issue: Cannot create admin user

**Symptoms:**
- UPDATE query runs but role doesn't change

**Solution:**
```sql
-- Check if user exists
SELECT * FROM profiles WHERE email = 'your@email.com';

-- If no results, user might be in auth.users but not profiles
-- Check auth.users
SELECT id, email FROM auth.users WHERE email = 'your@email.com';

-- Create profile manually if missing
INSERT INTO profiles (id, email, full_name, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'your@email.com'),
  'your@email.com',
  'Your Name',
  'admin'
);
```

### Issue: Storage bucket not working

**Symptoms:**
- File uploads fail
- 404 errors when accessing attachments

**Solution:**
1. Verify bucket exists: Storage → Buckets
2. Check bucket is public: Click bucket → Settings → Public access
3. Verify bucket name matches code: Should be `attachments`
4. Check RLS policies on storage.objects (auto-created)

---

## 🔐 Authentication Issues

### Issue: Login fails with "Invalid login credentials"

**Symptoms:**
- Correct password but can't log in
- Error message immediately after submit

**Solution:**
```bash
# Check if email confirmation is required
# In Supabase: Authentication → Settings → Email Auth
# Disable "Enable email confirmations" for development

# Or confirm email manually in SQL Editor:
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email = 'your@email.com';
```

### Issue: JWT token expired error

**Symptoms:**
```
401 Unauthorized: JWT expired
```

**Solution:**
```typescript
// Frontend will auto-refresh, but you can force it:
// In browser console:
const { data, error } = await supabase.auth.refreshSession();
console.log(data);

// Or just log out and log back in
```

### Issue: Magic link not received

**Symptoms:**
- "Send Magic Link" says success but no email

**Solution:**
1. Check spam folder
2. Verify Resend API key is correct
3. Check Resend dashboard for failed sends
4. For development, check Supabase Auth → Users → Recent Activity
5. Try email/password login instead

---

## 🌐 API / Network Issues

### Issue: Backend won't start - Port already in use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solution:**
```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>

# Or use different port in .env
PORT=3002
```

### Issue: Frontend can't connect to backend

**Symptoms:**
- Network errors in browser console
- `ERR_CONNECTION_REFUSED`

**Solution:**
1. Verify backend is running: `curl http://localhost:3001/api/health`
2. Check VITE_API_URL in `apps/web/.env`:
   ```
   VITE_API_URL=http://localhost:3001/api
   ```
3. Ensure no trailing slash
4. Restart frontend after .env changes
5. Check browser console for CORS errors

### Issue: CORS errors in browser

**Symptoms:**
```
Access to XMLHttpRequest blocked by CORS policy
```

**Solution:**
```typescript
// In apps/api/.env, ensure:
CORS_ORIGIN=http://localhost:5173

// For multiple origins:
CORS_ORIGIN=http://localhost:5173,http://localhost:3000

// Restart backend after changes
```

---

## 📧 Email Issues

### Issue: Emails not sending

**Symptoms:**
- No error in logs
- Emails never arrive

**Solution:**
1. Verify Resend API key is correct
2. Check Resend dashboard for send logs
3. Verify email addresses:
   - For testing, use your own verified email
   - Resend requires domain verification for production
4. Check backend logs for email service errors:
   ```bash
   # In apps/api terminal, look for:
   Email sent successfully to user@example.com
   # or
   Failed to send email: <error>
   ```

### Issue: Email templates look broken

**Symptoms:**
- Plain text emails instead of HTML
- Styling not applied

**Solution:**
- Emails use inline CSS, should work in all clients
- Test in different email clients (Gmail, Outlook, Apple Mail)
- Check `apps/api/src/services/email.ts` for template HTML
- Verify Resend supports HTML (it does by default)

---

## 🎨 Frontend Issues

### Issue: React app shows blank page

**Symptoms:**
- White screen in browser
- No errors in terminal

**Solution:**
```bash
# Check browser console for errors (F12)
# Common issues:

# 1. Environment variables not loaded
# Restart dev server after .env changes
npm run dev

# 2. Build artifacts cached
rm -rf dist .vite
npm run dev

# 3. Browser cache
# Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
```

### Issue: Vite dev server very slow

**Symptoms:**
- Page takes 10+ seconds to load
- HMR (hot reload) is slow

**Solution:**
```typescript
// Add to vite.config.ts:
export default defineConfig({
  server: {
    fs: {
      strict: false
    },
    watch: {
      usePolling: false  // Can help on some systems
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  }
});
```

### Issue: Bootstrap styles not loading

**Symptoms:**
- Unstyled page
- Missing buttons, cards, etc.

**Solution:**
```typescript
// Verify import in apps/web/src/main.tsx:
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/main.css';

// Check that bootstrap is installed:
cd apps/web
npm list bootstrap  // Should show version 5.3.2

// Reinstall if missing:
npm install bootstrap@5.3.2
```

---

## 🔒 Security Issues

### Issue: Service role key exposed in frontend

**Symptoms:**
- Seeing service_role key in browser console
- Key visible in Network tab

**Solution:**
```bash
# ⚠️ CRITICAL: Service role key should NEVER be in frontend

# Check apps/web/.env - should only have anon key:
VITE_SUPABASE_ANON_KEY=eyJh...  # ✅ Safe
# NOT this:
VITE_SUPABASE_SERVICE_ROLE_KEY=...  # ❌ NEVER DO THIS

# If exposed:
# 1. Immediately rotate key in Supabase dashboard
# 2. Update apps/api/.env with new key
# 3. Never commit service_role key to git
```

### Issue: Users can access other users' data

**Symptoms:**
- Seeing other people's messages
- Can edit others' posts

**Solution:**
```sql
-- Verify RLS is enabled on all tables:
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Should show 'true' for all tables

-- Re-run RLS migration if needed:
-- packages/db/migrations/002_rls_policies.sql
```

---

## 🐛 Development Issues

### Issue: Hot reload not working

**Symptoms:**
- Changes not reflected in browser
- Must manually refresh

**Solution:**
```bash
# For backend (API):
# Use tsx watch mode (should already be configured)
npm run dev

# For frontend:
# Vite HMR should work by default
# If not, try:
rm -rf .vite
npm run dev

# Check firewall isn't blocking WebSocket connection
```

### Issue: TypeScript errors everywhere

**Symptoms:**
- Red squiggles in editor
- `Cannot find module` errors

**Solution:**
```bash
# Restart TypeScript server in VS Code:
# Cmd+Shift+P → "TypeScript: Restart TS Server"

# Or check tsconfig.json paths are correct
# Ensure node_modules is not excluded
```

---

## 🚀 Deployment Issues

### Issue: Vercel build fails

**Symptoms:**
```
Build failed with exit code 1
```

**Solution:**
1. Check build logs for specific error
2. Common fixes:
   ```bash
   # Ensure build script exists in package.json
   "build": "tsc"  # Backend
   "build": "tsc && vite build"  # Frontend
   
   # Check Node version in Vercel matches local
   # Add to package.json:
   "engines": {
     "node": "18.x"
   }
   ```

### Issue: Environment variables not working in production

**Symptoms:**
- App works locally but not in production
- Supabase connection errors

**Solution:**
1. In Vercel dashboard → Project → Settings → Environment Variables
2. Add ALL variables from .env file
3. Redeploy after adding variables
4. For frontend, ensure variables start with `VITE_`

---

## 📊 Performance Issues

### Issue: Database queries very slow

**Symptoms:**
- API responses take 3+ seconds
- Forum page slow to load

**Solution:**
```sql
-- Check if indexes exist:
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public';

-- Should see indexes on all foreign keys
-- If missing, re-run 001_initial_schema.sql

-- Check query performance:
EXPLAIN ANALYZE 
SELECT * FROM messages 
WHERE conversation_id = 'some-id' 
ORDER BY created_at DESC 
LIMIT 50;
```

### Issue: Too many API calls

**Symptoms:**
- Network tab shows 100+ requests
- Page feels sluggish

**Solution:**
```typescript
// Use React Query to deduplicate:
const { data } = useQuery(['conversations'], fetchConversations, {
  staleTime: 30000,  // Don't refetch for 30 seconds
  refetchOnWindowFocus: false
});

// Batch related queries
// Use Supabase's .select() with joins instead of multiple calls
```

---

## 🆘 Getting Help

If you're still stuck after trying these solutions:

1. **Check Logs:**
   - Backend: Terminal where `npm run dev` is running
   - Frontend: Browser console (F12)
   - Database: Supabase Dashboard → Logs

2. **Review Documentation:**
   - README.md for full docs
   - ARCHITECTURE.md for system design
   - Supabase docs: https://supabase.com/docs

3. **Common Debugging Steps:**
   ```bash
   # Restart everything
   # Terminal 1:
   cd apps/api
   npm run dev
   
   # Terminal 2:
   cd apps/web
   npm run dev
   
   # Clear browser cache and hard refresh
   ```

4. **Check System Status:**
   - Supabase status: https://status.supabase.com
   - Resend status: https://status.resend.com
   - Vercel status: https://www.vercel-status.com

5. **Report Bugs:**
   - Check if issue is known
   - Provide error logs
   - Include steps to reproduce
   - Mention environment (OS, Node version, etc.)

---

**Last Updated:** January 27, 2026  
**Version:** 1.0.0
