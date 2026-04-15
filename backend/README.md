# SupportOS Backend

NestJS-based backend for the SupportOS AI Agent System.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Installation

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start development server
npm run start:dev
```

### Available Scripts

- `npm run start:dev` - Start development server with watch mode
- `npm run build` - Build the project
- `npm run start:prod` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run tests
- `npm run test:cov` - Run tests with coverage

## 📁 Project Structure

```
src/
├── agents/           # AI Agent implementations
├── tools/            # Tool implementations
├── claude/           # Claude API integration
├── safety/           # Safety mechanisms
├── tokens/           # Token tracking
├── tickets/          # Ticket management
├── queue/            # Queue management
├── socket/           # WebSocket handlers
└── common/           # Shared utilities
```

## 🔌 API Endpoints

- `GET /` - Health check
- `GET /health` - Detailed health status

## 📖 Documentation

API documentation is available at `http://localhost:3000/api` when the server is running.

## 🗄️ Database

The project uses Prisma ORM with PostgreSQL.

### Database Setup

```bash
# Create database
createdb supportos

# Run migrations
npx prisma migrate dev

# View database UI (optional)
npx prisma studio
```

## 🔐 Environment Variables

See `.env.example` for all available configuration options.

## 📝 License

MIT
