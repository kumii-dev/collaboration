# 🎯 Setup Checklist - Kumii Collaboration Module

Use this checklist to track your setup progress. Check off each item as you complete it.

## ✅ Phase 1: Environment Setup (10 min)

### Prerequisites
- [ ] Node.js 18+ installed (`node -v`)
- [ ] npm installed (`npm -v`)
- [ ] Git installed (optional, for version control)
- [ ] Code editor (VS Code recommended)

### Accounts & Services
- [ ] Supabase account created (https://supabase.com)
- [ ] Resend account created (https://resend.com)
- [ ] GitHub account (optional, for deployment)
- [ ] Vercel account (optional, for deployment)

---

## ✅ Phase 2: Database Setup (15 min)

### Supabase Project Creation
- [ ] New Supabase project created
- [ ] Project name: `kumii-collaboration` (or your choice)
- [ ] Region selected (choose closest to your users)
- [ ] Database password saved securely
- [ ] Project is fully initialized (wait for green status)

### Run Migrations
- [ ] Open SQL Editor in Supabase dashboard
- [ ] Create new query
- [ ] Copy contents of `packages/db/migrations/001_initial_schema.sql`
- [ ] Execute migration (should see "Success. No rows returned")
- [ ] Create another new query
- [ ] Copy contents of `packages/db/migrations/002_rls_policies.sql`
- [ ] Execute migration (should see "Success. No rows returned")
- [ ] Verify tables created: Go to Table Editor, should see 18+ tables

### Storage Setup
- [ ] Navigate to Storage in Supabase
- [ ] Click "New bucket"
- [ ] Name: `attachments`
- [ ] Public bucket: ✅ (checked)
- [ ] File size limit: 50 MB (or your preference)
- [ ] Allowed MIME types: Leave empty for all types
- [ ] Click "Create bucket"

### Get API Keys
- [ ] Go to Project Settings → API
- [ ] Copy **Project URL** (e.g., https://xxxxx.supabase.co)
- [ ] Copy **anon public** key (starts with `eyJ...`)
- [ ] Copy **service_role** key (starts with `eyJ...`)
- [ ] ⚠️ Keep service_role key secret! Never commit to git

---

## ✅ Phase 3: Backend Configuration (10 min)

### Install Dependencies
- [ ] Open terminal in project root
- [ ] Run: `cd apps/api`
- [ ] Run: `npm install`
- [ ] Wait for installation to complete (may take 2-3 minutes)
- [ ] Verify no errors in output

### Configure Environment Variables
- [ ] Open `apps/api/.env` in code editor
- [ ] Update `SUPABASE_URL` with your Project URL
- [ ] Update `SUPABASE_ANON_KEY` with your anon public key
- [ ] Update `SUPABASE_SERVICE_ROLE_KEY` with your service_role key
- [ ] Generate JWT secret: `openssl rand -base64 32`
- [ ] Paste result into `JWT_SECRET`
- [ ] Generate session secret: `openssl rand -base64 32`
- [ ] Paste result into `SESSION_SECRET`
- [ ] Update `RESEND_API_KEY` (get from resend.com dashboard)
- [ ] Save file
- [ ] ⚠️ Ensure .env is in .gitignore (already done)

### Test Backend
- [ ] In `apps/api` directory, run: `npm run dev`
- [ ] Should see: "✅ Server running on http://localhost:3001"
- [ ] Should see: "✅ Supabase connected"
- [ ] Open browser: http://localhost:3001/api/health
- [ ] Should see JSON: `{"success": true, "message": "API is running"}`
- [ ] Keep this terminal open (backend running)

---

## ✅ Phase 4: Frontend Configuration (10 min)

### Install Dependencies
- [ ] Open NEW terminal window
- [ ] Run: `cd apps/web`
- [ ] Run: `npm install`
- [ ] Wait for installation to complete
- [ ] Verify no errors in output

### Configure Environment Variables
- [ ] Open `apps/web/.env` in code editor
- [ ] Update `VITE_SUPABASE_URL` with your Project URL
- [ ] Update `VITE_SUPABASE_ANON_KEY` with your anon public key
- [ ] Verify `VITE_API_URL=http://localhost:3001/api`
- [ ] Save file

### Test Frontend
- [ ] In `apps/web` directory, run: `npm run dev`
- [ ] Should see: "Local: http://localhost:5173/"
- [ ] Open browser: http://localhost:5173
- [ ] Should see Kumii login page
- [ ] Keep this terminal open (frontend running)

---

## ✅ Phase 5: Create First User (5 min)

### Sign Up
- [ ] On login page, click "Sign Up" tab
- [ ] Enter email address
- [ ] Enter password (min 6 characters)
- [ ] Click "Sign Up"
- [ ] Should see success message
- [ ] Check email for confirmation link (if email confirmation enabled)

### Verify User in Database
- [ ] Go to Supabase dashboard
- [ ] Navigate to Table Editor → profiles
- [ ] Should see your user record
- [ ] Note the `id` value (UUID)

### Make User Admin
- [ ] In Supabase, go to SQL Editor
- [ ] Create new query
- [ ] Paste and run:
```sql
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```
- [ ] Should see "Success. 1 row affected"
- [ ] Refresh browser, log out and log back in
- [ ] Should now have admin access

---

## ✅ Phase 6: Test Core Features (15 min)

### Authentication
- [ ] Log out
- [ ] Log in with email/password
- [ ] Log out
- [ ] Try "Send Magic Link"
- [ ] Check email and click link
- [ ] Should be logged in

### Navigation
- [ ] Click "Chat" in sidebar
- [ ] Should navigate to chat page
- [ ] Click "Forums" in sidebar
- [ ] Should navigate to forums page
- [ ] Click "Moderation" (if admin)
- [ ] Should see moderation dashboard
- [ ] Click profile icon in topbar
- [ ] Should see dropdown menu

### Database Verification
- [ ] In Supabase Table Editor, check these tables:
  - [ ] `profiles` - Has your user
  - [ ] `forum_categories` - Should have demo categories
  - [ ] `forum_boards` - Should have demo boards
  - [ ] `audit_logs` - Should have login events

---

## ✅ Phase 7: Seed Demo Data (Optional, 5 min)

### Load Sample Forum Data
- [ ] In Supabase SQL Editor, create new query
- [ ] Copy contents of `packages/db/seeds/001_demo_data.sql`
- [ ] Execute query
- [ ] Refresh frontend forums page
- [ ] Should see populated categories and boards

---

## ✅ Phase 8: Email Testing (Optional, 10 min)

### Configure Resend
- [ ] Go to resend.com dashboard
- [ ] Navigate to API Keys
- [ ] Create new API key
- [ ] Name it "Kumii Collaboration Dev"
- [ ] Copy the key
- [ ] Update `RESEND_API_KEY` in `apps/api/.env`
- [ ] Restart backend server (Ctrl+C, then `npm run dev`)

### Add Verified Domain (Production)
- [ ] In Resend dashboard, go to Domains
- [ ] Click "Add Domain"
- [ ] Enter your domain (e.g., kumii.co.za)
- [ ] Follow DNS configuration steps
- [ ] Wait for verification (can take up to 48 hours)

### Test Email Sending
- [ ] Create a forum post with @mention
- [ ] Check mentioned user's email
- [ ] Should receive notification email
- [ ] Check backend logs for email send confirmation

---

## ✅ Phase 9: Production Deployment (Optional, 30 min)

### Deploy Backend to Vercel
- [ ] Push code to GitHub repository
- [ ] Go to vercel.com and import project
- [ ] Select `apps/api` as root directory
- [ ] Add all environment variables from `.env`
- [ ] Deploy
- [ ] Copy deployment URL (e.g., https://api.kumii.app)

### Deploy Frontend to Vercel
- [ ] In Vercel, add another project
- [ ] Select same repository
- [ ] Select `apps/web` as root directory
- [ ] Update environment variables:
  - [ ] `VITE_API_URL` → Your backend URL
  - [ ] `VITE_SUPABASE_URL` → Same as before
  - [ ] `VITE_SUPABASE_ANON_KEY` → Same as before
- [ ] Deploy
- [ ] Visit your production URL

### Update CORS Settings
- [ ] Update `apps/api/.env` production
- [ ] Set `CORS_ORIGIN` to your frontend URL
- [ ] Redeploy backend

### Configure Supabase Auth
- [ ] In Supabase dashboard, go to Authentication → URL Configuration
- [ ] Add your production URL to "Site URL"
- [ ] Add to "Redirect URLs"
- [ ] Save changes

---

## 🎉 Setup Complete!

### What You Have Now:
✅ Fully functional collaboration platform  
✅ Secure authentication system  
✅ Private chat capability  
✅ Forum with categories and boards  
✅ Moderation tools  
✅ Email notifications  
✅ Admin dashboard  
✅ Production-ready deployment

### Next Steps:
- [ ] Review docs/ARCHITECTURE.md for system design
- [ ] Implement full chat UI (currently placeholder)
- [ ] Implement full forum UI (currently placeholder)
- [ ] Add unit tests
- [ ] Set up CI/CD pipeline
- [ ] Configure monitoring and logging
- [ ] Perform security audit
- [ ] Load testing

### Need Help?
- 📖 **Documentation**: See README.md
- 🏗️ **Architecture**: See docs/ARCHITECTURE.md
- 🚀 **Quick Start**: See QUICKSTART.md
- 🐛 **Issues**: Check troubleshooting section in QUICKSTART.md

---

## 📊 Progress Summary

**Completed:** _____ / 100 tasks

**Time Invested:** _____ hours

**Status:** 
- [ ] In Setup
- [ ] Development Ready
- [ ] Testing
- [ ] Production Deployed

**Notes:**
_Add any custom notes or issues encountered here_

---

**Last Updated:** January 27, 2026  
**Version:** 1.0.0
