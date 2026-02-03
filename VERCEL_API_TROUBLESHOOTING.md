# 🔍 Vercel API Troubleshooting Guide

## Current Status
- ✅ Frontend: Loading at https://communities-ten.vercel.app
- ❌ Backend API: Returning 404 errors

## Diagnosis

### Issue 1: API Routes Returning 404
All API endpoints are returning "The page could not be found" or "NOT_FOUND"

**Tested:**
- `/api/health` → 404 NOT_FOUND
- `/api/forum/threads` → 404 NOT_FOUND  
- `/api/` → Returns `{"success":false,"error":"Resource not found"}`

**What this means:**
- The serverless function IS running (we get a response from `/api/`)
- But specific routes are not being found
- This usually means either:
  - The Express app isn't starting correctly
  - Environment variables are missing causing initialization to fail
  - The build didn't include the necessary files

## 🚨 Critical: Check Environment Variables

### Step 1: Verify Environment Variables in Vercel

1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. **Verify ALL these variables exist:**

#### Required Web Variables:
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `VITE_API_URL` (should be `https://communities-ten.vercel.app/api`)
- [ ] `VITE_APP_NAME`
- [ ] `VITE_APP_URL`
- [ ] `VITE_ENABLE_REALTIME`
- [ ] `VITE_ENABLE_NOTIFICATIONS`

#### Required API Variables:
- [ ] `NODE_ENV`
- [ ] `PORT`
- [ ] `API_URL`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `JWT_SECRET`
- [ ] `SESSION_SECRET`
- [ ] `CORS_ORIGIN`
- [ ] `LOG_LEVEL`
- [ ] `RATE_LIMIT_WINDOW_MS`
- [ ] `RATE_LIMIT_MAX_REQUESTS`

**If any are missing:** Add them from `VERCEL_ENV_VARIABLES_READY.md`

### Step 2: Check Vercel Function Logs

1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click **Functions** tab
4. Click on `api/index.js` function
5. Look for errors in the logs

**Common errors to look for:**
- `Missing Supabase environment variables`
- `Cannot find module`
- `ENOENT` errors
- Connection errors

### Step 3: Redeploy After Adding Variables

If you added/updated environment variables:

1. Go to **Deployments** tab
2. Click **⋯** (three dots) on latest deployment
3. Click **Redeploy**
4. Wait 2-3 minutes for build
5. Test again: `https://communities-ten.vercel.app/api/health`

## 🧪 Test Commands

After redeployment, run these tests:

```bash
# Test health endpoint
curl https://communities-ten.vercel.app/api/health

# Expected response:
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-03T...",
    "environment": "production"
  }
}

# Test forum endpoint
curl https://communities-ten.vercel.app/api/forum/threads?limit=1

# Should return forum data (not 404)
```

## 🔧 Recent Fixes Applied

✅ **API Routing Fix (Just committed)**
- Fixed health endpoint routing
- Vercel strips `/api` prefix before passing to function
- Health endpoint now correctly mapped to Express `/health` route
- Will take effect on next deployment

## 📝 Next Steps

1. **Check environment variables** in Vercel dashboard
2. **Add missing variables** from `VERCEL_ENV_VARIABLES_READY.md`
3. **Redeploy** the application
4. **Check function logs** for any runtime errors
5. **Test API endpoints** with curl commands above

## 🆘 If Still Not Working

Check these in order:

1. **Vercel Function Logs**
   - Look for initialization errors
   - Check if Express app is starting
   - Look for module not found errors

2. **Build Logs**
   - Go to Deployments → Latest → Build Logs
   - Check if TypeScript compilation succeeded
   - Check if `apps/api/dist/` was created

3. **Environment Variables**
   - Ensure all are in **Production** environment
   - Check for typos in variable names
   - Verify values don't have extra spaces/commas

4. **CORS Settings**
   - `CORS_ORIGIN` should be `https://communities-ten.vercel.app`
   - Not `http://localhost:5173`

## 📞 Debug Information to Share

If you need help, share:
- Screenshot of Vercel environment variables list
- Last 20 lines from Function logs
- Response from: `curl -v https://communities-ten.vercel.app/api/health`

---

**Most likely issue:** Missing environment variables causing API to fail during initialization. Add them and redeploy! 🚀
