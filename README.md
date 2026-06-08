# SupportOS - AI Agent System

<p align="center">
<a href="#english">English (default)</a> | <a href="#chinese">中文</a>
</p>

<a id="english"></a>

<details open>
<summary><strong>English (default)</strong></summary>

🚀 Enterprise-grade AI-powered support system built with NestJS + React + Claude API

[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.0-red)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-18.3-61dafb)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791)](https://www.postgresql.org/)

## Project Overview

An end-to-end production-ready AI Agent system integrating ticket management, AI-assisted suggestions, safety checks, concurrent processing, and real-time communication.

### Key Features

- ✨ AI-assisted reply suggestions — automatically analyze tickets and propose responses
- 🔍 Intelligent document search — integrated knowledge base to find relevant docs
- 🛡️ Safety & validation — confidence scoring, hallucination detection, and auto-approval
- ⚡ Concurrent processing — handle multiple tickets concurrently (5+ supported)
- 💰 Token cost tracking — monitor AI usage and costs in real time
- 🔌 Real-time updates — WebSocket pushes for progress and updates
- 📊 Full audit logs — trace execution for each Agent and Tool

## Tech Stack

### Frontend
- React 18.3, TypeScript, Tailwind CSS, Vite, SWR, Socket.io Client

### Backend
- NestJS 10, TypeScript, Prisma ORM, PostgreSQL, Redis, Socket.io, p-queue, Winston

### AI & External Services
- Anthropic Claude API (AI model), Qdrant (optional vector DB)

## Project Structure

```
SupportOS/
├── backend/                    # NestJS backend service
│   ├── src/
│   │   ├── main.ts            # Application entry (with Swagger)
│   │   ├── app.module.ts      # Root module
│   │   ├── app.controller.ts  # Example routes
│   │   ├── app.service.ts     # Example service
│   │   ├── agents/            # AI Agent system (work in progress)
│   │   ├── tools/             # Tooling (work in progress)
│   │   ├── claude/            # Claude integration (work in progress)
│   │   ├── safety/            # Safety mechanisms (work in progress)
│   │   ├── tokens/            # Token tracking (work in progress)
│   │   ├── tickets/           # Ticket management (work in progress)
│   │   ├── queue/             # Queue management (work in progress)
│   │   ├── socket/            # WebSocket (work in progress)
│   │   └── common/            # Shared utilities
│   ├── prisma/
│   │   └── schema.prisma      # Database schema ✅
│   ├── package.json           # Dependencies configured ✅
│   ├── tsconfig.json          # TypeScript config
│   ├── .env.example           # Environment template
│   └── README.md              # Backend docs
│
├── frontend/                   # React frontend app
│   ├── src/
│   │   ├── main.tsx           # React entry
│   │   ├── App.tsx            # Main app (health check demo) ✅
│   │   ├── index.css          # Tailwind styles
│   │   ├── components/        # React components (work in progress)
│   │   ├── pages/             # Page components (work in progress)
│   │   ├── hooks/             # Custom hooks (work in progress)
│   │   └── services/          # API services (work in progress)
│   ├── index.html             # HTML template
│   ├── vite.config.ts         # Vite config ✅
│   ├── tailwind.config.js     # Tailwind config ✅
│   ├── postcss.config.js      # PostCSS config
│   ├── package.json           # Dependencies configured ✅
│   └── README.md              # Frontend docs
│
├── README.md                  # This file
├── SupportOS_项目计划.md      # Project plan (5 weeks)
├── LOCAL_SETUP.md             # Local setup guide
├── setup.sh                   # One-click install script
├── start-dev.sh               # Dev server start script
└── .gitignore                 # Git config
```

## Status

| Module | Status | Notes |
|-------:|:------:|:------|
| Scaffolding | ✅ | Project structure and configs are ready |
| Backend build | ✅ | NestJS compiles and runs |
| Frontend build | ✅ | React builds and runs |
| Dependencies | ✅ | npm packages installed (backend: 810, frontend: 262) |
| DB schema | ✅ | Prisma schema defined |
| Types | ✅ | TypeScript configured |
| **Ready for development** | ✅ | Start Week 1 implementation |

## Quick Start

### Requirements

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Claude API Key (from Anthropic)

### Install

1) Install DB (choose one)

MacOS:
```bash
# Homebrew
brew install postgresql@14 redis

# Start services
brew services start postgresql@14
brew services start redis
```

Linux (Ubuntu/Debian):
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib redis-server

sudo systemctl start postgresql
sudo systemctl start redis-server
```

2) Create database

```bash
createdb supportos

psql -U postgres << EOF
CREATE USER supportos_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE supportos TO supportos_user;
\q
EOF
```

3) One-click install (recommended)

```bash
cd /home/xiyu/SupportOS
chmod +x setup.sh
./setup.sh
```

4) Configure env (backend/.env)

```bash
DATABASE_URL="postgresql://supportos_user:your_password@localhost:5432/supportos"
REDIS_URL="redis://localhost:6379"
CLAUDE_API_KEY="sk-ant-xxxxxxxxxxxxx"
NODE_ENV="development"
API_PORT=3000
```

5) Start dev servers

Auto (recommended):
```bash
./start-dev.sh
```

Manual:
```bash
# Terminal 1 - backend
cd backend
npm run start:dev

# Terminal 2 - frontend
cd frontend
npm run dev
```

Verify:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Swagger: http://localhost:3000/api
- Health: http://localhost:3000/health

</details>

<a id="chinese"></a>

<details>
<summary><strong>中文</strong></summary>

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

（保留原中文内容，其余同英文版）

</details>
