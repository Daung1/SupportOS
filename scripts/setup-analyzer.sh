#!/bin/bash

# SupportOS AnalyzerAgent Quick Initialization Script
# Before use: chmod +x scripts/setup-analyzer.sh

set -e

echo "🚀 SupportOS AnalyzerAgent Initialization"
echo "=================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please visit https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js: $(node --version)"

# Enter backend directory
cd backend

# 1. Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# 2. Check .env file
echo ""
echo "⚙️  Checking environment configuration..."
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file and set GEMINI_API_KEY"
    echo "   Get API Key: https://aistudio.google.com/app/apikeys"
else
    echo "✅ .env file already exists"
fi

# 3. Display next steps
echo ""
echo "=================================="
echo "✅ Initialization Complete!"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1️⃣  Get Gemini API Key (Free):"
echo "   https://aistudio.google.com/app/apikeys"
echo ""
echo "2️⃣  Edit .env file:"
echo "   vim backend/.env"
echo "   # Set GEMINI_API_KEY=AIzaSy..."
echo ""
echo "3️⃣  Start development server:"
echo "   npm run start:dev"
echo ""
echo "4️⃣  Test AnalyzerAgent:"
echo "   curl -X POST http://localhost:3000/analyze \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"content\": \"My order hasn't arrived yet\"}'
echo ""
echo "📚 More information:"
echo "   - Quick Start: ../QUICK_START_ANALYZER.md"
echo "   - Project Summary: ../IMPLEMENTATION_SUMMARY.md"
echo "   - Project Plan: ../SupportOS_ProgramPlan.md"
echo ""
