#!/bin/bash

# SupportOS Quick Start Script
# This script helps you quickly set up and start the SupportOS project

set -e

echo "🚀 SupportOS - Quick Start"
echo "=========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}📦 Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js is not installed. Please install Node.js 18+${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version)${NC}"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  PostgreSQL is not installed. Please install PostgreSQL${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL installed${NC}"

# Check Redis
if ! redis-cli ping &> /dev/null; then
    echo -e "${YELLOW}⚠️  Redis is not running. Please start Redis${NC}"
fi
echo -e "${GREEN}✓ Redis is running${NC}"

echo ""
echo -e "${BLUE}📚 Backend Setup${NC}"
echo "================="

cd backend

# Copy .env if not exists
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please update backend/.env with your database credentials${NC}"
fi

# Install dependencies
echo "Installing backend dependencies..."
npm install

# Run migrations
echo "Running database migrations..."
npx prisma migrate dev --skip-generate

echo -e "${GREEN}✓ Backend setup complete${NC}"

cd ..
echo ""
echo -e "${BLUE}🎨 Frontend Setup${NC}"
echo "=================="

cd frontend

# Install dependencies
echo "Installing frontend dependencies..."
npm install

echo -e "${GREEN}✓ Frontend setup complete${NC}"

cd ..

echo ""
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Backend:  cd backend && npm run start:dev"
echo "2. Frontend: cd frontend && npm run dev"
echo ""
echo "Application will be available at:"
echo "  - Frontend: http://localhost:5173"
echo "  - Backend:  http://localhost:3000"
echo "  - API Docs: http://localhost:3000/api"
