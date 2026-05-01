# Phase E — Integration Testing & Deployment

**状态**: 即将开始 ⏳  
**时间**: 2-3 小时  
**目标**: 完整端到端测试 + 部署就绪 + 文档完善

---

## 🎯 Phase E 目标清单

### 1. 本地集成测试 (30min)

#### ✅ 快速健康检查
```bash
# 启动所有服务
bash quick-start.sh

# 等待就绪提示，然后进行以下测试
```

#### ✅ 端到端工作流测试

**场景1: 创建和处理工单**
```
1. 前端输入 → 创建工单
   ✓ 成功消息显示
   ✓ 工单出现在列表
   ✓ WebSocket 连接正常

2. 实时处理进度
   ✓ 阶段从 pending → processing → completed
   ✓ AgentTracer 显示 TAO 迭代
   ✓ TokenCost 实时更新

3. 审批流程
   ✓ 输入审批人名字
   ✓ 点击 Approve
   ✓ 工单状态变为 approved
```

**场景2: 错误恢复**
```
1. WebSocket 断线
   ✓ 自动重连
   ✓ 显示"Connecting..."状态
   ✓ 重连后恢复进度

2. 网络不稳定
   ✓ 列表不闪烁
   ✓ SWR 去重成功
   ✓ 无重复 API 调用
```

**场景3: 数据完整性**
```
1. 工单创建正确
   ✓ 所有字段保存
   ✓ 优先级和标签正确

2. 日志记录完整
   ✓ 审计日志有所有阶段
   ✓ TokenUsage 准确
   ✓ 时间戳正确

3. 安全决策正确
   ✓ SafetyIndicator 显示评分
   ✓ 决策为 approve/review/reject
   ✓ 原因列表完整
```

#### ✅ API 测试
```bash
# 运行 API 测试套件
bash test-api.sh

# 手动测试关键端点
curl http://localhost:3000/api/health      # 健康检查
curl http://localhost:3000/api/tickets     # 列表
```

### 2. 后端 E2E 测试 (30min)

```bash
# 运行所有后端 E2E 测试
cd backend
npm run test:e2e

# 预期: 所有测试通过
# 检查: Pipeline 执行、WebSocket 事件、安全决策
```

**验证点:**
- [ ] 三层级联 Orchestrator 工作正常
- [ ] 并发处理 5 个工单不冲突
- [ ] WebSocket 事件及时推送
- [ ] 数据库正确持久化
- [ ] SafetyGate 决策正确

### 3. 性能基准测试 (30min)

```bash
# 批量创建工单测试
cd backend

# 创建 10 个工单
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/tickets \
    -H "Content-Type: application/json" \
    -d "{\"userMessage\": \"Load test $i\", \"priorityLevel\": \"medium\"}"
  sleep 0.5
done

# 检查:
# 1. 平均响应时间 < 100ms
# 2. 最大并发 = 5 个工单
# 3. 队列待处理数 ≤ 队列大小
```

**性能指标目标:**
| 指标 | 目标 | 实际 |
|-----|------|------|
| POST /tickets 响应时间 | < 100ms | - |
| GET /tickets 响应时间 | < 50ms | - |
| WebSocket 事件延迟 | < 500ms | - |
| 并发处理数 | 5 | - |
| 最大队列大小 | 100 | - |

### 4. Docker 部署准备 (20min)

#### ✅ Docker Compose 配置

创建 `docker-compose.yml`:
```yaml
version: '3.8'

services:
  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: supportos_user
      POSTGRES_PASSWORD: supportos_password
      POSTGRES_DB: supportos
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # Backend
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql://supportos_user:supportos_password@postgres:5432/supportos
      NODE_ENV: production
      API_PORT: 3000
      GEMINI_API_KEY: ${GEMINI_API_KEY}
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  # Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://backend:3000/api
    depends_on:
      - backend

volumes:
  postgres_data:
```

#### ✅ Dockerfile 创建

**Backend Dockerfile:**
```dockerfile
FROM node:18-alpine
WORKDIR /app

# 构建阶段
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# 运行阶段
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

**Frontend Dockerfile:**
```dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### ✅ 环境变量配置
```bash
# .env.production
DATABASE_URL=postgresql://supportos_user:supportos_password@postgres:5432/supportos
NODE_ENV=production
API_PORT=3000
GEMINI_API_KEY=<your-key>
```

### 5. 文档完善 (30min)

#### ✅ 已生成文档
- [x] QUICK_START_TEST.md - 快速开始测试
- [x] TESTING_GUIDE.md - 详细测试指南
- [x] quick-start.sh - 自动启动脚本
- [x] test-api.sh - API 测试脚本

#### ✅ 待完成文档

**ARCHITECTURE.md** - 系统架构详解
```markdown
# SupportOS 系统架构

## 总体设计
- 三层 Orchestrator (Cascade → Queue → Multi-Agent)
- 四层 SafetyGate (Rule → Heuristic → LLM → Decision)
- 实时 WebSocket 事件推送
- 完整审计日志链

## 核心组件
- Orchestrator 层: 并发管理、错误隔离
- Agent 层: TAO Loop 执行、事件发布
- SafetyGate: 生成后拦截评估
- Data 层: Prisma + PostgreSQL

## 数据流
```

**DEPLOYMENT.md** - 部署指南
```markdown
# 部署指南

## 本地开发
bash quick-start.sh

## Docker Compose
docker-compose up

## 生产环境
- 配置 Nginx 反向代理
- 配置 PostgreSQL 主从复制
- 配置 Redis 缓存
- 监控 + 告警
```

**API_REFERENCE.md** - API 完整参考
```markdown
# API 参考

## REST Endpoints
- POST /api/tickets - 创建工单
- GET /api/tickets - 列表
- GET /api/tickets/:id - 详情
- POST /api/tickets/:id/approve - 批准
- ...

## WebSocket Events
- subscribe / unsubscribe
- ticket.stage / ticket.iteration / ticket.cost
- ticket.completed / ticket.failed
```

### 6. 数据库备份 & 恢复 (10min)

```bash
# 备份
pg_dump -U supportos_user supportos > backup.sql

# 恢复
psql -U supportos_user supportos < backup.sql

# Docker 内备份
docker-compose exec postgres pg_dump -U supportos_user supportos > backup.sql
```

---

## 🧪 验收标准 (Definition of Done)

### 功能完整性
- [ ] 所有 9 个前端组件正常工作
- [ ] 所有 REST 端点响应正确
- [ ] WebSocket 实时更新无延迟
- [ ] 安全决策逻辑正确
- [ ] 数据库持久化完整

### 质量指标
- [ ] 前端 TypeScript 编译无错误
- [ ] 后端编译通过 + 所有测试绿
- [ ] 没有 JavaScript 控制台错误
- [ ] 没有 CORS 或网络错误
- [ ] DevTools Network 正常

### 性能指标
- [ ] API 响应时间 < 200ms
- [ ] 前端加载时间 < 2s
- [ ] WebSocket 事件延迟 < 500ms
- [ ] 并发处理能力 ≥ 5 工单

### 部署就绪
- [ ] Docker Compose 配置完成
- [ ] Dockerfile 编写正确
- [ ] 环境变量配置正确
- [ ] 部署文档完整
- [ ] 备份/恢复流程验证

### 文档完善
- [ ] Architecture.md 完整
- [ ] Deployment.md 可执行
- [ ] API_Reference.md 准确
- [ ] 快速开始指南清晰

---

## 📋 立即开始的步骤

### Step 1: 启动完整系统
```bash
cd /home/xiyu/SupportOS
bash quick-start.sh
```

### Step 2: 打开前端
在浏览器中访问 http://localhost:5173

### Step 3: 执行工作流测试
按照上面"端到端工作流测试"中的场景进行

### Step 4: 检查后端 E2E 测试
```bash
cd backend
npm run test:e2e
```

### Step 5: 完成文档
- 编写 ARCHITECTURE.md
- 编写 DEPLOYMENT.md
- 编写 API_REFERENCE.md

### Step 6: Docker 就绪
- 创建 docker-compose.yml
- 创建 Dockerfile
- 测试 Docker 构建

---

## ✅ Phase E 完成标志

当以下全部完成时，Phase E 完成：

```
✅ 本地集成测试全部通过
✅ 后端 E2E 测试 100% 绿
✅ 性能基准符合目标
✅ Docker 部署成功
✅ 文档完整可用
✅ 系统可演示运行

🎉 SupportOS Mini 项目完成！
```

---

## 📞 快速参考

| 任务 | 命令 | 位置 |
|-----|------|------|
| 启动系统 | `bash quick-start.sh` | / |
| 前端访问 | http://localhost:5173 | 浏览器 |
| API 测试 | `bash test-api.sh` | / |
| 后端 E2E | `npm run test:e2e` | backend/ |
| 查看日志 | `backend/backend.log` | 文件 |
| 检查数据库 | `psql -U supportos_user supportos` | 命令行 |

---

## 🚀 准备好了吗?

继续前进到 Phase E:
```bash
cd /home/xiyu/SupportOS

# 启动系统进行集成测试
bash quick-start.sh

# 在新 Terminal 运行 E2E 测试
cd backend && npm run test:e2e

# 开始编写部署文档...
```

Happy Testing! 🎉
