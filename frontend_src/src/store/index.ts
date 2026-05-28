import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

// ==========================================
// 1. AUTH SLICE
// ==========================================
interface HealthState {
  backend: 'online' | 'offline';
  api: 'online' | 'offline';
  database: 'online' | 'offline';
}

interface AuthState {
  jwt: string;
  apiKey: string;
  username: string;
  isAuthenticated: boolean;
  role: string;
  createdAt: string;
  health: HealthState;
}

const initialAuthState: AuthState = {
  jwt: localStorage.getItem('teamcenter.jwt') || '',
  apiKey: localStorage.getItem('teamcenter.apiKey') || '',
  username: localStorage.getItem('teamcenter.username') || '',
  isAuthenticated: !!localStorage.getItem('teamcenter.jwt'),
  role: 'Chief Engineer',
  createdAt: '',
  health: {
    backend: 'offline',
    api: 'offline',
    database: 'offline',
  },
};

const authSlice = createSlice({
  name: 'auth',
  initialState: initialAuthState,
  reducers: {
    loginSuccess(state, action: PayloadAction<{ jwt: string; apiKey: string; username: string }>) {
      state.jwt = action.payload.jwt;
      state.apiKey = action.payload.apiKey;
      state.username = action.payload.username;
      state.isAuthenticated = true;
      localStorage.setItem('teamcenter.jwt', action.payload.jwt);
      localStorage.setItem('teamcenter.apiKey', action.payload.apiKey);
      localStorage.setItem('teamcenter.username', action.payload.username);
    },
    logout(state) {
      state.jwt = '';
      state.apiKey = '';
      state.username = '';
      state.isAuthenticated = false;
      state.createdAt = '';
      localStorage.removeItem('teamcenter.jwt');
      localStorage.removeItem('teamcenter.apiKey');
      localStorage.removeItem('teamcenter.username');
      localStorage.removeItem('teamcenter.currentSessionId');
    },
    setProfile(state, action: PayloadAction<{ role: string; createdAt: string }>) {
      state.role = action.payload.role;
      state.createdAt = action.payload.createdAt;
    },
    updateHealth(state, action: PayloadAction<Partial<HealthState>>) {
      state.health = { ...state.health, ...action.payload };
    },
  },
});

// ==========================================
// 2. CHATS SLICE
// ==========================================
export interface ChatMessage {
  id: number;
  sender: 'user' | 'assistant';
  message: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface ChatSession {
  session_id: string;
  title: string;
  created_at?: string;
  is_unsaved?: boolean;
}

interface RunningTool {
  name: string;
  time: string;
  params: string;
  active: boolean;
}

interface TerminalLog {
  id: string;
  time: string;
  action: string;
  payload: string;
}

interface ChatsState {
  sessions: ChatSession[];
  activeSessionId: string;
  messages: ChatMessage[];
  loadingHistory: boolean;
  terminalLogs: TerminalLog[];
  activeRunningTool: RunningTool;
  attachedFile: { name: string; size: number } | null;
}

const initialChatsState: ChatsState = {
  sessions: [],
  activeSessionId: localStorage.getItem('teamcenter.currentSessionId') || '',
  messages: [],
  loadingHistory: false,
  terminalLogs: [
    {
      id: 'init',
      time: new Date().toTimeString().split(' ')[0],
      action: 'CONNECTING_TEAMCENTER_GATEWAY...',
      payload: JSON.stringify({ status: 'ESTABLISHED (200 OK)' }),
    },
  ],
  activeRunningTool: {
    name: '',
    time: '',
    params: '',
    active: false,
  },
  attachedFile: null,
};

const chatsSlice = createSlice({
  name: 'chats',
  initialState: initialChatsState,
  reducers: {
    setSessions(state, action: PayloadAction<ChatSession[]>) {
      state.sessions = action.payload;
    },
    setActiveSessionId(state, action: PayloadAction<string>) {
      state.activeSessionId = action.payload;
      localStorage.setItem('teamcenter.currentSessionId', action.payload);
    },
    setMessages(state, action: PayloadAction<ChatMessage[]>) {
      state.messages = action.payload;
    },
    addMessage(state, action: PayloadAction<ChatMessage>) {
      state.messages.push(action.payload);
    },
    updateLastAssistantMessage(state, action: PayloadAction<{ message: string; isStreaming?: boolean }>) {
      let last: ChatMessage | null = null;
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].sender === 'assistant') {
          last = state.messages[i];
          break;
        }
      }
      if (last) {
        last.message = action.payload.message;
        if (action.payload.isStreaming !== undefined) {
          last.isStreaming = action.payload.isStreaming;
        }
      }
    },
    setLoadingHistory(state, action: PayloadAction<boolean>) {
      state.loadingHistory = action.payload;
    },
    addTerminalLog(state, action: PayloadAction<{ action: string; payload: any }>) {
      const now = new Date();
      state.terminalLogs.push({
        id: Math.random().toString(),
        time: now.toTimeString().split(' ')[0],
        action: action.payload.action,
        payload: JSON.stringify(action.payload.payload),
      });
      // Limit to last 50 logs to prevent memory issues
      if (state.terminalLogs.length > 50) {
        state.terminalLogs.shift();
      }
    },
    setRunningTool(state, action: PayloadAction<RunningTool>) {
      state.activeRunningTool = action.payload;
    },
    setAttachedFile(state, action: PayloadAction<{ name: string; size: number } | null>) {
      state.attachedFile = action.payload;
    },
  },
});

// ==========================================
// 3. SETTINGS SLICE
// ==========================================
interface SettingsState {
  openaiKey: string;
  claudeKey: string;
  geminiKey: string;
  tcUser: string;
  tcPass: string;
  activeModel: 'gemini' | 'gpt4' | 'claude' | 'local';
  activeEnv: 'dev' | 'test' | 'prod';
  messagesUsed: number;
  dailyLimit: number;
  remainingMessages: number;
}

const initialSettingsState: SettingsState = {
  openaiKey: '',
  claudeKey: '',
  geminiKey: '',
  tcUser: 'tc_admin_prod',
  tcPass: '',
  activeModel: 'gemini',
  activeEnv: 'dev',
  messagesUsed: 0,
  dailyLimit: 500,
  remainingMessages: 500,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState: initialSettingsState,
  reducers: {
    setSettings(state, action: PayloadAction<Partial<SettingsState>>) {
      return { ...state, ...action.payload };
    },
    setModel(state, action: PayloadAction<'gemini' | 'gpt4' | 'claude' | 'local'>) {
      state.activeModel = action.payload;
    },
    setEnv(state, action: PayloadAction<'dev' | 'test' | 'prod'>) {
      state.activeEnv = action.payload;
    },
    setUsage(state, action: PayloadAction<{ messagesUsed: number; dailyLimit: number; remainingMessages: number }>) {
      state.messagesUsed = action.payload.messagesUsed;
      state.dailyLimit = action.payload.dailyLimit;
      state.remainingMessages = action.payload.remainingMessages;
    },
  },
});

// ==========================================
// 4. NOTIFICATIONS SLICE
// ==========================================
export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface NotificationLog {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  timestamp: string;
  read: boolean;
}

interface NotificationsState {
  toastQueue: ToastNotification[];
  unreadCount: number;
  history: NotificationLog[];
}

const initialNotificationsState: NotificationsState = {
  toastQueue: [],
  unreadCount: 0,
  history: [],
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: initialNotificationsState,
  reducers: {
    addToast(state, action: PayloadAction<{ message: string; type: ToastNotification['type'] }>) {
      const id = Math.random().toString();
      const toast = { id, message: action.payload.message, type: action.payload.type };
      state.toastQueue.push(toast);
      
      const now = new Date();
      state.history.unshift({
        id,
        message: action.payload.message,
        type: action.payload.type,
        timestamp: now.toLocaleTimeString(),
        read: false,
      });
      state.unreadCount += 1;
    },
    removeToast(state, action: PayloadAction<string>) {
      state.toastQueue = state.toastQueue.filter((t) => t.id !== action.payload);
    },
    markAllRead(state) {
      state.history.forEach((n) => { n.read = true; });
      state.unreadCount = 0;
    },
    clearNotifications(state) {
      state.history = [];
      state.unreadCount = 0;
    },
  },
});

// Export actions
export const { loginSuccess, logout, setProfile, updateHealth } = authSlice.actions;
export const {
  setSessions,
  setActiveSessionId,
  setMessages,
  addMessage,
  updateLastAssistantMessage,
  setLoadingHistory,
  addTerminalLog,
  setRunningTool,
  setAttachedFile,
} = chatsSlice.actions;
export const { setSettings, setModel, setEnv, setUsage } = settingsSlice.actions;
export const { addToast, removeToast, markAllRead, clearNotifications } = notificationsSlice.actions;

// Configure store
export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    chats: chatsSlice.reducer,
    settings: settingsSlice.reducer,
    notifications: notificationsSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
