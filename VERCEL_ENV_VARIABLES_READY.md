# 🔐 Environment Variables for Vercel Production

## Copy-Paste Ready for Vercel Dashboard

Go to: https://vercel.com/dashboard → Your Project → Settings → Environment Variables

---

## 📱 Web App Variables (Frontend)

Add these as **Production** environment variables:

```
VITE_SUPABASE_URL=https://lphdjsdufwioeeoselcg.supabase.co
```

```
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaGRqc2R1Zndpb2Vlb3NlbGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTg0ODUsImV4cCI6MjA4NTA5NDQ4NX0.156NsLu4te0qZEUa573f6xBU2HZNRUdP6ag6BuKCbLA
```

```
VITE_API_URL=https://communities-ten.vercel.app/api
```

```
VITE_APP_NAME=Kumii Collaboration
```

```
VITE_APP_URL=https://communities-ten.vercel.app
```

```
VITE_ENABLE_REALTIME=true
```

```
VITE_ENABLE_NOTIFICATIONS=true
```

---

## 🔧 API Variables (Backend)

Add these as **Production** environment variables:

```
NODE_ENV=production
```

```
PORT=3001
```

```
API_URL=https://communities-ten.vercel.app/api
```

```
SUPABASE_URL=https://lphdjsdufwioeeoselcg.supabase.co
```

```
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaGRqc2R1Zndpb2Vlb3NlbGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTg0ODUsImV4cCI6MjA4NTA5NDQ4NX0.156NsLu4te0qZEUa573f6xBU2HZNRUdP6ag6BuKCbLA
```

```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaGRqc2R1Zndpb2Vlb3NlbGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxODQ4NSwiZXhwIjoyMDg1MDk0NDg1fQ.IrxOu06NaErGtxpK3rra0sOttMCaLxN_h-edmXL164I
```

```
SUPABASE_STORAGE_BUCKET=collaboration-attachments
```

```
JWT_SECRET=maW+laHEMBsSeQKZLWrVxET7L0N0Jtx4DSUh6+CUO3o=
```

```
SESSION_SECRET=cZY9fI6kiemafCFb85K5+3nOChhDQYEdzxgfn9RXZ9k=
```

```
CORS_ORIGIN=https://communities-ten.vercel.app
```

```
LOG_LEVEL=info
```

```
RATE_LIMIT_WINDOW_MS=900000
```

```
RATE_LIMIT_MAX_REQUESTS=100
```

```
RESEND_API_KEY=re_6FXBJRPh_CjAqqGWH3f1HeKUU8H2PJ9Fx
```

```
RESEND_FROM_EMAIL=info@kumii.africa
```

```
RESEND_FROM_NAME=Kumii
```

---

## 📋 How to Add in Vercel

### Method 1: One by One (Recommended)
1. Click **Add New** button
2. Select **Production** environment
3. Paste variable name in **Key** field
4. Paste value in **Value** field
5. Click **Save**
6. Repeat for all variables above

### Method 2: Bulk Import (Faster)
1. Click **Import from .env** 
2. Create a temporary file with all variables:
```env
NODE_ENV=production
PORT=3001
API_URL=https://communities-ten.vercel.app/api
SUPABASE_URL=https://lphdjsdufwioeeoselcg.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaGRqc2R1Zndpb2Vlb3NlbGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTg0ODUsImV4cCI6MjA4NTA5NDQ4NX0.156NsLu4te0qZEUa573f6xBU2HZNRUdP6ag6BuKCbLA
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaGRqc2R1Zndpb2Vlb3NlbGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxODQ4NSwiZXhwIjoyMDg1MDk0NDg1fQ.IrxOu06NaErGtxpK3rra0sOttMCaLxN_h-edmXL164I
SUPABASE_STORAGE_BUCKET=collaboration-attachments
JWT_SECRET=maW+laHEMBsSeQKZLWrVxET7L0N0Jtx4DSUh6+CUO3o=
SESSION_SECRET=cZY9fI6kiemafCFb85K5+3nOChhDQYEdzxgfn9RXZ9k=
CORS_ORIGIN=https://communities-ten.vercel.app
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RESEND_API_KEY=re_6FXBJRPh_CjAqqGWH3f1HeKUU8H2PJ9Fx
RESEND_FROM_EMAIL=info@kumii.africa
RESEND_FROM_NAME=Kumii
VITE_SUPABASE_URL=https://lphdjsdufwioeeoselcg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaGRqc2R1Zndpb2Vlb3NlbGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTg0ODUsImV4cCI6MjA4NTA5NDQ4NX0.156NsLu4te0qZEUa573f6xBU2HZNRUdP6ag6BuKCbLA
VITE_API_URL=https://communities-ten.vercel.app/api
VITE_APP_NAME=Kumii Collaboration
VITE_APP_URL=https://communities-ten.vercel.app
VITE_ENABLE_REALTIME=true
VITE_ENABLE_NOTIFICATIONS=true
```
3. Copy entire content
4. Paste into Vercel's import dialog
5. Select **Production** environment
6. Click **Import**

---

## ✅ After Adding Variables

1. Go to **Deployments** tab
2. Click **⋯** on latest deployment
3. Click **Redeploy**
4. Wait for build to complete (~2-3 minutes)
5. Test your app at: https://communities-ten.vercel.app

---

## 🔒 Security Notes

✅ All secrets are from your local .env files
✅ CORS is set to your Vercel domain
✅ Using production-ready configurations
⚠️ Never share these values publicly
⚠️ Rotate secrets if compromised

---

## 🧪 Test After Deployment

- [ ] Frontend loads without errors
- [ ] Can register/login with Supabase
- [ ] API health check: `/api/health`
- [ ] Real-time features work
- [ ] No console errors about missing env vars
