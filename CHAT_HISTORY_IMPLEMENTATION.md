# 聊天记录保留机制文档

## 总体架构

SupportOS 中的聊天记录保留采用**后端驱动**的方式，确保数据持久化和多设备同步。

---

## 1. 聊天记录的两个来源

### 1.1 持久化消息（来自后端 Database）
- **数据来源**：`GET /api/tickets?userId={userId}` 
- **查询钩子**：`useTickets({ limit: 100, userId: currentUser.id }, true)`
- **实时更新**：SWR 每 3 秒自动重新获取一次
- **显示方式**：通过 `buildMessages()` 函数把 Ticket 记录转换成 ChatMessage

### 1.2 临时消息（来自前端本地状态）
- **pendingMessages**：用户在当前对话中发送的消息，但还未创建 Ticket
- **transientErrors**：错误提示和系统消息
- **何时清除**：
  - 点击"Generate as Ticket"后，消息转换为正式 Ticket，从 pending 移除
  - 点击"新对话"按钮时，清空所有 pending 消息

---

## 2. 消息生命周期

```
用户输入 "Hello" 
    ↓
点击 Send 按钮
    ↓
消息添加到 pendingMessages (本地)
    ↓ 用户可以查看消息，但还没创建 Ticket
    ↓
用户点击 "Generate as Ticket" 按钮 (可选)
    ↓
后端 POST /api/tickets 创建 Ticket
    ↓
后端返回 Ticket ID
    ↓
从 pendingMessages 移除该消息
    ↓
SWR 自动刷新 GET /api/tickets
    ↓
新 Ticket 出现在持久化消息中
    ↓
✅ 消息现在永久保存在数据库中
```

---

## 3. 数据流详解

### 3.1 Send（发送消息）流程
```typescript
handleSend() {
  // 1. 获取用户输入
  const userMessage = message.trim();
  
  // 2. 添加到本地状态（不创建 Ticket）
  setPendingMessages(prev => [...prev, {
    id: `pending-user-${Date.now()}`,
    type: 'user',
    content: userMessage,
    isLocalPending: true,  // 标记为待上传
  }]);
  
  // 3. 清空输入框
  setMessage('');
  
  // 4. 消息立即显示在 UI 中
  // 5. 用户可以查看消息，但还未创建 Ticket
}
```

### 3.2 Generate as Ticket（生成工单）流程
```typescript
handleGenerateTicket(messageId) {
  // 1. 找到对应的 pending 消息
  const pendingMsg = pendingMessages.find(m => m.id === messageId);
  
  // 2. 调用 POST /api/tickets 创建 Ticket
  const ticket = await createTicket({
    content: pendingMsg.content,
    userId: currentUser.id,
  });
  
  // 3. 从 pending 状态移除
  setPendingMessages(prev => 
    prev.filter(m => m.id !== messageId)
  );
  
  // 4. 显示成功提示
  setTransientErrors([...prev, {
    content: `✓ Ticket #${ticket.id.slice(0, 8)} created...`
  }]);
  
  // 5. 触发 SWR 重新获取
  // 6. 新 Ticket 自动出现在 buildMessages() 返回的列表中
}
```

### 3.3 New Conversation（新对话）流程
```typescript
handleNewConversation() {
  // 1. 清空本地 pending 消息
  setPendingMessages([]);
  
  // 2. 清空错误/系统消息
  setTransientErrors([]);
  
  // 3. 清空输入框
  setMessage('');
  
  // 4. 显示"新对话开始"提示
  // ⚠️ 注意：后端的 Ticket 历史仍然保留，只是清空了当前显示
}
```

---

## 4. 数据持久化的具体实现

### 4.1 后端数据模型
```prisma
model Ticket {
  id              String   @id @default(cuid())
  content         String   @db.Text  // 用户消息内容
  userId          String   // 关联用户
  status          String   @default("pending")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  // ... 其他 AI 分析结果字段
}
```

### 4.2 前端查询流程
```
Component Mount
    ↓
useTickets({ userId: currentUser.id }, true)
    ↓
SWR 发起 GET /api/tickets?userId=xxx&limit=100
    ↓
后端返回所有该用户的 Ticket
    ↓
buildMessages() 转换成 ChatMessage
    ↓
渲染到 UI
    ↓
SWR 每 3 秒自动重新获取（保持同步）
```

### 4.3 页面刷新/路由变更时
```
用户刷新页面 F5
    ↓
Component 重新 Mount
    ↓
useTickets 重新触发（SWR 缓存会被利用）
    ↓
后端返回所有 Ticket（从数据库）
    ↓
pendingMessages 清空（因为是本地 State）
    ↓
但 buildMessages() 的数据完整保留
    ↓
✅ 用户的所有已创建 Ticket 都能看到
```

---

## 5. 聊天记录保留的关键特性

### ✅ 自动持久化
- 无需手动保存
- 页面刷新后数据不丢失
- 所有已创建的 Ticket 都在数据库中

### ✅ 多设备同步
- 任何设备登录同一账户
- 所有历史 Ticket 都能看到（因为存在后端数据库）

### ✅ 灵活的对话管理
- pending 消息（本地）：用户可以发送多条，再决定是否创建 Ticket
- 已生成的 Ticket（后端）：永久保存，不可更改

### ✅ 错误隔离
- 单个 Ticket 创建失败不影响其他消息
- 错误提示临时显示，可手动重试

---

## 6. 对比：旧实现 vs 新实现

| 特性 | 旧实现 | 新实现 |
|------|------|------|
| 发送即创建 Ticket | ✅ 是 | ❌ 否 |
| 发送消息后可预览 | ❌ 否 | ✅ 是 |
| 用户自主创建 Ticket | ❌ 否 | ✅ 是 |
| 聊天-工单分离 | ❌ 否 | ✅ 是 |
| 新对话功能 | ❌ 否 | ✅ 是 |

---

## 7. 代码位置

- **主组件**：`frontend/src/components/ChatBox.tsx`
  - `buildMessages(tickets)` - 持久化消息转换
  - `handleSend()` - 发送消息（添加到 pending）
  - `handleGenerateTicket()` - 生成工单
  - `handleNewConversation()` - 新对话

- **数据钩子**：`frontend/src/hooks/useSWRApi.ts`
  - `useTickets()` - 获取用户 Ticket 列表
  - `useCreateTicket()` - 创建 Ticket API

- **后端端点**：`backend/src/ticket/ticket.controller.ts`
  - `POST /api/tickets` - 创建工单
  - `GET /api/tickets` - 列表查询

---

## 8. 常见问题

### Q: 为什么发送消息时没有立即创建 Ticket？
**A**: 这样可以让用户有一个真正的"聊天"体验，而不是每条消息都变成工单。用户满意回复后才创建工单，减少无谓的工单。

### Q: pending 消息会保存吗？
**A**: 不会。pending 消息只在前端内存中。页面刷新后会丢失。只有点击"Generate as Ticket"的消息才会保存到数据库。

### Q: "新对话"按钮会删除历史吗？
**A**: 不会。它只清空了当前页面显示的 pending 消息。后端的所有 Ticket 历史仍然保留，下次打开页面时仍能看到。

### Q: 多个浏览标签页时会同步吗？
**A**: 是的。SWR 会定期刷新，所以在 A 标签页创建的 Ticket 很快会在 B 标签页看到。

---

## 9. 未来优化方向

1. **消息搜索**：可以在数据库中搜索历史 Ticket
2. **对话分组**：按时间或主题自动分组对话
3. **草稿保存**：pending 消息可以持久化为草稿
4. **消息编辑**：已发送的消息可以编辑后再生成 Ticket
5. **消息撤回**：pending 消息可以撤回
