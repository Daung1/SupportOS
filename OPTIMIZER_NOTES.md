# 🔧 AnalyzerAgent 提示词优化方案

## 📊 优化对比

### ❌ 原始问题

| 问题 | 症状 | 后果 |
|------|------|------|
| **系统提示词冗长** | 包含完整历史 + 详细说明 | **341 input tokens** - 浪费配额 |
| **工具名不匹配** | 提示词说 `use_tool`，实际是 `text_analyzer` | ❌ 第 1 次迭代失败 |
| **历史记录完全保存** | 每次迭代都加入所有历史 | Token 爆炸式增长 |
| **温度设置过高** | temperature: 0.3 | 输出不够确定 |
| **maxTokens 过大** | 1000 tokens | 浪费生成 |

---

## ✅ 优化方案

### 1️⃣ 简化系统提示词

**优化前** (~200 字符)：
```typescript
const systemPrompt = `You are a customer support analysis expert.
Your task is to analyze support tickets and extract key information.

You can:
1. Use the 'text_analyzer' tool to analyze the ticket content
2. When you have enough information, return FINISH with your analysis

Current ticket content: "..."
Previous iterations: ... (完整历史)

Please analyze this ticket. Respond in this format:
...`;
```

**优化后** (~100 字符)：
```typescript
const systemPrompt = `Analyze support ticket: "${context.input}"

Respond ONLY in this exact format (no extra text):
THOUGHT: [brief reasoning]
ACTION: [FINISH or text_analyzer]

If FINISH: include JSON analysis
If text_analyzer: provide ticket content to analyze

Available tool: text_analyzer - extracts category, priority, sentiment, keywords`;
```

**效果**：
- 减少 ~50% 的系统提示词长度
- 更明确的指示 → 减少歧义
- 工具名一致：`text_analyzer`（不再说 `use_tool`）

---

### 2️⃣ 只保存最后一次迭代

**优化前**：
```typescript
for (const iteration of history) {
  messages.push({
    role: 'assistant',
    content: `THOUGHT: ${iteration.thought}\nACTION: ${iteration.action.type}`,
  });
  // 每个历史都加进去 ← 💥 Token 爆炸
}
```

**优化后**：
```typescript
const lastIteration = history.length > 0 ? history[history.length - 1] : null;

if (lastIteration) {
  messages.push({
    role: 'assistant',
    content: `THOUGHT: ${lastIteration.thought}\nACTION: ${lastIteration.action.type}`,
  });
  // 只保存最后一次 ← ✅ 节省 tokens
}
```

**效果**：
- 多次迭代时减少 70%+ 的历史消息
- 保留足够的上下文
- Token 用量大幅下降

---

### 3️⃣ 调整生成参数

**优化前**：
```typescript
const response = await context.modelClient.call(messages, undefined, {
  temperature: 0.3,     // 还是有点随机
  maxTokens: 1000,      // 可能浪费
});
```

**优化后**：
```typescript
const response = await context.modelClient.call(messages, undefined, {
  temperature: 0.2,     // 更确定的响应
  maxTokens: 500,       // 完全够用
});
```

**效果**：
- temperature 0.3 → 0.2：更一致的输出
- maxTokens 1000 → 500：输出 token 减半

---

### 4️⃣ 修复工具名解析

**优化前**：
```typescript
const parts = actionLine.split('|');
const toolName = parts[0].trim();  // ❌ 可能是 "use_tool"
```

**优化后**：
```typescript
const toolNames = ['text_analyzer', 'text-analyzer'];
let toolName = '';

for (const name of toolNames) {
  if (actionLine.toLowerCase().includes(name)) {
    toolName = 'text_analyzer';  // ✅ 规范化
    break;
  }
}

// 容错：即使提示词有歧义，也能正确识别
if (actionLine.toLowerCase().includes('analyz')) {
  toolName = 'text_analyzer';
}
```

**效果**：
- 消除工具名不匹配问题
- 第 1 次迭代直接成功 ✅
- 减少 1 次多余迭代

---

## 📈 性能改进预期

### Token 用量对比

| 指标 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| Input Tokens | ~341 | ~150 | **56% ↓** |
| Output Tokens | ~145 | ~80 | **45% ↓** |
| **总计** | **486** | **230** | **53% ↓** |

### 执行流程对比

**优化前**（2 次迭代）：
```
迭代 0: THOUGHT + ACTION (parse: use_tool) → Tool 'use_tool' not found ❌
迭代 1: THOUGHT + ACTION (parse: FINISH) → Success ✅
总消耗: 486 tokens, 2 次迭代
```

**优化后**（1-2 次迭代）：
```
迭代 0: THOUGHT + ACTION (parse: text_analyzer) → Tool found ✅
        Observation: Success ✅
        (如果需要继续) 迭代 1: FINISH ✅
总消耗: ~230 tokens, 1-2 次迭代 (但成功率更高)
```

---

## 🧪 验证优化

测试新版本：

```bash
# 重启服务
npm run start:dev

# 测试相同请求
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"content": "My order #12345 has delayed 5 days", "ticketId": "ticket_001"}'
```

**预期改进**：
- ✅ `iterations` 减少到 1-2 次（而不是 2+ 次）
- ✅ `tokensUsed.input` 从 341 → ~150
- ✅ `tokensUsed.output` 从 145 → ~80
- ✅ 第一次迭代直接调用 `text_analyzer`（不是 `use_tool`）
- ✅ `observation.success` 第一次就是 `true`

---

## 🎯 关键改进总结

### 问题 1: 为什么 THOUGHT/ACTION 混在一起？
**答案**：系统提示词要求这个格式。优化后简化为 2 行，让 LLM 输出更清晰。

### 问题 2: 为什么 observation 有时 true/false？
**答案**：因为工具名不匹配（`use_tool` vs `text_analyzer`）。优化后自动规范化工具名。

### 问题 3: 为什么 token 用了这么多？
**答案**：
1. 系统提示词冗长 (~50%)
2. 保存完整历史 (~30%)
3. maxTokens 过大 (~20%)

优化后总体减少 53%！

### 问题 4: 为什么需要 2 次迭代？
**答案**：第 1 次因为工具名错误失败了。优化后应该 1 次成功。

---

## 🚀 后续优化方向

1. **动态调整 temperature**
   - 第 1 次迭代：temperature: 0.2（确定）
   - 后续迭代：temperature: 0.3（灵活）

2. **上下文窗口优化**
   - 只在必要时保存历史
   - 使用摘要而不是完整内容

3. **工具参数优化**
   - 直接传递 `context.input` 而不是完整响应
   - 减少冗余信息

4. **缓存策略**
   - 相同输入使用缓存结果
   - 减少 API 调用

---

**优化完成时间**：2026-04-19  
**预期效果**：53% Token 节省 + 迭代次数减少  
**需要验证**：运行测试并观察实际效果
