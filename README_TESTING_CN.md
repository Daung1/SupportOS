# 🚀 SupportOS 快速参考 - 立即开始测试

## 📊 当前进度

```
Phase A (Orchestrator) ✅ 100% - 316 个测试通过
Phase B (WebSocket/HTTP) ✅ 100% - 293 个测试通过  
Phase C (安全机制) ✅ 100% - 340 个测试通过
Phase D (前端) ✅ 100% - 9 个组件完成 + App.tsx 集成

Phase E (集成测试) ⏳ 即将开始 - 2-3 小时
```

---

## 🎯 立即执行

### 最快开始方式（1分钟）

```bash
cd /home/xiyu/SupportOS
bash quick-start.sh
```

这会自动：
- ✓ 检查 PostgreSQL（已运行 ✓）
- ✓ 启动后端 (localhost:3000)
- ✓ 启动前端 (localhost:5173)
- ✓ 显示访问链接

---

## 🔗 访问地址

启动后打开以下链接进行测试：

| 应用 | 地址 | 用途 |
|------|------|------|
| **前端应用** | http://localhost:5173 | 提交和管理工单 |
| **后端 API** | http://localhost:3000/api | REST 端点测试 |
| **API 文档** | http://localhost:3000/api/docs | Swagger 交互式文档 |
| **健康检查** | http://localhost:3000/api/health | 系统状态 |

---

## ✅ 测试场景（5分钟）

### 场景 1: 创建工单

**在前端 (http://localhost:5173):**
1. 填写表单：
   - Message: "我的系统运行缓慢，请帮助诊断"
   - Priority: "High"
   - Tags: "performance, urgent"
2. 点击 "Submit Ticket"
3. 看到绿色成功提示 ✓

### 场景 2: 查看实时更新

**在工单详情页:**
1. 点击工单查看详情
2. 观察 "Overview" 标签：
   - ✓ 状态变化：pending → processing → completed
   - ✓ AI 响应出现
   - ✓ 安全评分显示
3. 观察 "Response" 标签：
   - ✓ AgentTracer 显示 TAO 迭代
   - ✓ 阶段进度实时更新

### 场景 3: 审批工单

**在 "Approval" 标签页:**
1. 输入审批人名字：例如 "QA Team"
2. 可选：编辑响应内容
3. 点击 "Approve" 按钮
4. ✓ 工单状态变为 "approved"

### 场景 4: 检查日志和成本

**在其他标签页:**
- "Audit Logs" - 查看完整处理链路
- "Token Cost" - 查看成本明细和实时更新

---

## 🧪 快速 API 测试

```bash
# 启动后运行 API 测试脚本
bash test-api.sh

# 这会测试：
# 1. 健康检查
# 2. 创建工单
# 3. 查询工单列表
# 4. 获取工单详情
# 5. 查看审计日志
# 6. 批准工单
# 7. 错误处理
```

---

## 📊 后端测试

```bash
# 运行所有后端 E2E 测试
cd backend
npm run test:e2e

# 预期：所有测试 ✅ 通过
```

---

## 🔍 检查清单

打开浏览器 DevTools (F12) 验证：

| 检查项 | 验证方法 | 预期 |
|--------|---------|------|
| **WebSocket 连接** | Network 标签 → 筛选 WS | 看到 `/ws` 连接 ✓ |
| **实时事件** | Network → WS → Messages | 收到 `ticket.stage`, `ticket.iteration` ✓ |
| **API 调用** | Network 标签 → XHR | 无错误状态码 ✓ |
| **JavaScript 错误** | Console 标签 | 没有红色错误 ✓ |
| **CORS 错误** | Console 标签 | 没有 CORS 错误 ✓ |

---

## 📋 测试记录

### 前端测试
- [ ] 工单成功创建
- [ ] 工单出现在列表
- [ ] 实时更新显示
- [ ] WebSocket 连接正常
- [ ] 批准工单成功
- [ ] 日志记录完整
- [ ] 成本统计正确
- [ ] 没有 JavaScript 错误

### 后端测试
- [ ] 健康检查通过
- [ ] API 端点响应正确
- [ ] 数据库保存正确
- [ ] WebSocket 事件推送
- [ ] 并发处理无冲突
- [ ] 错误处理正常
- [ ] 安全决策正确

---

## 🐛 常见问题

### Q: 后端启动失败
**检查：** 
```bash
# PostgreSQL 是否运行
ps aux | grep postgres

# 端口是否占用
lsof -i :3000
```

### Q: 前端无法连接后端
**检查：**
- 后端是否在 3000 运行: `curl http://localhost:3000/api/health`
- 浏览器 Console 是否有 CORS 错误

### Q: WebSocket 不工作
**检查：** DevTools → Network → 搜索 "ws" → 是否有 `/ws` 连接

### Q: 工单不显示
**解决：** 按 F5 刷新页面，或检查浏览器 Console 是否有错误

---

## 📁 重要文件

| 文件 | 用途 |
|------|------|
| `quick-start.sh` | 一键启动所有服务 |
| `test-api.sh` | API 功能测试脚本 |
| `QUICK_START_TEST.md` | 详细测试指南 |
| `TESTING_GUIDE.md` | 完整测试方案 |
| `PHASE_E_CHECKLIST.md` | Phase E 详细任务 |
| `.env` | 环境变量配置 |
| `backend/backend.log` | 后端日志 |
| `frontend/frontend.log` | 前端日志 |

---

## 🎯 Phase E 下一步

完成本地测试后，继续：

### 1. Docker 部署准备 (20 min)
```bash
# 查看 PHASE_E_CHECKLIST.md 中的 Docker 配置
# 创建 docker-compose.yml
# 创建 Dockerfile
```

### 2. 文档编写 (20 min)
- ARCHITECTURE.md - 系统架构
- DEPLOYMENT.md - 部署指南
- API_REFERENCE.md - API 参考

### 3. 性能测试 (10 min)
```bash
# 批量创建工单，观察性能指标
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/tickets \
    -H "Content-Type: application/json" \
    -d "{\"userMessage\": \"Test $i\", \"priorityLevel\": \"medium\"}"
  sleep 0.5
done
```

---

## 🚀 开始了吗?

```bash
# 一条命令启动完整系统
cd /home/xiyu/SupportOS
bash quick-start.sh

# 然后在浏览器打开
# http://localhost:5173
```

**Happy Testing!** 🎉

---

## 💡 关键特性快速演示

### ✨ 实时处理进度
- 工单创建后立即返回
- WebSocket 推送实时处理进度
- 从输入 → 分析 → 检索 → 生成 → 审批 全程实时显示

### ✨ 智能安全评估  
- 四层评估：规则 → 启发式 → LLM → 决策
- 显示具体评分和原因
- 自动决策：批准/审阅/拒绝

### ✨ 完整审计链
- 每个操作都记录
- 显示耗时、工具、输入输出
- 可展开查看 JSON 细节

### ✨ 成本透明
- 实时 Token 计数
- 按 Agent 分类
- USD 成本计算

### ✨ 人工审批
- 可编辑生成内容
- 可与 AI 继续对话
- 记录审批人和时间

---

## 📞 需要帮助?

查看这些文档：
- `QUICK_START_TEST.md` - 快速开始
- `TESTING_GUIDE.md` - 详细测试
- `PHASE_E_CHECKLIST.md` - 完整任务清单
