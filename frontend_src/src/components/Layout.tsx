import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import apiClient from '../api';
import { SidebarFolder, SidebarFolderItem, groupSessionsByDate } from './SidebarComponents';
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
  clearToasts,
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
  const role = useSelector((state: RootState) => state.auth.role);
  const permissions = useSelector((state: RootState) => state.auth.permissions || []);
  const health = useSelector((state: RootState) => state.auth.health);
  const sessions = useSelector((state: RootState) => state.chats.sessions);
  const activeSessionId = useSelector((state: RootState) => state.chats.activeSessionId);
  const activeModel = useSelector((state: RootState) => state.settings.activeModel);
  const activeEnv = useSelector((state: RootState) => state.settings.activeEnv);
  const notifications = useSelector((state: RootState) => state.notifications);

  // Local UI States
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionSearch, setSessionSearch] = useState('');
  const [activePopover, setActivePopover] = useState<'environment' | 'notifications' | 'profile' | 'model' | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('tc.sidebar.collapsed') === 'true');
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Refs for returning focus (Accessibility)
  const envTriggerRef = React.useRef<HTMLButtonElement>(null);
  const modelTriggerRef = React.useRef<HTMLButtonElement>(null);
  const notifTriggerRef = React.useRef<HTMLButtonElement>(null);
  const profileTriggerRef = React.useRef<HTMLButtonElement>(null);

  // Close active popover when navigating
  useEffect(() => {
    setActivePopover(null);
  }, [currentView]);

  // Clear stale toasts on view or session change
  useEffect(() => {
    dispatch(clearToasts());
  }, [currentView, activeSessionId, dispatch]);

  // Toggle popover helper
  const handlePopoverToggle = (popover: 'environment' | 'notifications' | 'profile' | 'model') => {
    setActivePopover(prev => prev === popover ? null : popover);
  };

  // Close popover helper (focus restoration)
  const closePopover = () => {
    if (activePopover === 'environment') {
      envTriggerRef.current?.focus();
    } else if (activePopover === 'model') {
      modelTriggerRef.current?.focus();
    } else if (activePopover === 'notifications') {
      notifTriggerRef.current?.focus();
    } else if (activePopover === 'profile') {
      profileTriggerRef.current?.focus();
    }
    setActivePopover(null);
  };

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePopover();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePopover]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!activePopover) return;

      let isInside = false;
      if (activePopover === 'environment') {
        const container = document.getElementById('env-selector-container');
        if (container && container.contains(target)) isInside = true;
      } else if (activePopover === 'model') {
        const container = document.getElementById('model-selector-container');
        if (container && container.contains(target)) isInside = true;
      } else if (activePopover === 'notifications') {
        const container = document.getElementById('notifications-container');
        if (container && container.contains(target)) isInside = true;
      } else if (activePopover === 'profile') {
        const container = document.getElementById('profile-container');
        if (container && container.contains(target)) isInside = true;
      }

      if (!isInside) {
        setActivePopover(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activePopover]);

  const handleToggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('tc.sidebar.collapsed', String(next));
  };

  const handleHistoryShortcutClick = () => {
    setIsCollapsed(false);
    localStorage.setItem('tc.sidebar.collapsed', 'false');
    setTimeout(() => {
      document.getElementById('recent-sessions-header')?.scrollIntoView({ behavior: 'smooth' });
      searchInputRef.current?.focus();
    }, 120);
  };

  const handleCollapsedFolderClick = (folderId: string) => {
    localStorage.setItem(`tc.folder.open.${folderId}`, 'true');
    setIsCollapsed(false);
    localStorage.setItem('tc.sidebar.collapsed', 'false');
  };
  const [pinnedSessions, setPinnedSessions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('teamcenter.pinnedSessions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleTogglePinSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let nextPinned: string[];
    if (pinnedSessions.includes(id)) {
      nextPinned = pinnedSessions.filter(pid => pid !== id);
      dispatch(addToast({ message: 'Session unpinned', type: 'info' }));
    } else {
      nextPinned = [...pinnedSessions, id];
      dispatch(addToast({ message: 'Session pinned', type: 'success' }));
    }
    setPinnedSessions(nextPinned);
    localStorage.setItem('teamcenter.pinnedSessions', JSON.stringify(nextPinned));
  };
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.remove('light-theme');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);
  const [demoActive, setDemoActive] = useState(false);

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
    // poll demo mode status
    let demoTimer: any = null;
    (async function fetchDemo(){
      try {
        const res = await apiClient.get('/api/demo/status');
        setDemoActive(!!res.data?.demo_mode);
      } catch {}
      demoTimer = setInterval(async ()=>{
        try { const r = await apiClient.get('/api/demo/status'); setDemoActive(!!r.data?.demo_mode);}catch{}
      }, 10000);
    })();
    return () => clearInterval(interval);
  }, []);

  // Theme toggle
  function toggleTheme() {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
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

  // Folders visibility and active state logic
  const showRawConsole = permissions.includes('VIEW_RAW_CONSOLE');
  const showHealthDashboard = permissions.includes('VIEW_HEALTH_DASHBOARD');
  const showSecurityLogs = permissions.includes('VIEW_SECURITY_LOGS');
  const showMcpExplorer = permissions.includes('VIEW_MCP_EXPLORER');

  const folder1Count = 2 + (showRawConsole ? 1 : 0);
  const folder2Count = (showHealthDashboard ? 1 : 0) + 1 + (showSecurityLogs ? 1 : 0);
  const folder3Count = 3 + (showMcpExplorer ? 1 : 0);

  const isFolder1Visible = folder1Count > 0;
  const isFolder2Visible = folder2Count > 0;
  const isFolder3Visible = folder3Count > 0;

  const isFolder1Active = ['teamcenter/properties', 'api-explorer', 'teamcenter-console'].includes(currentView);
  const isFolder2Active = ['teamcenter/health', 'logs', 'security'].includes(currentView);
  const isFolder3Active = ['teamcenter', 'architecture', 'settings', 'mcp'].includes(currentView);

  // Group filtered sessions by date
  const groupedSessions = groupSessionsByDate(filteredSessions, pinnedSessions);

  // Group renderer helper
  const renderGroup = (title: string, list: any[]) => {
    if (list.length === 0) return null;
    return (
      <div key={title} className="space-y-0.5">
        <p className="text-[9px] uppercase font-bold tracking-wider text-on-surface-variant/60 px-md mb-1 mt-2">{title}</p>
        {list.map((session) => {
          const isActive = session.session_id === activeSessionId;
          const isPinned = pinnedSessions.includes(session.session_id);
          return (
            <div
              key={session.session_id}
              onMouseLeave={() => {
                if (menuSessionId === session.session_id) {
                  setMenuSessionId(null);
                }
              }}
              className={`flex items-center justify-between w-full rounded-lg hover:bg-surface-variant/20 transition-all border border-transparent group relative ${
                isActive ? 'bg-secondary-container/5 border-secondary-fixed-dim/20' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => handleSessionClick(session.session_id)}
                className={`flex-1 text-left px-3 py-1 text-xs truncate outline-none pr-8 ${
                  isActive ? 'text-secondary-fixed-dim font-bold' : 'text-on-surface-variant'
                }`}
              >
                {session.title}
              </button>
              
              {isPinned && (
                <span className="text-[10px] text-secondary-fixed-dim mr-1.5 select-none animate-fade-in" title="Pinned">📌</span>
              )}

              {/* Hover Actions Menu Toggle */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuSessionId(menuSessionId === session.session_id ? null : session.session_id);
                  }}
                  className="p-1 text-on-surface-variant hover:text-secondary-fixed-dim rounded opacity-0 group-hover:opacity-100 transition-opacity outline-none"
                  title="Session Actions"
                >
                  <span className="material-symbols-outlined text-sm font-bold">more_vert</span>
                </button>

                {/* Dropdown Menu */}
                {menuSessionId === session.session_id && (
                  <div
                    onMouseLeave={() => setMenuSessionId(null)}
                    className="absolute right-0 top-6 bg-surface-container-high border border-outline-variant/30 rounded-md shadow-2xl z-[100] py-1 w-28 text-xs flex flex-col text-left"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        handleTogglePinSession(session.session_id, e);
                        setMenuSessionId(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-on-surface hover:bg-surface-variant/30 transition-colors flex items-center gap-2 outline-none"
                    >
                      <span className="material-symbols-outlined text-xs">push_pin</span>
                      {isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        handleRenameSession(session.session_id, session.title, e);
                        setMenuSessionId(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-on-surface hover:bg-surface-variant/30 transition-colors flex items-center gap-2 outline-none"
                    >
                      <span className="material-symbols-outlined text-xs">edit</span>
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        handleDeleteSession(session.session_id, e);
                        setMenuSessionId(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-error hover:bg-error-container/10 transition-colors flex items-center gap-2 font-semibold outline-none"
                    >
                      <span className="material-symbols-outlined text-xs text-error">delete</span>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Determine current navbar title
  let viewTitle = 'AI Copilot';
  if (currentView === 'dashboard') viewTitle = 'Enterprise Overview';
  else if (currentView === 'teamcenter') viewTitle = 'Teamcenter Command Center';
  else if (currentView === 'architecture') viewTitle = 'System Architecture';
  else if (currentView === 'teamcenter-console') viewTitle = 'Teamcenter Raw Console';
  else if (currentView === 'teamcenter/search') viewTitle = 'Advanced Teamcenter Search';
  else if (currentView === 'teamcenter/properties') viewTitle = 'Teamcenter Property Inspector';
  else if (currentView === 'teamcenter/health') viewTitle = 'Teamcenter Health Monitor';
  else if (currentView === 'teamcenter-console') viewTitle = 'Teamcenter Raw Console';
  else if (currentView === 'api-explorer') viewTitle = 'API Explorer';
  else if (currentView === 'logs') viewTitle = 'Observability Dashboard';
  else if (currentView === 'mcp') viewTitle = 'MCP Tool Explorer';
  else if (currentView === 'search') viewTitle = 'Teamcenter Search';
  else if (currentView === 'security') viewTitle = 'Security Auditing';
  else if (currentView === 'settings') viewTitle = 'System Settings';

  return (
    <div className="dashboard-container h-screen w-screen flex relative overflow-hidden bg-background text-on-background">
      {demoActive && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-black text-center py-2 z-50 font-bold">
          DEMO MODE ACTIVE
        </div>
      )}
      
      {/* 1. LEFT SIDEBAR */}
      <aside
        id="chat-sidebar"
        className={`h-full bg-surface-container border-r border-outline-variant/10 flex flex-col py-md px-sm z-[60] flex-shrink-0 transition-all duration-300 ${
          !sidebarOpen 
            ? 'w-0 -translate-x-full overflow-hidden p-0 border-r-0' 
            : isCollapsed 
              ? 'w-[84px] px-2' 
              : 'w-[280px]'
        }`}
      >
        {isCollapsed ? (
          // COLLAPSED LAYOUT
          <div className="flex flex-col h-full w-full items-center gap-4">
            {/* Header: TC logo & expand toggle */}
            <div className="flex flex-col items-center gap-2 w-full pt-1">
              <span className="px-2 py-0.5 bg-secondary-container/20 border border-secondary-fixed-dim/30 rounded text-xs select-none font-bold text-secondary-fixed-dim">
                TC
              </span>
              <button
                type="button"
                className="p-1 hover:bg-surface-variant rounded text-on-surface-variant outline-none"
                onClick={handleToggleCollapse}
                title="Expand Sidebar"
              >
                <span className="material-symbols-outlined text-lg">keyboard_double_arrow_right</span>
              </button>
            </div>

            {/* New Chat Button (Compact +) */}
            <button
              type="button"
              onClick={handleNewChat}
              className="w-10 h-10 rounded-lg bg-secondary-container/10 border border-secondary-fixed-dim/30 text-secondary-fixed-dim flex items-center justify-center hover:bg-secondary-container/20 transition-all active:scale-95 group font-bold outline-none"
              title="New Chat"
            >
              <span className="material-symbols-outlined text-lg group-hover:rotate-90 transition-transform">add</span>
            </button>

            {/* Navigation Icons list */}
            <div className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto px-1">
              {/* Dashboard */}
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors outline-none ${
                  currentView === 'dashboard'
                    ? 'tab-link-active text-secondary-fixed-dim'
                    : 'text-on-surface-variant hover:bg-surface-variant/30'
                }`}
                title="Dashboard"
              >
                <span className="material-symbols-outlined">dashboard</span>
              </button>

              {/* AI Copilot */}
              <button
                type="button"
                onClick={() => onNavigate('copilot')}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors outline-none ${
                  currentView === 'copilot'
                    ? 'tab-link-active text-secondary-fixed-dim'
                    : 'text-on-surface-variant hover:bg-surface-variant/30'
                }`}
                title="AI Copilot"
              >
                <span className="material-symbols-outlined">chat</span>
              </button>

              {/* Search */}
              <button
                type="button"
                onClick={() => onNavigate('search')}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors outline-none ${
                  currentView === 'search'
                    ? 'tab-link-active text-secondary-fixed-dim'
                    : 'text-on-surface-variant hover:bg-surface-variant/30'
                }`}
                title="Search"
              >
                <span className="material-symbols-outlined">search</span>
              </button>

              {/* Advanced Search */}
              <button
                type="button"
                onClick={() => onNavigate('teamcenter/search')}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors outline-none ${
                  currentView === 'teamcenter/search'
                    ? 'tab-link-active text-secondary-fixed-dim'
                    : 'text-on-surface-variant hover:bg-surface-variant/30'
                }`}
                title="Advanced Search"
              >
                <span className="material-symbols-outlined">manage_search</span>
              </button>

              {/* Divider */}
              <div className="w-8 h-[1px] bg-outline-variant/10 my-1"></div>

              {/* Folder 1: Engineering Tools */}
              {isFolder1Visible && (
                <SidebarFolder label="Engineering Tools" icon="construction" folderId="engineering" active={isFolder1Active} collapsed={true}>
                  <SidebarFolderItem label="Property Inspector" icon="description" active={currentView === 'teamcenter/properties'} onClick={() => onNavigate('teamcenter/properties')} />
                  <SidebarFolderItem label="API Explorer" icon="code" active={currentView === 'api-explorer'} onClick={() => onNavigate('api-explorer')} />
                  {showRawConsole && (
                    <SidebarFolderItem label="Raw Console" icon="terminal" active={currentView === 'teamcenter-console'} onClick={() => onNavigate('teamcenter-console')} />
                  )}
                </SidebarFolder>
              )}

              {/* Folder 2: Monitoring */}
              {isFolder2Visible && (
                <SidebarFolder label="Monitoring" icon="monitoring" folderId="monitoring" active={isFolder2Active} collapsed={true}>
                  {showHealthDashboard && (
                    <SidebarFolderItem label="Health Dashboard" icon="health_and_safety" active={currentView === 'teamcenter/health'} onClick={() => onNavigate('teamcenter/health')} />
                  )}
                  <SidebarFolderItem label="Observability" icon="insights" active={currentView === 'logs'} onClick={() => onNavigate('logs')} />
                  {showSecurityLogs && (
                    <SidebarFolderItem label="Security Logs" icon="shield" active={currentView === 'security'} onClick={() => onNavigate('security')} />
                  )}
                </SidebarFolder>
              )}

              {/* Folder 3: System Management */}
              {isFolder3Visible && (
                <SidebarFolder label="System Management" icon="settings" folderId="system" active={isFolder3Active} collapsed={true}>
                  <SidebarFolderItem label="Command Center" icon="hub" active={currentView === 'teamcenter'} onClick={() => onNavigate('teamcenter')} />
                  <SidebarFolderItem label="System Architecture" icon="account_tree" active={currentView === 'architecture'} onClick={() => onNavigate('architecture')} />
                  <SidebarFolderItem label="Settings" icon="settings" active={currentView === 'settings'} onClick={() => onNavigate('settings')} />
                  {showMcpExplorer && (
                    <SidebarFolderItem label="MCP Explorer" icon="terminal" active={currentView === 'mcp'} onClick={() => onNavigate('mcp')} />
                  )}
                </SidebarFolder>
              )}

              {/* Divider */}
              <div className="w-8 h-[1px] bg-outline-variant/10 my-1"></div>

              {/* History Shortcut Icon */}
              <button
                type="button"
                onClick={handleHistoryShortcutClick}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-variant/30 transition-colors outline-none"
                title="Recent Sessions"
              >
                <span className="material-symbols-outlined">history</span>
              </button>
            </div>

            {/* Footer with status and settings */}
            <div className="mt-auto border-t border-outline-variant/10 pt-2 flex flex-col items-center gap-2 w-full">
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="p-1.5 hover:bg-surface-variant rounded text-on-surface-variant transition-colors outline-none"
                title={health.backend === 'online' ? "System Online - Profile Settings" : "System Offline - Profile Settings"}
              >
                <div className="relative">
                  <span className="material-symbols-outlined text-lg">person</span>
                  <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-surface-container ${health.backend === 'online' ? 'bg-tertiary' : 'bg-error'}`} />
                </div>
              </button>
            </div>
          </div>
        ) : (
          // EXPANDED LAYOUT
          <>
            {/* Brand Header */}
            <div className="mb-lg px-sm flex items-center justify-between">
              <div className="flex items-center gap-1 truncate">
                <span className="px-2 py-0.5 bg-secondary-container/20 border border-secondary-fixed-dim/30 rounded text-xs flex-shrink-0 select-none">TC</span>
                <div className="truncate">
                  <h1 className="font-headline-md text-sm font-bold text-secondary-fixed-dim">
                    PLM AI Engine
                  </h1>
                  <p className="font-label-md text-[10px] text-on-surface-variant opacity-70 mt-0.5">Enterprise Precision</p>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                {/* Collapse button - Desktop only */}
                <button
                  type="button"
                  className="p-1 hover:bg-surface-variant rounded text-on-surface-variant outline-none hidden md:block"
                  onClick={handleToggleCollapse}
                  title="Collapse Sidebar"
                >
                  <span className="material-symbols-outlined text-lg">keyboard_double_arrow_left</span>
                </button>
                
                {/* Close button - Mobile only */}
                <button
                  type="button"
                  className="md:hidden p-1 hover:bg-surface-variant rounded text-on-surface-variant outline-none"
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
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
            <nav className="overflow-y-auto pr-xs space-y-1 flex-shrink-0 max-h-[50%]">
              {/* Dashboard */}
              <button
                id="nav-dashboard"
                type="button"
                onClick={() => onNavigate('dashboard')}
                className={`flex items-center gap-md px-md py-2 rounded-lg text-left transition-colors outline-none w-full ${
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
                id="nav-copilot"
                type="button"
                onClick={() => onNavigate('copilot')}
                className={`flex items-center gap-md px-md py-2 rounded-lg text-left transition-colors outline-none w-full ${
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
                className={`flex items-center gap-md px-md py-2 rounded-lg text-left transition-colors outline-none w-full ${
                  currentView === 'search'
                    ? 'tab-link-active text-secondary-fixed-dim font-bold'
                    : 'text-on-surface-variant font-medium hover:bg-surface-variant/30 active:scale-98'
                }`}
              >
                <span className="material-symbols-outlined">search</span>
                <span className="text-sm">Search</span>
              </button>

              {/* Advanced Search */}
              <button
                type="button"
                onClick={() => onNavigate('teamcenter/search')}
                className={`flex items-center gap-md px-md py-2 rounded-lg text-left transition-colors outline-none w-full ${
                  currentView === 'teamcenter/search'
                    ? 'tab-link-active text-secondary-fixed-dim font-bold'
                    : 'text-on-surface-variant font-medium hover:bg-surface-variant/30 active:scale-98'
                }`}
              >
                <span className="material-symbols-outlined">manage_search</span>
                <span className="text-sm">Advanced Search</span>
              </button>

              {/* Folder 1: Engineering Tools */}
              {isFolder1Visible && (
                <SidebarFolder label="Engineering Tools" icon="construction" folderId="engineering" active={isFolder1Active}>
                  <SidebarFolderItem label="Property Inspector" icon="description" active={currentView === 'teamcenter/properties'} onClick={() => onNavigate('teamcenter/properties')} />
                  <SidebarFolderItem label="API Explorer" icon="code" active={currentView === 'api-explorer'} onClick={() => onNavigate('api-explorer')} />
                  {showRawConsole && (
                    <SidebarFolderItem label="Raw Console" icon="terminal" active={currentView === 'teamcenter-console'} onClick={() => onNavigate('teamcenter-console')} />
                  )}
                </SidebarFolder>
              )}

              {/* Folder 2: Monitoring */}
              {isFolder2Visible && (
                <SidebarFolder label="Monitoring" icon="monitoring" folderId="monitoring" active={isFolder2Active}>
                  {showHealthDashboard && (
                    <SidebarFolderItem label="Health Dashboard" icon="health_and_safety" active={currentView === 'teamcenter/health'} onClick={() => onNavigate('teamcenter/health')} />
                  )}
                  <SidebarFolderItem label="Observability" icon="insights" active={currentView === 'logs'} onClick={() => onNavigate('logs')} />
                  {showSecurityLogs && (
                    <SidebarFolderItem label="Security Logs" icon="shield" active={currentView === 'security'} onClick={() => onNavigate('security')} />
                  )}
                </SidebarFolder>
              )}

              {/* Folder 3: System Management */}
              {isFolder3Visible && (
                <SidebarFolder label="System Management" icon="settings" folderId="system" active={isFolder3Active}>
                  <SidebarFolderItem label="Command Center" icon="hub" active={currentView === 'teamcenter'} onClick={() => onNavigate('teamcenter')} />
                  <SidebarFolderItem label="System Architecture" icon="account_tree" active={currentView === 'architecture'} onClick={() => onNavigate('architecture')} />
                  <SidebarFolderItem label="Settings" icon="settings" active={currentView === 'settings'} onClick={() => onNavigate('settings')} />
                  {showMcpExplorer && (
                    <SidebarFolderItem label="MCP Explorer" icon="terminal" active={currentView === 'mcp'} onClick={() => onNavigate('mcp')} />
                  )}
                </SidebarFolder>
              )}
            </nav>

            {/* Divider */}
            <div className="h-[1px] bg-outline-variant/10 my-2.5 flex-shrink-0"></div>

            {/* Recent Chats Area */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-sm mb-2 flex-shrink-0">
                <div className="flex items-center gap-xs p-1 bg-surface-container-lowest border border-outline-variant/10 rounded-lg focus-within:border-secondary-fixed-dim">
                  <span className="material-symbols-outlined text-on-surface-variant text-sm px-1">search</span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search conversations..."
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    className="w-full bg-transparent border-none text-xs text-on-surface focus:ring-0 p-0.5 outline-none"
                  />
                </div>
              </div>

              <p id="recent-sessions-header" className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant px-md mb-1.5 flex-shrink-0">
                Recent Sessions
              </p>
              <div className="flex-1 overflow-y-auto pr-xs space-y-3 min-h-0">
                {filteredSessions.length === 0 ? (
                  <div className="px-md py-4 text-center">
                    <p className="text-xs text-on-surface-variant font-medium">No previous conversations</p>
                    <p className="text-[11px] text-on-surface-variant/60 mt-1">Start a new chat to begin</p>
                  </div>
                ) : (
                  <>
                    {renderGroup("Today", groupedSessions.today)}
                    {renderGroup("Yesterday", groupedSessions.yesterday)}
                    {renderGroup("Last 7 Days", groupedSessions.last7Days)}
                    {renderGroup("Older", groupedSessions.older)}
                  </>
                )}
              </div>
            </div>

            {/* Footer info */}
            <div className="mt-auto border-t border-outline-variant/10 pt-md flex flex-col gap-2 flex-shrink-0">
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
          </>
        )}
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
            <div className="relative" id="env-selector-container">
              <button
                type="button"
                ref={envTriggerRef}
                onClick={() => handlePopoverToggle('environment')}
                className="bg-surface-container border border-outline-variant/20 rounded-lg text-xs font-bold text-on-surface py-1.5 px-3 flex items-center justify-between gap-1 focus:border-secondary-fixed-dim focus:ring-1 focus:ring-secondary-fixed-dim cursor-pointer outline-none min-w-[70px] transition-all"
              >
                <span>{activeEnv.toUpperCase()}</span>
                <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
              </button>
              {activePopover === 'environment' && (
                <div className="absolute left-0 mt-1 w-24 bg-surface-container border border-outline-variant/20 rounded-lg shadow-2xl z-[100] p-1 flex flex-col text-xs animate-flyout-slide-in">
                  {['dev', 'test', 'prod'].map((env) => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => {
                        handleEnvSelector(env as any);
                        closePopover();
                      }}
                      className={`w-full text-left p-2 hover:bg-surface-variant/30 rounded transition-colors outline-none font-semibold ${
                        activeEnv === env ? 'text-secondary-fixed-dim' : 'text-on-surface'
                      }`}
                    >
                      {env.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Model Selector */}
            <div className="relative" id="model-selector-container">
              <button
                type="button"
                ref={modelTriggerRef}
                onClick={() => handlePopoverToggle('model')}
                className="bg-surface-container border border-outline-variant/20 rounded-lg text-xs font-bold text-on-surface py-1.5 px-3 flex items-center justify-between gap-1 focus:border-secondary-fixed-dim focus:ring-1 focus:ring-secondary-fixed-dim cursor-pointer outline-none min-w-[120px] transition-all"
              >
                <span>{getModelDisplayName(activeModel)}</span>
                <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
              </button>
              {activePopover === 'model' && (
                <div className="absolute left-0 mt-1 w-36 bg-surface-container border border-outline-variant/20 rounded-lg shadow-2xl z-[100] p-1 flex flex-col text-xs animate-flyout-slide-in">
                  {[
                    { value: 'gemini', label: 'Gemini 3.5' },
                    { value: 'gpt4', label: 'GPT-4 Turbo' },
                    { value: 'claude', label: 'Claude 3.5' },
                    { value: 'local', label: 'Local LLM' },
                  ].map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => {
                        handleModelSelector(m.value as any);
                        closePopover();
                      }}
                      className={`w-full text-left p-2 hover:bg-surface-variant/30 rounded transition-colors outline-none font-semibold ${
                        activeModel === m.value ? 'text-secondary-fixed-dim' : 'text-on-surface'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
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
                  {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                </span>
              </button>

              {/* Notification Bell */}
              <div className="relative" id="notifications-container">
                <button
                  type="button"
                  ref={notifTriggerRef}
                  onClick={() => handlePopoverToggle('notifications')}
                  className="p-2 text-on-surface-variant hover:text-secondary-fixed-dim transition-colors relative outline-none"
                  title="Notifications"
                >
                  <span className="material-symbols-outlined">notifications</span>
                  {notifications.unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-secondary-fixed-dim rounded-full animate-pulse" />
                  )}
                </button>

                {/* Notifications Dropdown */}
                {activePopover === 'notifications' && (
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
            <div className="relative" id="profile-container">
              <button
                type="button"
                ref={profileTriggerRef}
                onClick={() => handlePopoverToggle('profile')}
                className="w-8 h-8 rounded-full overflow-hidden border border-secondary-fixed-dim/30 bg-primary-container flex items-center justify-center cursor-pointer shadow hover:brightness-115 transition-all outline-none focus:border-secondary-fixed-dim focus:ring-1 focus:ring-secondary-fixed-dim"
                title="User Profile Menu"
              >
                <img
                  alt="User Avatar"
                  className="w-full h-full object-cover"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBdAvgLhmqkFv7lzGxnSHuBgPXL30S0s3tmvOtpJwNCzljiVA-J5Py-cYxsPqo6zzW6EtgkYyVVeuOPaq0PLDXvlGYb6QuHtmV8Ow9gqVp0pIhNiR3RfY8kAZeUaUncghGM4tRa9IP38Nr9o1lzQxiPlIG-bPc9uJtSJ7P8ErQRiXsJmVMEVtZJdiypTp5F-HG4P8xRAQdJTkHAMKD0dhopprqthr9pwz3iYIzNnIFn8aFve0yeScw5q0qNQOnu7T1WRpxp8se_GtU"
                />
              </button>

              {activePopover === 'profile' && (
                <div className="absolute right-0 mt-2 w-48 bg-surface-container border border-outline-variant/20 rounded-lg shadow-2xl z-[100] p-1 flex flex-col text-xs">
                  <button
                    type="button"
                    onClick={() => { onNavigate('settings'); closePopover(); }}
                    className="w-full text-left p-2.5 text-on-surface hover:bg-surface-variant/30 rounded transition-colors outline-none"
                  >
                    Profile Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => { onNavigate('settings'); closePopover(); }}
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

function getModelDisplayName(model: string) {
  switch (model) {
    case 'gemini': return 'Gemini 3.5';
    case 'gpt4': return 'GPT-4 Turbo';
    case 'claude': return 'Claude 3.5';
    case 'local': return 'Local LLM';
    default: return model;
  }
}
