#!/bin/bash

# SupportOS Development Server Startup Script
# This script starts both backend and frontend servers

set -e

echo "🚀 Starting SupportOS Development Servers"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Create processes array
pids=()

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    for pid in "${pids[@]}"; do
        kill $pid 2>/dev/null || true
    done
    exit 0
}

# Set up trap for Ctrl+C
trap cleanup SIGINT SIGTERM

# Start Backend
echo -e "${BLUE}Starting Backend (NestJS)...${NC}"
cd backend
npm run start:dev &
backend_pid=$!
pids+=($backend_pid)
echo -e "${GREEN}✓ Backend PID: $backend_pid${NC}"

# Wait a bit for backend to start
sleep 2

# Start Frontend
echo -e "${BLUE}Starting Frontend (React)...${NC}"
cd ../frontend
npm run dev &
frontend_pid=$!
pids+=($frontend_pid)
echo -e "${GREEN}✓ Frontend PID: $frontend_pid${NC}"

echo ""
echo -e "${GREEN}✅ Both servers started!${NC}"
echo ""
echo "📍 Access your application:"
echo -e "  ${BLUE}Frontend: ${NC}http://localhost:5173"
echo -e "  ${BLUE}Backend:  ${NC}http://localhost:3000"
echo -e "  ${BLUE}API Docs: ${NC}http://localhost:3000/api"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for all processes
wait
