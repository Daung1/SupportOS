#!/bin/bash

# SupportOS API Testing - Quick Reference
# These commands help test the backend API quickly

API_URL="http://localhost:3000/api"

echo "📋 SupportOS API Testing Commands"
echo "=================================="
echo ""

# Function to print section header
section() {
  echo ""
  echo "▶ $1"
  echo "---"
}

# Test 1: Health Check
section "1. Health Check"
echo "$ curl $API_URL/health"
echo ""
curl -s $API_URL/health | jq . 2>/dev/null || curl -s $API_URL/health

# Test 2: Create a Ticket
section "2. Create New Ticket"
echo "$ curl -X POST $API_URL/tickets \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"userMessage\": \"Test ticket\", \"priorityLevel\": \"medium\", \"tags\": [\"test\"]}'"
echo ""

TICKET_RESPONSE=$(curl -s -X POST $API_URL/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "Integration test ticket for system validation",
    "priorityLevel": "high",
    "tags": ["integration-test", "e2e"]
  }')

echo "$TICKET_RESPONSE" | jq . 2>/dev/null || echo "$TICKET_RESPONSE"

# Extract ticket ID for subsequent tests
TICKET_ID=$(echo "$TICKET_RESPONSE" | jq -r '.id' 2>/dev/null)

if [ ! -z "$TICKET_ID" ] && [ "$TICKET_ID" != "null" ]; then
  echo ""
  echo "✓ Created ticket with ID: $TICKET_ID"
  
  # Test 3: Get Single Ticket
  section "3. Get Ticket Details"
  echo "$ curl $API_URL/tickets/$TICKET_ID"
  echo ""
  curl -s $API_URL/tickets/$TICKET_ID | jq . 2>/dev/null || curl -s $API_URL/tickets/$TICKET_ID
  
  # Test 4: List Tickets
  section "4. List All Tickets"
  echo "$ curl '$API_URL/tickets?status=pending&limit=5'"
  echo ""
  curl -s "$API_URL/tickets?status=pending&limit=5" | jq . 2>/dev/null || curl -s "$API_URL/tickets?status=pending&limit=5"
  
  # Test 5: Get Ticket Logs
  section "5. Get Ticket Audit Logs"
  echo "$ curl $API_URL/tickets/$TICKET_ID/logs"
  echo ""
  curl -s $API_URL/tickets/$TICKET_ID/logs | jq . 2>/dev/null || curl -s $API_URL/tickets/$TICKET_ID/logs
  
  # Test 6: Approve Ticket
  section "6. Approve Ticket"
  echo "$ curl -X POST $API_URL/tickets/$TICKET_ID/approve \\"
  echo "  -H 'Content-Type: application/json' \\"
  echo "  -d '{\"approvedBy\": \"Test User\"}'"
  echo ""
  APPROVE_RESPONSE=$(curl -s -X POST $API_URL/tickets/$TICKET_ID/approve \
    -H "Content-Type: application/json" \
    -d '{"approvedBy": "Integration Test", "editedContent": null}')
  
  echo "$APPROVE_RESPONSE" | jq . 2>/dev/null || echo "$APPROVE_RESPONSE"
  
else
  echo "⚠ Could not extract ticket ID from response"
fi

# Test 7: Error Handling
section "7. Error Handling - Invalid Ticket ID"
echo "$ curl $API_URL/tickets/invalid-id-12345"
echo ""
curl -s $API_URL/tickets/invalid-id-12345 | jq . 2>/dev/null || curl -s $API_URL/tickets/invalid-id-12345

# Test 8: Missing Required Field
section "8. Error Handling - Missing Required Field"
echo "$ curl -X POST $API_URL/tickets \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"priorityLevel\": \"high\"}'"
echo ""
curl -s -X POST $API_URL/tickets \
  -H "Content-Type: application/json" \
  -d '{"priorityLevel": "high"}' | jq . 2>/dev/null || curl -s -X POST $API_URL/tickets \
  -H "Content-Type: application/json" \
  -d '{"priorityLevel": "high"}'

echo ""
echo "=================================="
echo "✓ API Testing Complete"
echo ""
echo "Notes:"
echo "  • Tests require backend running on port 3000"
echo "  • Install jq for better JSON formatting: sudo apt install jq"
echo "  • Check backend logs for processing details"
echo "  • WebSocket events are logged in browser console"
