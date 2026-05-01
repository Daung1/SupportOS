# 🚀 快速开始测试指南

## 前置条件检查

✅ PostgreSQL 已运行  
✅ 数据库已初始化  
✅ 前端已编译 (231 KB)  
✅ 后端已编译  
✅ 环境变量已配置

---

## 方案一：自动启动（推荐）

### 最简单的方式 - 一个命令启动所有服务

```bash
cd /home/xiyu/SupportOS
bash quick-start.sh
```

这会自动：
- ✓ 检查PostgreSQL连接
- ✓ 检查端口可用性
- ✓ 启动后端服务 (localhost:3000)
- ✓ 启动前端服务 (localhost:5173)
- ✓ 等待两个服务就绪
- ✓ 显示访问链接

**输出示例：**
```
✓ SupportOS is ready for testing!
============================================
Access points:
  Frontend:        http://localhost:5173
  Backend API:     http://localhost:3000/api
  API Docs:        http://localhost:3000/api/docs
  Health Check:    curl http://localhost:3000/api/health

Press Ctrl+C to stop all services
```

---

## 方案二：手动启动（更灵活）

### Terminal 1 - 启动后端

```bash
cd /home/xiyu/SupportOS/backend
npm run start:dev
```

等待看到：
```
[Nest] 12345  - 04/29/2026, 10:00:00 AM     LOG [NestFactory] Starting Nest application...
```

### Terminal 2 - 启动前端

```bash
cd /home/xiyu/SupportOS/frontend
npm run dev
```

等待看到：
```
VITE v5.4.21  ready in 523 ms

➜  Local:   http://localhost:5173/
```

---

## 方案三：快速API测试

在服务运行中，开启新 Terminal 3 运行测试：

```bash
cd /home/xiyu/SupportOS
bash test-api.sh
```

这会测试：
1. 健康检查
2. 创建工单
3. 查询工单详情
4. 工单列表
5. 审计日志
6. 批准工单
7. 错误处理

---

## 测试流程

### 步骤1：打开前端应用
访问 http://localhost:5173

你应该看到：
- ✓ SupportOS 标题和说明
- ✓ "Submit Support Ticket" 表单
- ✓ Dashboard 区域（显示工单统计）

### 步骤2：提交测试工单

**表单字段：**
- **Message**: "我的系统在处理大量请求时超时了。请帮助诊断问题。"
- **Priority**: Medium
- **Tags**: bug, urgent, system

点击 "Submit Ticket" 按钮

**预期结果：**
```
✅ 绿色成功提示: "Ticket abc12345 created successfully!"
✅ 自动跳转到工单详情页
✅ 工单出现在列表中
```

### 步骤3：观察实时更新

在工单详情页的 **"Overview"** 标签页：

- **AI Response 区域**: 展示系统的分析和建议
- **Safety Indicator 区域**: 显示安全验证结果

观察：
- ✓ 状态从 "pending" → "processing" → "completed"
- ✓ 阶段栏显示处理流程
- ✓ 实时日志更新（查看控制台）

### 步骤4：审批工单

点击 **"Approval"** 标签页：

1. 输入审批人名字: "Test Reviewer"
2. 可选：编辑生成的回复内容
3. 点击 **"Approve"** 按钮

**预期结果：**
```
✅ 工单状态变为 "approved"
✅ 显示审批时间戳
✅ 内容被锁定（审批后不能编辑）
```

### 步骤5：查看工单历史

点击 **"Audit Logs"** 标签页：

- ✓ 查看完整处理流程
- ✓ 每个操作的耗时
- ✓ 输入输出数据 (JSON格式)
- ✓ 点击展开查看详情

### 步骤6：查看成本统计

点击 **"Token Cost"** 标签页：

- ✓ 总成本 (USD)
- ✓ 输入/输出 Token 数
- ✓ 各个 Agent 的成本明细
- ✓ 实时更新高亮显示

---

## 核心检查清单

在浏览器中验证：

- [ ] 工单能成功创建
- [ ] 工单列表能显示新工单
- [ ] 工单详情加载正确
- [ ] WebSocket 连接正常（DevTools 查看）
- [ ] 实时更新流畅显示
- [ ] 批准工单成功
- [ ] 审计日志记录完整
- [ ] 成本统计正确
- [ ] 没有 JavaScript 错误（Console 检查）
- [ ] 没有 CORS 错误

---

## 调试工具

### DevTools 检查 WebSocket

1. 打开浏览器 **DevTools** (F12)
2. 进入 **Network** 标签
3. 筛选 "WS" (WebSocket)
4. 创建工单后应该看到 `/ws` 连接
5. 查看 **Messages** 标签查看实时事件

### 查看后端日志

**在后端 Terminal 中查看：**
```
[Nest] Starting Pipeline...
[Pipeline] Executing Analyzer Agent...
[Pipeline] Executing Classifier Agent...
[WebSocket] Broadcasting to ticket:abc123
```

### 查看前端日志

**在浏览器 DevTools Console 中查看：**
```
✓ Socket connected
→ Received iteration: Agent1 - Iteration 1
→ Received cost update: 0.005 USD
✓ Ticket completed
```

---

## API 端点测试

### 快速 API 测试

```bash
# 健康检查
curl http://localhost:3000/api/health

# 列出工单
curl http://localhost:3000/api/tickets

# 创建工单
curl -X POST http://localhost:3000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "Test",
    "priorityLevel": "high"
  }'
```

或使用预制脚本：
```bash
bash test-api.sh
```

---

## 常见问题排查

### 问题：后端无法启动

**症状：** `Error: listen EADDRINUSE: address already in use :::3000`

**解决：**
```bash
# 找出占用端口的进程
lsof -i :3000

# 杀死进程
kill -9 <PID>

# 重新启动
npm run start:dev
```

### 问题：前端无法连接后端

**症状：** 网络标签显示 API 请求失败

**检查：**
1. 后端是否在运行: `curl http://localhost:3000/api/health`
2. 前端代理配置: 检查 `vite.config.ts`
3. CORS 错误: 检查浏览器 Console
4. 防火墙: 检查 localhost 连接是否被阻止

### 问题：WebSocket 不连接

**症状：** DevTools Network 中没有 WS 连接

**检查：**
1. 后端是否支持 Socket.io (查看日志)
2. 浏览器是否支持 WebSocket
3. 查看 Console 中的 Socket.io 错误信息
4. 尝试清除缓存并刷新页面

### 问题：数据库连接失败

**症状：** 后端无法启动，错误信息包含 "PostgreSQL"

**解决：**
```bash
# 启动 PostgreSQL
sudo systemctl start postgresql

# 验证连接
psql -U supportos_user -d supportos

# 重新运行迁移
cd backend && npm run db:migrate
```

---

## 下一步行动

### ✅ 本地测试通过后

1. **运行后端 E2E 测试**
   ```bash
   cd backend
   npm run test:e2e
   ```

2. **性能测试** (批量创建工单)
   ```bash
   for i in {1..5}; do
     curl -X POST http://localhost:3000/api/tickets \
       -H "Content-Type: application/json" \
       -d "{\"userMessage\": \"Load test $i\", \"priorityLevel\": \"medium\"}"
   done
   ```

3. **准备部署** (Docker/K8s)
   - 查看 Docker 配置
   - 准备生产环境变量
   - 性能优化

---

## 快速命令参考

```bash
# 启动所有服务
bash quick-start.sh

# 启动后端 (watch mode)
cd backend && npm run start:dev

# 启动前端
cd frontend && npm run dev

# 运行 API 测试
bash test-api.sh

# 后端单元测试
cd backend && npm run test

# 后端 E2E 测试
cd backend && npm run test:e2e

# 数据库重置
cd backend && npm run db:reset

# 前端编译
cd frontend && npm run build

# 后端编译
cd backend && npm run build

# 访问地址
Frontend:    http://localhost:5173
Backend:     http://localhost:3000
API Docs:    http://localhost:3000/api/docs
```

---

**准备好开始了吗？** 🎉

```bash
cd /home/xiyu/SupportOS
bash quick-start.sh
```

然后打开 http://localhost:5173

Happy Testing! 🚀
