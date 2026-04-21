#!/bin/bash
# Simple database setup script - copy and paste commands to run
# Copy and paste the following into your terminal and run with sudo

# This script needs to be run with sudo
# Usage: sudo bash ./init-db.sh

set -e

echo "🔧 Setting up SupportOS PostgreSQL database..."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ This script must be run with sudo"
  echo "Usage: sudo bash ./init-db.sh"
  exit 1
fi

echo "Step 1: Creating PostgreSQL user and database..."

# Run SQL as postgres user
sudo -u postgres psql <<'EOSQL'
-- Create user if not exists
DO $$ BEGIN
  CREATE USER supportos_user WITH PASSWORD 'supportos_password';
EXCEPTION WHEN duplicate_object THEN
  ALTER USER supportos_user WITH PASSWORD 'supportos_password';
END $$;

-- Create database if not exists
SELECT 'CREATE DATABASE supportos OWNER supportos_user'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'supportos')
\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE supportos TO supportos_user;

-- Connect to supportos database and configure
\c supportos postgres

-- Grant schema privileges
GRANT USAGE ON SCHEMA public TO supportos_user;
GRANT CREATE ON SCHEMA public TO supportos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO supportos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO supportos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO supportos_user;

EOSQL

echo "✅ Database user and database created successfully!"
echo ""
echo "Credentials:"
echo "  User: supportos_user"
echo "  Password: supportos_password"
echo "  Database: supportos"
echo ""
echo "Step 2: Update backend/.env file"
echo "DATABASE_URL=\"postgresql://supportos_user:supportos_password@localhost:5432/supportos\""
echo ""
echo "Step 3: Run Prisma migrations"
echo "cd backend && npx prisma migrate deploy"
