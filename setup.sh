#!/bin/bash

# Kumii Collaboration Module - Complete Setup Script
# Run this after setting up Supabase and getting API keys

echo "🚀 Kumii Collaboration Module Setup"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Please run this script from the project root${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Prerequisites Check${NC}"
echo "-----------------------------------"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+${NC}"
    exit 1
else
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✅ Node.js: $NODE_VERSION${NC}"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
else
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✅ npm: $NPM_VERSION${NC}"
fi

echo ""
echo -e "${YELLOW}📦 Installing Dependencies${NC}"
echo "-----------------------------------"

# Install backend dependencies
echo "Installing backend dependencies..."
cd apps/api
if npm install; then
    echo -e "${GREEN}✅ Backend dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install backend dependencies${NC}"
    exit 1
fi
cd ../..

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd apps/web
if npm install; then
    echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install frontend dependencies${NC}"
    exit 1
fi
cd ../..

echo ""
echo -e "${YELLOW}🔧 Configuration Check${NC}"
echo "-----------------------------------"

# Check backend .env
if [ -f "apps/api/.env" ]; then
    if grep -q "your-project-url" apps/api/.env; then
        echo -e "${YELLOW}⚠️  Backend .env needs configuration${NC}"
        echo "   Please update apps/api/.env with your actual credentials"
    else
        echo -e "${GREEN}✅ Backend .env configured${NC}"
    fi
else
    echo -e "${RED}❌ Backend .env not found${NC}"
    echo "   Copy apps/api/.env.example to apps/api/.env"
fi

# Check frontend .env
if [ -f "apps/web/.env" ]; then
    if grep -q "your-project-url" apps/web/.env; then
        echo -e "${YELLOW}⚠️  Frontend .env needs configuration${NC}"
        echo "   Please update apps/web/.env with your actual credentials"
    else
        echo -e "${GREEN}✅ Frontend .env configured${NC}"
    fi
else
    echo -e "${RED}❌ Frontend .env not found${NC}"
    echo "   Copy apps/web/.env.example to apps/web/.env"
fi

echo ""
echo -e "${YELLOW}📊 Database Setup${NC}"
echo "-----------------------------------"
echo "Next steps:"
echo "1. Go to https://supabase.com and create a new project"
echo "2. In the SQL Editor, run these migrations in order:"
echo "   a) packages/db/migrations/001_initial_schema.sql"
echo "   b) packages/db/migrations/002_rls_policies.sql"
echo "3. Go to Storage → Create bucket named 'attachments' (public)"
echo "4. Copy your Project URL and API keys to .env files"
echo ""
echo "Get your keys from: Project Settings → API"
echo "- SUPABASE_URL: Project URL"
echo "- SUPABASE_ANON_KEY: anon public key"
echo "- SUPABASE_SERVICE_ROLE_KEY: service_role key (keep secret!)"
echo ""

echo -e "${YELLOW}📧 Email Setup (Resend)${NC}"
echo "-----------------------------------"
echo "1. Go to https://resend.com and create an account"
echo "2. Create an API key"
echo "3. Add to apps/api/.env as RESEND_API_KEY"
echo ""

echo -e "${YELLOW}🔐 Security Setup${NC}"
echo "-----------------------------------"
echo "Generate secure secrets for JWT and session:"
echo ""
echo "Run these commands and add to apps/api/.env:"
echo "  JWT_SECRET=\$(openssl rand -base64 32)"
echo "  SESSION_SECRET=\$(openssl rand -base64 32)"
echo ""

echo -e "${GREEN}✅ Setup script complete!${NC}"
echo ""
echo -e "${YELLOW}🚀 To start the application:${NC}"
echo "-----------------------------------"
echo "Terminal 1 (Backend):"
echo "  cd apps/api"
echo "  npm run dev"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd apps/web"
echo "  npm run dev"
echo ""
echo "Then visit: http://localhost:5173"
echo ""
echo -e "${YELLOW}📖 Need help? Check:${NC}"
echo "  - QUICKSTART.md for step-by-step guide"
echo "  - README.md for full documentation"
echo "  - docs/ARCHITECTURE.md for system design"
echo ""
