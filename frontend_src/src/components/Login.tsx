import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import apiClient from '../api';
import { loginSuccess, addToast } from '../store';

export function Login() {
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const dispatch = useDispatch();

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await apiClient.post('/login', { username, password });
      dispatch(loginSuccess({
        jwt: res.data.access_token,
        apiKey: res.data.api_key,
        username: username.toLowerCase()
      }));
      dispatch(addToast({ message: `Signed in as ${username}`, type: 'success' }));
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid account credentials.');
    }
  }

  async function handleSignupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiClient.post('/signup', { username, password });
      
      // Auto login after successful signup
      const loginRes = await apiClient.post('/login', { username, password });
      dispatch(loginSuccess({
        jwt: loginRes.data.access_token,
        apiKey: loginRes.data.api_key,
        username: username.toLowerCase()
      }));
      dispatch(addToast({ message: 'Account created successfully', type: 'success' }));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed creating account.');
    }
  }

  return (
    <div id="auth-screen" className="auth-container active flex items-center justify-center min-h-screen w-screen bg-background relative overflow-hidden">
      {/* Visual background elements */}
      <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-tr from-background via-black/40 to-background opacity-45 animate-spin-slow pointer-events-none" />
      
      <div className="auth-card glass-panel ai-glow max-w-sm w-full p-6 rounded-xl border border-outline-variant/25 z-10">
        <div className="auth-header text-center mb-6">
          <div className="brand-logo w-12 h-12 bg-secondary-container/20 border border-secondary-fixed-dim/30 rounded-lg flex items-center justify-center text-secondary-fixed-dim font-bold text-xl mx-auto mb-2">
            TC
          </div>
          <h2 className="text-on-surface font-bold text-2xl">Teamcenter AI</h2>
          <p className="text-on-surface-variant text-xs mt-1">Your secure intelligent engineering gateway</p>
        </div>

        {/* Tab options */}
        <div className="auth-tabs flex border-b border-outline-variant/10 text-sm font-semibold mb-6">
          <button
            type="button"
            className={`auth-tab-btn flex-1 pb-2 border-b-2 text-center transition-all outline-none ${
              activeTab === 'login'
                ? 'border-secondary-fixed-dim text-secondary-fixed-dim'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
            onClick={() => { setActiveTab('login'); setErrorMsg(''); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn flex-1 pb-2 border-b-2 text-center transition-all outline-none ${
              activeTab === 'signup'
                ? 'border-secondary-fixed-dim text-secondary-fixed-dim'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
            onClick={() => { setActiveTab('signup'); setErrorMsg(''); }}
          >
            Sign Up
          </button>
        </div>

        {/* Error messaging */}
        {errorMsg && (
          <div className="error-msg text-xs py-2 px-3 bg-error-container/20 text-error border border-error/30 rounded-lg mb-4 text-center leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* LOGIN FORM */}
        {activeTab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="form-group flex flex-col gap-1.5">
              <label className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Username</label>
              <input
                type="text"
                placeholder="Enter your username"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-background/80 border border-outline-variant/30 text-xs rounded-lg p-2.5 text-white/95 placeholder-white/45 focus:border-secondary-fixed-dim focus:ring-1 focus:ring-secondary-fixed-dim outline-none w-full caret-secondary-fixed-dim"
              />
            </div>
            <div className="form-group flex flex-col gap-1.5">
              <label className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background/80 border border-outline-variant/30 text-xs rounded-lg p-2.5 text-white/95 placeholder-white/45 focus:border-secondary-fixed-dim focus:ring-1 focus:ring-secondary-fixed-dim outline-none w-full caret-secondary-fixed-dim"
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full bg-secondary-fixed-dim text-primary-container font-bold py-2.5 rounded-lg shadow-lg hover:shadow-secondary-fixed-dim/20 hover:brightness-110 active:scale-98 transition-all text-xs outline-none mt-2"
            >
              Sign In
            </button>
          </form>
        ) : (
          /* SIGNUP FORM */
          <form onSubmit={handleSignupSubmit} className="space-y-4">
            <div className="form-group flex flex-col gap-1.5">
              <label className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Username</label>
              <input
                type="text"
                placeholder="Choose a username"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-background/80 border border-outline-variant/30 text-xs rounded-lg p-2.5 text-white/95 placeholder-white/45 focus:border-secondary-fixed-dim focus:ring-1 focus:ring-secondary-fixed-dim outline-none w-full caret-secondary-fixed-dim"
              />
            </div>
            <div className="form-group flex flex-col gap-1.5">
              <label className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Password</label>
              <input
                type="password"
                placeholder="Min. 8 characters"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background/80 border border-outline-variant/30 text-xs rounded-lg p-2.5 text-white/95 placeholder-white/45 focus:border-secondary-fixed-dim focus:ring-1 focus:ring-secondary-fixed-dim outline-none w-full caret-secondary-fixed-dim"
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full bg-secondary-fixed-dim text-primary-container font-bold py-2.5 rounded-lg shadow-lg hover:shadow-secondary-fixed-dim/20 hover:brightness-110 active:scale-98 transition-all text-xs outline-none mt-2"
            >
              Create Account
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
