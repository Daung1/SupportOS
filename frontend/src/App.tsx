import { useState, useEffect, useMemo } from 'react';
import {
  TicketDetail,
  ChatBox,
  SupporterDashboard,
  AllTicketsPage,
} from './components';
import { useUsers } from './hooks/useSWRApi';
import { User } from './types';

type View = 'dashboard' | 'all-tickets' | 'detail';

const STORAGE_KEY_USER_ID = 'supportos-current-user-id';

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');

  const { users, isLoading: usersLoading } = useUsers();

  // Load persisted identity choice from localStorage. We store only the id;
  // the full user object is rehydrated from the /api/users response so role
  // and display name always reflect the latest backend state.
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_USER_ID);
  });

  // Once the user list arrives, default to the first "user" if no choice
  // exists yet, or if the saved id no longer maps to a real account.
  useEffect(() => {
    if (usersLoading || users.length === 0) return;
    const stillValid =
      currentUserId && users.some((u) => u.id === currentUserId);
    if (!stillValid) {
      const fallback =
        users.find((u) => u.role === 'user') ?? users[0];
      setCurrentUserId(fallback.id);
    }
  }, [users, usersLoading, currentUserId]);

  useEffect(() => {
    if (currentUserId) {
      localStorage.setItem(STORAGE_KEY_USER_ID, currentUserId);
    }
  }, [currentUserId]);

  const currentUser: User | null = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId],
  );

  // Identity drives mode: a "user" account sees the chat view, a
  // "supporter" account sees the dashboard. No separate toggle needed.
  const userMode = currentUser?.role ?? 'user';

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

  // When identity changes, reset navigation to a clean dashboard so we
  // never end up viewing another account's ticket detail.
  const handleSwitchUser = (id: string) => {
    setCurrentUserId(id);
    setCurrentView('dashboard');
    setSelectedTicketId(null);
  };

  // Group users by role for the dropdown so user/supporter accounts
  // are visually separated.
  const groupedUsers = useMemo(() => {
    const userAccounts = users.filter((u) => u.role === 'user');
    const supporterAccounts = users.filter((u) => u.role === 'supporter');
    return { userAccounts, supporterAccounts };
  }, [users]);

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
              <p className="text-sm text-gray-600 hidden md:block">
                AI-powered Support Ticket System
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* Identity switcher */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="user-switcher"
                  className="text-sm font-medium text-gray-600 whitespace-nowrap"
                >
                  Acting as:
                </label>
                <select
                  id="user-switcher"
                  value={currentUserId ?? ''}
                  onChange={(e) => handleSwitchUser(e.target.value)}
                  disabled={usersLoading || users.length === 0}
                  className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[200px]"
                >
                  {usersLoading && <option value="">Loading…</option>}
                  {!usersLoading && users.length === 0 && (
                    <option value="">No users (run db:seed)</option>
                  )}
                  {groupedUsers.userAccounts.length > 0 && (
                    <optgroup label="💬 Users">
                      {groupedUsers.userAccounts.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {groupedUsers.supporterAccounts.length > 0 && (
                    <optgroup label="👤 Supporters">
                      {groupedUsers.supporterAccounts.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
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

              <button
                onClick={() => setCurrentView('all-tickets')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentView === 'all-tickets'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                All Tickets
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

        {/* Wait for identity to be hydrated before rendering anything that
            depends on userId — avoids a flash of "all tickets" before the
            per-user filter takes effect. */}
        {!currentUser ? (
          <div className="text-center py-20 text-gray-500">
            <p>Loading identity…</p>
          </div>
        ) : userMode === 'user' ? (
          <>
            {currentView === 'dashboard' && (
              <div className="max-w-2xl mx-auto">
                <ChatBox
                  currentUser={currentUser}
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
        ) : (
          // Supporter mode
          <>
            {currentView === 'dashboard' && (
              <SupporterDashboard
                currentUser={currentUser}
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

            {currentView === 'all-tickets' && (
              <AllTicketsPage
                currentUser={currentUser}
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
            SupportOS © 2026 | Enterprise AI Support System
            {currentUser && (
              <>
                {' | '}Signed in as{' '}
                <span className="font-medium">
                  {currentUser.name}
                </span>
              </>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
