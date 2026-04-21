# Day 12 开发清单 - FAQMatcher + SimpleFilter

**日期:** 2026-04-21  
**目标:** 实现两个轻量级预处理器，成本降低 80%  
**预计时间:** 2.5-3 小时  
**目标完成时间:** 本日

---

## 📋 任务分解

### Task 1: FAQMatcher 实现（1 小时）

#### 1.1 创建 FAQ 数据集
- [ ] 创建文件 `backend/src/cascade/faq.data.ts`
- [ ] 定义 FAQ 结构：
  ```typescript
  interface FAQ {
    id: string;
    question: string;
    answer: string;
    keywords: string[];
    category: 'shipping' | 'billing' | 'product' | 'account' | 'policy';
  }
  ```
- [ ] 输入 50-100 个常见问题（以电商场景为例）
  - 发货问题 15 个
  - 退货问题 15 个
  - 物流追踪 15 个
  - 账户相关 10 个
  - 支付问题 10 个
  - 其他 20 个
- [ ] **时间:** 20 分钟

#### 1.2 实现相似度计算
- [ ] 创建文件 `backend/src/cascade/similarity.utils.ts`
- [ ] 实现基础相似度函数：
  ```typescript
  // 方案 1: TF-IDF（更完善）
  // 方案 2: 简单词袋模型（足够用）
  // 方案 3: 关键词匹配（最快）
  ```
- [ ] 测试函数准确性
- [ ] **时间:** 20 分钟

#### 1.3 实现 FAQMatcher 类
- [ ] 创建文件 `backend/src/cascade/faq.matcher.ts`
- [ ] 实现接口：
  ```typescript
  export interface IFAQMatcher {
    match(ticket: Ticket): Promise<{
      matched: boolean;
      answer?: string;
      confidence: number;
      faqId?: string;
      reason?: string;
    }>;
  }
  ```
- [ ] 核心逻辑：
  - 输入：工单文本
  - 与 FAQ 库逐一计算相似度
  - 找到最高相似度的 FAQ
  - 如果相似度 ≥ 0.9，返回答案
  - 否则返回 `matched: false`
- [ ] **时间:** 15 分钟

#### 1.4 单元测试
- [ ] 创建文件 `backend/src/cascade/faq.matcher.spec.ts`
- [ ] 测试用例：
  - ✅ 精确匹配（工单 = FAQ 问题）→ 置信度 1.0
  - ✅ 高相似度（词汇相同）→ 置信度 ≥ 0.9
  - ✅ 低相似度（完全不同）→ 置信度 < 0.9
  - ✅ 多个 FAQ 时，选最高相似度
- [ ] 运行测试，确保覆盖率 ≥ 90%
- [ ] **时间:** 5 分钟

---

### Task 2: SimpleFilter 实现（1 小时）

#### 2.1 定义关键词规则库
- [ ] 创建文件 `backend/src/cascade/rules.data.ts`
- [ ] 按 category 定义关键词：
  ```typescript
  const RULES = {
    shipping: ['运单', '物流', '快递', '配送', '追踪', '发货', '到达', '延迟', ...],
    billing: ['订单', '支付', '发票', '账单', '扣款', '充值', '退款', '金额', ...],
    account: ['账户', '登录', '密码', '绑定', '注册', '认证', '身份验证', ...],
    product: ['产品', '规格', '尺寸', '性能', '兼容', '功能', '使用方法', ...],
    policy: ['政策', '条款', '协议', '规则', '规定', '说明', '要求', ...]
  };
  ```
- [ ] 每个 category 20-30 个关键词
- [ ] **时间:** 20 分钟

#### 2.2 实现 SimpleFilter 类
- [ ] 创建文件 `backend/src/cascade/simple.filter.ts`
- [ ] 实现接口：
  ```typescript
  export interface ISimpleFilter {
    classify(ticket: Ticket): Promise<{
      category: string;
      confidence: number;  // 0.7-0.9
      reason: string;
      matchedKeywords: string[];
    }>;
  }
  ```
- [ ] 核心逻辑：
  - 输入：工单文本
  - 对每个 category，计算匹配的关键词数量
  - 选择匹配最多的 category
  - 置信度 = 匹配关键词数 / 总关键词数
  - 置信度 < 0.7 → 不分类（交给 Level 3）
- [ ] **时间:** 20 分钟

#### 2.3 单元测试
- [ ] 创建文件 `backend/src/cascade/simple.filter.spec.ts`
- [ ] 测试用例：
  - ✅ shipping 工单 → category = 'shipping'
  - ✅ billing 工单 → category = 'billing'
  - ✅ 混合关键词 → 选择匹配最多的
  - ✅ 无关键词 → confidence < 0.7
- [ ] **时间:** 10 分钟

#### 2.4 集成测试
- [ ] 创建文件 `backend/src/cascade/cascade.integration.spec.ts`
- [ ] 创建 100 个测试工单（10 个每个类别 × 10）
- [ ] 验证：
  - FAQ 匹配准确率
  - Filter 分类准确率
  - 响应时间 < 50ms
- [ ] **时间:** 10 分钟

---

### Task 3: CascadeOrchestrator 基础结构（0.5 小时）

#### 3.1 创建 CascadeOrchestrator 类（基础框架）
- [ ] 创建文件 `backend/src/cascade/cascade.orchestrator.ts`
- [ ] 暂时不实现完整逻辑，只预留接口：
  ```typescript
  export class CascadeOrchestrator {
    async process(ticket: Ticket): Promise<CascadeResult> {
      // Day 13 实现完整逻辑
      throw new Error('Not implemented yet - Day 13');
    }
  }
  ```
- [ ] 定义类型：
  ```typescript
  export interface CascadeResult {
    source: 'FAQ' | 'FILTER' | 'MULTI_AGENT';
    answer?: string;
    category?: string;
    confidence: number;
    cost: number;      // $0 or $0.001-0.003
    latency: number;   // ms
  }
  ```
- [ ] **时间:** 10 分钟

#### 3.2 创建模块和导出
- [ ] 更新 `backend/src/cascade/cascade.module.ts`（新建）
- [ ] 导出 FAQMatcher、SimpleFilter、CascadeOrchestrator
- [ ] **时间:** 5 分钟

---

## 🎯 验收标准

### 代码质量
- [ ] TypeScript 严格模式 ✅
- [ ] 所有函数都有类型定义 ✅
- [ ] 单元测试覆盖率 ≥ 90% ✅
- [ ] ESLint 无错误 ✅

### 功能验证
- [ ] FAQMatcher：
  - [ ] 置信度 ≥ 0.9 能匹配 FAQ
  - [ ] 置信度 < 0.9 返回 false
  - [ ] 响应时间 < 10ms
- [ ] SimpleFilter：
  - [ ] 能正确分类 5 个 category
  - [ ] 置信度准确（基于关键词数）
  - [ ] 响应时间 < 10ms
- [ ] 集成测试：
  - [ ] 100 个测试工单通过
  - [ ] 平均响应时间 < 50ms
  - [ ] 准确率 ≥ 80%

### 文档
- [ ] 代码注释完整 ✅
- [ ] README 更新（新增 Cascade 说明）✅

---

## 📊 进度跟踪

| 任务 | 预计时间 | 实际时间 | 状态 |
|------|---------|---------|------|
| Task 1: FAQMatcher | 1h | - | 未开始 |
| Task 2: SimpleFilter | 1h | - | 未开始 |
| Task 3: CascadeOrchestrator 框架 | 0.5h | - | 未开始 |
| **总计** | **2.5h** | - | **未开始** |

---

## 💡 实现提示

### FAQ 匹配算法选择
**推荐：简单词袋模型（速度快，效果好）**
```typescript
// 伪代码
function similarity(text1: string, text2: string): number {
  const words1 = tokenize(text1);
  const words2 = tokenize(text2);
  const intersection = words1.filter(w => words2.includes(w));
  return intersection.length / Math.max(words1.length, words2.length);
}
```

### SimpleFilter 关键词定义
**规则：宽松匹配，只要有关键词就增加分数**
```typescript
// 伪代码
const matchedCount = RULES[category].filter(keyword => 
  text.includes(keyword)
).length;
const confidence = matchedCount / RULES[category].length;
```

### 测试工单生成
```bash
# Day 12 创建测试工单文件
# backend/test/cascade.test-tickets.ts
# 包含 100 个代表性工单，按 category 分布
```

---

## 🔗 文件清单

**创建的文件：**
```
backend/src/cascade/
├── faq.data.ts                      # FAQ 数据集
├── similarity.utils.ts              # 相似度计算
├── faq.matcher.ts                   # FAQMatcher 实现
├── faq.matcher.spec.ts              # FAQMatcher 测试
├── rules.data.ts                    # 规则库
├── simple.filter.ts                 # SimpleFilter 实现
├── simple.filter.spec.ts            # SimpleFilter 测试
├── cascade.orchestrator.ts          # CascadeOrchestrator（框架）
├── cascade.integration.spec.ts      # 集成测试
├── cascade.module.ts                # 模块导出
└── index.ts                         # 统一导出

backend/test/
└── cascade.test-tickets.ts          # 100 个测试工单
```

---

## ✅ Day 12 完成标志

完成以下所有项目时，Day 12 结束：
1. ✅ FAQMatcher 完全可用（单元测试通过）
2. ✅ SimpleFilter 完全可用（单元测试通过）
3. ✅ 集成测试通过（100 个工单）
4. ✅ 性能基准达到 < 50ms
5. ✅ 代码提交到 Git
6. ✅ 在 terminal 运行 `npm run test:cascade` 全部通过

**预期时间:** 2.5-3 小时（今天完成）

---

**开始时间:** 14:30  
**目标完成时间:** 17:30  
**准备好了吗？让我们开始！** 🚀
