# SupportOS 阶段 A.1 – A.5 关键设计决策

> 本文档沉淀 Phase A（Agent 框架基座）各子阶段在实现过程中做出的所有**架构决策**、**权衡理由**、**与程序计划 `SupportOS_ProgramPlan.md` 的呼应关系**，以及**后续阶段会受影响的接口点**。
>
> 读者对象：
>
> - 接手维护本项目的下一位工程师
> - 做 Code Review 想快速理解"为什么这么写"的评审人
> - 需要扩展新 Agent / 新 Orchestrator / 新 Pipeline 的后续开发者

---

## 目录

- [A.1 SharedState 类型化](#a1-sharedstate-类型化)
- [A.2 BaseAgent 事件化（EventEmitter）](#a2-baseagent-事件化eventemitter)
- [A.3 Pipeline / PipelineProvider](#a3-pipeline--pipelineprovider)
- [A.4 MultiAgentOrchestrator](#a4-multiagentorchestrator)
- [A.5 CascadeOrchestrator](#a5-cascadeorchestrator)
- [总体架构全景](#总体架构全景)
- [尚未落地但已预留接口的能力](#尚未落地但已预留接口的能力)

---

## A.1 SharedState 类型化

### 问题背景

原 `ISessionContext.state` 是 `Map<string, any>`，所有 Agent 之间通过字符串 key + `any` 值交换数据。这带来三个问题：

1. **无编译期检查**：写入时拼错 key（`analyzerResuilt`）、读取时假设类型错误（把 `SearchResult` 当成 `string`），TypeScript 完全感知不到。
2. **数据契约散落**：一个 key（如 `analyzerResult`）的字段约定只散落在各 Agent 的代码里，没有集中定义，新人接手要读完全部 Agent 才能搞清楚"谁写什么、谁读什么"。
3. **重构阻力大**：想改 `SearchResult` 多加一个字段？得全局搜索 `context.state.get('searcherResult')`，容易漏改。

### 决策

引入 `SharedState` 类作为 `context.state` 的**类型化门面（facade）**：

- **不修改** `ISessionContext.state` 本身（依然是 `Map<string, any>`）——保留向后兼容，存量测试和代码继续工作。
- 新增 `SharedStateSchema` 接口集中声明所有跨 Agent 数据的形状：`analyzerResult` / `searcherResult` / `faqResult` / `problemClassification` / `generatorResult` / `safetyResult`。
- `SharedState.from(context)` 返回包装器，暴露 `get<K>` / `set<K>` / `require<K>` / `has<K>` / `delete<K>` / `raw()` 方法，泛型约束 key ∈ schema、value 符合 schema 对应的类型。

### 为什么不直接把 `state` 改成 `Map<SharedStateKey, SharedStateValue>`

> 考虑过但否决。

- **破坏性**：所有 Agent 内部临时用 state 存的零散 key（如 `BaseAgent` 自己写的 `iteration_${i}`）都会编译不过。
- **开放性**：Agent 有时需要存"schema 之外"的临时数据（调试、cache），强约束反而不便。
- **渐进迁移**：facade 模式允许逐个 Agent 迁移，不用一次性改完。

### 实现要点

- `SHARED_STATE_KEYS` 常量数组 + `SharedStateSchema` 接口要保持同步，写了一个"key 穷尽性检查"的单元测试兜底。
- `require<K>` 会抛出有描述性信息的错误（"Required shared state key 'analyzerResult' is missing"），调试比 `undefined.field` 友好太多。
- `shared.raw()` 返回底层 `Map`——仅在需要兼容旧 API 或执行批量操作时用，日常代码应该用类型化方法。

### 好处与代价

| 维度 | 好处 | 代价 |
|---|---|---|
| **类型安全** | 写错 key / 类型错直接红线，不用等到运行时 | 新增 key 要改两处（schema + KEYS 数组） |
| **可发现性** | `SharedStateSchema` 成为 Agent 间协议的"单一真相来源" | schema 本身变成必须维护的契约 |
| **重构** | 改字段 → IDE 自动找全部调用方 | 改 schema 要同步改 consumer（但这是好事，强制一致） |
| **测试** | mock `context.state` 时类型已知，假值不会静默通过 | 需额外写"key 穷尽性"meta 测试 |

### 涉及文件

- `backend/src/agents/core/shared-state.ts`（新建）
- `backend/src/agents/core/shared-state.spec.ts`（新建）
- `backend/src/agents/impl/generator.agent.ts`（迁移为 SharedState）
- `backend/src/classifier/problem.classifier.ts`（迁移为 SharedState）

### 下游影响

- A.4 的 `MultiAgentOrchestrator` 使用 `shared.raw().set(route.publishAs, output)` 来把每个 Agent 的输出回填到 SharedState。
- 后续 SafetyGate（C.2）会写入 `safetyResult`；TokenTracker（A.6）**不会**写 SharedState，它走独立的服务。

---

## A.2 BaseAgent 事件化（EventEmitter）

### 问题背景

持久化和 WebSocket 推送需要监听 Agent 内部的 TAO Loop 过程：

- 每个 iteration 要写一条 `TicketLog`
- 每个 stage 切换要 push `ticket.stage` 到前端
- Agent 失败要单独记录 error log

**方案对比：**

| 方案 | 优点 | 缺点 |
|---|---|---|
| Agent 直接依赖 `LogRepository` / `SocketGateway` | 调用点显式 | Agent 和基础设施强耦合，测试要 mock 一堆东西；SafetyGate / TokenTracker 陆续加入时 Agent 构造函数会爆炸 |
| 回调数组（`onIteration?: (e) => void`） | 无外部依赖 | 多订阅者要自己管理数组；类型繁琐 |
| **EventEmitter + 生命周期事件** | 原生多订阅、标准 API、解耦 | 事件名是字符串（但可以用类型重载补回来） |

### 决策

**`BaseAgent extends EventEmitter`**，发布四个强类型事件：

| 事件 | 触发时机 | Payload |
|---|---|---|
| `agent.start` | TAO Loop 开始前 | `{ agentName, sessionId, taskId, ticketId, timestamp, input }` |
| `tao.iteration` | 每个 iteration 完成后（FINISH 前也发一次） | `{ ..., iteration, thought, action, observation, duration }` |
| `agent.error` | `think` / `parseAction` / `executeAction` 抛异常时 | `{ ..., phase, iteration, error }` |
| `agent.end` | 循环退出（FINISH / 异常 / max iterations） | `{ ..., success, iterations, duration, output, error }` |

### 为什么要做强类型事件

原生 EventEmitter 的 `on('tao.iteration', (e) => ...)` 里 `e` 是 `any`——这等于在 A.1 辛辛苦苦类型化 state 之后又开一个 `any` 漏洞。

解决：通过**重载**给 `emit` / `on` / `once` / `off` 都加一层 `<K extends keyof AgentEventMap>` 约束：

```ts
on<K extends keyof AgentEventMap>(
  name: K,
  listener: (payload: AgentEventMap[K]) => void,
): this;
on(name: string | symbol, listener: (...args: any[]) => void): this { ... }
```

订阅方 `agent.on('tao.iteration', e => e.iteration)` 直接有类型，写错事件名立即红线。

### `safeEmit` 隔离订阅者异常

订阅者（比如数据库写入）异常**绝不能**让 Agent 崩溃。所有发射走 `safeEmit`：

```ts
private safeEmit(name, payload) {
  try {
    super.emit(name, payload);
  } catch (err) {
    // log warn, swallow
  }
}
```

这个设计在 A.4 的 orchestrator `safeCall` 里也复用了同样的哲学：**基础设施错误不能阻塞业务流**。

### 为什么不用 RxJS / 自定义 EventBus

- RxJS Subject 学习成本高于 EventEmitter，且 NestJS 里一般 EventEmitter 就够（也有 `@nestjs/event-emitter` 包，但我们的需求是"每个 Agent 实例自己发自己的"，不是全局总线，不需要它）。
- 自定义 EventBus 没必要重复造轮子。

### 设置 `setMaxListeners(20)`

Node 默认 10 个监听器上限，超过就 warn。一个 Agent 实例会被：

- orchestrator（4 个）
- LogRepository（4 个）
- TokenTracker（1 个）
- SafetyGate（可能 0-2 个）
- 测试 hook（若干）

同时挂载，10 个很容易超。padding 到 20 留足空间，但不是无限——真的超了说明有泄漏。

### 涉及文件

- `backend/src/agents/core/types.ts`（新增 `AgentEventMap` 和四个事件 payload 类型）
- `backend/src/agents/base/base.agent.ts`（继承 EventEmitter + 事件发射）
- `backend/src/agents/base/base.agent.spec.ts`（新建事件测试）

### 下游影响

- A.4 orchestrator 挂载监听器、卸载监听器都基于这套 API。
- A.8 `TicketLogRepository` 将来直接实现 `ILogRepository` 就能接上。
- B.3 `SocketGateway` 同理。

---

## A.3 Pipeline / PipelineProvider

### 问题背景

三个 Agent 的调用关系是 `Analyzer → Searcher → Generator`。当前硬编码在 CascadeOrchestrator 里。未来要：

1. **动态跳过**：Analyzer 置信度高时 Searcher 没必要跑。
2. **动态路由**：LLM 分流到不同 Agent 组合（"高优工单"走简版流程、"疑难杂症"加上 KBAgent + CodeAgent）。
3. **业务线差异化**：同一批 Agent，不同产品线排列不同。

### 决策：三层抽象

```
AgentRoute  →  AgentPipeline  →  IPipelineProvider
  (一步)         (一条完整流程)      (生产流程的工厂)
```

- **`AgentRoute`**：单步路由配置。
  ```ts
  interface AgentRoute {
    id: string;                   // 路由唯一标识（"analyzer" / "searcher" / ...）
    agent: IAgent;                // 要跑的 Agent 实例
    condition?: (ctx) => boolean | Promise<boolean>;  // 软跳过
    timeoutMs?: number;           // 覆盖默认超时
    retries?: number;             // 覆盖默认重试次数
    required?: boolean;           // condition=false 时是否视为 pipeline 失败
    publishAs?: SharedStateKey;   // 输出写到 SharedState 的哪个 key
  }
  ```
- **`AgentPipeline`**：一条 pipeline 就是 `{ id, routes: AgentRoute[] }`。
- **`IPipelineProvider`**：`getPipeline(ctx): Promise<AgentPipeline>`，orchestrator 只依赖这个接口。

### 为什么要 `IPipelineProvider` 这层工厂，而不是直接把 pipeline 注入 orchestrator

- **扩展点**：默认静态 `DefaultPipelineProvider` → 未来可无缝替换为 `SmartPipelineProvider`（LLM 根据上下文动态编排），**orchestrator 零改动**。
- **上下文相关**：`getPipeline(ctx)` 可以拿当前租户 / 业务线 / 问题类型动态选 pipeline。
- **可测试性**：测试里传 `new StubPipelineProvider(pipeline)`，不用走 DI 容器。

### 为什么 `condition` 放在 route 上而不是 Agent 上

Agent 应该只关心"我要做什么"，不该关心"我是否要被调用"——后者是编排决策。同一个 SearcherAgent 在不同 pipeline 里可能有不同跳过规则。

### 为什么 `publishAs` 放在 route 上

> 这是 A.4 引入的补充字段。

orchestrator 执行 Agent 拿到 `ExecutionResult.output`，需要知道回填到 SharedState 的哪个 key。

**放在 route 上的好处**：同一个 Agent 被不同 pipeline 用时，发布的 key 可以不一样（比如 "AnalyzerAgent 用在 FAQ pipeline 里发布成 `faqAnalyzerResult`"）。

**硬编码在 orchestrator 里**会耦合 orchestrator 和 agent 命名，拒绝。

**让 Agent 自己 publish**（像 GeneratorAgent 那样 `shared.set('generatorResult', output)`）也可以，但这样 Agent 又依赖 SharedState 内部细节，不是所有 Agent 都该关心"我要被谁消费"。折中：Agent 自己可以写，orchestrator 也会保险地再写一次（幂等，最后写生效）。

### `assertValidPipeline` 在启动时验证

- pipeline.id 非空
- routes 非空
- 每个 route.id 唯一
- timeoutMs / retries 合法
- agent 存在且有 name

**失败即抛**——orchestrator 的 `execute()` 第一步调它，不允许非法 pipeline 悄悄运行一半再崩。

### `AgentRouteCondition` 返回 `boolean | Promise<boolean>`

支持同步和异步条件。同步用于简单检查（`shared.get('analyzerResult')?.confidence >= 0.8`），异步用于需要 I/O 的判断（查 feature flag、查权限）。`await` 一个非 Promise 值合法，orchestrator 里统一 `await` 即可。

### `DefaultPipelineProvider` 的默认逻辑

```
Analyzer  →  Searcher (condition: confidence < 0.8)  →  Generator
```

这对应程序计划里定义的"Analyzer 高置信度可以直接跳过检索"的优化。

### 涉及文件

- `backend/src/agents/pipeline/pipeline.interface.ts`（新建）
- `backend/src/agents/pipeline/pipeline.interface.spec.ts`（新建）
- `backend/src/agents/pipeline/default-pipeline.provider.ts`（新建）
- `backend/src/agents/pipeline/default-pipeline.provider.spec.ts`（新建）
- `backend/src/agents/agents.module.ts`（注册 provider）

### 下游影响

- A.4 orchestrator 注入 `PIPELINE_PROVIDER` token，`useExisting: DefaultPipelineProvider`，以后切成 SmartPipelineProvider 只改这一行。
- 未来 Graph-based 编排（有向图而非线性）可以通过换一个新的 provider 接口实现，当前接口不妨碍升级。

---

## A.4 MultiAgentOrchestrator

### 问题背景

A.1-A.3 完成后需要一个**协调者**把它们串起来：拿 pipeline、执行每个 route、挂事件、写持久化、推 WebSocket、做安全审核、统计 token。

### 决策：一个服务，一堆可选端口

```
┌─────────────────────────────────────────┐
│     MultiAgentOrchestrator              │
│                                         │
│  必选：IPipelineProvider                │
│  可选：ILogRepository                   │
│  可选：ISocketGateway                   │
│  可选：ISafetyGate                      │
│  可选：ITokenTracker                    │
│  可选：MultiAgentOrchestratorOptions    │
└─────────────────────────────────────────┘
```

### 为什么所有端口都用 `@Optional()`

**核心动机：让 A.4 可以独立落地，不阻塞等待 A.6 / A.8 / B.3 / C.2。**

- 现在：orchestrator 可以只挂 `IPipelineProvider` 跑起来，其他 port 给 `undefined`，相关副作用全部跳过。
- 未来：A.8 实现 `TicketLogRepository` 后，在 module 里 `{ provide: LOG_REPOSITORY, useClass: TicketLogRepository }`，orchestrator 无需任何代码改动自动接上。

这是标准的 **Hexagonal Architecture / Ports & Adapters** 写法：

- 核心（orchestrator）依赖抽象（`ILogRepository`）
- 适配器（`TicketLogRepository`）实现抽象
- DI 容器负责 wire

### 端口接口一览

| Port | Symbol Token | 职责 | 对应计划阶段 |
|---|---|---|---|
| `IPipelineProvider` | `PIPELINE_PROVIDER` | 产出 pipeline | A.3 ✅ |
| `ILogRepository` | `LOG_REPOSITORY` | 把 TAO 事件写 `TicketLog` 表 | A.8 |
| `ISocketGateway` | `SOCKET_GATEWAY` | 向 ticketId room 推送 WS 事件 | B.3 |
| `ISafetyGate` | `SAFETY_GATE` | 评估 generator 输出，决定 approve/review/reject | C.2 |
| `ITokenTracker` | `TOKEN_TRACKER` | flush 本次 session 的 token 使用量 | A.6 |

### 为什么自己写 `retryWithBackoff` 而不用 `p-retry`

- `p-retry` v5+ 是 **ESM-only**，项目是 CJS NestJS 构建，ts-jest 和 tsc 输出都要折腾 `moduleResolution` 和 dynamic import，成本远大于收益。
- 真正需要的语义：固定重试次数 + 指数退避 + 可选错误过滤 + 可选 onRetry hook。大约 30 行代码。
- 自带的版本还多了两项灵活性：
  - `shouldRetry` 谓词可按错误类型决定
  - `onRetry` 抛异常会被吞掉（日志 hook 绝不能干扰重试循环）

### `shouldRetry` 过滤结构性错误

```ts
shouldRetry: (err) => {
  if (err instanceof TypeError) return false;
  if (err instanceof SyntaxError) return false;
  return true;
}
```

**`TypeError` / `SyntaxError` = 程序 bug**，重试 3 次没意义。真正需要重试的是网络错误、LLM 429、工具超时。

### `withTimeout` 的限制与已知行为

- `timeoutMs <= 0` → 禁用超时（测试时方便）
- 超时后**原 Promise 不会被取消**（Promise 没取消原语），只是 race 失败。下层 agent 可能仍在后台跑完——这是 JS Promise 的固有限制，不是 bug。文档里明确标注。
- timer 用 `.unref()` 防止挂起 Node 事件循环。

### 执行流程核心逻辑

```
1. provider.getPipeline(ctx) + assertValidPipeline
2. notifyPipelineStart()                     ← 写 pipeline.start log
3. for each route in pipeline.routes:
     a. 如果 route.condition 返回 false:
          - required? → 立即 abort pipeline
          - 否则 → 记录 skipped, continue
     b. attachListeners(route)                ← 挂 start/iteration/error/end 监听器
     c. 执行: retryWithBackoff(
          () => withTimeout(agent.execute(ctx), timeoutMs),
          { retries, shouldRetry, onRetry }
        )
     d. 如果 route.publishAs + execResult.success:
          shared.raw().set(route.publishAs, output)
     e. detachListeners(route)                ← finally 保证卸载
     f. 如果 !success: abort pipeline（不再跑后续 route）
4. safetyGate?.evaluate(generatorOutput) → shared.set('safetyResult', ...)
5. tokenTracker?.flush(sessionId) → 推 ticket.cost
6. notifyPipelineEnd()                       ← 写 pipeline.end + 推 ticket.completed
```

### 重要边界：BaseAgent 吞异常与重试语义

在实现测试时发现一个关键事实：

> **`BaseAgent.execute()` 会把内部所有异常（think/parseAction/executeAction）都转成 `{ success: false, error }` 返回，不会 reject。**

这意味着 `retryWithBackoff` 包住 `agent.execute()` **只有两种情况真的重试**：

1. `withTimeout` 触发 `TimeoutError`
2. 非 BaseAgent 的 IAgent 实现真的 throw

BaseAgent 内部的工具瞬时失败→不会被 orchestrator 重试；而是被记为 "永久失败"，pipeline abort。

**为什么这是合理的**（而不是 bug）：

- TAO Loop 本身已经有多轮 iteration，LLM 的 think 阶段失败通常是结构性问题（prompt 坏了、schema 不对），重试外层 3 次只会放大问题。
- 真正的瞬时故障（网络、工具超时）在 iteration 内部就该被 Tool 层处理（重试 / 降级），或者通过 `withTimeout` 在 orchestrator 层兜底。
- Agent 自己决定 "success=false" 时意味着它已经想清楚了，不需要外层猜。

这个语义写进了 orchestrator 的测试里：`StubAgent`（BaseAgent 子类） 走 success=false 路径时 `retriesUsed=0`；`ThrowingAgent`（纯 IAgent，execute 真 throw）才会走 retry 路径。

### `safeCall`：副作用错误永不杀业务

```ts
private safeCall(fn: () => void | Promise<void>): void {
  try {
    const ret = fn();
    if (ret?.then) {
      ret.catch(err => this.logger.warn(...));
    }
  } catch (err) {
    this.logger.warn(...);
  }
}
```

- 同步 / 异步统一处理
- LogRepository 数据库挂了？warn 一行，pipeline 继续
- SocketGateway 断了？同上
- **一个 port 不能拖垮整条管道**

### SafetyGate 失败降级到 `review`

```ts
try {
  return await this.safetyGate.evaluate(output, ctx);
} catch (err) {
  return {
    decision: 'review',
    confidence: 0,
    reasons: [`SafetyGate unavailable: ${err}`],
    ...
  };
}
```

**Fail-closed 原则**：安全闸挂了**绝不 approve**，强制走人工审核。这是合规/安全语境下的默认姿态。

### Pipeline 级事件 vs Agent 级事件

| 级别 | 事件 | 谁发 |
|---|---|---|
| Agent | `agent.start` / `tao.iteration` / `agent.error` / `agent.end` | `BaseAgent` |
| Pipeline | `pipeline.start` / `pipeline.route.skipped` / `pipeline.end` / `pipeline.error` | `MultiAgentOrchestrator` 直接调 `logRepository.appendPipelineEvent` |
| WebSocket | `ticket.stage` / `ticket.iteration` / `ticket.cost` / `ticket.completed` / `ticket.failed` | orchestrator 翻译上述事件后 emit |

### 涉及文件

- `backend/src/agents/orchestrator/retry.util.ts`（新建）
- `backend/src/agents/orchestrator/timeout.util.ts`（新建）
- `backend/src/agents/orchestrator/ports/orchestrator-ports.ts`（新建）
- `backend/src/agents/orchestrator/multi-agent-orchestrator.service.ts`（新建）
- `backend/src/agents/orchestrator/*.spec.ts`（三份新测试，共 29 条）
- `backend/src/agents/pipeline/pipeline.interface.ts`（加 `publishAs`）
- `backend/src/agents/pipeline/default-pipeline.provider.ts`（三条 route 补 `publishAs`）
- `backend/src/agents/agents.module.ts`（注册 orchestrator + PIPELINE_PROVIDER 绑定）

### 下游影响

- **A.5 CascadeOrchestrator 重构**：应把旧的硬编码三步改为调用 `MultiAgentOrchestrator.execute(ctx)`，并把 FAQMatcher / SimpleFilter 等外围逻辑纳入 pipeline（可能需要把它们包成 Agent 或通过 condition 插入）。
- **A.6 TokenTracker**：实现 `ITokenTracker`，在 module 里 `provide: TOKEN_TRACKER` 即接上。
- **A.8 Prisma + TicketLogRepository**：实现 `ILogRepository`，同理接上。
- **B.3 WebSocket Gateway**：实现 `ISocketGateway`，同理接上。
- **C.2 SafetyGate**：实现 `ISafetyGate`，同理接上。

---

## A.5 CascadeOrchestrator

### 问题背景

单纯跑 `MultiAgentOrchestrator`（A.4）意味着**每一张工单都会触发一次完整 LLM pipeline**——调用 Analyzer / Searcher / Generator 三个 LLM Agent，token 成本几美分起跳、响应时间数秒级。

但现实中：

- ~60% 的工单是高频 FAQ（"shipping 要几天？"），答案固定，**应该走字典匹配，零 token，毫秒级返回**。
- ~20% 的工单是规则可分类但没有标准答案的（"我这是个账单问题"），**走关键词分类 + 模板/转人工，也不该动 LLM**。
- 只有剩下 ~20% 才真正需要 LLM 来生成定制化答案。

原项目代码里已经有 `FAQMatcher`（L1）和 `SimpleFilter`（L2），但只存在于 `cascade.integration.spec.ts` 里的本地 `CascadeProcessor` 类，**没有被服务化**，也没有接入 A.4 的 MultiAgentOrchestrator。A.5 的任务就是把它提取成生产级的 `@Injectable()` 服务。

### 决策：三层级联 + "便宜的先跑"

```
┌──────────────────────────────────────┐
│  L1 FAQMatcher   (~10ms, $0)         │  匹配到 → 直接返回 FAQ 答案
│     miss ↓                           │
│  L2 SimpleFilter (~50ms, $0)         │  匹配到 → 返回分类 + 模板
│     miss ↓                           │
│  L3 MultiAgent   (~3-8s, $0.01+)     │  A.4 pipeline 生成 LLM 答案
└──────────────────────────────────────┘
```

三个关键性质：

1. **短路（short-circuit）**：任何一层命中都**立即返回**，不跑下层。测试显式断言 `multiAgent.execute` 在 L1/L2 命中时没被调用。
2. **单一入口**：`processTicket(context: ISessionContext): Promise<CascadeResult>` 是 controller 调用的唯一方法。不对外暴露 "调 L1 / 调 L2 / 调 L3" 的接口。
3. **统一返回**：`CascadeResult` 同时包含 `level` / `source` / `answer` / `confidence` / `category` + 层特定诊断字段（`faqId` / `matchedKeywords` / `pipelineResult` / `safetyDecision`）。消费者既能简单用 `answer`，也能深挖每层的细节。

### 为什么 `processTicket` 接收的是 `ISessionContext` 而不是字符串

> 这是一个"小"决策但影响很大。

- 如果接字符串，到 L3 时还要临时构造 `ISessionContext`（tools、modelClient、metadata、state），调用侧要么临时拼装要么污染 cascade 自己的职责。
- 接 `ISessionContext` 则一次成型：L1/L2 只消费 `context.input`，L3 原封不动传给 `MultiAgentOrchestrator.execute(ctx)`。上下文贯穿整个调用链，`metadata.ticketId` 也自动沿途可用。

### 为什么 `MultiAgentOrchestrator` 不用 `@Optional()`

跟 A.4 里所有端口都 `@Optional()` 不同：

- A.4 的端口（Log / Socket / Token / Safety）是**副作用**，失去不影响核心流程。
- MultiAgent 是 cascade 的**主功能路径**。丢了它 = L3 彻底失效 = cascade 坏了半条腿。

所以它作为**必选构造参数**。测试可以传 stub，但生产环境必须注入真实实例。

### `ILogRepository` port 复用 + 事件类型扩展

CascadeOrchestrator **没有**引入新的 port 接口，直接**复用** A.4 的 `ILogRepository`。这样：

- 一条工单在 DB 里的完整 trace = cascade 层事件 + L3 agent 层 TAO 事件，**同一张表、同一种 Log 接口**。读侧重建时间线很顺。
- 不用再搞一个 `ICascadeLog`，减少抽象数量。

但 `PipelineLogEvent.type` 原来只有 4 个 `pipeline.*` 值，需要扩展。加了 9 个新值：

| 事件 | 触发时机 |
|---|---|
| `cascade.start` | 进入 cascade |
| `cascade.level1_hit` / `cascade.level1_miss` | L1 命中 / 未命中 |
| `cascade.level2_hit` / `cascade.level2_miss` | L2 命中 / 未命中 |
| `cascade.level3_entry` | 进入 L3（L1+L2 都未命中） |
| `cascade.level3_complete` | L3 执行完成（success 与否都发） |
| `cascade.end` | cascade 正常结束 |
| `cascade.error` | cascade 自身异常（注意不是 L3 业务失败） |

**有 miss 事件的好处**：在统计侧能直接出"L1 命中率 = count(level1_hit) / (count(level1_hit) + count(level1_miss))"这类指标，不用在 consumer 侧做集合运算。

### L3 的三种"失败"要区分对待

| 情况 | `CascadeResult.level` | `source` | `success` | `error` |
|---|---|---|---|---|
| L3 pipeline 跑完但 generator 失败 | `3` | `'MultiAgent'` | `false` | pipeline error |
| L3 `execute()` 抛异常（网络、OOM 等） | `0` | `'Error'` | `false` | 异常 message |
| L3 SafetyGate 判 `review` 或 `reject` | `3` | `'MultiAgent'` | `true` | `undefined`（安全决策在 `safetyDecision` 里） |

第三种尤其关键：SafetyGate 不是"失败"，是"有决定"——cascade 返回 `success=true` 把球踢给 controller，由 controller 决定"直接发给用户"/"转人工审核"/"拒绝"。cascade **不擅自判断**。

### L2 不生成真实答案（仅分类 + 模板）

`SimpleFilter` 的输出只有 `category` + `matchedKeywords`，没有 answer。如果 L2 命中就想发给用户，总得填个 `answer` 字段。几种选择：

| 方案 | 评价 |
|---|---|
| L2 直接返回空 answer | 破坏 "answer 字段可用" 的契约 |
| L2 调 LLM 补 answer | 违反 cascade 的 "便宜的先跑" 原则，退化成 L3 |
| **L2 返回模板化 acknowledgement**（采用） | 对用户说"已分类为 X，相关帮助会转给你"，由下游渠道（knowledge base / 人工）接力 |

选了方案 3，跟现有 `cascade.integration.spec.ts` 语义一致。模板串写死在 `level2TemplateAnswer`，未来加一个 `ITemplateResponder` 或 `IKBMatcher` port 就能升级。

### `appendLog` 和 A.4 的 `safeCall` 一脉相承

跟 A.4 orchestrator 里的原则完全相同：**日志 port 挂了绝不能杀业务**。同步/异步统一处理，catch 后 `logger.warn` 然后吞掉。测试里专门有一条"破损 LogRepository"场景验证 cascade 仍能返回正确结果。

### 已识别但推迟处理的问题：SimpleFilter 置信度公式

运行现有测试发现 `simple.filter.spec.ts` 有 10 条预存失败，`faq.matcher.spec.ts` 有 3 条。定位根因：

> `SimpleFilter.confidence = matchedKeywords.length / totalCategoryKeywords.length`
>
> `shipping` 类别在 `rules.data.ts` 里配了 40+ 关键词。用户 query 只能命中 2-3 个 → 置信度 ≈ 0.05，**永远达不到** `min=0.5` 的阈值。

这是**算法设计缺陷**（公式太悲观），**不是** A.5 CascadeOrchestrator 引入的，也**不在** A.5 的 scope 里（A.5 只是调用 SimpleFilter，不改它内部）。已登记到程序计划的"已知问题"清单，单开任务 `cascade: rework SimpleFilter confidence formula` 处理（改成 saturation 公式或 TF-IDF/BM25 加权）。

### 涉及文件

- `backend/src/cascade/cascade-orchestrator.service.ts`（新建）
- `backend/src/cascade/cascade-orchestrator.service.spec.ts`（新建，11 条测试）
- `backend/src/cascade/cascade.module.ts`（改写：`imports: [AgentsModule]` + 注册 orchestrator）
- `backend/src/cascade/index.ts`（追加导出）
- `backend/src/agents/orchestrator/ports/orchestrator-ports.ts`（`PipelineLogEvent.type` 扩展 9 个 `cascade.*` 事件）

### 下游影响

- **A.6 TokenTracker**：cascade 不用改。L3 的 token usage 通过 `CascadeResult.pipelineResult.tokenUsage` 透传。
- **A.7 ConcurrentOrchestrator**：用 `p-queue` 包住 `cascadeOrchestrator.processTicket()` 即可。
- **A.8 TicketLogRepository**：实现后，在 `CascadeModule` / `AgentsModule` 里 `provide: LOG_REPOSITORY`，**cascade 层 + agent 层的所有事件自动持久化**。
- **B.3 WebSocket Gateway**：cascade 层暂不直接推 WS（L1/L2 太快，一次 `ticket.completed` 就够）；L3 的 stage/iteration 仍由 MultiAgentOrchestrator 推送。
- **Controller 层**：拿到 `CascadeResult` 后，根据 `safetyDecision?.decision` 决定是否直接发给用户或转人工。

---

## 总体架构全景

```
┌──────────────────────────────────────────────────────────────────┐
│                      HTTP / WS Controller                        │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                  CascadeOrchestrator (A.5 ✅)                    │
│                                                                  │
│   L1 FAQMatcher     (~10ms, $0)  → hit? return                   │
│       ↓ miss                                                     │
│   L2 SimpleFilter   (~50ms, $0)  → hit? return template          │
│       ↓ miss                                                     │
│   L3 ↓ 调 MultiAgentOrchestrator.execute(ctx)                    │
│                                                                  │
│   复用 ILogRepository port：发 cascade.start / level1_hit /      │
│      level1_miss / level2_hit / ... / level3_complete / end      │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                  MultiAgentOrchestrator (A.4 ✅)                 │
│                                                                  │
│   ┌───────────────┐    ┌──────────────────┐                      │
│   │ Pipeline      │◄───│ IPipelineProvider│ ◄─── 可替换成       │
│   │ Provider      │    │  (默认: 静态)    │      LLM 动态编排   │
│   └───────────────┘    └──────────────────┘                      │
│                                                                  │
│   for each AgentRoute:                                           │
│     ┌─────────┐  attach listeners                                │
│     │ BaseAgt │◄───────────────────────────┐                     │
│     │ (A.2 ✅)│  TAO events                │                     │
│     └─────────┘                            │                     │
│          │                                 ▼                     │
│          │              ┌──────────────────────────────────┐     │
│          │              │  ILogRepository (A.8 待)         │     │
│          │              │  ISocketGateway (B.3 待)         │     │
│          │              │  ITokenTracker (A.6 待)          │     │
│          │              └──────────────────────────────────┘     │
│          ▼                                                       │
│   SharedState.raw().set(publishAs, output)  ◄── A.1 ✅           │
│                                                                  │
│   after pipeline:                                                │
│     ISafetyGate.evaluate(generatorOutput)   ◄── C.2 待           │
└──────────────────────────────────────────────────────────────────┘
```

### 职责边界速查

| 组件 | 只做 | 不做 |
|---|---|---|
| `BaseAgent` | TAO Loop + 发事件 | 不落库、不推 WS、不判安全 |
| `SharedState` | 类型化读写 context.state | 不持久化、不广播 |
| `AgentPipeline` | 描述执行顺序 + 条件 | 不决定如何执行 |
| `IPipelineProvider` | 返回 pipeline | 不执行 |
| `MultiAgentOrchestrator` | 串 pipeline、挂事件、重试、超时、调 SafetyGate、flush Token | 不决定 pipeline 长啥样（交给 provider）、不实现具体持久化（交给 ports） |
| `CascadeOrchestrator` | L1/L2/L3 漏斗路由、cascade 级事件日志、统一返回 `CascadeResult` | 不生成 answer（L3 交给 MultiAgent）、不自己推 WebSocket（交给 MultiAgent/controller）、不做安全判定（透传 SafetyGate 决策） |
| `ILogRepository` 等 ports | 单一职责的副作用 | 不参与编排决策 |

---

## 尚未落地但已预留接口的能力

> 以下每一项都只需"实现一个类 + 在 module 里 provide"即可接通，**orchestrator 和 Agent 代码不用改**。

| 能力 | 预留接口 | 预计阶段 |
|---|---|---|
| TAO 事件持久化到 PostgreSQL | `ILogRepository` | A.8 |
| 前端实时进度推送 | `ISocketGateway` | B.3 |
| Token 统计 + 成本核算 | `ITokenTracker` | A.6 |
| 输出安全审核 | `ISafetyGate` | C.2 |
| LLM 动态编排（根据问题类型选 agent 组合） | 替换 `IPipelineProvider` 实现 | 未来扩展 |
| Graph-based 编排（非线性 DAG） | 新增 `IPipelineProvider` 实现即可 | 未来扩展 |

---

## 回归与验收状态（截至 A.5 结束）

- **TypeScript 编译**：`tsc --noEmit` 零错误
- **单元测试**：200 条，187 绿
  - shared-state: ✅
  - base.agent: ✅
  - pipeline.interface: ✅
  - default-pipeline.provider: ✅
  - retry.util: ✅（7 条）
  - timeout.util: ✅（6 条）
  - multi-agent-orchestrator.service: ✅（16 条）
  - cascade-orchestrator.service: ✅（11 条，**A.5 新增**）
  - cascade.integration: ✅（原有）
  - generator.agent: ✅（迁移后未回归）
- **已知遗留失败**：`cascade/faq.matcher.spec.ts`（3 条）、`cascade/simple.filter.spec.ts`（10 条）—— **根因是 `SimpleFilter` 置信度公式缺陷**，与 A.1-A.5 无关。已登记到 `SupportOS_ProgramPlan.md` 的"已知问题与技术债"清单，单开任务修复（改成 saturation / BM25 加权公式）。

---

## 附：检索友好的术语对照表

| 中文 | 代码里出现的名字 |
|---|---|
| 共享状态 / 类型化 state | `SharedState`, `SharedStateSchema`, `SharedStateKey` |
| 生命周期事件 | `AgentEventMap`, `'agent.start'`, `'tao.iteration'`, `'agent.end'`, `'agent.error'` |
| 路由 / 流水线 | `AgentRoute`, `AgentPipeline` |
| 流水线工厂 | `IPipelineProvider`, `DefaultPipelineProvider`, `PIPELINE_PROVIDER` |
| 端口（可选依赖） | `ILogRepository`, `ISocketGateway`, `ISafetyGate`, `ITokenTracker`, 对应 `LOG_REPOSITORY` / `SOCKET_GATEWAY` / `SAFETY_GATE` / `TOKEN_TRACKER` |
| 重试 / 超时 | `retryWithBackoff`, `withTimeout`, `TimeoutError` |
| 主编排器 | `MultiAgentOrchestrator`, `MultiAgentResult`, `RouteExecutionRecord` |
| 发布点 | `AgentRoute.publishAs` |
| 级联编排器 | `CascadeOrchestrator`, `CascadeResult`, `CascadeSource` |
| 级联事件 | `cascade.start`, `cascade.level1_hit`, `cascade.level1_miss`, `cascade.level2_hit`, `cascade.level2_miss`, `cascade.level3_entry`, `cascade.level3_complete`, `cascade.end`, `cascade.error` |
