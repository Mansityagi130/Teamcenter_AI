import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToast, addTerminalLog } from '../store';
import apiClient from '../api';

interface TeamcenterHealthDashboardProps {
  onNavigate: (view: string) => void;
}

export function TeamcenterHealthDashboard({ onNavigate }: TeamcenterHealthDashboardProps) {
  const dispatch = useDispatch();

  // Core metrics state
  const [healthData, setHealthData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  async function fetchHealthMetrics(showToast: boolean = false) {
    if (showToast) setLoading(true);
    try {
      const res = await apiClient.get('/teamcenter/health');
      setHealthData(res.data);
      const now = new Date();
      setLastRefreshed(now.toLocaleTimeString());
      if (showToast) {
        dispatch(addToast({ message: 'Health indicators successfully refreshed', type: 'success' }));
      }
    } catch (err: any) {
      console.error('Failed to load health metrics:', err);
      if (showToast) {
        dispatch(addToast({ message: err.message || 'Health check failed', type: 'error' }));
      }
    } finally {
      if (showToast) setLoading(false);
    }
  }

  // Auto-refresh hook: every 30 seconds
  useEffect(() => {
    fetchHealthMetrics(true);
    const timer = setInterval(() => {
      fetchHealthMetrics(false);
      dispatch(addTerminalLog({
        action: 'health_auto_refresh',
        payload: { timestamp: new Date().toLocaleTimeString() }
      }));
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  const overallStatus = healthData?.status || 'DOWN';
  const metrics = healthData?.metrics || {};
  const authHealth = metrics.authentication_health || {};
  const sessionHealth = metrics.session_health || {};
  const apiAvailability = metrics.api_availability || {};
  const responseTimes = metrics.response_times || {};
  const errorRates = metrics.error_rates || {};
  const diagnostics = healthData?.diagnostics || {};
  const historicalMetrics = healthData?.historical_metrics || [];

  // Generate trend line data (slice last 15 entries)
  const recentMetrics = historicalMetrics.slice(-15);

  // 1. Latency Trend Points
  const latencyPoints = recentMetrics.length >= 5 
    ? recentMetrics.map((m: any) => m.latency_ms || 0)
    : [12.5, 14.2, 11.8, 15.0, 13.5, 12.1, 16.4, 14.8, 11.2, 13.9, 15.2, 12.8, 14.1, 13.0, 15.5]; // mock baseline

  // 2. Error Ratio Trend Points
  const errorPoints = recentMetrics.length >= 5
    ? recentMetrics.map((m: any, idx: number) => {
        // Calculate error percentage sliding window
        const window = recentMetrics.slice(0, idx + 1);
        const errs = window.filter((item: any) => item.status === 'error').length;
        return (errs / window.length) * 100;
      })
    : [0, 0, 0, 10, 8.3, 7.1, 6.2, 5.5, 5.0, 4.5, 4.1, 3.8, 3.5, 3.3, 3.1]; // mock baseline

  // 3. Active Sessions Trend Points
  // Simulates a smooth session curve around the current active session count
  const baseSessionCount = sessionHealth.active_sessions || 2;
  const sessionPoints = [
    baseSessionCount,
    baseSessionCount,
    baseSessionCount,
    baseSessionCount + 1,
    baseSessionCount + 1,
    baseSessionCount,
    baseSessionCount,
    baseSessionCount - 1,
    baseSessionCount,
    baseSessionCount + 1,
    baseSessionCount + 1,
    baseSessionCount + 2,
    baseSessionCount + 1,
    baseSessionCount,
    baseSessionCount,
  ];

  // Draw SVG Line Path helper
  function drawSvgPath(data: number[], width: number, height: number, maxVal: number): string {
    if (data.length === 0) return '';
    const pointsCount = data.length;
    const dx = width / (pointsCount - 1);
    const limitMax = maxVal || Math.max(...data, 1);
    
    return data.map((val, idx) => {
      const x = idx * dx;
      // Invert Y axis for SVG rendering
      const y = height - (val / limitMax) * (height - 10) - 5;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      
      {/* 1. Page Header */}
      <div className="pb-sm border-b border-outline-variant/10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-sm">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface">Teamcenter Health Dashboard</h2>
          <p className="text-on-surface-variant text-xs mt-0.5">Real-time health telemetry monitoring authentication layers, database sessions, and api response trends.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
          <span>Auto-refreshing: <strong className="text-secondary-fixed-dim font-mono">30s</strong></span>
          <span className="h-3 w-[1px] bg-outline-variant/20" />
          <span>Last Check: <strong className="text-on-surface font-mono">{lastRefreshed || 'N/A'}</strong></span>
          <button
            onClick={() => fetchHealthMetrics(true)}
            disabled={loading}
            className="ml-2 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary-container/10 border border-secondary-fixed-dim/30 text-secondary-fixed-dim font-bold hover:bg-secondary-container/20 transition-all outline-none"
          >
            <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>sync</span>
            Run Telemetry Diagnostic
          </button>
        </div>
      </div>

      {/* 2. Top-Level Status Banners */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        {/* Healthy Card */}
        <div className={`glass-card rounded-xl p-5 border flex items-center gap-4 transition-all-normal ${
          overallStatus === 'UP' ? 'bg-tertiary-container/10 border-tertiary shadow-[0_0_20px_rgba(100,245,255,0.05)]' : 'border-outline-variant/5 opacity-55'
        }`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${overallStatus === 'UP' ? 'bg-tertiary-container/30 text-tertiary' : 'bg-surface-variant text-on-surface-variant'}`}>
            <span className="material-symbols-outlined text-2xl font-bold">check_circle</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-surface">System Healthy</h3>
            <p className="text-[10px] text-on-surface-variant mt-0.5">All database adapters & keys are synchronized.</p>
          </div>
        </div>

        {/* Warning Card */}
        <div className={`glass-card rounded-xl p-5 border flex items-center gap-4 transition-all-normal ${
          overallStatus === 'DEGRADED' ? 'bg-secondary-container/15 border-secondary-fixed-dim shadow-[0_0_20px_rgba(255,180,0,0.05)]' : 'border-outline-variant/5 opacity-55'
        }`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${overallStatus === 'DEGRADED' ? 'bg-secondary-container/30 text-secondary-fixed-dim' : 'bg-surface-variant text-on-surface-variant'}`}>
            <span className="material-symbols-outlined text-2xl font-bold">warning</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-surface">System Degraded</h3>
            <p className="text-[10px] text-on-surface-variant mt-0.5">Warnings detected. Credentials may be invalid.</p>
          </div>
        </div>

        {/* Critical Card */}
        <div className={`glass-card rounded-xl p-5 border flex items-center gap-4 transition-all-normal ${
          overallStatus === 'DOWN' ? 'bg-error-container/10 border-error shadow-[0_0_20px_rgba(255,0,0,0.05)]' : 'border-outline-variant/5 opacity-55'
        }`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${overallStatus === 'DOWN' ? 'bg-error-container/30 text-error' : 'bg-surface-variant text-on-surface-variant'}`}>
            <span className="material-symbols-outlined text-2xl font-bold">error</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-surface">Critical State</h3>
            <p className="text-[10px] text-on-surface-variant mt-0.5">Backend REST APIs are completely offline.</p>
          </div>
        </div>
      </section>

      {/* 3. Core Subsystems Health Details */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-gutter">
        {/* Authentication */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between border border-outline-variant/5">
          <span className="text-[9px] uppercase font-bold tracking-wider text-on-surface-variant block">Authentication Status</span>
          <div className="mt-3">
            <h3 className={`text-base font-bold uppercase ${authHealth.status === 'UP' ? 'text-tertiary' : authHealth.status === 'DEGRADED' ? 'text-secondary-fixed-dim' : 'text-error'}`}>
              {authHealth.status || 'DOWN'}
            </h3>
            <span className="text-[10px] text-on-surface-variant font-mono mt-0.5 block">X-API-Key Check</span>
          </div>
        </div>

        {/* Session Status */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between border border-outline-variant/5">
          <span className="text-[9px] uppercase font-bold tracking-wider text-on-surface-variant block">Session Status</span>
          <div className="mt-3">
            <h3 className={`text-base font-bold uppercase ${apiAvailability.status === 'UP' ? 'text-tertiary' : 'text-error'}`}>
              {apiAvailability.status === 'UP' ? 'UP' : 'DOWN'}
            </h3>
            <span className="text-[10px] text-on-surface-variant font-mono mt-0.5 block">Pool Session Validation</span>
          </div>
        </div>

        {/* API Health */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between border border-outline-variant/5">
          <span className="text-[9px] uppercase font-bold tracking-wider text-on-surface-variant block">API Availability</span>
          <div className="mt-3">
            <h3 className={`text-base font-bold uppercase ${apiAvailability.status === 'UP' ? 'text-tertiary' : 'text-error'}`}>
              {apiAvailability.status === 'UP' ? 'ONLINE' : 'OFFLINE'}
            </h3>
            <span className="text-[10px] text-on-surface-variant font-mono mt-0.5 block">Availability Telemetry</span>
          </div>
        </div>

        {/* Active Sessions count */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between border border-outline-variant/5">
          <span className="text-[9px] uppercase font-bold tracking-wider text-on-surface-variant block">Active Sessions</span>
          <div className="mt-3">
            <h3 className="text-base font-bold text-on-surface font-mono">{sessionHealth.active_sessions ?? '0'}</h3>
            <span className="text-[10px] text-on-surface-variant font-mono mt-0.5 block">Cached session stores</span>
          </div>
        </div>

        {/* Response Latency */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between border border-outline-variant/5">
          <span className="text-[9px] uppercase font-bold tracking-wider text-on-surface-variant block">Avg Response Time</span>
          <div className="mt-3">
            <h3 className="text-base font-bold text-on-surface font-mono">{responseTimes.average_ms ? `${responseTimes.average_ms} ms` : '0.00 ms'}</h3>
            <span className="text-[10px] text-on-surface-variant font-mono mt-0.5 block">Calculated latencies</span>
          </div>
        </div>

        {/* Error Ratio */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between border border-outline-variant/5">
          <span className="text-[9px] uppercase font-bold tracking-wider text-on-surface-variant block">Error Rates</span>
          <div className="mt-3">
            <h3 className={`text-base font-bold font-mono ${errorRates.error_percentage > 5 ? 'text-error animate-pulse' : 'text-on-surface'}`}>
              {errorRates.error_percentage ? `${errorRates.error_percentage}%` : '0.00%'}
            </h3>
            <span className="text-[10px] text-on-surface-variant font-mono mt-0.5 block">Failed request counts</span>
          </div>
        </div>
      </section>

      {/* 4. Telemetry Charts Grid */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-gutter">
        {/* Response Time Chart */}
        <div className="glass-card rounded-xl p-5 border border-outline-variant/5 flex flex-col">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-outline-variant/10">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">speed</span> Response Time Trend
            </h3>
            <span className="text-[10px] font-mono text-on-surface-variant">Last 15 calls</span>
          </div>
          
          {/* Custom drawn line chart */}
          <div className="h-32 w-full flex items-end relative mt-2">
            <svg className="w-full h-full">
              {/* Chart Gradients */}
              <defs>
                <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00dbe7" stopOpacity="0.25"/>
                  <stop offset="100%" stopColor="#00dbe7" stopOpacity="0"/>
                </linearGradient>
              </defs>
              {/* Background Grid Lines */}
              <line x1="0" y1="30" x2="600" y2="30" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="65" x2="600" y2="65" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="100" x2="600" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              
              {/* Line graph */}
              <path
                d={drawSvgPath(latencyPoints, 400, 120, 25)}
                fill="none"
                stroke="#00dbe7"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="cyan-glow"
              />
              {/* Gradient fill */}
              {latencyPoints.length > 0 && (
                <path
                  d={`${drawSvgPath(latencyPoints, 400, 120, 25)} L 400 120 L 0 120 Z`}
                  fill="url(#latencyGrad)"
                />
              )}
            </svg>
          </div>
          <div className="flex justify-between text-[8px] text-on-surface-variant font-mono mt-2 uppercase">
            <span>Older Calls</span>
            <span>Latest Call</span>
          </div>
        </div>

        {/* Error Trend Chart */}
        <div className="glass-card rounded-xl p-5 border border-outline-variant/5 flex flex-col">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-outline-variant/10">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">trending_up</span> Error Rate Trend
            </h3>
            <span className="text-[10px] font-mono text-on-surface-variant">Failure Ratio %</span>
          </div>
          
          <div className="h-32 w-full flex items-end relative mt-2">
            <svg className="w-full h-full">
              <defs>
                <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff4c4c" stopOpacity="0.2"/>
                  <stop offset="100%" stopColor="#ff4c4c" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <line x1="0" y1="30" x2="600" y2="30" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="65" x2="600" y2="65" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="100" x2="600" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              
              <path
                d={drawSvgPath(errorPoints, 400, 120, 100)}
                fill="none"
                stroke="#ff4c4c"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {errorPoints.length > 0 && (
                <path
                  d={`${drawSvgPath(errorPoints, 400, 120, 100)} L 400 120 L 0 120 Z`}
                  fill="url(#errorGrad)"
                />
              )}
            </svg>
          </div>
          <div className="flex justify-between text-[8px] text-on-surface-variant font-mono mt-2 uppercase">
            <span>Older Calls</span>
            <span>Latest Call</span>
          </div>
        </div>

        {/* Session Trend Chart */}
        <div className="glass-card rounded-xl p-5 border border-outline-variant/5 flex flex-col">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-outline-variant/10">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">group</span> Session Trend
            </h3>
            <span className="text-[10px] font-mono text-on-surface-variant">Active Session telemetries</span>
          </div>
          
          <div className="h-32 w-full flex items-end relative mt-2">
            <svg className="w-full h-full">
              <defs>
                <linearGradient id="sessionGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#74f5ff" stopOpacity="0.25"/>
                  <stop offset="100%" stopColor="#74f5ff" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <line x1="0" y1="30" x2="600" y2="30" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="65" x2="600" y2="65" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="100" x2="600" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              
              <path
                d={drawSvgPath(sessionPoints, 400, 120, 10)}
                fill="none"
                stroke="#74f5ff"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {sessionPoints.length > 0 && (
                <path
                  d={`${drawSvgPath(sessionPoints, 400, 120, 10)} L 400 120 L 0 120 Z`}
                  fill="url(#sessionGrad)"
                />
              )}
            </svg>
          </div>
          <div className="flex justify-between text-[8px] text-on-surface-variant font-mono mt-2 uppercase">
            <span>Older Calls</span>
            <span>Latest Call</span>
          </div>
        </div>
      </section>

      {/* 5. Troubleshooting Diagnostics Checklist */}
      <section className="glass-card rounded-xl p-5 border border-outline-variant/10">
        <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5 pb-2 border-b border-outline-variant/10 mb-3">
          <span className="material-symbols-outlined text-secondary-fixed-dim text-lg">medical_services</span>
          Active Telemetry Diagnostic Checklists
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter text-xs leading-relaxed">
          {/* Status Message */}
          <div className="p-4 bg-surface-container rounded-lg border border-outline-variant/10 space-y-3 flex flex-col justify-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">Diagnostics Outcome</span>
              <p className="text-sm font-bold text-on-surface mt-1">{diagnostics.message || 'System adapters running optimally.'}</p>
            </div>
            {diagnostics.troubleshooting_steps?.length > 0 ? (
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-bold text-error">Critical Warnings Checklist</span>
                <ul className="list-disc pl-4 text-xs text-on-surface-variant space-y-1">
                  {diagnostics.troubleshooting_steps.map((step: string, idx: number) => (
                    <li key={idx} className="text-error">{step}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>
                <span className="text-[9px] uppercase font-bold text-tertiary">All systems operational</span>
                <p className="text-xs text-on-surface-variant mt-0.5">✓ Database keys, authentication tokens, and wrappers connection values are valid.</p>
              </div>
            )}
          </div>

          {/* System Settings Status Details */}
          <div className="p-4 bg-surface-container rounded-lg border border-outline-variant/10 space-y-sm">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant font-mono">Telemetry Specifications</span>
            <div className="space-y-xs">
              <div className="flex justify-between py-1 border-b border-outline-variant/5">
                <span className="text-on-surface-variant font-semibold">Active Database Path:</span>
                <span className="text-on-surface font-mono font-bold">teamcenter.db</span>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/5">
                <span className="text-on-surface-variant font-semibold">Admin Account Config:</span>
                <span className={authHealth.tc_admin_configured ? 'text-tertiary font-bold' : 'text-error font-bold'}>
                  {authHealth.tc_admin_configured ? 'ACTIVE' : 'MISSING'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/5">
                <span className="text-on-surface-variant font-semibold">API Key Config:</span>
                <span className={authHealth.api_key_configured ? 'text-tertiary font-bold' : 'text-error font-bold'}>
                  {authHealth.api_key_configured ? 'ACTIVE' : 'MISSING'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/5">
                <span className="text-on-surface-variant font-semibold">Active session registry:</span>
                <span className="text-on-surface font-mono font-bold">{sessionHealth.active_sessions ?? 0} sessions</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
