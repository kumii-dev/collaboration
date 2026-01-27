#!/bin/bash

# Kumii Collaboration - Setup Verification Script
# Checks if everything is configured correctly

echo "🔍 Kumii Collaboration - Setup Verification"
echo "==========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ERRORS=0

echo "Checking configuration..."
echo ""

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Not in project root directory${NC}"
    exit 1
fi

echo -e "${YELLOW}1. Checking Dependencies${NC}"
echo "-----------------------------------"

# Check backend dependencies
if [ -d "apps/api/node_modules" ]; then
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "${RED}✗ Backend dependencies missing${NC}"
    echo "  Run: cd apps/api && npm install"
    ((ERRORS++))
fi

# Check frontend dependencies
if [ -d "apps/web/node_modules" ]; then
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
else
    echo -e "${RED}✗ Frontend dependencies missing${NC}"
    echo "  Run: cd apps/web && npm install"
    ((ERRORS++))
fi

echo ""
echo -e "${YELLOW}2. Checking Environment Files${NC}"
echo "-----------------------------------"

# Check backend .env
if [ -f "apps/api/.env" ]; then
    echo -e "${GREEN}✓ Backend .env exists${NC}"
    
    # Check if configured
    if grep -q "your-project-url" apps/api/.env 2>/dev/null; then
        echo -e "${RED}  ⚠️  Backend .env not configured (contains placeholder)${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}  ✓ Backend .env configured${NC}"
    fi
    
    # Check required variables
    required_vars=("SUPABASE_URL" "SUPABASE_ANON_KEY" "SUPABASE_SERVICE_ROLE_KEY" "JWT_SECRET")
    for var in "${required_vars[@]}"; do
        if grep -q "^$var=" apps/api/.env; then
            echo -e "${GREEN}  ✓ $var set${NC}"
        else
            echo -e "${RED}  ✗ $var missing${NC}"
            ((ERRORS++))
        fi
    done
else
    echo -e "${RED}✗ Backend .env missing${NC}"
    echo "  Copy apps/api/.env.example to apps/api/.env"
    ((ERRORS++))
fi

echo ""

# Check frontend .env
if [ -f "apps/web/.env" ]; then
    echo -e "${GREEN}✓ Frontend .env exists${NC}"
    
    # Check if configured
    if grep -q "your-project-url" apps/web/.env 2>/dev/null; then
        echo -e "${RED}  ⚠️  Frontend .env not configured (contains placeholder)${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}  ✓ Frontend .env configured${NC}"
    fi
    
    # Check required variables
    required_vars=("VITE_SUPABASE_URL" "VITE_SUPABASE_ANON_KEY" "VITE_API_URL")
    for var in "${required_vars[@]}"; do
        if grep -q "^$var=" apps/web/.env; then
            echo -e "${GREEN}  ✓ $var set${NC}"
        else
            echo -e "${RED}  ✗ $var missing${NC}"
            ((ERRORS++))
        fi
    done
else
    echo -e "${RED}✗ Frontend .env missing${NC}"
    echo "  Copy apps/web/.env.example to apps/web/.env"
    ((ERRORS++))
fi

echo ""
echo -e "${YELLOW}3. Checking TypeScript Configuration${NC}"
echo "-----------------------------------"

if [ -f "apps/api/tsconfig.json" ]; then
    echo -e "${GREEN}✓ Backend tsconfig.json exists${NC}"
else
    echo -e "${RED}✗ Backend tsconfig.json missing${NC}"
    ((ERRORS++))
fi

if [ -f "apps/web/tsconfig.json" ]; then
    echo -e "${GREEN}✓ Frontend tsconfig.json exists${NC}"
else
    echo -e "${RED}✗ Frontend tsconfig.json missing${NC}"
    ((ERRORS++))
fi

echo ""
echo -e "${YELLOW}4. Checking Database Files${NC}"
echo "-----------------------------------"

if [ -f "packages/db/migrations/001_initial_schema.sql" ]; then
    echo -e "${GREEN}✓ Initial schema migration exists${NC}"
else
    echo -e "${RED}✗ Initial schema migration missing${NC}"
    ((ERRORS++))
fi

if [ -f "packages/db/migrations/002_rls_policies.sql" ]; then
    echo -e "${GREEN}✓ RLS policies migration exists${NC}"
else
    echo -e "${RED}✗ RLS policies migration missing${NC}"
    ((ERRORS++))
fi

echo ""
echo -e "${YELLOW}5. Checking Port Availability${NC}"
echo "-----------------------------------"

# Check if port 3001 is available
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Port 3001 is in use (backend port)${NC}"
    echo "  Current process: $(lsof -Pi :3001 -sTCP:LISTEN | tail -n 1)"
    echo "  You may need to stop it before running the backend"
else
    echo -e "${GREEN}✓ Port 3001 available (backend)${NC}"
fi

# Check if port 5173 is available
if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Port 5173 is in use (frontend port)${NC}"
    echo "  Current process: $(lsof -Pi :5173 -sTCP:LISTEN | tail -n 1)"
    echo "  You may need to stop it before running the frontend"
else
    echo -e "${GREEN}✓ Port 5173 available (frontend)${NC}"
fi

echo ""
echo -e "${YELLOW}6. Checking Node.js & npm${NC}"
echo "-----------------------------------"

# Check Node version
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓ Node.js installed: $NODE_VERSION${NC}"
    
    # Check if version is 18+
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        echo -e "${YELLOW}  ⚠️  Node.js 18+ recommended (you have v$MAJOR_VERSION)${NC}"
    fi
else
    echo -e "${RED}✗ Node.js not found${NC}"
    ((ERRORS++))
fi

# Check npm version
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓ npm installed: $NPM_VERSION${NC}"
else
    echo -e "${RED}✗ npm not found${NC}"
    ((ERRORS++))
fi

echo ""
echo "==========================================="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! You're ready to start.${NC}"
    echo ""
    echo "To start the application:"
    echo ""
    echo "1. Terminal 1 - Backend:"
    echo "   cd apps/api && npm run dev"
    echo ""
    echo "2. Terminal 2 - Frontend:"
    echo "   cd apps/web && npm run dev"
    echo ""
    echo "3. Visit: http://localhost:5173"
    echo ""
else
    echo -e "${RED}❌ Found $ERRORS issue(s) that need attention.${NC}"
    echo ""
    echo "Please fix the issues above before starting the application."
    echo ""
    echo "Need help? Check:"
    echo "  - QUICKSTART.md for setup guide"
    echo "  - TROUBLESHOOTING.md for common issues"
    echo "  - ./setup-supabase.sh to configure Supabase"
    echo ""
fi

exit $ERRORS
