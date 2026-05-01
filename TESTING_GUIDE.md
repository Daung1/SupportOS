# SupportOS Integration Testing Guide

## Prerequisites

### 1. PostgreSQL Database Setup
PostgreSQL must be running and configured. Check status:

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# If not running, start it
sudo systemctl start postgresql

# Run database setup (one-time only)
sudo bash setup_postgresql.sh

# Initialize database migrations
cd backend
npm run db:migrate
npm run db:seed
cd ..
```

### 2. Required Services
- PostgreSQL (localhost:5432)
- Redis (optional, for caching)
- Gemini API key (already in backend/.env)

### 3. Build Before Testing
```bash
# Build both applications
cd frontend && npm run build && cd ..
cd backend && npm run build && cd ..
```

---

## Testing Methods

### Method 1: Full Stack Development (Recommended)

Start both servers in watch mode for rapid development:

```bash
# Terminal 1: Backend
cd backend
npm run start:dev

# Terminal 2: Frontend (new terminal)
cd frontend
npm run dev

# Application URLs:
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000/api
# Backend Swagger Docs: http://localhost:3000/api/docs
```

### Method 2: Using Helper Script

Automated startup script:

```bash
bash start-dev.sh

# This starts both backend and frontend
# Press Ctrl+C to stop both servers
```

### Method 3: Production Build Test

Test with optimized production builds:

```bash
# Terminal 1: Backend (production)
cd backend
npm run start:prod

# Terminal 2: Frontend (serve production build)
cd frontend
npm install -g serve
serve -s dist -l 5173
```

---

## Integration Test Cases

### Test 1: Backend Health Check
Verify backend is running:

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-29T..."
}
```

### Test 2: Create Ticket (Happy Path)
1. Open http://localhost:5173 in browser
2. Fill in "Submit Support Ticket" form:
   - Message: "Test ticket for system validation"
   - Priority: "Medium"
   - Tags: "testing, integration"
3. Click "Submit Ticket"
4. Observe:
   - ✅ Success message appears
   - ✅ Ticket appears in Dashboard
   - ✅ Ticket ID generated
   - ✅ Status is "pending" or "processing"

### Test 3: Real-Time Updates (WebSocket)
1. Create a ticket (Test 2)
2. Click ticket to view details
3. Observe:
   - ✅ "Overview" tab shows AI response
   - ✅ Real-time updates appear as ticket processes
   - ✅ "Audit Logs" tab shows pipeline stages
   - ✅ "Token Cost" tab shows usage updates

### Test 4: Approval Workflow
1. View processed ticket in TicketDetail
2. Go to "Approval" tab
3. Enter your name and click "Approve"
4. Observe:
   - ✅ Ticket status changes to "approved"
   - ✅ Success notification
   - ✅ Final content saved

### Test 5: Error Handling
Test error scenarios:

```bash
# Test invalid ticket ID
curl http://localhost:3000/api/tickets/invalid-id

# Test missing required fields
curl -X POST http://localhost:3000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{"priorityLevel": "high"}'  # Missing userMessage
```

### Test 6: API Endpoints

```bash
# List tickets
curl http://localhost:3000/api/tickets

# Get single ticket
curl http://localhost:3000/api/tickets/{ticket_id}

# Create ticket
curl -X POST http://localhost:3000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "My issue is...",
    "priorityLevel": "medium",
    "tags": ["bug"]
  }'

# Approve ticket
curl -X POST http://localhost:3000/api/tickets/{ticket_id}/approve \
  -H "Content-Type: application/json" \
  -d '{
    "approvedBy": "John Doe",
    "editedContent": "Optional edited response"
  }'

# Reject ticket
curl -X POST http://localhost:3000/api/tickets/{ticket_id}/reject \
  -H "Content-Type: application/json" \
  -d '{"reason": "Does not meet standards"}'
```

---

## Monitoring & Debugging

### Backend Logs
Check backend logs for:
- Database connection issues
- API errors
- WebSocket connection status
- Ticket processing pipeline logs

### Frontend DevTools
Use browser DevTools:
- **Network Tab**: Monitor API requests
- **Console Tab**: Check for JavaScript errors
- **Storage Tab**: View SWR cache and local storage

### WebSocket Debugging
Check WebSocket connection:
1. Open DevTools → Network Tab
2. Filter for "WS"
3. Look for `/ws` connection
4. Verify "ticket:" events are received

### Database Inspection
```bash
# Connect to database
psql -U supportos_user -d supportos

# View tables
\dt

# View sample tickets
SELECT id, "userMessage", status, "createdAt" FROM tickets LIMIT 5;
```

---

## Troubleshooting

### Issue: Backend won't start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill process if needed
kill -9 <PID>

# Check database connection
curl http://localhost:3000/api/health
```

### Issue: Frontend won't connect to backend
- Verify backend is running on localhost:3000
- Check vite.config.ts proxy settings
- Inspect browser console for CORS errors
- Verify Vite port is 5173

### Issue: Database migration fails
```bash
# Reset database
cd backend
npm run db:reset

# Re-seed data
npm run db:seed
```

### Issue: WebSocket not connecting
- Check browser console for Socket.io errors
- Verify backend has `/ws` namespace enabled
- Check if port 3000 allows WebSocket upgrades

---

## Performance Testing

### Load Testing Ticket Creation
```bash
# Create 10 tickets in sequence
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/tickets \
    -H "Content-Type: application/json" \
    -d "{
      \"userMessage\": \"Test ticket $i\",
      \"priorityLevel\": \"medium\",
      \"tags\": [\"load-test\"]
    }"
  echo "Created ticket $i"
  sleep 1
done
```

### Monitor Processing Time
Check logs for `ticket.completed` events and measure:
- Time from creation to completion
- Token usage patterns
- Safety validation times

---

## End-to-End Testing Checklist

- [ ] Database initialized and seeded
- [ ] Backend starts without errors
- [ ] Frontend builds successfully
- [ ] Health check returns OK
- [ ] Create ticket via UI works
- [ ] Ticket appears in list
- [ ] WebSocket updates work in real-time
- [ ] Approval workflow functions
- [ ] Error messages display correctly
- [ ] API endpoints respond correctly
- [ ] Audit logs are recorded
- [ ] Token usage is tracked
- [ ] Safety indicators display
- [ ] No console errors in DevTools

---

## Next Steps

1. **Manual E2E Testing**: Follow test cases 1-6 above
2. **Integration Testing**: Run backend E2E tests
   ```bash
   cd backend && npm run test:e2e
   ```
3. **Performance Testing**: Load test with multiple concurrent requests
4. **Deployment**: Prepare Docker Compose for production deployment
