# Vercel Deployment - Quick Start Summary

## ✅ Your Project is Ready for Vercel!

All necessary configuration files have been created and committed to your repository.

---

## 📁 Files Created

### Configuration Files
- ✅ `vercel.json` - Root configuration (monorepo support)
- ✅ `apps/api/vercel.json` - Backend API configuration
- ✅ `apps/web/vercel.json` - Frontend web configuration
- ✅ `.vercelignore` - Files to exclude from deployment
- ✅ `.env.production.example` - Production environment variables template

### Documentation
- ✅ `VERCEL_DEPLOYMENT.md` - Complete deployment guide (READ THIS FIRST!)
- ✅ `DEPLOYMENT_CHECKLIST.md` - Pre-deployment verification checklist

### Scripts
- ✅ `deploy-vercel.sh` - Automated deployment helper script (chmod +x applied)

### Code Optimizations
- ✅ Updated `vite.config.ts` with production build optimizations
- ✅ Added `vercel-build` scripts to package.json files
- ✅ Made email configuration optional in API config
- ✅ Added code splitting for better performance

---

## 🚀 Deployment Options

### Option 1: Quick Deploy via Script (Easiest)
```bash
./deploy-vercel.sh
```
Follow the prompts to deploy API, Web, or both.

### Option 2: Manual Deploy - Separate Projects (Recommended)

**Step 1: Deploy Backend API**
```bash
cd apps/api
vercel login
vercel --prod
# Note your API URL (e.g., https://kumii-api.vercel.app)
```

**Step 2: Deploy Frontend Web**
```bash
cd apps/web
vercel --prod
# Note your Web URL (e.g., https://kumii-collaboration.vercel.app)
```

### Option 3: GitHub Integration (Best for CI/CD)

1. Push your code to GitHub (✅ Already done!)
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "Import Project"
4. Select your GitHub repository
5. Create **TWO separate projects**:
   - **Project 1 (API)**: Set Root Directory to `apps/api`
   - **Project 2 (Web)**: Set Root Directory to `apps/web`
6. Configure environment variables for each
7. Deploy!

---

## ⚠️ Important: Before Deploying

### 1. Generate Security Secrets
```bash
# Generate JWT_SECRET (copy the output)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate SESSION_SECRET (copy the output)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Prepare Environment Variables

Check `.env.production.example` for the complete list. You'll need:

**Backend API (Required)**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET` (generated above)
- `SESSION_SECRET` (generated above)
- `CORS_ORIGIN` (your frontend Vercel URL)
- `API_URL` (your API Vercel URL)

**Frontend Web (Required)**
- `VITE_API_URL` (your API Vercel URL + /api)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL` (your Web Vercel URL)

### 3. Install Vercel CLI (if not installed)
```bash
npm install -g vercel
```

### 4. Review Checklist
Open `DEPLOYMENT_CHECKLIST.md` and verify all items.

---

## 📝 Deployment Workflow

### First Time Deployment

1. **Deploy API First**
   ```bash
   cd apps/api
   vercel --prod
   ```
   - Note your API URL
   - Add environment variables in Vercel dashboard

2. **Update Frontend Config**
   - In Vercel dashboard, add `VITE_API_URL` with your API URL

3. **Deploy Frontend**
   ```bash
   cd apps/web
   vercel --prod
   ```
   - Note your Web URL

4. **Update API CORS**
   - In Vercel dashboard (API project), update `CORS_ORIGIN` to your Web URL
   - Redeploy: `vercel --prod`

5. **Update Supabase**
   - Add your Web URL to Supabase allowed URLs
   - Set as Site URL in Supabase auth settings

### Subsequent Deployments

```bash
# Deploy API
cd apps/api && vercel --prod

# Deploy Web
cd apps/web && vercel --prod
```

Or use the script:
```bash
./deploy-vercel.sh
```

---

## 🧪 Testing Your Deployment

After deployment, verify:

1. **Frontend loads**: Visit your Web URL
2. **API health check**: Visit `https://your-api.vercel.app/health`
3. **Authentication works**: Try logging in
4. **Features work**: Test chat and forum
5. **No CORS errors**: Check browser console
6. **Check logs**: Review Vercel dashboard for errors

---

## 📚 Documentation

For complete details, read these in order:

1. **DEPLOYMENT_CHECKLIST.md** - Verify you're ready
2. **VERCEL_DEPLOYMENT.md** - Complete deployment guide
3. **.env.production.example** - Environment variables reference

---

## 🆘 Quick Troubleshooting

**Build fails?**
- Test locally: `cd apps/web && npm run build`
- Check Vercel build logs

**CORS errors?**
- Update `CORS_ORIGIN` to match frontend URL exactly
- Redeploy API

**API 404?**
- Verify `VITE_API_URL` includes `/api` path
- Example: `https://your-api.vercel.app/api`

**Can't connect to database?**
- Check Supabase credentials
- Verify RLS policies

---

## ✨ What's Different from Local Dev?

### Development (Local)
- API: `http://localhost:3001`
- Web: `http://localhost:5173`
- Proxy handles API calls

### Production (Vercel)
- API: `https://your-api.vercel.app`
- Web: `https://your-web.vercel.app`
- Direct API calls (no proxy)
- Environment variables from Vercel
- Optimized builds
- Serverless functions

---

## 🎯 Next Steps

1. ✅ Install Vercel CLI: `npm install -g vercel`
2. ✅ Generate security secrets (see above)
3. ✅ Review DEPLOYMENT_CHECKLIST.md
4. ✅ Choose deployment option (script, manual, or GitHub)
5. ✅ Deploy!
6. ✅ Configure environment variables
7. ✅ Test your deployment
8. ✅ Update Supabase configuration
9. ✅ Celebrate! 🎉

---

## 💡 Pro Tips

- **Use GitHub Integration** for automatic deployments on push
- **Set up custom domain** in Vercel dashboard for professional URLs
- **Enable Vercel Analytics** to monitor performance
- **Use preview deployments** to test before going to production
- **Set up Vercel Secrets** for sensitive environment variables
- **Monitor Vercel logs** for runtime issues

---

## 📞 Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel CLI Reference](https://vercel.com/docs/cli)
- [Supabase Documentation](https://supabase.com/docs)
- Project Issues: Check your GitHub repository

---

**Ready to deploy?** Start with the script or follow the manual steps above!

Good luck! 🚀
