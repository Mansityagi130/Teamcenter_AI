import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import apiClient from '../api';
import { addToast } from '../store';

export function Security() {
  const [quota, setQuota] = useState({ message_count: 0, daily_limit: 500, remaining: 500 });
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [logType, setLogType] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const dispatch = useDispatch();

  async function fetchQuotaAndLogs() {
    setLoading(true);
    try {
      // Fetch quota usage
      const usageRes = await apiClient.get('/chat/usage');
      setQuota(usageRes.data);

      // Fetch logs
      const logsRes = await apiClient.get(`/api/logs?page=${page}&limit=10&query=${encodeURIComponent(search)}&type=${logType}`);
      setLogs(logsRes.data.logs);
      setTotalPages(logsRes.data.pages);
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Failed to load security audits', type: 'error' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchQuotaAndLogs();
  }, [page, logType]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchQuotaAndLogs();
  }

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      <div className="pb-sm border-b border-outline-variant/10 flex justify-between items-end">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface">Security & Governance Dashboard</h2>
          <p className="text-on-surface-variant text-xs mt-0.5">Surveillance of model token consumption limits and system actions.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            fetchQuotaAndLogs();
            dispatch(addToast({ message: 'Audit logs refreshed', type: 'success' }));
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary-fixed-dim text-primary-container rounded-lg font-bold text-xs hover:opacity-90 active:scale-95 transition-all shadow-md outline-none"
        >
          <span className="material-symbols-outlined text-sm">refresh</span> Refresh Audits
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
        <div className="glass-card p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">Messages Used (24h)</p>
            <h3 className="text-xl font-bold text-secondary-fixed-dim">{quota.message_count}</h3>
            <p className="text-[9px] text-on-surface-variant mt-0.5">Running user consumption</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-secondary-fixed-dim/10 flex items-center justify-center text-secondary-fixed-dim">
            <span className="material-symbols-outlined">sms</span>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">Daily Chat Limit</p>
            <h3 className="text-xl font-bold text-on-surface">{quota.daily_limit}</h3>
            <p className="text-[9px] text-on-surface-variant mt-0.5">Standard quota capacity</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-surface-variant flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined">bar_chart</span>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">Remaining Messages</p>
            <h3 className="text-xl font-bold text-tertiary">{quota.remaining}</h3>
            <p className="text-[9px] text-on-surface-variant mt-0.5">Available token count</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined">shield</span>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">System Health</p>
            <h3 className="text-xl font-bold text-tertiary">99.98%</h3>
            <p className="text-[9px] text-tertiary">Optimal Throughput</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined">verified_user</span>
          </div>
        </div>
      </div>

      {/* Bento Analytics */}
      <div className="grid grid-cols-12 gap-gutter">
        {/* SVG chart panel */}
        <div className="col-span-12 lg:col-span-8 glass-card rounded-xl p-5 ai-glow">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2 text-secondary-fixed-dim">
              <span className="material-symbols-outlined">monitoring</span>
              <h4 className="text-sm font-bold text-on-surface">Token Consumption Analytics</h4>
            </div>
          </div>
          <div className="h-56 w-full relative">
            {/* Area Chart with SVG */}
            <svg className="w-full h-full" viewBox="0 0 800 220" preserveAspectRatio="none">
              <defs>
                <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#00dbe7" stopOpacity={0.3}></stop>
                  <stop offset="95%" stopColor="#00dbe7" stopOpacity={0}></stop>
                </linearGradient>
              </defs>
              <path d="M0,180 L50,160 L100,170 L150,110 L200,90 L250,120 L300,80 L350,60 L400,100 L450,130 L500,90 L550,50 L600,30 L650,70 L700,40 L750,20 L800,35 L800,220 L0,220 Z" fill="url(#areaGrad)"></path>
              <path d="M0,180 L50,160 L100,170 L150,110 L200,90 L250,120 L300,80 L350,60 L400,100 L450,130 L500,90 L550,50 L600,30 L650,70 L700,40 L750,20 L800,35" fill="none" stroke="#00dbe7" strokeWidth="2.5"></path>
              <circle cx="600" cy="30" fill="#00dbe7" r="5"></circle>
            </svg>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[9px] text-on-surface-variant font-mono mt-2 px-2">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:59</span>
            </div>
          </div>
        </div>

        {/* Side Metrics */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-md">
          <div className="glass-card rounded-xl p-5 flex-1 space-y-4">
            <div className="flex items-center gap-2 text-secondary-fixed-dim">
              <span className="material-symbols-outlined">shield</span>
              <h4 className="text-xs font-bold uppercase tracking-wider">Security Thresholds</h4>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between font-bold mb-1">
                  <span className="text-on-surface">API Rate Limit</span>
                  <span className="text-secondary-fixed-dim">78%</span>
                </div>
                <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-secondary-fixed-dim w-[78%]"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between font-bold mb-1">
                  <span className="text-on-surface">GPU Memory Pool</span>
                  <span className="text-tertiary">42%</span>
                </div>
                <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-tertiary w-[42%]"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between font-bold mb-1">
                  <span className="text-on-surface">Data Exfiltration Buffer</span>
                  <span className="text-error">92%</span>
                </div>
                <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-error w-[92%]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time activity table */}
      <div className="glass-card rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="px-5 py-3 border-b border-outline-variant/10 bg-surface-container-low/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed-dim text-lg">list_alt</span>
            User Activity Audit Logs
          </h4>
          
          <form onSubmit={handleSearchSubmit} className="flex gap-2 text-xs w-full md:w-auto">
            <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/20 font-bold max-w-xs w-full">
              <select
                value={logType}
                onChange={(e) => { setLogType(e.target.value); setPage(1); }}
                className="bg-transparent border-none text-xs text-on-surface-variant font-bold p-1 outline-none cursor-pointer"
              >
                <option value="all">All Logs</option>
                <option value="api">API Calls</option>
                <option value="tool">Tool Calls</option>
                <option value="user">User Actions</option>
                <option value="security">Security</option>
                <option value="error">Errors</option>
              </select>
            </div>
            
            <div className="flex items-center gap-xs p-1 bg-background border border-outline-variant/30 rounded-lg">
              <input
                type="text"
                placeholder="Search logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent border-none text-xs text-on-surface focus:ring-0 p-1 outline-none"
              />
              <button type="submit" className="material-symbols-outlined text-on-surface-variant hover:text-on-surface px-1">search</button>
            </div>
          </form>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-surface-variant/20 text-on-surface-variant font-bold border-b border-outline-variant/10 uppercase tracking-wider">
                <th className="p-4">Action</th>
                <th className="p-4">Endpoint</th>
                <th className="p-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {loading && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-on-surface-variant italic">Loading logs...</td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-on-surface-variant italic">No audit records match query parameters.</td>
                </tr>
              )}
              {!loading && logs.map((log, index) => {
                const logDate = new Date(log.timestamp);
                const formattedTime = logDate.toLocaleDateString() + " " + logDate.toLocaleTimeString();
                return (
                  <tr key={index} className="hover:bg-surface-variant/20 transition-colors border-b border-outline-variant/5">
                    <td className="p-4 font-bold text-on-surface">{log.action}</td>
                    <td className="p-4 text-on-surface-variant font-mono">{log.endpoint}</td>
                    <td className="p-4 text-on-surface-variant">{formattedTime}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="p-4 bg-surface-container-low/30 border-t border-outline-variant/10 flex justify-between items-center text-xs">
            <span className="text-on-surface-variant">Page <strong>{page}</strong> of {totalPages}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 bg-surface-container border border-outline-variant/20 rounded hover:bg-surface-variant text-on-surface disabled:opacity-50 transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 bg-surface-container border border-outline-variant/20 rounded hover:bg-surface-variant text-on-surface disabled:opacity-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
