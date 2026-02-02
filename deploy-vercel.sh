#!/bin/bash

# Vercel Deployment Script for Kumii Collaboration
# This script helps deploy both frontend and backend to Vercel

set -e

echo "🚀 Kumii Collaboration - Vercel Deployment"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Vercel CLI is not installed${NC}"
    echo -e "${YELLOW}Install it with: npm install -g vercel${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Vercel CLI is installed${NC}"
echo ""

# Check if user is logged in
if ! vercel whoami &> /dev/null; then
    echo -e "${YELLOW}Please log in to Vercel first${NC}"
    vercel login
fi

echo -e "${GREEN}✅ Logged in to Vercel${NC}"
echo ""

# Ask which component to deploy
echo "What would you like to deploy?"
echo "1) Backend API only"
echo "2) Frontend Web only"
echo "3) Both (recommended for first deployment)"
echo ""
read -p "Enter your choice (1-3): " choice

deploy_api() {
    echo ""
    echo -e "${BLUE}📦 Deploying Backend API...${NC}"
    cd apps/api
    
    read -p "Deploy to production? (y/n): " prod
    if [ "$prod" = "y" ]; then
        vercel --prod
    else
        vercel
    fi
    
    cd ../..
    echo -e "${GREEN}✅ Backend API deployed${NC}"
}

deploy_web() {
    echo ""
    echo -e "${BLUE}📦 Deploying Frontend Web...${NC}"
    cd apps/web
    
    read -p "Deploy to production? (y/n): " prod
    if [ "$prod" = "y" ]; then
        vercel --prod
    else
        vercel
    fi
    
    cd ../..
    echo -e "${GREEN}✅ Frontend Web deployed${NC}"
}

case $choice in
    1)
        deploy_api
        ;;
    2)
        deploy_web
        ;;
    3)
        deploy_api
        deploy_web
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}=========================================="
echo "✅ Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo -e "${YELLOW}Important Next Steps:${NC}"
echo "1. Add environment variables in Vercel dashboard"
echo "2. Update CORS_ORIGIN in API to match frontend URL"
echo "3. Add Vercel URLs to Supabase allowed URLs"
echo "4. Test your deployment"
echo ""
echo -e "${BLUE}📚 See VERCEL_DEPLOYMENT.md for detailed instructions${NC}"
