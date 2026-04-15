# SupportOS Frontend

React-based frontend for the SupportOS AI Agent System.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Available Scripts

- `npm run dev` - Start development server with Vite
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## 📁 Project Structure

```
src/
├── components/       # React components
├── pages/           # Page components
├── hooks/           # Custom React hooks
├── services/        # API services
├── types/           # TypeScript types
└── App.tsx          # Main app component
```

## 🎨 Styling

The project uses Tailwind CSS for styling.

## 🔌 API Integration

The frontend connects to the backend API at `http://localhost:3000`

## 📖 Technologies Used

- React 18
- TypeScript
- Vite
- Tailwind CSS
- SWR (for data fetching)
- Socket.io Client (for real-time updates)

## 🔐 Environment Variables

Create a `.env.local` file if needed for environment-specific configuration.

## 📝 License

MIT
