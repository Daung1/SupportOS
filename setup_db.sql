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
