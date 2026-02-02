# Vercel Deployment Guide

This guide will help you deploy the Kumii Collaboration platform to Vercel.

## Architecture

This project uses a monorepo structure with two main applications:
- **Frontend (apps/web)**: React + Vite application
- **Backend (apps/api)**: Express.js API server

## Deployment Strategy

We recommend deploying as **two separate Vercel projects**:

1. **Frontend Project**: Deploy from `apps/web` directory
2. **Backend Project**: Deploy from `apps/api` directory

This approach provides better separation of concerns and easier management.

---

## Prerequisites

1. A Vercel account (https://vercel.com)
2. Vercel CLI installed: `npm install -g vercel`
3. Supabase project set up with your database
4. All environment variables ready

---

## Step 1: Deploy the Backend API

### 1.1 Navigate to API Directory
```bash
cd apps/api
```

### 1.2 Login to Vercel
```bash
vercel login
```

### 1.3 Deploy to Vercel
```bash
# For first deployment (creates project)
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Select your account
# - Link to existing project? No
# - Project name? kumii-collaboration-api (or your choice)
# - In which directory is your code located? ./
# - Want to override settings? No
```

### 1.4 Configure Environment Variables

In your Vercel dashboard (or via CLI):

```bash
# Add environment variables
vercel env add NODE_ENV
# Enter: production

vercel env add PORT
# Enter: 3001

vercel env add SUPABASE_URL
# Enter: your_supabase_project_url

vercel env add SUPABASE_ANON_KEY
# Enter: your_supabase_anon_key

vercel env add SUPABASE_SERVICE_ROLE_KEY
# Enter: your_supabase_service_role_key

vercel env add JWT_SECRET
# Enter: your_secure_jwt_secret

vercel env add CORS_ORIGIN
# Enter: your_frontend_vercel_url (e.g., https://kumii-collaboration.vercel.app)

vercel env add API_URL
# Enter: your_api_vercel_url (e.g., https://kumii-collaboration-api.vercel.app)

# Optional: Email configuration
vercel env add RESEND_API_KEY
vercel env add RESEND_FROM_EMAIL
```

### 1.5 Deploy to Production
```bash
vercel --prod
```

**Note your API URL** (e.g., `https://kumii-collaboration-api.vercel.app`)

---

## Step 2: Deploy the Frontend

### 2.1 Navigate to Web Directory
```bash
cd ../web
```

### 2.2 Deploy to Vercel
```bash
# For first deployment
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Select your account
# - Link to existing project? No
# - Project name? kumii-collaboration-web (or your choice)
# - In which directory is your code located? ./
# - Want to override settings? No
```

### 2.3 Configure Environment Variables

```bash
vercel env add VITE_API_URL
# Enter: https://your-api-deployment.vercel.app/api

vercel env add VITE_SUPABASE_URL
# Enter: your_supabase_project_url

vercel env add VITE_SUPABASE_ANON_KEY
# Enter: your_supabase_anon_key

vercel env add VITE_APP_NAME
# Enter: Kumii Collaboration

vercel env add VITE_APP_URL
# Enter: https://your-web-deployment.vercel.app

vercel env add VITE_ENABLE_REALTIME
# Enter: true

vercel env add VITE_ENABLE_NOTIFICATIONS
# Enter: true
```

### 2.4 Deploy to Production
```bash
vercel --prod
```

---

## Step 3: Update CORS Configuration

After deploying both projects, you need to update the backend's CORS configuration:

1. Go to your **API project** in Vercel dashboard
2. Navigate to **Settings > Environment Variables**
3. Update `CORS_ORIGIN` to your frontend URL (e.g., `https://kumii-collaboration.vercel.app`)
4. Redeploy the API: `vercel --prod`

---

## Step 4: Update Supabase Configuration

### 4.1 Add Vercel URLs to Supabase Allowed URLs

1. Go to your Supabase project dashboard
2. Navigate to **Authentication > URL Configuration**
3. Add your Vercel URLs to **Site URL** and **Redirect URLs**:
   - Site URL: `https://your-web-deployment.vercel.app`
   - Add to Redirect URLs: `https://your-web-deployment.vercel.app/**`

### 4.2 Update RLS Policies (if needed)

Ensure your Row Level Security policies allow access from the production environment.

---

## Alternative: Single Vercel Project (Monorepo)

If you prefer to deploy as a single project, you can use the root `vercel.json`:

```bash
# From project root
vercel

# Configure all environment variables for both apps
vercel env add NODE_ENV
vercel env add VITE_API_URL
# ... (add all variables)

vercel --prod
```

**Note**: This approach is more complex and may have routing challenges.

---

## Continuous Deployment

### Option 1: GitHub Integration

1. Push your code to GitHub
2. In Vercel dashboard, import your repository
3. Create two projects (one for API, one for Web)
4. Set the **Root Directory** for each:
   - API Project: `apps/api`
   - Web Project: `apps/web`
5. Configure environment variables
6. Every push to `main` will trigger automatic deployment

### Option 2: CLI Deployments

```bash
# Deploy API
cd apps/api && vercel --prod

# Deploy Web
cd apps/web && vercel --prod
```

---

## Verification Checklist

After deployment, verify:

- ✅ Frontend loads at your Vercel URL
- ✅ API health check works: `https://your-api.vercel.app/health`
- ✅ Authentication works (login/signup)
- ✅ Chat functionality works
- ✅ Forum functionality works
- ✅ File uploads work (check Supabase storage)
- ✅ Real-time features work (if enabled)
- ✅ No CORS errors in browser console

---

## Troubleshooting

### CORS Errors
- Ensure `CORS_ORIGIN` in API matches your frontend URL exactly
- No trailing slash in URLs
- Redeploy API after changing environment variables

### API Not Found (404)
- Verify `VITE_API_URL` includes `/api` path
- Example: `https://your-api.vercel.app/api`

### Build Failures
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify TypeScript compiles locally: `npm run build`

### Environment Variables Not Working
- Vercel requires redeployment after adding/changing env vars
- Use `vercel --prod` to redeploy
- Frontend vars MUST start with `VITE_`

### Database Connection Issues
- Verify Supabase URL and keys are correct
- Check Supabase project is not paused
- Ensure RLS policies allow access

---

## Updating Your Deployment

```bash
# Pull latest changes
git pull origin main

# Update dependencies if needed
npm install

# Deploy
cd apps/api && vercel --prod
cd ../web && vercel --prod
```

---

## Monitoring & Logs

- **Vercel Dashboard**: View deployment logs and runtime logs
- **Supabase Dashboard**: Monitor database queries and storage
- **Browser DevTools**: Check for frontend errors

---

## Cost Considerations

### Vercel Free Tier Includes:
- Unlimited deployments
- 100GB bandwidth per month
- Serverless function execution time limits
- Custom domains

### Supabase Free Tier Includes:
- 500MB database storage
- 1GB file storage
- 50MB file upload limit
- 50,000 monthly active users

---

## Production Best Practices

1. **Use Production Secrets**: Generate strong, unique values for `JWT_SECRET` and `SESSION_SECRET`
2. **Enable Vercel Analytics**: Monitor performance
3. **Set up Custom Domain**: Use your own domain instead of `.vercel.app`
4. **Configure Vercel Edge Network**: Optimize for your users' locations
5. **Monitor Supabase Usage**: Set up alerts for quota limits
6. **Regular Backups**: Use Supabase backup features
7. **Security Headers**: Review and tighten helmet.js configuration
8. **Rate Limiting**: Adjust based on production traffic patterns

---

## Support

For issues:
1. Check Vercel deployment logs
2. Review Supabase logs
3. Check browser console for errors
4. Verify all environment variables are set correctly

---

## Quick Reference: Environment Variables

### Backend (apps/api)
```
NODE_ENV=production
PORT=3001
API_URL=https://your-api.vercel.app
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_secure_secret
CORS_ORIGIN=https://your-frontend.vercel.app
RESEND_API_KEY=re_xxx (optional)
RESEND_FROM_EMAIL=noreply@yourdomain.com (optional)
```

### Frontend (apps/web)
```
VITE_API_URL=https://your-api.vercel.app/api
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_APP_NAME=Kumii Collaboration
VITE_APP_URL=https://your-frontend.vercel.app
VITE_ENABLE_REALTIME=true
VITE_ENABLE_NOTIFICATIONS=true
```
