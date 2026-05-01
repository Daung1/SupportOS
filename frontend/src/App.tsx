import { useState, useEffect } from 'react';
import {
  TicketDetail,
  ChatBox,
  SupporterDashboard,
} from './components';

type View = 'dashboard' | 'detail';
type UserMode = 'user' | 'supporter';

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [userMode, setUserMode] = useState<UserMode>(() => {
    const saved = localStorage.getItem('supportos-mode');
    return (saved as UserMode) || 'user';
  });
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Save mode preference
  useEffect(() => {
    localStorage.setItem('supportos-mode', userMode);
  }, [userMode]);

  const handleTicketCreated = (ticketId: string) => {
    setSuccessMessage(`Ticket ${ticketId.slice(0, 8)} created successfully!`);
    setTimeout(() => setSuccessMessage(''), 3000);
    setSelectedTicketId(ticketId);
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
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
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
            
            {/* Mode Toggle */}
            <div className="flex items-center gap-4">
              <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => {
                    setUserMode('user');
                    setCurrentView('dashboard');
                  }}
                  className={`px-4 py-2 rounded font-medium transition-colors ${
                    userMode === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  💬 User
                </button>
                <button
                  onClick={() => {
                    setUserMode('supporter');
                    setCurrentView('dashboard');
                  }}
                  className={`px-4 py-2 rounded font-medium transition-colors ${
                    userMode === 'supporter'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  👤 Supporter
                </button>
              </div>
              
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
            </div>
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

        {/* User Mode */}
        {userMode === 'user' && (
          <>
            {currentView === 'dashboard' && (
              <div className="max-w-2xl mx-auto">
                <ChatBox
                  onTicketCreated={handleTicketCreated}
                  onError={(error) => {
                    alert(`Error: ${error}`);
                  }}
                />
              </div>
            )}

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
          </>
        )}

        {/* Supporter Mode */}
        {userMode === 'supporter' && (
          <>
            {currentView === 'dashboard' && (
              <SupporterDashboard
                onSelectTicket={handleSelectTicket}
                onApproveTicket={(ticketId) => {
                  alert(`Approved: ${ticketId}`);
                  handleBack();
                }}
                onRejectTicket={(ticketId, reason) => {
                  alert(`Rejected: ${ticketId}\nReason: ${reason}`);
                  handleBack();
                }}
              />
            )}

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
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-600">
            SupportOS © 2026 | Enterprise AI Support System | Mode: {userMode === 'user' ? '💬 User' : '👤 Supporter'}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
