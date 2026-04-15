# SupportOS Database Setup Guide

## 问题诊断

你的PostgreSQL安装需要进行初始配置以创建 `supportos` 数据库和 `supportos_user` 用户。

## 解决方案

### 方法1：使用PostgreSQL超级用户凭证（推荐）

#### Step 1: 作为PostgreSQL超级用户连接

```bash
# 尝试以下任一方式连接到PostgreSQL：
sudo -u postgres psql

# 或者，如果你知道postgres用户的密码：
psql -h localhost -U postgres
```

#### Step 2: 在PostgreSQL中运行以下SQL命令

```sql
-- 创建用户
CREATE USER supportos_user WITH PASSWORD 'supportos_password';

-- 创建数据库
CREATE DATABASE supportos OWNER supportos_user;

-- 授予权限
GRANT ALL PRIVILEGES ON DATABASE supportos TO supportos_user;

-- 为用户设置配置
ALTER ROLE supportos_user SET client_encoding TO 'utf8';
ALTER ROLE supportos_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE supportos_user SET default_transaction_deferrable TO on;
ALTER ROLE supportos_user SET default_transaction_read_only TO off;

-- 连接到supportos数据库
\c supportos

-- 授予schema权限
GRANT USAGE ON SCHEMA public TO supportos_user;
GRANT CREATE ON SCHEMA public TO supportos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO supportos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO supportos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO supportos_user;

-- 退出
\q
```

### 方法2：通过文件执行

#### Step 1: 保存SQL到文件

创建或使用已有的 `setup_db.sql` 文件，内容如上所示。

#### Step 2: 以postgres用户执行

```bash
sudo -u postgres psql -f /home/xiyu/SupportOS/setup_db.sql
```

或

```bash
cat /home/xiyu/SupportOS/setup_db.sql | sudo -u postgres psql
```

### 方法3：修改PostgreSQL配置（高级用户）

如果上述方法需要密码但你不知道，可以修改PostgreSQL的认证配置：

1. 编辑PostgreSQL配置文件：
```bash
sudo nano /etc/postgresql/14/main/pg_hba.conf
```

2. 找到本地socket连接的行（通常在文件开头）：
```
local   all             postgres                                peer
```

3. 将其改为信任认证（仅用于开发环境）：
```
local   all             postgres                                trust
```

4. 重启PostgreSQL：
```bash
sudo systemctl restart postgresql
```

5. 然后运行SQL设置命令。

## 验证配置

配置完成后，验证连接：

```bash
# 使用新创建的用户连接
PGPASSWORD=supportos_password psql -h localhost -U supportos_user -d supportos -c "SELECT 1;"
```

如果看到 `1` 输出，说明配置成功。

## 更新.env文件

在 `backend/.env` 中确保有以下行：

```
DATABASE_URL="postgresql://supportos_user:supportos_password@localhost:5432/supportos"
```

## 运行Prisma迁移

```bash
cd /home/xiyu/SupportOS/backend
npx prisma migrate deploy
```

## 故障排除

### 错误：`role "supportos_user" already exists`

数据库用户已存在。你可以：
- 删除现有用户并重新创建：
  ```sql
  DROP DATABASE IF EXISTS supportos;
  DROP USER IF EXISTS supportos_user;
  ```
  然后重新运行上述SQL命令。

### 错误：`permission denied for schema public`

确保已运行了权限授予命令。

### 错误：`authentication failed`

- 检查密码是否正确
- 确保PostgreSQL服务正在运行：
  ```bash
  sudo systemctl status postgresql
  ```
- 如果需要启动PostgreSQL：
  ```bash
  sudo systemctl start postgresql
  ```
