#!/bin/bash

# Database setup script for SupportOS
# Run with: sudo bash setup_postgresql.sh

set -e

echo "Setting up PostgreSQL database and user..."

# Create database and user
sudo -u postgres psql << EOF
-- Create database user
CREATE USER supportos_user WITH PASSWORD 'supportos_password';

-- Create database  
CREATE DATABASE supportos OWNER supportos_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE supportos TO supportos_user;

-- Connect to the database and grant schema privileges
\c supportos postgres

GRANT USAGE ON SCHEMA public TO supportos_user;
GRANT CREATE ON SCHEMA public TO supportos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO supportos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO supportos_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO supportos_user;
EOF

echo "✅ Database setup complete!"
echo ""
echo "Database credentials:"
echo "  User: supportos_user"
echo "  Password: supportos_password"
echo "  Database: supportos"
echo ""
echo "Update your backend/.env with:"
echo "  DATABASE_URL=\"postgresql://supportos_user:supportos_password@localhost:5432/supportos\""
