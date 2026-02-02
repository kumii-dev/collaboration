# Pre-Deployment Checklist for Vercel

Complete this checklist before deploying to Vercel to ensure a smooth deployment.

## ✅ Prerequisites

- [ ] Vercel account created (https://vercel.com)
- [ ] Vercel CLI installed: `npm install -g vercel`
- [ ] Logged into Vercel CLI: `vercel login`
- [ ] Supabase project created and configured
- [ ] All SQL migrations run on Supabase database
- [ ] Repository pushed to GitHub (optional but recommended)

## ✅ Environment Variables Prepared

### Backend API Required Variables
- [ ] `NODE_ENV=production`
- [ ] `PORT=3001`
- [ ] `API_URL` (will be your Vercel API URL)
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `JWT_SECRET` (minimum 32 characters, use `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- [ ] `SESSION_SECRET` (minimum 32 characters, generate similar to JWT_SECRET)
- [ ] `CORS_ORIGIN` (will be your Vercel Web URL)

### Frontend Web Required Variables
- [ ] `VITE_API_URL` (will be your Vercel API URL + /api)
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `VITE_APP_NAME`
- [ ] `VITE_APP_URL` (will be your Vercel Web URL)
- [ ] `VITE_ENABLE_REALTIME`
- [ ] `VITE_ENABLE_NOTIFICATIONS`

### Optional Variables
- [ ] `RESEND_API_KEY` (if using email features)
- [ ] `RESEND_FROM_EMAIL` (if using email features)

## ✅ Code Quality Checks

- [ ] All TypeScript files compile without errors: `cd apps/api && npm run build`
- [ ] Frontend builds successfully: `cd apps/web && npm run build`
- [ ] No console errors in development mode
- [ ] All dependencies are in package.json (not globally installed)
- [ ] .env files are in .gitignore (not committed to Git)

## ✅ Database Ready

- [ ] Supabase tables created (use SQL files in root directory)
- [ ] Row Level Security (RLS) policies configured
- [ ] Storage buckets created (`collaboration-attachments`)
- [ ] Storage policies configured for file uploads
- [ ] Test data seeded (optional)

## ✅ Configuration Files

- [ ] `vercel.json` files created (root, apps/api, apps/web)
- [ ] `.vercelignore` file created
- [ ] `vite.config.ts` optimized for production
- [ ] Package.json scripts include `vercel-build`

## ✅ Supabase Configuration

- [ ] Authentication enabled
- [ ] Email provider configured (if using)
- [ ] Site URL will be updated to Vercel URL after deployment
- [ ] Redirect URLs will be updated after deployment
- [ ] API rate limits configured appropriately

## ✅ Security

- [ ] Strong JWT_SECRET generated (32+ characters)
- [ ] Strong SESSION_SECRET generated (32+ characters)
- [ ] Supabase service role key kept secure
- [ ] No secrets in code or Git history
- [ ] CORS properly configured for production
- [ ] Helmet security headers configured
- [ ] Rate limiting enabled

## ✅ Testing

- [ ] Authentication flow tested locally
- [ ] Chat functionality tested locally
- [ ] Forum functionality tested locally
- [ ] File upload tested locally
- [ ] All API endpoints respond correctly
- [ ] Frontend routing works correctly

## ✅ Deployment Strategy

Choose one:
- [ ] **Option A**: Deploy both as separate Vercel projects (recommended)
  - Deploy API first from `apps/api`
  - Then deploy Web from `apps/web`
  - Easier to manage and scale
  
- [ ] **Option B**: Deploy as monorepo from root
  - Single deployment but more complex routing
  - Use root `vercel.json` configuration

## ✅ Documentation

- [ ] Read VERCEL_DEPLOYMENT.md
- [ ] Environment variables documented
- [ ] Deployment URLs documented
- [ ] Team members have access to Vercel projects

## 🚀 Ready to Deploy?

If all items above are checked, you're ready to deploy!

### Quick Deploy Commands:

**Option A: Separate Projects (Recommended)**
```bash
# Deploy API
cd apps/api
vercel --prod

# Deploy Web (update VITE_API_URL first!)
cd ../web
vercel --prod
```

**Option B: Using Deploy Script**
```bash
./deploy-vercel.sh
```

**Option C: GitHub Integration**
1. Push to GitHub
2. Import project in Vercel dashboard
3. Create two projects with root directories:
   - API: `apps/api`
   - Web: `apps/web`
4. Configure environment variables
5. Deploy automatically on push

## 📋 Post-Deployment Tasks

After successful deployment:

- [ ] Note your deployment URLs
- [ ] Update API `CORS_ORIGIN` to frontend URL
- [ ] Update Web `VITE_API_URL` to API URL
- [ ] Redeploy both after URL updates
- [ ] Update Supabase Site URL to Web deployment URL
- [ ] Add Web deployment URL to Supabase Redirect URLs
- [ ] Test authentication on production
- [ ] Test all major features on production
- [ ] Set up custom domain (optional)
- [ ] Configure Vercel Analytics (optional)
- [ ] Set up monitoring/alerting
- [ ] Document deployment URLs for team

## 🔍 Verification Steps

- [ ] Visit your Web URL - site loads
- [ ] Check API health: `https://your-api.vercel.app/health`
- [ ] Sign up / Log in works
- [ ] Chat page loads and functions
- [ ] Forum page loads and functions
- [ ] File uploads work
- [ ] No CORS errors in browser console
- [ ] No 500 errors in Vercel logs
- [ ] Real-time features work (if enabled)

## ⚠️ Common Issues

**Build Fails**
- Check Vercel build logs
- Verify all dependencies in package.json
- Test build locally: `npm run build`

**CORS Errors**
- Verify CORS_ORIGIN matches frontend URL exactly
- No trailing slashes
- Redeploy API after changing env vars

**404 on API Calls**
- Verify VITE_API_URL includes /api path
- Check API routes are correct
- Verify vercel.json routing configuration

**Database Connection Fails**
- Check Supabase URL and keys
- Verify RLS policies allow access
- Check Supabase project is active

## 📚 Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [Supabase Documentation](https://supabase.com/docs)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

**Need Help?** Check VERCEL_DEPLOYMENT.md for detailed deployment instructions.
