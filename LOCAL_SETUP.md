# SupportOS 本地开发环境配置指南

**不使用 Docker，完全本地开发环境设置**

---

## 📍 系统要求

- Node.js 18+ (推荐 20+)
- npm 9+ 或 yarn
- PostgreSQL 14+
- Redis 6+

---

## 🖥️ MacOS 安装指南

### **1. 安装 Homebrew (如果未安装)**

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### **2. 安装 PostgreSQL**

```bash
brew install postgresql@16

# 初始化数据库
initdb /usr/local/var/postgres

# 启动 PostgreSQL 服务
brew services start postgresql@16

# 验证安装
psql --version
```

### **3. 安装 Redis**

```bash
brew install redis

# 启动 Redis 服务
brew services start redis

# 验证安装
redis-cli ping
# 返回: PONG 表示成功
```

### **4. 创建数据库和用户**

```bash
# 进入 PostgreSQL
psql -U postgres

# 执行以下命令
CREATE DATABASE supportos;
CREATE USER supportos_user WITH PASSWORD 'your_secure_password';
ALTER ROLE supportos_user SET client_encoding TO 'utf8';
ALTER ROLE supportos_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE supportos_user SET default_transaction_deferrable TO on;
ALTER ROLE supportos_user SET default_transaction_read_only TO off;
GRANT ALL PRIVILEGES ON DATABASE supportos TO supportos_user;
\q
```

---

## 🐧 Linux (Ubuntu/Debian) 安装指南

### **1. 安装 PostgreSQL**

```bash
# 更新包列表
sudo apt-get update

# 安装 PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# 验证安装
psql --version

# 启动服务
sudo systemctl start postgresql
sudo systemctl enable postgresql  # 开机自启
```

### **2. 安装 Redis**

```bash
sudo apt-get install redis-server redis-tools

# 启动服务
sudo systemctl start redis-server
sudo systemctl enable redis-server  # 开机自启

# 验证安装
redis-cli ping
# 返回: PONG 表示成功
```

### **3. 创建数据库和用户**

```bash
# 以 postgres 用户登录
sudo -u postgres psql

# 执行以下命令
CREATE DATABASE supportos;
CREATE USER supportos_user WITH PASSWORD 'your_secure_password';
ALTER ROLE supportos_user SET client_encoding TO 'utf8';
ALTER ROLE supportos_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE supportos_user SET default_transaction_deferrable TO on;
ALTER ROLE supportos_user SET default_transaction_read_only TO off;
GRANT ALL PRIVILEGES ON DATABASE supportos TO supportos_user;
\q
```

---

## 🪟 Windows 安装指南

### **1. 安装 PostgreSQL**

- 下载: https://www.postgresql.org/download/windows/
- 运行安装程序
- 记住 postgres 用户的密码
- 默认端口: 5432

### **2. 安装 Redis**

**方式 A: Windows Subsystem for Linux (WSL)**

```bash
# 在 WSL 中运行
sudo apt-get update
sudo apt-get install redis-server
sudo service redis-server start
```

**方式 B: Windows Native (不推荐)**

- 下载: https://github.com/microsoftarchive/redis/releases
- 或使用 Chocolatey: `choco install redis`

### **3. 创建数据库和用户**

```bash
# 打开 PostgreSQL 命令行
psql -U postgres

# 执行上面的 SQL 命令
CREATE DATABASE supportos;
...
```

---

## ✅ 验证安装

```bash
# 1. 检查 PostgreSQL
psql -U supportos_user -d supportos -c "SELECT 1;"

# 如果返回类似这样的输出，说明成功：
#  ?column? 
# ----------
#         1

# 2. 检查 Redis
redis-cli ping
# 返回: PONG

# 3. 检查 Node.js
node --version  # 应该是 v18.0.0 或更高

npm --version   # 应该是 9.0.0 或更高
```

---

## 📝 创建项目的 .env 文件

进入 `backend/` 目录，创建 `.env` 文件：

```bash
cat > backend/.env << 'EOF'
# 数据库配置
DATABASE_URL="postgresql://supportos_user:your_secure_password@localhost:5432/supportos"

# Redis 配置
REDIS_URL="redis://localhost:6379"

# Claude API
CLAUDE_API_KEY="sk-ant-xxxxxxxxxxxxxx"

# 环境
NODE_ENV="development"

# 端口
API_PORT=3000

# 日志等级
LOG_LEVEL="debug"
EOF
```

**⚠️ 重要: 替换密码和 API Key**

如果你用了不同的密码或不同的端口，要相应修改。

---

## 🚀 启动开发环境

### **步骤 1: 启动数据库服务**

```bash
# MacOS
brew services start postgresql@16
brew services start redis

# Linux
sudo systemctl start postgresql
sudo systemctl start redis-server

# Windows (WSL)
sudo service postgresql start
sudo service redis-server start
```

### **步骤 2: 初始化后端**

```bash
cd backend

# 安装依赖
npm install

# 运行数据库迁移
npx prisma migrate dev

# 启动后端服务器
npm run start:dev

# 应该看到类似的输出：
# [NestFactory] Starting Nest application...
# Logger initialized
# Server running on port 3000
```

### **步骤 3: 启动前端（新终端）**

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 应该看到：
# > vite
#   VITE v4.x.x  ready in xxx ms
#   ➜  Local:   http://localhost:5173/
```

### **步骤 4: 打开浏览器**

访问 http://localhost:5173

---

## 🛑 停止开发环境

```bash
# MacOS
brew services stop postgresql@16
brew services stop redis

# Linux
sudo systemctl stop postgresql
sudo systemctl stop redis-server

# Windows (WSL)
sudo service postgresql stop
sudo service redis-server stop
```

---

## 📊 常用数据库命令

### **PostgreSQL**

```bash
# 连接到数据库
psql -U supportos_user -d supportos

# 显示所有表
\dt

# 显示表结构
\d table_name

# 查询数据
SELECT * FROM tickets;

# 退出
\q

# 从命令行执行查询
psql -U supportos_user -d supportos -c "SELECT * FROM tickets;"
```

### **Redis**

```bash
# 进入 Redis CLI
redis-cli

# 查看所有键
KEYS *

# 获取特定键的值
GET key_name

# 列出所有数据库
INFO

# 清空数据库
FLUSHDB

# 退出
EXIT
```

---

## 🐛 常见问题

### **Q1: PostgreSQL 无法启动**

```bash
# 检查进程
ps aux | grep postgres

# 如果已经在运行，停止后重启
brew services stop postgresql@16
brew services start postgresql@16

# 检查日志
tail -f /usr/local/var/log/postgres.log
```

### **Q2: 连接被拒绝**

```bash
# 确保 PostgreSQL 正在运行
brew services list

# 检查连接字符串是否正确
psql -U supportos_user -d supportos

# 如果密码错误，重置密码
sudo -u postgres psql -c "ALTER USER supportos_user PASSWORD 'new_password';"
```

### **Q3: Redis 连接失败**

```bash
# 检查 Redis 是否运行
redis-cli ping

# 如果返回 (error) could not connect，启动 Redis
brew services start redis

# 检查 Redis 配置文件
cat /usr/local/etc/redis.conf | grep port
```

### **Q4: 端口已被占用**

```bash
# 检查哪个进程占用了端口
# MacOS/Linux
lsof -i :5432   # PostgreSQL
lsof -i :6379   # Redis
lsof -i :3000   # 后端
lsof -i :5173   # 前端

# Windows
netstat -ano | findstr :3000

# 杀死进程
kill -9 process_id
```

### **Q5: Prisma 迁移失败**

```bash
# 重置数据库 (谨慎！会删除所有数据)
npx prisma migrate reset

# 或者手动创建数据库
dropdb supportos
createdb supportos
npx prisma migrate dev
```

---

## 📦 项目启动验证清单

启动前检查：

- [ ] PostgreSQL 正在运行 (`brew services list`)
- [ ] Redis 正在运行 (`redis-cli ping` 返回 PONG)
- [ ] 数据库 `supportos` 已创建
- [ ] 用户 `supportos_user` 已创建
- [ ] `.env` 文件已配置正确
- [ ] Node.js 版本 >= 18
- [ ] 已运行 `npx prisma migrate dev`

启动时：

- [ ] 后端启动成功 (监听 3000 端口)
- [ ] 前端启动成功 (监听 5173 端口)
- [ ] 浏览器能访问 http://localhost:5173
- [ ] 网络控制台无 CORS 错误

---

## 💾 数据库备份和恢复

### **备份数据库**

```bash
pg_dump -U supportos_user supportos > backup.sql
```

### **恢复数据库**

```bash
psql -U supportos_user supportos < backup.sql
```

---

## 🔧 性能优化建议

### **PostgreSQL**

```bash
# 查看连接数
psql -U supportos_user -d supportos -c "SELECT max_connections FROM pg_settings;"

# 增加连接数 (在 postgresql.conf)
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
```

### **Redis**

```bash
# 配置内存限制
redis-cli CONFIG SET maxmemory 256mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

---

## 📞 需要帮助？

遇到问题时：

1. 检查日志输出
2. 验证服务状态
3. 查看这个指南中的 "常见问题"
4. 查看官方文档
   - PostgreSQL: https://www.postgresql.org/docs/
   - Redis: https://redis.io/documentation
   - NestJS: https://docs.nestjs.com

---

**最后更新:** 2026-04-15  
**版本:** 1.0
