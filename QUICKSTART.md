# 🚀 QUICKSTART GUIDE

Get the Kumii Collaboration Module running in 15 minutes!

## Prerequisites Checklist
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm/yarn/pnpm installed
- [ ] Supabase account created (free tier OK)
- [ ] Resend account created (free tier OK)

## Step 1: Database Setup (5 minutes)

### 1.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name: `kumii-collaboration`
3. Database password: Save this securely!
4. Region: Choose closest to your users
5. Wait for project to finish setting up (~2 minutes)

### 1.2 Run Migrations
1. In Supabase dashboard → **SQL Editor**
2. Click **New Query**
3. Copy entire contents of `packages/db/migrations/001_initial_schema.sql`
4. Paste and click **RUN**
5. Repeat for `002_rls_policies.sql`
6. Verify: Go to **Table Editor** - you should see all tables

### 1.3 Create Storage Bucket
1. Go to **Storage** → **New Bucket**
2. Name: `collaboration-attachments`
3. Public: **OFF** (private bucket)
4. Click **Create**

### 1.4 Get API Keys
1. Go to **Settings** → **API**
2. Copy these values (you'll need them next):
   - **Project URL**: `https://xxx.supabase.co`
   - **anon public key**: `eyJxxx...`
   - **service_role secret**: `eyJxxx...` (⚠️ Keep this SECRET!)

## Step 2: Backend Setup (3 minutes)

```bash
# Navigate to API directory
cd apps/api

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 2.1 Edit `apps/api/.env`
Open `.env` in your editor and fill in:

```bash
# From Supabase Settings → API
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# Generate secure secrets (use: openssl rand -base64 32)
JWT_SECRET=<paste-generated-secret-here>
SESSION_SECRET=<paste-another-generated-secret-here>

# Get from resend.com → API Keys
RESEND_API_KEY=re_xxx

# Your verified sender email
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Leave others as default for now
```

### 2.2 Start Backend
```bash
npm run dev
```

✅ You should see: `🚀 Server running on port 3001`

Keep this terminal open!

## Step 3: Frontend Setup (2 minutes)

**Open a NEW terminal window**

```bash
# Navigate to web directory
cd apps/web

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 3.1 Edit `apps/web/.env`
```bash
# From Supabase (same values as backend)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...

# API URL (leave as is for local dev)
VITE_API_URL=http://localhost:3001/api
```

### 3.2 Start Frontend
```bash
npm run dev
```

✅ You should see: `Local: http://localhost:5173`

## Step 4: Create First User (2 minutes)

1. Open browser: `http://localhost:5173`
2. Click **"Don't have an account? Sign up"**
3. Enter email and password
4. Check your email for confirmation link (might be in spam!)
5. Click confirmation link
6. Go back to `http://localhost:5173/login`
7. Sign in with your credentials

🎉 **You're in!** You should see the main dashboard.

## Step 5: Make Yourself Admin (Optional, 1 minute)

To access moderation features:

1. In Supabase dashboard → **SQL Editor** → **New Query**
2. Run:
   ```sql
   UPDATE profiles 
   SET role = 'admin' 
   WHERE email = 'your@email.com';
   ```
3. Refresh your browser
4. You now have access to **Moderation** section

## Quick Test

### Test Chat
1. Click **Chat** in sidebar
2. You should see "Chat & Messaging" page
3. API endpoint: `GET /api/chat/conversations`

### Test Forum
1. Click **Forum** in sidebar
2. You should see "Forum & Discussions" page
3. API endpoint: `GET /api/forum/categories`

### Test API Health
Open: `http://localhost:3001/health`

Should return:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-27T...",
    "environment": "development"
  }
}
```

## Troubleshooting

### Backend won't start
- **Error: Missing environment variables**
  - Solution: Check all values in `apps/api/.env` are filled
  
- **Error: Cannot connect to database**
  - Solution: Verify `SUPABASE_URL` is correct
  - Solution: Check your internet connection
  
### Frontend won't start
- **Error: Module not found**
  - Solution: Run `npm install` again
  
- **Blank page after login**
  - Solution: Check browser console (F12) for errors
  - Solution: Verify backend is running on port 3001

### Can't sign in
- **Error: Invalid credentials**
  - Solution: Check email confirmation was clicked
  - Solution: Try "Send Magic Link" instead
  
- **Error: 401 Unauthorized**
  - Solution: Check `SUPABASE_ANON_KEY` matches in both frontend and backend

### Database errors
- **Error: relation does not exist**
  - Solution: Re-run migrations in correct order
  
- **Error: permission denied**
  - Solution: Check RLS policies migration was run

## Next Steps

1. **Seed demo data**: Run `packages/db/seeds/001_demo_data.sql`
2. **Customize**: Edit pages in `apps/web/src/pages/`
3. **Add features**: Implement actual UI for chat, forum, etc.
4. **Deploy**: See `README.md` for Vercel deployment instructions

## Getting Help

- **Check logs**:
  - Backend: Look at terminal running `npm run dev` in `apps/api`
  - Frontend: Open browser DevTools (F12) → Console tab
  - Database: Supabase dashboard → Logs

- **Common issues**: See `README.md` → Troubleshooting section

- **Community**: [Your support channel]

---

**Need the full setup?** See `README.md` for detailed documentation.

**Ready to deploy?** See `docs/DEPLOYMENT.md` for production setup.
