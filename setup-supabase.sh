#!/bin/bash

# Kumii Collaboration - Supabase Setup Assistant
# This script helps you configure your Supabase connection

echo "🚀 Kumii Collaboration - Supabase Setup Assistant"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Please run this script from the project root${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Create Supabase Project${NC}"
echo "-----------------------------------"
echo "1. Go to https://supabase.com"
echo "2. Sign in or create account"
echo "3. Click 'New Project'"
echo "4. Choose organization"
echo "5. Enter project details:"
echo "   - Name: kumii-collaboration (or your choice)"
echo "   - Database Password: (save this securely!)"
echo "   - Region: Choose closest to your users"
echo "6. Click 'Create new project'"
echo "7. Wait for project to initialize (2-3 minutes)"
echo ""
read -p "Press Enter when your Supabase project is ready..."

echo ""
echo -e "${YELLOW}📊 Step 2: Run Database Migrations${NC}"
echo "-----------------------------------"
echo "In your Supabase dashboard:"
echo "1. Click 'SQL Editor' in left sidebar"
echo "2. Click 'New Query'"
echo "3. Copy the contents of: packages/db/migrations/001_initial_schema.sql"
echo ""
echo -e "${BLUE}Opening migration file for you...${NC}"
echo ""

# Offer to open the file
if command -v cat &> /dev/null; then
    echo -e "${GREEN}✓ Here's a preview of the first migration:${NC}"
    echo "-----------------------------------"
    head -n 20 packages/db/migrations/001_initial_schema.sql
    echo "..."
    echo "(File continues...)"
    echo "-----------------------------------"
fi

echo ""
echo "4. Paste it in Supabase SQL Editor"
echo "5. Click 'Run' or press Cmd+Enter"
echo "6. Should see 'Success. No rows returned'"
echo ""
read -p "Press Enter when first migration is complete..."

echo ""
echo "Now run the second migration:"
echo "1. Click 'New Query' again"
echo "2. Copy contents of: packages/db/migrations/002_rls_policies.sql"
echo "3. Paste and run"
echo "4. Should see 'Success. No rows returned'"
echo ""
read -p "Press Enter when second migration is complete..."

echo ""
echo -e "${YELLOW}✅ Step 3: Verify Tables${NC}"
echo "-----------------------------------"
echo "In Supabase dashboard:"
echo "1. Click 'Table Editor' in left sidebar"
echo "2. You should see these tables:"
echo "   - profiles"
echo "   - conversations"
echo "   - messages"
echo "   - forum_categories"
echo "   - forum_boards"
echo "   - forum_threads"
echo "   - forum_posts"
echo "   - and 11 more..."
echo ""
read -p "Do you see all the tables? (y/n): " tables_ok

if [ "$tables_ok" != "y" ]; then
    echo -e "${RED}❌ Tables not found. Please re-run the migrations.${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}🗄️ Step 4: Create Storage Bucket${NC}"
echo "-----------------------------------"
echo "In Supabase dashboard:"
echo "1. Click 'Storage' in left sidebar"
echo "2. Click 'Create new bucket'"
echo "3. Bucket name: attachments"
echo "4. Public bucket: ✅ CHECK THIS"
echo "5. File size limit: 50 MB"
echo "6. Allowed MIME types: (leave empty)"
echo "7. Click 'Create bucket'"
echo ""
read -p "Press Enter when storage bucket is created..."

echo ""
echo -e "${YELLOW}🔑 Step 5: Get API Keys${NC}"
echo "-----------------------------------"
echo "In Supabase dashboard:"
echo "1. Click 'Settings' (gear icon) in left sidebar"
echo "2. Click 'API' under Project Settings"
echo "3. You'll see these keys:"
echo "   - Project URL"
echo "   - anon public key"
echo "   - service_role key (secret!)"
echo ""
echo "Let's configure your .env files now..."
echo ""

# Get Supabase URL
read -p "Enter your Supabase Project URL (e.g., https://xxxxx.supabase.co): " supabase_url
while [[ ! "$supabase_url" =~ ^https://.+\.supabase\.co$ ]]; do
    echo -e "${RED}Invalid URL format. Should be like: https://xxxxx.supabase.co${NC}"
    read -p "Enter your Supabase Project URL: " supabase_url
done

echo ""
# Get anon key
read -p "Enter your anon public key (starts with eyJ...): " anon_key
while [[ ! "$anon_key" =~ ^eyJ ]]; do
    echo -e "${RED}Invalid key format. Should start with 'eyJ'${NC}"
    read -p "Enter your anon public key: " anon_key
done

echo ""
# Get service role key
read -p "Enter your service_role key (starts with eyJ...): " service_key
while [[ ! "$service_key" =~ ^eyJ ]]; do
    echo -e "${RED}Invalid key format. Should start with 'eyJ'${NC}"
    read -p "Enter your service_role key: " service_key
done

echo ""
echo -e "${YELLOW}🔐 Step 6: Generate Secrets${NC}"
echo "-----------------------------------"
echo "Generating secure secrets for JWT and session..."

jwt_secret=$(openssl rand -base64 32)
session_secret=$(openssl rand -base64 32)

echo -e "${GREEN}✓ Secrets generated${NC}"

echo ""
echo -e "${YELLOW}📧 Step 7: Resend API Key (Optional)${NC}"
echo "-----------------------------------"
echo "For email notifications, you need a Resend API key:"
echo "1. Go to https://resend.com"
echo "2. Sign up or sign in"
echo "3. Create an API key"
echo ""
read -p "Enter your Resend API key (or press Enter to skip): " resend_key

if [ -z "$resend_key" ]; then
    resend_key="your-resend-api-key-here"
    echo -e "${YELLOW}⚠️  Skipped. You can add this later to apps/api/.env${NC}"
fi

echo ""
echo -e "${YELLOW}💾 Step 8: Writing Configuration Files${NC}"
echo "-----------------------------------"

# Write backend .env
cat > apps/api/.env << EOF
# Supabase Configuration
SUPABASE_URL=$supabase_url
SUPABASE_ANON_KEY=$anon_key
SUPABASE_SERVICE_ROLE_KEY=$service_key

# JWT Configuration
JWT_SECRET=$jwt_secret

# Email Configuration (Resend)
RESEND_API_KEY=$resend_key

# Session Configuration
SESSION_SECRET=$session_secret

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:5173
EOF

echo -e "${GREEN}✓ Created apps/api/.env${NC}"

# Write frontend .env
cat > apps/web/.env << EOF
# Supabase Configuration
VITE_SUPABASE_URL=$supabase_url
VITE_SUPABASE_ANON_KEY=$anon_key

# API Configuration
VITE_API_URL=http://localhost:3001/api
EOF

echo -e "${GREEN}✓ Created apps/web/.env${NC}"

echo ""
echo -e "${GREEN}✅ Configuration Complete!${NC}"
echo "=========================="
echo ""
echo "Your environment is now configured with:"
echo "  ✓ Supabase connection"
echo "  ✓ Database with 18+ tables"
echo "  ✓ RLS security policies"
echo "  ✓ Storage bucket for attachments"
echo "  ✓ Secure JWT and session secrets"
echo "  ✓ Backend .env file"
echo "  ✓ Frontend .env file"
echo ""

echo -e "${YELLOW}🚀 Next Steps:${NC}"
echo "-----------------------------------"
echo ""
echo "1. Start the backend server:"
echo "   ${BLUE}cd apps/api && npm run dev${NC}"
echo ""
echo "2. In a new terminal, start the frontend:"
echo "   ${BLUE}cd apps/web && npm run dev${NC}"
echo ""
echo "3. Visit http://localhost:5173"
echo ""
echo "4. Sign up for a new account"
echo ""
echo "5. Make yourself admin:"
echo "   In Supabase SQL Editor, run:"
echo "   ${BLUE}UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';${NC}"
echo ""
echo ""
echo -e "${GREEN}🎉 Setup complete! Happy coding!${NC}"
echo ""
echo "Need help? Check TROUBLESHOOTING.md"
echo ""
