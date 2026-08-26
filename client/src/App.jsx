import React, { useState, useEffect } from 'react';
import Navigation from './components/Navigation';
import Feed from './components/Feed';
import DirectMessages from './components/DirectMessages';
import Groups from './components/Groups';
import StatusScreen from './components/StatusScreen';
import ServerInspector from './components/ServerInspector';
import AuthModal from './components/AuthModal';
import SearchModal from './components/SearchModal';
import { initializeUserIdentity, getCurrentUsername } from './crypto/vault';

const WS_PROTOCOL = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const HOST = typeof window !== 'undefined' && window.location.host ? window.location.host : 'localhost:3000';
const SERVER_URL = '';
const WS_URL = `${WS_PROTOCOL}//${HOST}/ws`;

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('feed');
  const [wsClient, setWsClient] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [isDMChatOpen, setIsDMChatOpen] = useState(false);
  const [isGroupChatOpen, setIsGroupChatOpen] = useState(false);

  // Fetch Public Directory Users
  const loadUsersDirectory = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/users`);
      const data = await res.json();
      setAllUsers(data);
    } catch (err) {
      console.error("Failed to load user directory:", err);
    }
  };

  useEffect(() => {
    loadUsersDirectory();
  }, []);

  // Login / Switch User Persona Handler
  const handleLogin = async (username) => {
    try {
      // 1. Initialize local keypair from Vault (auto-restoring from Zero-Knowledge Cloud Vault if needed)
      const userObj = await initializeUserIdentity(username, SERVER_URL);
      setCurrentUser(userObj);

      // 2. Publish Public Identity Key to Server Prekey Directory
      await fetch(`${SERVER_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: userObj.username,
          publicIdentityKey: userObj.spkiPublicKey,
          avatarColor: userObj.avatarColor
        })
      });

      await loadUsersDirectory();
      setShowAuthModal(false);
    } catch (err) {
      console.error("Login failed:", err);
      alert(err.message || "Failed to initialize user session");
    }
  };

  // Account Restored from Cloud Backup Callback
  const handleRestoredAccount = (restoredUserObj) => {
    setCurrentUser(restoredUserObj);
    loadUsersDirectory();
    setShowAuthModal(false);
  };

  // Auto restore active user from storage on mount
  useEffect(() => {
    const savedUser = getCurrentUsername();
    if (savedUser) {
      handleLogin(savedUser);
    } else {
      // Auto register Alice for instant demo feedback
      handleLogin('Alice');
    }
  }, []);

  // Connect WebSocket when currentUser is set
  useEffect(() => {
    if (!currentUser) return;

    const ws = new WebSocket(`${WS_URL}?user=${currentUser.username}`);
    ws.onopen = () => {
      console.log(`[WS] Connected as ${currentUser.username}`);
      setWsClient(ws);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'USER_JOINED') {
          loadUsersDirectory();
        }
      } catch (e) {
        console.error("WS event error:", e);
      }
    };

    ws.onclose = () => console.log("[WS] Connection closed");

    return () => ws.close();
  }, [currentUser]);

  const isAnyChatActive = isDMChatOpen || isGroupChatOpen;

  return (
    <div className="app-layout">
      {/* Top Navbar */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsDMChatOpen(false);
          setIsGroupChatOpen(false);
        }}
        user={currentUser}
        onSwitchUser={() => setShowAuthModal(true)}
        onOpenSearch={() => setShowSearchModal(true)}
        hideBottomNav={isAnyChatActive}
      />

      {/* Zero Knowledge Search Overlay */}
      {showSearchModal && (
        <SearchModal onClose={() => setShowSearchModal(false)} />
      )}

      {/* Main Content Area */}
      <main className={`main-content ${isAnyChatActive ? 'chat-mode' : ''}`}>
        {!currentUser || showAuthModal ? (
          <AuthModal
            onLogin={handleLogin}
            activeUsername={currentUser?.username}
            onRestored={handleRestoredAccount}
            serverUrl={SERVER_URL}
          />
        ) : (
          <>
            {activeTab === 'feed' && (
              <Feed
                currentUser={currentUser}
                allUsers={allUsers}
                serverUrl={SERVER_URL}
                wsClient={wsClient}
              />
            )}

            {activeTab === 'messages' && (
              <DirectMessages
                currentUser={currentUser}
                allUsers={allUsers}
                serverUrl={SERVER_URL}
                wsClient={wsClient}
                onChatStateChange={setIsDMChatOpen}
              />
            )}

            {activeTab === 'groups' && (
              <Groups
                currentUser={currentUser}
                allUsers={allUsers}
                serverUrl={SERVER_URL}
                wsClient={wsClient}
                onGroupChatStateChange={setIsGroupChatOpen}
              />
            )}

            {activeTab === 'status' && (
              <StatusScreen
                currentUser={currentUser}
                allUsers={allUsers}
                serverUrl={SERVER_URL}
                wsClient={wsClient}
              />
            )}

            {activeTab === 'inspector' && (
              <ServerInspector
                serverUrl={SERVER_URL}
                wsClient={wsClient}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
