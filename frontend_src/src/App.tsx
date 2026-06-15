import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setProfile, logout, updateHealth } from './store';
import apiClient from './api';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Copilot } from './components/Copilot';
import { Search } from './components/Search';
import { Security } from './components/Security';
import { Settings } from './components/Settings';
import { ToastContainer } from './components/Toast';
import { TeamcenterCommandCenter } from './components/TeamcenterCommandCenter';
import { TeamcenterConsolePage } from './components/TeamcenterConsolePage';
import { ApiExplorerPage } from './components/ApiExplorerPage';
import { AdvancedSearchPage } from './components/AdvancedSearchPage';
import { PropertyInspectorPage } from './components/PropertyInspectorPage';
import { TeamcenterHealthDashboard } from './components/TeamcenterHealthDashboard';
import { McpToolExplorer } from './components/McpToolExplorer';
import { Observability } from './components/Observability';
import { SystemArchitectureDashboard } from './components/SystemArchitectureDashboard';

// Component wrapper to sync routing with Layout view state
function AppContent() {
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // Load user profile details on startup
  useEffect(() => {
    if (isAuthenticated) {
      apiClient.get('/user/profile')
        .then((res) => {
          dispatch(setProfile({
            role: res.data.role || 'Chief Engineer',
            createdAt: res.data.created_at,
            permissions: res.data.permissions || [],
          }));
        })
        .catch(() => {
          dispatch(logout());
        });
    }
  }, [isAuthenticated, dispatch]);

  // If not authenticated, force routing to login page
  if (!isAuthenticated) {
    if (location.pathname !== '/login') {
      return <Navigate to="/login" replace />;
    }
    return <Login />;
  }

  // If authenticated and tries to go to login or root, go to copilot
  if (location.pathname === '/login' || location.pathname === '/') {
    return <Navigate to="/copilot" replace />;
  }

  // Determine current active view name from location pathname
  const currentView = location.pathname.substring(1) || 'copilot';

  function handleNavigate(view: string) {
    navigate(`/${view}`);
  }

  return (
    <Layout currentView={currentView} onNavigate={handleNavigate}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard onNavigate={handleNavigate} />} />
        <Route path="/teamcenter" element={<TeamcenterCommandCenter onNavigate={handleNavigate} />} />
        <Route path="/teamcenter-console" element={<TeamcenterConsolePage onNavigate={handleNavigate} />} />
        <Route path="/api-explorer" element={<ApiExplorerPage onNavigate={handleNavigate} />} />
        <Route path="/teamcenter/search" element={<AdvancedSearchPage onNavigate={handleNavigate} />} />
        <Route path="/teamcenter/properties" element={<PropertyInspectorPage onNavigate={handleNavigate} />} />
        <Route path="/teamcenter/health" element={<TeamcenterHealthDashboard onNavigate={handleNavigate} />} />
        <Route path="/architecture" element={<SystemArchitectureDashboard onNavigate={handleNavigate} />} />
        <Route path="/logs" element={<Observability />} />
        <Route path="/mcp" element={<McpToolExplorer onNavigate={handleNavigate} />} />
        <Route path="/copilot" element={<Copilot />} />
        <Route path="/search" element={<Search />} />
        <Route path="/security" element={<Security />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/copilot" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
      <ToastContainer />
    </BrowserRouter>
  );
}
