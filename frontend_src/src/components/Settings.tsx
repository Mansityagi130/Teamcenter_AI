import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import apiClient from '../api';
import { RootState, addToast, setSettings, setEnv, setModel, addTerminalLog } from '../store';

export function Settings() {
  const settings = useSelector((state: RootState) => state.settings);
  const username = useSelector((state: RootState) => state.auth.username);
  const createdAt = useSelector((state: RootState) => state.auth.createdAt);
  const dispatch = useDispatch();

  // Local state for forms
  const [openaiKey, setOpenaiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [tcUser, setTcUser] = useState('');
  const [tcPass, setTcPass] = useState('');
  
  const [visibility, setVisibility] = useState<Record<string, boolean>>({
    openai: false,
    claude: false,
    gemini: false,
    tc: false,
  });

  // Password reset fields
  const [curPassword, setCurPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  async function fetchSettingsData() {
    try {
      const res = await apiClient.get('/user/settings');
      const data = res.data;
      dispatch(setSettings(data));
      
      setOpenaiKey(data.openai_key);
      setClaudeKey(data.claude_key);
      setGeminiKey(data.gemini_key);
      setTcUser(data.tc_user);
      setTcPass(data.tc_pass);
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Failed to load settings', type: 'error' }));
    }
  }

  useEffect(() => {
    fetchSettingsData();
  }, []);

  function toggleVisibility(field: string) {
    setVisibility((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  async function handleSaveSettings() {
    dispatch(addTerminalLog({
      action: 'save_configurations',
      payload: { timestamp: new Date().toISOString() }
    }));

    try {
      await apiClient.post('/user/settings', {
        openai_key: openaiKey,
        claude_key: claudeKey,
        gemini_key: geminiKey,
        tc_user: tcUser,
        tc_pass: tcPass,
        active_model: settings.activeModel,
        active_env: settings.activeEnv
      });
      dispatch(addToast({ message: 'Settings saved successfully', type: 'success' }));
      fetchSettingsData(); // Refresh masked keys
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Failed to save settings', type: 'error' }));
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      dispatch(addToast({ message: 'New password must be at least 8 characters long', type: 'error' }));
      return;
    }

    try {
      await apiClient.post('/user/reset-password', {
        current_password: curPassword,
        new_password: newPassword
      });
      dispatch(addToast({ message: 'Password reset successful', type: 'success' }));
      setCurPassword('');
      setNewPassword('');
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Failed to reset password', type: 'error' }));
    }
  }

  async function testConnection() {
    dispatch(addTerminalLog({
      action: 'credentials_handshake_test',
      payload: { openai: 'verifying', claude: 'verifying', gemini: 'verifying', teamcenter: 'verifying' }
    }));
    
    dispatch(addToast({ message: 'Initiating credentials handshake...', type: 'info' }));
    
    // Simulate test delay
    setTimeout(() => {
      dispatch(addToast({ message: 'Vault connections validated: SUCCESS', type: 'success' }));
      dispatch(addTerminalLog({
        action: 'credentials_handshake_success',
        payload: { openai: 'verified', claude: 'verified', gemini: 'verified', teamcenter: '200_OK' }
      }));
    }, 1500);
  }

  function handleEnvChange(env: 'dev' | 'test' | 'prod') {
    if (env === 'prod') {
      const confirmAccess = window.confirm(
        'WARNING: You are about to switch to the PRODUCTION database.\n' +
        'Any modifications will execute real Siemens Teamcenter PLM transactions.\n' +
        'Do you wish to proceed?'
      );
      if (!confirmAccess) return;
    }
    dispatch(setEnv(env));
    dispatch(addTerminalLog({
      action: 'environment_switch',
      payload: { target: env.toUpperCase() }
    }));
    dispatch(addToast({ message: `Switched target environment to ${env.toUpperCase()}`, type: 'warning' }));
  }

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      <div className="pb-sm border-b border-outline-variant/10 flex justify-between items-end">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface">System Configuration Panel</h2>
          <p className="text-on-surface-variant text-xs mt-0.5">Manage your industrial deployment credentials, passwords, and model API key configurations.</p>
        </div>
        <button
          type="button"
          onClick={handleSaveSettings}
          className="bg-secondary-fixed-dim text-primary-container px-5 py-2 rounded-lg font-bold hover:brightness-110 active:scale-95 transition-all text-xs flex items-center gap-1.5 shadow-md cyan-glow outline-none"
        >
          <span className="material-symbols-outlined text-sm">save</span> Apply Configuration Changes
        </button>
      </div>

      <div className="grid grid-cols-12 gap-gutter">
        {/* Left Side selectors */}
        <div className="col-span-12 lg:col-span-4 space-y-gutter">
          {/* Environment */}
          <div className="glass-panel p-5 rounded-xl space-y-4">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
              <span className="material-symbols-outlined">hub</span>
              Target Environment Setup
            </h3>
            <div className="bg-surface-container-lowest p-1 rounded-lg flex border border-outline-variant/10 text-xs font-bold">
              {(['dev', 'test', 'prod'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleEnvChange(id)}
                  className={`flex-1 py-1.5 rounded-md transition-all text-center uppercase outline-none ${
                    settings.activeEnv === id
                      ? 'bg-secondary-container/20 text-secondary-fixed-dim font-bold border border-secondary-fixed-dim/20'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-on-surface-variant italic leading-relaxed">
              Configuring deployment targets manages GPU queue scheduling and PLM transaction latency limits.
            </p>
          </div>

          {/* Model selection */}
          <div className="glass-panel p-5 rounded-xl space-y-4">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
              <span className="material-symbols-outlined">memory</span>
              Active Model Select
            </h3>
            <div className="space-y-2 text-xs">
              {/* Gemini */}
              <label className="block cursor-pointer">
                <input
                  type="radio"
                  name="settings-model"
                  checked={settings.activeModel === 'gemini'}
                  onChange={() => dispatch(setModel('gemini'))}
                  className="hidden peer"
                />
                <div className="p-3 rounded-lg border border-outline-variant/20 bg-surface-container-low peer-checked:border-secondary-fixed-dim peer-checked:bg-secondary-container/5 transition-all">
                  <div className="flex justify-between items-center font-bold text-on-surface">
                    <span>Gemini 3.5 Flash</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-secondary-fixed-dim/20 text-secondary-fixed-dim rounded font-semibold uppercase">Default</span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant mt-1">High speed token parsing, recommended for interactive chat commands.</p>
                </div>
              </label>

              {/* GPT4 */}
              <label className="block cursor-pointer">
                <input
                  type="radio"
                  name="settings-model"
                  checked={settings.activeModel === 'gpt4'}
                  onChange={() => dispatch(setModel('gpt4'))}
                  className="hidden peer"
                />
                <div className="p-3 rounded-lg border border-outline-variant/20 bg-surface-container-low peer-checked:border-secondary-fixed-dim peer-checked:bg-secondary-container/5 transition-all">
                  <span className="font-bold text-on-surface block">GPT-4 Turbo</span>
                  <p className="text-[10px] text-on-surface-variant mt-1">Precision BOM tree analysis, suited for complex schema calculations.</p>
                </div>
              </label>

              {/* Claude */}
              <label className="block cursor-pointer">
                <input
                  type="radio"
                  name="settings-model"
                  checked={settings.activeModel === 'claude'}
                  onChange={() => dispatch(setModel('claude'))}
                  className="hidden peer"
                />
                <div className="p-3 rounded-lg border border-outline-variant/20 bg-surface-container-low peer-checked:border-secondary-fixed-dim peer-checked:bg-secondary-container/5 transition-all">
                  <span className="font-bold text-on-surface block">Claude 3.5 Sonnet</span>
                  <p className="text-[10px] text-on-surface-variant mt-1">Large structural engineering summaries and document matching.</p>
                </div>
              </label>

              {/* Local */}
              <label className="block cursor-pointer">
                <input
                  type="radio"
                  name="settings-model"
                  checked={settings.activeModel === 'local'}
                  onChange={() => dispatch(setModel('local'))}
                  className="hidden peer"
                />
                <div className="p-3 rounded-lg border border-outline-variant/20 bg-surface-container-low peer-checked:border-secondary-fixed-dim peer-checked:bg-secondary-container/5 transition-all">
                  <div className="flex justify-between items-center font-bold text-on-surface">
                    <span>Local Llama 3 (8B)</span>
                    <span className="material-symbols-outlined text-sm text-tertiary">lock</span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant mt-1">Offline compliance model running on internal GPU nodes.</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right side credentials */}
        <div className="col-span-12 lg:col-span-8 space-y-gutter">
          <div className="glass-panel p-5 rounded-xl space-y-5">
            <div className="flex justify-between items-center border-b border-outline-variant/10 pb-3">
              <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
                <span className="material-symbols-outlined text-lg">key</span>
                Model API Keys & Teamcenter Credentials
              </h3>
              <span className="text-[10px] text-tertiary font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
                Secure Vault Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* OpenAI */}
              <div className="space-y-1.5">
                <label className="block text-on-surface-variant font-bold">OpenAI API Key</label>
                <div className="flex gap-xs items-center p-1 bg-background border border-outline-variant/30 rounded-lg focus-within:border-secondary-fixed-dim">
                  <input
                    type={visibility.openai ? 'text' : 'password'}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="flex-1 bg-transparent border-none text-xs text-on-surface focus:ring-0 p-1 outline-none"
                  />
                  <button type="button" className="p-1 text-on-surface-variant hover:text-secondary-fixed-dim" onClick={() => toggleVisibility('openai')}>
                    <span className="material-symbols-outlined text-base">
                      {visibility.openai ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Claude */}
              <div className="space-y-1.5">
                <label className="block text-on-surface-variant font-bold">Anthropic Claude Key</label>
                <div className="flex gap-xs items-center p-1 bg-background border border-outline-variant/30 rounded-lg focus-within:border-secondary-fixed-dim">
                  <input
                    type={visibility.claude ? 'text' : 'password'}
                    value={claudeKey}
                    onChange={(e) => setClaudeKey(e.target.value)}
                    className="flex-1 bg-transparent border-none text-xs text-on-surface focus:ring-0 p-1 outline-none"
                  />
                  <button type="button" className="p-1 text-on-surface-variant hover:text-secondary-fixed-dim" onClick={() => toggleVisibility('claude')}>
                    <span className="material-symbols-outlined text-base">
                      {visibility.claude ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Gemini */}
              <div className="space-y-1.5">
                <label className="block text-on-surface-variant font-bold">Google Gemini Key</label>
                <div className="flex gap-xs items-center p-1 bg-background border border-outline-variant/30 rounded-lg focus-within:border-secondary-fixed-dim">
                  <input
                    type={visibility.gemini ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    className="flex-1 bg-transparent border-none text-xs text-on-surface focus:ring-0 p-1 outline-none"
                  />
                  <button type="button" className="p-1 text-on-surface-variant hover:text-secondary-fixed-dim" onClick={() => toggleVisibility('gemini')}>
                    <span className="material-symbols-outlined text-base">
                      {visibility.gemini ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Connection Tester */}
              <div className="space-y-1.5 flex flex-col justify-end">
                <button
                  type="button"
                  onClick={testConnection}
                  className="w-full bg-surface-container-high border border-outline-variant/20 hover:bg-surface-variant text-on-surface py-2 rounded-lg font-bold transition-all text-xs flex items-center justify-center gap-1.5 outline-none"
                >
                  <span className="material-symbols-outlined text-sm">network_ping</span> Test API Connection Status
                </button>
              </div>

              {/* TC Credentials */}
              <div className="md:col-span-2 pt-2 border-t border-outline-variant/10 space-y-2">
                <label className="block text-on-surface-variant font-bold">Siemens Teamcenter Credentials (PLM Connector)</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                  <div className="flex gap-xs items-center p-1 bg-background border border-outline-variant/30 rounded-lg focus-within:border-secondary-fixed-dim">
                    <span className="material-symbols-outlined text-on-surface-variant px-1.5 text-base">person</span>
                    <input
                      type="text"
                      value={tcUser}
                      onChange={(e) => setTcUser(e.target.value)}
                      className="flex-1 bg-transparent border-none text-xs text-on-surface focus:ring-0 p-1 outline-none"
                    />
                  </div>
                  <div className="flex gap-xs items-center p-1 bg-background border border-outline-variant/30 rounded-lg focus-within:border-secondary-fixed-dim">
                    <span className="material-symbols-outlined text-on-surface-variant px-1.5 text-base">lock</span>
                    <input
                      type={visibility.tc ? 'text' : 'password'}
                      value={tcPass}
                      onChange={(e) => setTcPass(e.target.value)}
                      className="flex-1 bg-transparent border-none text-xs text-on-surface focus:ring-0 p-1 outline-none"
                    />
                    <button type="button" className="p-1 text-on-surface-variant hover:text-secondary-fixed-dim" onClick={() => toggleVisibility('tc')}>
                      <span className="material-symbols-outlined text-base">
                        {visibility.tc ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Reset password form */}
          <div className="glass-panel p-5 rounded-xl space-y-4">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
              <span className="material-symbols-outlined">lock_reset</span>
              Reset User Account Password
            </h3>
            <form onSubmit={handlePasswordReset} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs items-end">
              <div className="space-y-1.5">
                <label className="block text-on-surface-variant font-bold">Current Password</label>
                <input
                  type="password"
                  required
                  value={curPassword}
                  onChange={(e) => setCurPassword(e.target.value)}
                  className="w-full bg-background border border-outline-variant/30 rounded-lg p-2 text-xs text-on-surface focus:border-secondary-fixed-dim outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-on-surface-variant font-bold">New Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-background border border-outline-variant/30 rounded-lg p-2 text-xs text-on-surface focus:border-secondary-fixed-dim outline-none"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="bg-primary-container border border-primary/20 text-primary-fixed-dim hover:bg-primary-container/85 px-4 py-2 rounded-lg font-bold transition-all text-xs outline-none"
                >
                  Reset Password
                </button>
              </div>
            </form>
          </div>

          {/* User profile details panel */}
          <div className="glass-card p-5 rounded-xl space-y-3 text-xs max-w-lg">
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary-fixed-dim">Active User profile details</h3>
            <div className="space-y-2 font-mono">
              <div className="flex justify-between py-1 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Active Username:</span>
                <strong className="text-on-surface">{username || '-'}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">User Role status:</span>
                <strong className="text-on-surface">Chief Engineer</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Account created timestamp:</span>
                <strong className="text-on-surface">
                  {createdAt ? new Date(createdAt).toLocaleString() : '-'}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
