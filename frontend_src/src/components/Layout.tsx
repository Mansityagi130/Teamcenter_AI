import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import apiClient from '../api';
import {
  RootState,
  logout,
  setSessions,
  setActiveSessionId,
  updateHealth,
  addToast,
  setEnv,
  setModel,
  markAllRead,
  clearNotifications,
  addTerminalLog,
} from '../store';

interface LayoutProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
}

export function Layout({ currentView, onNavigate, children }: LayoutProps) {
  const dispatch = useDispatch();
  
  // Selectors
  const username = useSelector((state: RootState) => state.auth.username);
  const health = useSelector((state: RootState) => state.auth.health);
  const sessions = useSelector((state: RootState) => state.chats.sessions);
  const activeSessionId = useSelector((state: RootState) => state.chats.activeSessionId);
  const activeModel = useSelector((state: RootState) => state.settings.activeModel);
  const activeEnv = useSelector((state: RootState) => state.settings.activeEnv);
  const notifications = useSelector((state: RootState) => state.notifications);

  // Local UI States
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionSearch, setSessionSearch] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Fetch recent sessions
  async function loadSessionsList() {
    try {
      const res = await apiClient.get('/chat/sessions');
      dispatch(setSessions(res.data));
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
    }
  }

  // Health check loop
  async function checkHealth() {
    try {
      const resBackend = await apiClient.get('/health/backend');
      dispatch(updateHealth({ backend: resBackend.data.status === 'online' ? 'online' : 'offline' }));
    } catch {
      dispatch(updateHealth({ backend: 'offline' }));
    }

    try {
      const resApi = await apiClient.get('/health/api');
      dispatch(updateHealth({ api: resApi.data.status === 'online' ? 'online' : 'offline' }));
    } catch {
      dispatch(updateHealth({ api: 'offline' }));
    }

    try {
      const resDb = await apiClient.get('/health/database');
      dispatch(updateHealth({ database: resDb.data.status === 'online' ? 'online' : 'offline' }));
    } catch {
      dispatch(updateHealth({ database: 'offline' }));
    }
  }

  useEffect(() => {
    loadSessionsList();
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Theme toggle
  function toggleTheme() {
    if (theme === 'dark') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light-theme');
      setTheme('light');
    } else {
      document.documentElement.classList.remove('light-theme');
      document.documentElement.classList.add('dark');
      setTheme('dark');
    }
  }

  // Create New Chat Session
  function handleNewChat() {
    onNavigate('copilot');
    const newId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    dispatch(setActiveSessionId(newId));
    dispatch(addToast({ message: 'New chat session initialized', type: 'info' }));
    dispatch(addTerminalLog({
      action: 'new_chat_session',
      payload: { session_id: newId }
    }));
  }

  // Session click
  function handleSessionClick(id: string) {
    onNavigate('copilot');
    dispatch(setActiveSessionId(id));
  }

  // Rename Session
  async function handleRenameSession(id: string, currentTitle: string, e: React.MouseEvent) {
    e.stopPropagation();
    const newTitle = prompt('Enter new title for this chat session:', currentTitle);
    if (newTitle === null) return;
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === currentTitle) return;

    try {
      await apiClient.post('/chat/session/rename', {
        session_id: id,
        title: trimmed,
      });
      loadSessionsList();
      dispatch(addToast({ message: 'Session renamed', type: 'success' }));
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Rename failed', type: 'error' }));
    }
  }

  // Delete Session
  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this session and all its messages?')) return;

    try {
      await apiClient.delete(`/chat/session/${encodeURIComponent(id)}`);
      dispatch(addToast({ message: 'Session deleted', type: 'success' }));
      
      if (id === activeSessionId) {
        // Clear active session
        dispatch(setActiveSessionId(''));
        handleNewChat();
      } else {
        loadSessionsList();
      }
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Delete failed', type: 'error' }));
    }
  }

  // Logout flow
  function handleLogout() {
    dispatch(logout());
    dispatch(addToast({ message: 'Logged out successfully', type: 'info' }));
    window.location.href = '/login';
  }

  // Env change
  function handleEnvSelector(env: 'dev' | 'test' | 'prod') {
    if (env === 'prod') {
      const confirmAccess = window.confirm(
        'WARNING: You are about to switch to the PRODUCTION database.\n' +
        'Any modifications will execute real Siemens Teamcenter PLM transactions.\n' +
        'Do you wish to proceed?'
      );
      if (!confirmAccess) return;
    }
    dispatch(setEnv(env));
    dispatch(addToast({ message: `Switched environment to ${env.toUpperCase()}`, type: 'warning' }));
    
    // Save to settings db
    apiClient.post('/user/settings', {
      active_env: env
    }).catch(console.error);
  }

  // Model change
  function handleModelSelector(modelName: 'gemini' | 'gpt4' | 'claude' | 'local') {
    dispatch(setModel(modelName));
    dispatch(addToast({ message: `Switched model to ${modelName.toUpperCase()}`, type: 'info' }));
    
    // Save to settings db
    apiClient.post('/user/settings', {
      active_model: modelName
    }).catch(console.error);
  }

  // Filter recent sessions by search
  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  // Determine current navbar title
  let viewTitle = 'AI Copilot';
  if (currentView === 'dashboard') viewTitle = 'Enterprise Overview';
  else if (currentView === 'search') viewTitle = 'Teamcenter Search';
  else if (currentView === 'security') viewTitle = 'Security Auditing';
  else if (currentView === 'settings') viewTitle = 'System Settings';

  return (
    <div className="dashboard-container h-screen w-screen flex relative overflow-hidden bg-background text-on-background">
      
      {/* 1. LEFT SIDEBAR */}
      <aside
        id="chat-sidebar"
        className={`h-full bg-surface-container border-r border-outline-variant/10 flex flex-col py-md px-sm z-[60] flex-shrink-0 transition-all duration-300 ${
          sidebarOpen ? 'w-[280px]' : 'w-0 -translate-x-full overflow-hidden p-0 border-r-0'
        }`}
      >
        {/* Brand Header */}
        <div className="mb-lg px-sm flex items-center justify-between">
          <div>
            <h1 className="font-headline-md text-lg font-bold text-secondary-fixed-dim flex items-center gap-1">
              <span className="px-2 py-0.5 bg-secondary-container/20 border border-secondary-fixed-dim/30 rounded text-xs">TC</span>
              PLM AI Engine
            </h1>
            <p className="font-label-md text-xs text-on-surface-variant opacity-70 mt-0.5">Enterprise Precision</p>
          </div>
          <button
            type="button"
            className="md:hidden p-1 hover:bg-surface-variant rounded text-on-surface-variant outline-none"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* New Chat Button */}
        <button
          type="button"
          onClick={handleNewChat}
          className="mx-sm mb-4 py-2 px-4 rounded-lg bg-secondary-container/10 border border-secondary-fixed-dim/30 text-secondary-fixed-dim flex items-center justify-center gap-2 hover:bg-secondary-container/20 transition-all active:scale-95 group font-bold outline-none"
        >
          <span className="material-symbols-outlined text-lg group-hover:rotate-90 transition-transform">add</span>
          <span className="text-sm">New Chat</span>
        </button>

        {/* Navigation Links */}
        <nav className="flex-1 flex flex-col gap-1 px-xs overflow-y-auto">
          {/* Dashboard */}
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className={`flex items-center gap-md px-md py-sm rounded-lg text-left transition-colors outline-none ${
              currentView === 'dashboard'
                ? 'tab-link-active text-secondary-fixed-dim font-bold'
                : 'text-on-surface-variant font-medium hover:bg-surface-variant/30 active:scale-98'
            }`}
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span className="text-sm">Dashboard</span>
          </button>

          {/* AI Copilot */}
          <button
            type="button"
            onClick={() => onNavigate('copilot')}
            className={`flex items-center gap-md px-md py-sm rounded-lg text-left transition-colors outline-none ${
              currentView === 'copilot'
                ? 'tab-link-active text-secondary-fixed-dim font-bold'
                : 'text-on-surface-variant font-medium hover:bg-surface-variant/30 active:scale-98'
            }`}
          >
            <span className="material-symbols-outlined">chat</span>
            <span className="text-sm">AI Copilot</span>
          </button>

          {/* Search */}
          <button
            type="button"
            onClick={() => onNavigate('search')}
            className={`flex items-center gap-md px-md py-sm rounded-lg text-left transition-colors outline-none ${
              currentView === 'search'
                ? 'tab-link-active text-secondary-fixed-dim font-bold'
                : 'text-on-surface-variant font-medium hover:bg-surface-variant/30 active:scale-98'
            }`}
          >
            <span className="material-symbols-outlined">search</span>
            <span className="text-sm">Search</span>
          </button>

          {/* Security */}
          <button
            type="button"
            onClick={() => onNavigate('security')}
            className={`flex items-center gap-md px-md py-sm rounded-lg text-left transition-colors outline-none ${
              currentView === 'security'
                ? 'tab-link-active text-secondary-fixed-dim font-bold'
                : 'text-on-surface-variant font-medium hover:bg-surface-variant/30 active:scale-98'
            }`}
          >
            <span className="material-symbols-outlined">security</span>
            <span className="text-sm">Security Logs</span>
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={`flex items-center gap-md px-md py-sm rounded-lg text-left transition-colors outline-none ${
              currentView === 'settings'
                ? 'tab-link-active text-secondary-fixed-dim font-bold'
                : 'text-on-surface-variant font-medium hover:bg-surface-variant/30 active:scale-98'
            }`}
          >
            <span className="material-symbols-outlined">settings</span>
            <span className="text-sm">Settings</span>
          </button>

          {/* Divider & Recent Sessions Search */}
          <div className="h-[1px] bg-outline-variant/10 my-4"></div>
          
          <div className="px-sm mb-3">
            <div className="flex items-center gap-xs p-1 bg-surface-container-lowest border border-outline-variant/10 rounded-lg focus-within:border-secondary-fixed-dim">
              <span className="material-symbols-outlined text-on-surface-variant text-sm px-1">search</span>
              <input
                type="text"
                placeholder="Search sessions..."
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                className="w-full bg-transparent border-none text-xs text-on-surface focus:ring-0 p-0.5 outline-none"
              />
            </div>
          </div>

          <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant px-md mb-2">Recent Sessions</p>
          <div className="history-list space-y-1 overflow-y-auto max-h-[220px] pr-xs">
            {filteredSessions.length === 0 ? (
              <p className="text-xs text-on-surface-variant px-md py-1 italic">No recent chats</p>
            ) : (
              filteredSessions.map((session) => {
                const isActive = session.session_id === activeSessionId;
                return (
                  <div
                    key={session.session_id}
                    className={`flex items-center justify-between w-full rounded-lg hover:bg-surface-variant/20 transition-all border border-transparent group ${
                      isActive ? 'bg-secondary-container/5 border-secondary-fixed-dim/20' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSessionClick(session.session_id)}
                      className={`flex-1 text-left px-3 py-2 text-xs truncate outline-none ${
                        isActive ? 'text-secondary-fixed-dim font-bold' : 'text-on-surface-variant'
                      }`}
                    >
                      {session.title}
                    </button>
                    
                    <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleRenameSession(session.session_id, session.title, e)}
                        className="p-0.5 text-on-surface-variant hover:text-secondary-fixed-dim rounded outline-none"
                        title="Rename Session"
                      >
                        <span className="material-symbols-outlined text-[14px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(session.session_id, e)}
                        className="p-0.5 text-on-surface-variant hover:text-error rounded outline-none"
                        title="Delete Session"
                      >
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </nav>

        {/* Footer info */}
        <div className="mt-auto border-t border-outline-variant/10 pt-md flex flex-col gap-2">
          <div className="flex items-center justify-between px-md py-1 text-xs">
            <div className="flex items-center gap-sm">
              <span className={`status-dot inline-block ${health.backend === 'online' ? 'ok' : 'bg-error'}`} />
              <span className="text-xs text-on-surface-variant font-semibold">
                {health.backend === 'online' ? 'System Online' : 'System Offline'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="p-1 hover:bg-surface-variant rounded text-on-surface-variant transition-colors outline-none"
              title="User Profile Details"
            >
              <span className="material-symbols-outlined text-lg">person</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 2. RIGHT CONTENT WINDOW */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        
        {/* TOP NAVBAR */}
        <header className="sticky top-0 right-0 left-0 h-16 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10 z-50 flex justify-between items-center px-gutter flex-shrink-0">
          {/* Toggle and titles */}
          <div className="flex items-center gap-md">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-surface-variant rounded-full text-on-surface transition-colors outline-none"
              title="Toggle Sidebar"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="font-headline-md text-lg font-extrabold text-on-surface tracking-wide hidden sm:inline">PLM OS</span>
            <span className="text-xs text-outline font-semibold hidden md:inline">/</span>
            <span className="text-sm font-semibold text-secondary-fixed-dim tracking-wider uppercase">{viewTitle}</span>
          </div>

          {/* Status Indicators & selectors */}
          <div className="flex items-center gap-md">
            
            {/* Indicators */}
            <div className="hidden lg:flex items-center gap-sm mr-2 text-xs">
              {/* Backend */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-container border border-outline-variant/10 rounded-full">
                <span className={`w-1.5 h-1.5 rounded-full ${health.backend === 'online' ? 'bg-tertiary' : 'bg-error'}`} />
                <span className="text-on-surface-variant font-medium">
                  {health.backend === 'online' ? 'Backend Connected' : 'Backend Offline'}
                </span>
              </div>
              {/* API */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-container border border-outline-variant/10 rounded-full">
                <span className={`w-1.5 h-1.5 rounded-full ${health.api === 'online' ? 'bg-tertiary' : 'bg-error'}`} />
                <span className="text-on-surface-variant font-medium">
                  {health.api === 'online' ? 'API Running' : 'API Offline'}
                </span>
              </div>
              {/* Database */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-container border border-outline-variant/10 rounded-full">
                <span className={`w-1.5 h-1.5 rounded-full ${health.database === 'online' ? 'bg-tertiary' : 'bg-error'}`} />
                <span className="text-on-surface-variant font-medium">
                  {health.database === 'online' ? 'Database Connected' : 'Database Offline'}
                </span>
              </div>
            </div>

            {/* Env Selector */}
            <div className="relative">
              <select
                value={activeEnv}
                onChange={(e) => handleEnvSelector(e.target.value as any)}
                className="bg-surface-container border border-outline-variant/20 rounded-lg text-xs font-bold text-on-surface py-1 pl-2 pr-7 focus:border-secondary-fixed-dim focus:ring-0 cursor-pointer outline-none"
              >
                <option value="dev">DEV</option>
                <option value="test">TEST</option>
                <option value="prod">PROD</option>
              </select>
            </div>

            {/* Model Selector */}
            <div className="relative">
              <select
                value={activeModel}
                onChange={(e) => handleModelSelector(e.target.value as any)}
                className="bg-surface-container border border-outline-variant/20 rounded-lg text-xs font-bold text-on-surface py-1 pl-2 pr-7 focus:border-secondary-fixed-dim focus:ring-0 cursor-pointer outline-none"
              >
                <option value="gemini">Gemini 3.5</option>
                <option value="gpt4">GPT-4 Turbo</option>
                <option value="claude">Claude 3.5</option>
                <option value="local">Local LLM</option>
              </select>
            </div>

            <div className="h-6 w-[1px] bg-outline-variant/20 hidden md:block" />

            {/* Interactive Bell / Theme Toggle */}
            <div className="flex items-center gap-1 relative">
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 text-on-surface-variant hover:text-secondary-fixed-dim transition-colors outline-none"
                title="Toggle Theme"
              >
                <span className="material-symbols-outlined">
                  {theme === 'dark' ? 'brightness_4' : 'brightness_2'}
                </span>
              </button>

              {/* Notification Bell */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifMenuOpen(!notifMenuOpen)}
                  className="p-2 text-on-surface-variant hover:text-secondary-fixed-dim transition-colors relative outline-none"
                  title="Notifications"
                >
                  <span className="material-symbols-outlined">notifications</span>
                  {notifications.unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-secondary-fixed-dim rounded-full animate-pulse" />
                  )}
                </button>

                {/* Notifications Dropdown */}
                {notifMenuOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-surface-container border border-outline-variant/20 rounded-lg shadow-2xl z-[100] p-3 text-xs flex flex-col gap-2">
                    <div className="flex justify-between items-center border-b border-outline-variant/10 pb-2">
                      <span className="font-bold text-on-surface">Notifications ({notifications.unreadCount})</span>
                      <button
                        type="button"
                        onClick={() => dispatch(markAllRead())}
                        className="text-secondary-fixed-dim font-semibold hover:underline"
                      >
                        Mark all as read
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto flex flex-col gap-2">
                      {notifications.history.length === 0 ? (
                        <p className="text-on-surface-variant italic py-4 text-center">No notifications</p>
                      ) : (
                        notifications.history.map((n) => (
                          <div key={n.id} className={`p-2 rounded border border-outline-variant/5 ${n.read ? 'opacity-60' : 'bg-secondary-container/5'}`}>
                            <div className="flex justify-between text-[10px] text-on-surface-variant mb-1 font-mono">
                              <span className="uppercase font-bold">{n.type}</span>
                              <span>{n.timestamp}</span>
                            </div>
                            <p className="text-on-surface leading-normal">{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => dispatch(clearNotifications())}
                      className="border-t border-outline-variant/10 pt-2 text-center text-error font-semibold hover:underline"
                    >
                      Clear History
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <div
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-8 h-8 rounded-full overflow-hidden border border-secondary-fixed-dim/30 bg-primary-container flex items-center justify-center cursor-pointer shadow hover:brightness-115 transition-all"
              >
                <img
                  alt="User Avatar"
                  className="w-full h-full object-cover"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBdAvgLhmqkFv7lzGxnSHuBgPXL30S0s3tmvOtpJwNCzljiVA-J5Py-cYxsPqo6zzW6EtgkYyVVeuOPaq0PLDXvlGYb6QuHtmV8Ow9gqVp0pIhNiR3RfY8kAZeUaUncghGM4tRa9IP38Nr9o1lzQxiPlIG-bPc9uJtSJ7P8ErQRiXsJmVMEVtZJdiypTp5F-HG4P8xRAQdJTkHAMKD0dhopprqthr9pwz3iYIzNnIFn8aFve0yeScw5q0qNQOnu7T1WRpxp8se_GtU"
                />
              </div>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-surface-container border border-outline-variant/20 rounded-lg shadow-2xl z-[100] p-1 flex flex-col text-xs">
                  <button
                    type="button"
                    onClick={() => { onNavigate('settings'); setUserMenuOpen(false); }}
                    className="w-full text-left p-2.5 text-on-surface hover:bg-surface-variant/30 rounded transition-colors outline-none"
                  >
                    Profile Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => { onNavigate('settings'); setUserMenuOpen(false); }}
                    className="w-full text-left p-2.5 text-on-surface hover:bg-surface-variant/30 rounded transition-colors border-b border-outline-variant/10 outline-none"
                  >
                    Preferences
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left p-2.5 text-error hover:bg-error-container/10 rounded transition-colors font-bold outline-none"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="hidden sm:inline-block px-3 py-1.5 text-xs bg-surface-variant text-on-surface font-semibold rounded-lg hover:bg-outline-variant/20 transition-all outline-none"
            >
              Logout
            </button>
          </div>
        </header>

        {/* View container */}
        <div className="flex-1 overflow-hidden relative w-full h-full">
          {children}
        </div>
      </div>
    </div>
  );
}
