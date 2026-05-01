#!/bin/bash

# SupportOS Quick Start - Development Mode
# This script starts both backend and frontend for local testing

set -e

echo "🚀 SupportOS Development Environment Startup"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
BACKEND_PORT=3000
FRONTEND_PORT=5173
TIMEOUT=0

# Get absolute path to the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Helper functions
print_status() {
  echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

# Cleanup function
cleanup() {
  echo ""
  print_status "Shutting down servers..."
  
  # Kill all child processes
  if [ ! -z "$backend_pid" ]; then
    kill $backend_pid 2>/dev/null || true
    print_success "Backend stopped"
  fi
  
  if [ ! -z "$frontend_pid" ]; then
    kill $frontend_pid 2>/dev/null || true
    print_success "Frontend stopped"
  fi
  
  exit 0
}

# Set up trap for Ctrl+C
trap cleanup SIGINT SIGTERM

# Check prerequisites
print_status "Checking prerequisites..."

# Check if PostgreSQL is running
if ! nc -z localhost 5432 2>/dev/null; then
  print_error "PostgreSQL is not running on localhost:5432"
  echo "  Start PostgreSQL with: sudo systemctl start postgresql"
  exit 1
fi
print_success "PostgreSQL is running"

# Check if ports are available
if netstat -tln 2>/dev/null | grep -q ":$BACKEND_PORT "; then
  print_error "Backend port $BACKEND_PORT is already in use"
  exit 1
fi
print_success "Backend port $BACKEND_PORT is available"

if netstat -tln 2>/dev/null | grep -q ":$FRONTEND_PORT "; then
  print_error "Frontend port $FRONTEND_PORT is already in use"
  exit 1
fi
print_success "Frontend port $FRONTEND_PORT is available"

echo ""
print_status "Starting services..."
echo ""

# Start Backend
print_status "Starting Backend (NestJS on port $BACKEND_PORT)..."
cd "$SCRIPT_DIR/backend"
npm run start:dev > backend.log 2>&1 &
backend_pid=$!
print_success "Backend PID: $backend_pid (logs: backend/backend.log)"

# Wait for backend to be ready
echo -n "  Waiting for backend to start"
for i in {1..30}; do
  if curl -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
    print_success "Backend ready!"
    break
  fi
  echo -n "."
  sleep 1
done

if ! curl -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
  print_error "Backend failed to start. Check backend/backend.log"
  cleanup
  exit 1
fi

echo ""

# Start Frontend
print_status "Starting Frontend (React on port $FRONTEND_PORT)..."
cd "$SCRIPT_DIR/frontend"
npm run dev > frontend.log 2>&1 &
frontend_pid=$!
print_success "Frontend PID: $frontend_pid (logs: frontend/frontend.log)"

# Wait for frontend to be ready
echo -n "  Waiting for frontend to start"
for i in {1..30}; do
  if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
    print_success "Frontend ready!"
    break
  fi
  echo -n "."
  sleep 1
done

echo ""
echo ""
echo "=============================================="
echo -e "${GREEN}✓ SupportOS is ready for testing!${NC}"
echo "=============================================="
echo ""
echo "Access points:"
echo "  ${BLUE}Frontend:${NC}        http://localhost:$FRONTEND_PORT"
echo "  ${BLUE}Backend API:${NC}      http://localhost:$BACKEND_PORT/api"
echo "  ${BLUE}API Docs:${NC}         http://localhost:$BACKEND_PORT/api/docs"
echo "  ${BLUE}Health Check:${NC}    curl http://localhost:$BACKEND_PORT/api/health"
echo ""
echo "Available test cases:"
echo "  1. Create new ticket via UI"
echo "  2. View ticket list with filtering"
echo "  3. Click ticket to see real-time updates"
echo "  4. Review approval workflow"
echo "  5. Check WebSocket connection (DevTools → Network)"
echo ""
echo "Log files:"
echo "  Backend:  backend/backend.log"
echo "  Frontend: frontend/frontend.log"
echo ""
echo "Press Ctrl+C to stop all services"
echo "=============================================="
echo ""

# Keep process running
wait
