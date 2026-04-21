#!/bin/bash
# SearcherAgent curl 测试用例
# 
# 使用说明:
# 1. 启动后端服务: npm start (在 backend 目录)
# 2. 运行此脚本: bash scripts/test-searcher-curl.sh
# 3. 或单独运行某个 curl 命令

API_URL="http://localhost:3000"
CONTENT_TYPE="Content-Type: application/json"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         SearcherAgent cURL 测试用例                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# =====================================================
# 测试 1: 基本健康检查
# =====================================================
echo "📍 测试 1: 健康检查"
echo "─────────────────────────────────────────────────"
echo ""
echo "$ curl -X GET http://localhost:3000/health"
echo ""
curl -s -X GET "$API_URL/health" -H "$CONTENT_TYPE" | jq '.'
echo ""
echo ""

# =====================================================
# 测试 2: SearcherAgent - 退货问题
# =====================================================
echo "📍 测试 2: SearcherAgent - 退货问题"
echo "─────────────────────────────────────────────────"
echo ""
echo '$ curl -X POST http://localhost:3000/search \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "'\''{
    "query": "How do I return a defective product?",
    "ticketId": "TICKET-001"
  }'"'"'"'
echo ""

curl -s -X POST "$API_URL/search" \
  -H "$CONTENT_TYPE" \
  -d '{
    "query": "How do I return a defective product?",
    "ticketId": "TICKET-001"
  }' | jq '.'

echo ""
echo ""

# =====================================================
# 测试 3: SearcherAgent - 退款问题
# =====================================================
echo "📍 测试 3: SearcherAgent - 退款问题"
echo "─────────────────────────────────────────────────"
echo ""
echo '$ curl -X POST http://localhost:3000/search \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "'\''{
    "query": "Can I get a refund if the product is broken?",
    "ticketId": "TICKET-002"
  }'"'"'"'
echo ""

curl -s -X POST "$API_URL/search" \
  -H "$CONTENT_TYPE" \
  -d '{
    "query": "Can I get a refund if the product is broken?",
    "ticketId": "TICKET-002"
  }' | jq '.'

echo ""
echo ""

# =====================================================
# 测试 4: SearcherAgent - 长文本票据
# =====================================================
echo "📍 测试 4: SearcherAgent - 长文本票据"
echo "─────────────────────────────────────────────────"
echo ""
echo '$ curl -X POST http://localhost:3000/search \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "{...长文本..."'
echo ""

curl -s -X POST "$API_URL/search" \
  -H "$CONTENT_TYPE" \
  -d '{
    "query": "I received my order today but the laptop screen has dead pixels and the keyboard is not working properly. I want to return it for a refund. What is your return policy?",
    "ticketId": "TICKET-003"
  }' | jq '.'

echo ""
echo ""

# =====================================================
# 测试 5: AnalyzerAgent (对比)
# =====================================================
echo "📍 测试 5: AnalyzerAgent (对比) - 文本分析"
echo "─────────────────────────────────────────────────"
echo ""
echo '$ curl -X POST http://localhost:3000/analyze \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "'\''{
    "content": "How do I return a defective product?",
    "ticketId": "TICKET-004"
  }'"'"'"'
echo ""

curl -s -X POST "$API_URL/analyze" \
  -H "$CONTENT_TYPE" \
  -d '{
    "content": "How do I return a defective product?",
    "ticketId": "TICKET-004"
  }' | jq '.'

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    测试完成！                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
