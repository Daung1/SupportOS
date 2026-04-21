# Vector Search Quick Reference

## Quick Start

### 1. Initialize Database
```bash
cd backend
npm run db:reset    # Clear old data
npm run db:seed     # Load 40 documents with embeddings
```

### 2. Start Server
```bash
npm run start:dev
# Server runs on http://localhost:3000
```

### 3. Test Search API
```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"query":"reset password","topK":5}'
```

## Query Examples

### Example 1: Password Recovery
```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{
    "query":"How do I reset my password?",
    "topK":3
  }'
```
**Result**: "Password Reset Instructions" document

### Example 2: Warranty Questions
```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{
    "query":"What is the warranty coverage?",
    "topK":3
  }'
```
**Result**: "Warranty Information" document

### Example 3: International Shipping
```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{
    "query":"How long does international shipping take?",
    "topK":5
  }'
```
**Result**: "International Shipping" document with delivery times

## API Parameters

### Request Body
- `query` (string, required): User's search question
- `topK` (number, optional): Number of results to return (default: 5)

### Response Structure
```json
{
  "success": true,
  "data": {
    "success": true,
    "output": {
      "summary": "...",
      "documentsFound": 1,
      "sources": [
        {
          "id": "...",
          "title": "...",
          "source": "...",
          "score": 0.21,
          "url": "/docs/..."
        }
      ]
    },
    "iterations": 2,
    "history": [...]
  }
}
```

## Similarity Scores

| Score Range | Interpretation |
|------------|-----------------|
| 0.20 - 1.0 | Highly relevant |
| 0.10 - 0.20 | Moderately relevant |
| 0.05 - 0.10 | Loosely related |
| < 0.05 | Not relevant |

## Troubleshooting

### Issue: "No documents with embeddings found"
**Solution**: Run database seed
```bash
npm run db:seed
```

### Issue: Empty results
**Solution**: 
1. Check if query contains meaningful words (not just stop words)
2. Try different query phrasing
3. Increase `topK` parameter

### Issue: Server won't start
**Solution**:
1. Clear port 3000: `lsof -i :3000 | grep -v COMMAND | awk '{print $2}' | xargs kill -9`
2. Rebuild: `npm run build`
3. Restart: `npm run start:dev`

## Architecture Overview

```
User Query
    ↓
Generate Pseudo-Embedding (hash-based)
    ↓
Retrieve All Documents
    ↓
Calculate Cosine Similarity
    ↓
Rank by Score
    ↓
Return Top-K Results
```

## Performance Tips

1. **Limit topK**: Use `topK: 3` for faster results
2. **Specific Queries**: More specific queries return better results
3. **Batch Requests**: Can handle multiple requests concurrently
4. **Database Size**: Performance remains O(n) with document count

## Additional Resources

- [Full Implementation Guide](./VECTOR_SEARCH_IMPLEMENTATION.md)
- [API Documentation](http://localhost:3000/api)
- [Database Schema](./backend/prisma/schema.prisma)

## Key Files

- **Seed Data**: `backend/prisma/seed.ts`
- **Search Tool**: `backend/src/tools/search.tool.ts`
- **API Endpoint**: `backend/src/app.controller.ts`
- **Searcher Agent**: `backend/src/agents/impl/searcher.agent.ts`
