# SupportOS - AI Agent System

<p align="center">
<a href="#english-version">English</a> | <a href="#zh-version">中文</a>
</p>

<a id="zh-version"></a>

🚀 企业级 AI 驱动的支持系统，采用 NestJS + React + Claude API 架构

[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.0-red)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-18.3-61dafb)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791)](https://www.postgresql.org/)

## 📋 项目概览

一个完整的生产级 AI Agent 系统，集成了工单管理、AI 驱动的建议、安全验证、并发处理和实时通信。

### 核心功能

- ✨ **AI 驱动回复建议** - 自动分析工单并生成建议回复
- 🔍 **智能文档搜索** - 集成知识库，智能找到相关文档
- 🛡️ **安全验证层** - 置信度评分、幻觉检测、自动审批
- ⚡ **并发处理** - 同时处理多个工单（支持 5+ 并发）
- 💰 **Token 成本追踪** - 实时监控 AI 成本
- 🔌 **实时通信** - WebSocket 推送进度和更新
- 📊 **完整审计日志** - 追踪每个 Agent 和 Tool 的执行

## 🏗️ 技术栈

### Frontend
- **React** 18.3 - UI 框架
- **TypeScript** - 类型系统
- **Tailwind CSS** - 现代样式
- **Vite** - 快速构建工具
- **SWR** - 数据获取和缓存
- **Socket.io Client** - 实时通信

### Backend
- **NestJS** 10 - Web 框架
- **TypeScript** - 类型系统
- **Prisma** - 数据库 ORM
- **PostgreSQL** - 主数据库
- **Redis** - 缓存和会话
- **Socket.io** - WebSocket 服务器
- **p-queue** - 任务队列管理
- **Winston** - 日志系统

### AI & 外部服务
- **Anthropic Claude API** - AI 模型
- **Qdrant** - 向量数据库（可选）

## 📦 项目结构

```
SupportOS/
├── backend/                    # NestJS 后端服务
│   ├── src/
│   │   ├── main.ts            # 应用入口 (带 Swagger)
│   │   ├── app.module.ts      # 根模块
│   │   ├── app.controller.ts  # 示例路由
│   │   ├── app.service.ts     # 示例服务
│   │   ├── agents/            # AI Agent 系统 (待实现)
│   │   ├── tools/             # 工具链 (待实现)
│   │   ├── claude/            # Claude 集成 (待实现)
│   │   ├── safety/            # 安全机制 (待实现)
│   │   ├── tokens/            # Token 追踪 (待实现)
│   │   ├── tickets/           # 工单管理 (待实现)
│   │   ├── queue/             # 队列管理 (待实现)
│   │   ├── socket/            # WebSocket (待实现)
│   │   └── common/            # 通用工具
│   ├── prisma/
│   │   └── schema.prisma      # 完整数据模型 ✅
│   ├── package.json           # 所有依赖已配置 ✅
│   ├── tsconfig.json          # TypeScript 配置
│   ├── .env.example           # 环境变量模板
│   └── README.md              # 后端文档
│
├── frontend/                   # React 前端应用
│   ├── src/
│   │   ├── main.tsx           # React 入口
│   │   ├── App.tsx            # 主应用 (健康检查演示) ✅
│   │   ├── index.css          # Tailwind 样式
│   │   ├── components/        # React 组件 (待实现)
│   │   ├── pages/             # 页面组件 (待实现)
│   │   ├── hooks/             # 自定义 hooks (待实现)
│   │   └── services/          # API 服务 (待实现)
│   ├── index.html             # HTML 模板
│   ├── vite.config.ts         # Vite 配置 ✅
│   ├── tailwind.config.js     # Tailwind 配置 ✅
│   ├── postcss.config.js      # PostCSS 配置
│   ├── package.json           # 所有依赖已配置 ✅
│   └── README.md              # 前端文档
│
├── README.md                  # 本文件
├── SupportOS_项目计划.md      # 📖 详细 5 周开发计划
├── LOCAL_SETUP.md             # 🔧 本地环境配置指南
├── setup.sh                   # ⚙️ 一键安装脚本
├── start-dev.sh               # 🚀 开发服务器启动脚本
└── .gitignore                 # Git 配置
```

## ✅ 项目状态

| 模块 | 状态 | 说明 |
|------|------|------|
| 项目脚手架 | ✅ 完成 | 所有配置文件和基础结构就位 |
| Backend 构建 | ✅ 成功 | NestJS 编译无错误，已可运行 |
| Frontend 构建 | ✅ 成功 | React 编译无错误，已可运行 |
| 依赖安装 | ✅ 完成 | 所有 npm 包已安装 (backend: 810, frontend: 262) |
| 数据库模型 | ✅ 完成 | Prisma schema 完全定义 |
| 类型定义 | ✅ 完成 | TypeScript 配置已优化 |
| **开发准备** | ✅ **就绪** | **可以直接开始 Week 1 实现** |

## 🚀 快速开始

### 前置要求

- **Node.js** 18+（已验证）
- **PostgreSQL** 14+
- **Redis** 6+
- **Claude API Key** (从 [Anthropic](https://console.anthropic.com) 获取)

### 安装指南

#### 1️⃣ 安装数据库（选择一种）

**MacOS:**
```bash
# 使用 Homebrew
brew install postgresql@14 redis

# 启动服务
brew services start postgresql@14
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
# 安装包
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib redis-server

# 启动服务
sudo systemctl start postgresql
sudo systemctl start redis-server
```

#### 2️⃣ 创建数据库

```bash
# 创建数据库
createdb supportos

# 创建用户并授予权限
psql -U postgres << EOF
CREATE USER supportos_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE supportos TO supportos_user;
\q
EOF
```

#### 3️⃣ 一键安装（推荐）

```bash
cd /home/xiyu/SupportOS
chmod +x setup.sh
./setup.sh
```

#### 4️⃣ 配置环境变量

**Backend** - 编辑 `backend/.env`:
```bash
DATABASE_URL="postgresql://supportos_user:your_password@localhost:5432/supportos"
REDIS_URL="redis://localhost:6379"
CLAUDE_API_KEY="sk-ant-xxxxxxxxxxxxx"  # 从 Anthropic 获取
NODE_ENV="development"
API_PORT=3000
```

#### 5️⃣ 启动开发服务器

**方式 A - 自动启动（推荐）:**
```bash
./start-dev.sh
```

**方式 B - 手动启动:**

```bash
# Terminal 1 - 后端
cd backend
npm run start:dev

# Terminal 2 - 前端
cd frontend
npm run dev
```

### 🎉 验证安装

打开浏览器访问这些 URL：

- **前端应用:** http://localhost:5173 ✅
- **后端 API:** http://localhost:3000 ✅
- **Swagger 文档:** http://localhost:3000/api ✅
- **Health Check:** http://localhost:3000/health ✅

你应该看到：
- 前端显示绿色的"✅ Backend is running!"
- 后端 Swagger 页面显示所有 API 接口
- Health check 返回 `{"status":"ok","timestamp":"..."}`

## 📚 文档

### 核心文档

| 文档 | 描述 |
|------|------|
| [SupportOS_项目计划.md](/SupportOS_项目计划.md) | 📖 **5 周详细开发计划**，包括架构、数据模型、每日任务 |
| [LOCAL_SETUP.md](/LOCAL_SETUP.md) | 🔧 **本地环境配置**，支持 MacOS/Linux/Windows |
| [backend/README.md](/backend/README.md) | 🐢 **后端文档**，NestJS 配置和 API |
| [frontend/README.md](/frontend/README.md) | 🎨 **前端文档**，React 项目结构 |

### 快速参考

- **数据库迁移:** `npx prisma migrate dev`
- **查看数据库:** `npx prisma studio`
- **代码格式化:** `npm run format`
- **代码检查:** `npm run lint`
- **运行测试:** `npm test`

## 🔐 环境变量

### Backend (.env)

```env
# 数据库
DATABASE_URL="postgresql://supportos_user:password@localhost:5432/supportos"

# Redis
REDIS_URL="redis://localhost:6379"

# Claude API - 从 https://console.anthropic.com 获取
CLAUDE_API_KEY="sk-ant-xxxxxxxxxxxxx"

# 应用配置
NODE_ENV="development"       # development | production
API_PORT=3000               # API 服务端口
LOG_LEVEL="debug"           # debug | info | warn | error

# JWT (身份验证)
JWT_SECRET="your-jwt-secret-key"
JWT_EXPIRES_IN="7d"
```

## 🧪 测试

### Backend 测试

```bash
cd backend

# 运行单元测试
npm test

# 监视模式
npm run test:watch

# 生成覆盖率报告
npm run test:cov
```

### Frontend 测试

```bash
cd frontend

# TypeScript 类型检查
npm run type-check

# ESLint 代码检查
npm run lint
```

## 🏗️ 构建和部署

### 后端构建

```bash
cd backend

# 构建生产版本
npm run build

# 运行生产服务器
npm run start:prod

# 或者使用 Node 直接运行
node dist/main
```

### 前端构建

```bash
cd frontend

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 输出在 dist/ 目录
```

## 🏋️ 项目开发进度

### ✅ 已完成

- [x] 项目结构和配置 - 脚手架 100% 完成
- [x] NestJS 框架搭建 - 编译通过，运行就绪
- [x] React 框架搭建 - 构建通过，运行就绪
- [x] Prisma ORM 和数据模型 - 7 个模型已定义
- [x] 前后端通信配置 - Vite 代理已配置
- [x] 环境变量管理 - .env.example 已准备
- [x] 基础 API 端点 - /health 和 / 已实现

### 🔄 进行中 (Week 1-3)

- [ ] Agent 系统架构 (Week 1) - 下一个任务
- [ ] 工具链实现 (Week 2)
- [ ] Claude API 集成 (Week 2)
- [ ] 安全机制 (Week 2.5)
- [ ] 前端 UI 组件 (Week 3)

详见 [SupportOS_项目计划.md](/SupportOS_项目计划.md)

## 🐛 常见问题

### Q: 连接被拒绝

**A:** 检查 PostgreSQL 和 Redis 是否正在运行：

```bash
# MacOS
brew services list

# Linux
sudo systemctl status postgresql
sudo systemctl status redis-server
```

### Q: 依赖安装失败

**A:** 清除缓存并重新安装：

```bash
rm -rf node_modules package-lock.json
npm install
```

### Q: 端口已被占用

**A:** 修改端口配置：
- 后端: `backend/.env` 中 `API_PORT`
- 前端: `frontend/vite.config.ts` 中 `server.port`

### Q: Prisma 迁移失败

**A:** 重置数据库（会删除所有数据）：

```bash
cd backend
npx prisma migrate reset
```

### Q: 前端无法连接到后端

**A:** 检查 `frontend/vite.config.ts` 中的代理配置是否正确指向 `http://localhost:3000`

## 📞 获取帮助

1. 📖 查看 [本地设置指南](/LOCAL_SETUP.md)
2. 📋 查看 [项目计划](/SupportOS_项目计划.md)
3. 🔍 检查后端日志：`docker logs backend` 或终端输出
4. 🔍 检查浏览器控制台的网络错误

## 📝 项目时间表

```
Week 1:    Agent 框架 + 基础设置 (5 days)
Week 2:    工具链 + Claude 集成 (6 days)
Week 2.5:  安全机制 + 并发处理 (4 days)
Week 3:    前端 + 集成测试 (5 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total:     完整的生产就绪系统 (20 days)
```

详见 [SupportOS_项目计划.md](/SupportOS_项目计划.md) 中的详细日程安排。

## 📊 项目统计

| 指标 | 数据 |
|------|------|
| 预期代码行数 | 3,500-4,000 |
| 文件数 | 45-60 |
| 开发周期 | 4-5 周 |
| Agent 数量 | 4+ |
| Tool 数量 | 3+ |
| 支持并发 | 5+ |

## 🤝 贡献指南

欢迎提交 Pull Request 和 Issue！

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 📞 快速链接

- 🌐 [Claude API 文档](https://docs.anthropic.com)
- 📚 [NestJS 文档](https://docs.nestjs.com)
- ⚛️ [React 文档](https://react.dev)
- 🗄️ [Prisma 文档](https://www.prisma.io/docs)
- 🐘 [PostgreSQL 文档](https://www.postgresql.org/docs)
- 🔴 [Redis 文档](https://redis.io/documentation)

---

**版本:** 0.0.1  
**创建日期:** 2026-04-15  
**最后更新:** 2026-04-15  
**开发者:** Development Team

✨ **准备好开始了吗？** 运行 `./setup.sh` 然后 `./start-dev.sh` 开始开发！
