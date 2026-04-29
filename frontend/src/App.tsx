import { useState } from 'react';
import {
  TicketInput,
  Dashboard,
  TicketDetail,
} from './components';

type View = 'dashboard' | 'detail';

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');

  const handleTicketCreated = (ticketId: string) => {
    setSuccessMessage(`Ticket ${ticketId.slice(0, 8)} created successfully!`);
    setTimeout(() => setSuccessMessage(''), 3000);
    setSelectedTicketId(ticketId);
    setCurrentView('detail');
  };

  const handleSelectTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setCurrentView('detail');
  };

  const handleBack = () => {
    setCurrentView('dashboard');
    setSelectedTicketId(null);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">
                🚀 SupportOS
              </h1>
              <p className="text-sm text-gray-600">
                AI-powered Support Ticket System
              </p>
            </div>
            <nav className="flex gap-4">
              <button
                onClick={() => setCurrentView('dashboard')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentView === 'dashboard'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Dashboard
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
            {successMessage}
          </div>
        )}

        {/* Dashboard View */}
        {currentView === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <TicketInput
                  onTicketCreated={handleTicketCreated}
                  onError={(error) => {
                    alert(`Error: ${error}`);
                  }}
                />
              </div>
              <div className="lg:col-span-2">
                <Dashboard onSelectTicket={handleSelectTicket} />
              </div>
            </div>
          </div>
        )}

        {/* Detail View */}
        {currentView === 'detail' && selectedTicketId && (
          <div>
            <button
              onClick={handleBack}
              className="mb-4 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 font-medium"
            >
              ← Back to Dashboard
            </button>
            <TicketDetail
              ticketId={selectedTicketId}
              onBack={handleBack}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-600">
            SupportOS © 2026 | Enterprise AI Support System
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
