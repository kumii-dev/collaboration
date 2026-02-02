# Vercel Environment Variables Setup

## 🚀 Quick Setup Guide

Your app is deployed but needs environment variables configured in Vercel.

### Step 1: Go to Vercel Dashboard

1. Open [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project: **communities-ten** (or your project name)
3. Click **Settings** tab
4. Click **Environment Variables** in the sidebar

### Step 2: Add Web App Environment Variables

Add these variables for **Production** environment:

| Variable Name | Value |
|--------------|-------|
| `VITE_SUPABASE_URL` | `https://lphdjsdufwioeeoselcg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaGRqc2R1Zndpb2Vlb3NlbGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTg0ODUsImV4cCI6MjA4NTA5NDQ4NX0.156NsLu4te0qZEUa573f6xBU2HZNRUdP6ag6BuKCbLA` |
| `VITE_API_URL` | `https://communities-ten.vercel.app/api` |
| `VITE_APP_NAME` | `Kumii Collaboration` |
| `VITE_APP_URL` | `https://communities-ten.vercel.app` |
| `VITE_ENABLE_REALTIME` | `true` |
| `VITE_ENABLE_NOTIFICATIONS` | `true` |

### Step 3: Add API Environment Variables

Also add these for the backend API:

| Variable Name | Value |
|--------------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `API_URL` | `https://communities-ten.vercel.app/api` |
| `SUPABASE_URL` | `https://lphdjsdufwioeeoselcg.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaGRqc2R1Zndpb2Vlb3NlbGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTg0ODUsImV4cCI6MjA4NTA5NDQ4NX0.156NsLu4te0qZEUa573f6xBU2HZNRUdP6ag6BuKCbLA` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(Get from Supabase Dashboard > Settings > API > service_role key)* |
| `JWT_SECRET` | *(Generate a strong random string, at least 32 characters)* |
| `SESSION_SECRET` | *(Generate a strong random string, at least 32 characters)* |
| `CORS_ORIGIN` | `https://communities-ten.vercel.app` |
| `LOG_LEVEL` | `info` |
| `RATE_LIMIT_WINDOW_MS` | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | `100` |

### Step 4: Generate Secrets

For `JWT_SECRET` and `SESSION_SECRET`, you can generate secure random strings using:

```bash
# In your terminal, run this twice (once for each secret)
openssl rand -base64 32
```

Or use Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Step 5: Get Supabase Service Role Key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. Copy the **service_role** key (keep this secret!)
5. Add it as `SUPABASE_SERVICE_ROLE_KEY` in Vercel

### Step 6: Redeploy

After adding all environment variables:

1. Go to **Deployments** tab in Vercel
2. Click the **⋯** (three dots) on the latest deployment
3. Click **Redeploy**
4. Wait for the build to complete

### Step 7: Update Supabase CORS Settings

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Authentication** → **URL Configuration**
4. Add your Vercel URL to:
   - **Site URL**: `https://communities-ten.vercel.app`
   - **Redirect URLs**: Add `https://communities-ten.vercel.app/**`

## ✅ Verification

After redeployment, test these URLs:

- **Frontend**: https://communities-ten.vercel.app
- **API Health**: https://communities-ten.vercel.app/api/health
- **API Users**: https://communities-ten.vercel.app/api/users (should require auth)

## 🔒 Security Notes

- Never commit `.env` files to Git
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret
- Rotate secrets regularly
- Use Vercel's environment variable encryption

## 📝 Optional: Custom Domain

To use a custom domain:

1. Go to **Settings** → **Domains** in Vercel
2. Add your custom domain
3. Update DNS records as instructed
4. Update all environment variables with your custom domain

---

**Need Help?** Check the [Vercel Documentation](https://vercel.com/docs/concepts/projects/environment-variables)
