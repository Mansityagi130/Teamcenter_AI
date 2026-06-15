import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import apiClient from '../api';

interface DashboardProps {
  onNavigate: (view: string) => void;
}

interface ActivityLog {
  action: string;
  endpoint: string;
  timestamp: string;
}

interface Metrics {
  total_requests: number;
  error_rate: number;
  average_latency_ms: number;
  active_sessions: number;
  top_mcp_tools: Array<{ tool_name: string; usage_count: number; success_rate: number; avg_execution_time: number }>;
  teamcenter_usage: { request_count: number; error_rate: number; average_latency_ms: number };
}

interface TrendPoint {
  bucket: string;
  request_count: number;
  error_count: number;
  average_latency_ms: number;
}

interface ErrorLog {
  timestamp: string;
  message: string;
  service: string;
  status_code: number;
  method: string;
  endpoint: string;
}

function formatActivityDescription(action: string, endpoint: string) {
  if (!action) return endpoint || "Unknown Activity";
  if (action === "chat_message_success") return "Sent message to AI Copilot";
  if (action === "chat_message_edit_success") return "Edited AI Copilot message";
  if (action.startsWith("chat_add_item:")) return `AI Tool: Add Item "${action.split(":")[1] || ''}"`;
  if (action.startsWith("chat_update_item:")) return `AI Tool: Update Item "${action.split(":")[1] || ''}"`;
  if (action.startsWith("chat_delete_item:")) return `AI Tool: Delete Item "${action.split(":")[1] || ''}"`;
  if (action.startsWith("chat_search_item:")) return `AI Tool: Search items for "${action.split(":")[1] || ''}"`;
  if (action.startsWith("chat_add_dataset:")) return `AI Tool: Attach Dataset "${action.split(":")[1] || ''}"`;
  if (action.startsWith("chat_add_revision:")) return `AI Tool: Create Revision "${action.split(":")[2] || ''}"`;
  if (action.startsWith("chat_add_workflow:")) return `AI Tool: Initiate Workflow "${action.split(":")[1] || ''}"`;
  if (action.startsWith("item_add")) return "Created item in Teamcenter";
  if (action.startsWith("item_update:")) return `Modified item "${action.split(":")[1] || ''}"`;
  if (action.startsWith("item_delete:")) return `Removed item "${action.split(":")[1] || ''}"`;
  if (action.startsWith("item_search")) return "Searched Teamcenter database";
  if (action.startsWith("workflow_add:")) return `Initiated workflow process "${action.split(":")[1] || ''}"`;
  if (action.startsWith("workflow_approve:")) return `Approved workflow "${action.split(":")[1] || ''}"`;
  if (action.startsWith("login")) return "User logged in";
  if (action.startsWith("signup")) return "New user registered";
  if (action.startsWith("update_settings_success")) return "Modified user settings";
  if (action.startsWith("rename_session")) return "Renamed chat session";
  return action.replace(/_/g, ' ');
}

function getActivityDepartment(endpoint: string) {
  if (!endpoint) return "System";
  if (endpoint.includes("/chat") || endpoint.includes("/api/chat")) return "AI Assistant";
  if (endpoint.includes("/item")) return "Engineering";
  if (endpoint.includes("/dataset") || endpoint.includes("/revision")) return "Data Control";
  if (endpoint.includes("/workflow")) return "Operations";
  if (endpoint.includes("/user")) return "Administration";
  return "General";
}

function formatTimestamp(tsStr: string) {
  if (!tsStr) return "";
  try {
    const parts = tsStr.split(' ');
    if (parts.length < 2) return tsStr;
    const dateParts = parts[0].split('-');
    const timeParts = parts[1].split(':');
    
    const utcDate = new Date(Date.UTC(
      parseInt(dateParts[0]),
      parseInt(dateParts[1]) - 1,
      parseInt(dateParts[2]),
      parseInt(timeParts[0]),
      parseInt(timeParts[1]),
      parseInt(timeParts[2] || '0')
    ));
    
    const local = new Date(utcDate.getTime());
    const now = new Date();
    
    if (local.toDateString() === now.toDateString()) {
      return local.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (local.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    
    return local.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return tsStr;
  }
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const username = useSelector((state: RootState) => state.auth.username);
  
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [alerts, setAlerts] = useState<ErrorLog[]>([]);
  const [totalEvents, setTotalEvents] = useState(1240);
  const [loading, setLoading] = useState(true);

  async function fetchDashboardData() {
    try {
      const [activityRes, metricsRes, trendsRes, errorsRes] = await Promise.all([
        apiClient.get('/api/logs', { params: { page: 1, limit: 5 } }),
        apiClient.get('/api/logs/metrics'),
        apiClient.get('/api/logs/trends', { params: { granularity: 'day' } }),
        apiClient.get('/api/logs/errors', { params: { page: 1, limit: 3 } })
      ]);

      if (activityRes.data?.logs) setActivity(activityRes.data.logs);
      if (activityRes.data?.total) setTotalEvents(activityRes.data.total);
      if (metricsRes.data) setMetrics(metricsRes.data);
      if (trendsRes.data?.points) setTrends(trendsRes.data.points);
      if (errorsRes.data?.logs) setAlerts(errorsRes.data.logs);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Compute 7 days chart data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const chartData = last7Days.map(date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const match = trends.find(p => p.bucket && p.bucket.startsWith(dateStr));
    const count = match ? match.request_count : 0;
    
    const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    return {
      label: weekdays[date.getDay()],
      count: count,
      title: `${weekdays[date.getDay()]} (${month}/${day}): ${count} requests`
    };
  });

  const maxCount = Math.max(...chartData.map(d => d.count), 1);

  // Engagement percentages
  const designPct = metrics ? Math.min(100, Math.max(15, Math.round((metrics.teamcenter_usage.request_count / (metrics.total_requests || 1)) * 100))) : 88;
  const materialPct = metrics ? Math.min(100, Math.max(10, Math.round((metrics.total_requests - metrics.teamcenter_usage.request_count) / (metrics.total_requests || 1) * 100))) : 62;
  const manufacturingPct = metrics ? Math.min(100, Math.max(5, Math.round(100 - (metrics.error_rate || 0)))) : 45;

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      {/* Welcome Greeting */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-gutter">
        <div className="xl:col-span-2 glass-card rounded-xl p-6 flex flex-col justify-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none transition-transform duration-700 group-hover:scale-105">
            <svg viewBox="0 0 100 100" className="w-full h-full stroke-secondary-fixed-dim fill-none stroke-[0.2]">
              <circle cx="50" cy="50" r="40" />
              <circle cx="50" cy="50" r="30" strokeDasharray="2 2" />
              <line x1="10" y1="50" x2="90" y2="50" />
              <line x1="50" y1="10" x2="50" y2="90" />
            </svg>
          </div>
          <div className="relative z-10">
            <span className="text-secondary-fixed-dim font-label-md text-xs uppercase tracking-widest mb-1 block">Industrial Operations</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface mb-2">
              Welcome, <span className="capitalize">{username || 'Engineer'}</span>.
            </h2>
            <p className="text-on-surface-variant max-w-xl text-sm leading-relaxed mb-6">
              The PLM AI Assistant is synchronized. Database tables reflect {totalEvents.toLocaleString()} lifecycle events. Check BOM changes, workflow statuses, and tool actions below.
            </p>
            <div className="flex flex-wrap gap-sm">
              <button 
                className="bg-primary-container text-primary-fixed-dim px-4 py-2 rounded-lg font-bold border border-primary/20 hover:bg-primary/10 transition-all flex items-center gap-2 text-xs"
                onClick={() => onNavigate('copilot')}
              >
                <span className="material-symbols-outlined text-sm">smart_toy</span> Consult AI Copilot
              </button>
              <button 
                className="bg-secondary-container text-on-secondary-container px-4 py-2 rounded-lg font-bold hover:brightness-110 transition-all flex items-center gap-2 text-xs cyan-glow"
                onClick={() => onNavigate('search')}
              >
                <span className="material-symbols-outlined text-sm">search</span> Search Teamcenter
              </button>
            </div>
          </div>
        </div>

        {/* Active Alerts Panel */}
        <div className="glass-card rounded-xl p-5 flex flex-col space-y-sm">
          <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed-dim text-lg">warning</span>
            Active Alerts
          </h3>
          <div className="space-y-sm overflow-y-auto max-h-[160px] pr-xs flex-1">
            {alerts.length > 0 ? (
              alerts.slice(0, 3).map((alert, idx) => (
                <div key={idx} className="p-3 bg-error-container/10 border-l-4 border-error rounded flex gap-2">
                  <span className="material-symbols-outlined text-error text-sm">error</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-on-error-container truncate">{alert.message || 'Error encountered'}</p>
                    <p className="text-on-surface-variant text-[11px] mt-0.5 truncate">
                      {alert.service.toUpperCase()} {alert.method} {alert.endpoint} ({formatTimestamp(alert.timestamp)})
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 bg-tertiary-container/10 border-l-4 border-tertiary rounded flex gap-2">
                <span className="material-symbols-outlined text-tertiary text-sm">check_circle</span>
                <div>
                  <p className="font-bold text-xs text-on-tertiary-container">System Fully Operational</p>
                  <p className="text-on-surface-variant text-[11px] mt-0.5">No critical issues or tolerance offsets detected.</p>
                </div>
              </div>
            )}
          </div>
          <button 
            className="mt-auto w-full text-center text-xs font-bold text-secondary-fixed-dim hover:underline py-1"
            onClick={() => onNavigate('security')}
          >
            View Security Audits
          </button>
        </div>
      </section>

      {/* Metrics Bento Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        {/* SVG Analytics Chart */}
        <div className="lg:col-span-8 glass-card rounded-xl p-5 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-on-surface">Workflow Execution Trends</h3>
            <div className="flex gap-1 bg-surface-container-low p-1 rounded-lg">
              <button className="px-2.5 py-0.5 text-[10px] font-bold bg-secondary-container/20 text-secondary-fixed-dim rounded">7d</button>
              <button className="px-2.5 py-0.5 text-[10px] font-medium text-on-surface-variant" onClick={() => onNavigate('logs')}>30d</button>
            </div>
          </div>
          
          <div className="h-44 w-full flex items-end gap-3 px-4 relative mt-2">
            <div className="absolute inset-0 flex flex-col justify-between opacity-5 py-2 pointer-events-none">
              <div className="border-b border-white w-full"></div>
              <div className="border-b border-white w-full"></div>
              <div className="border-b border-white w-full"></div>
            </div>
            {/* Dynamic Chart Bars */}
            {chartData.map((day, idx) => {
              const heightPct = day.count === 0 ? '3%' : `${Math.round((day.count / maxCount) * 85 + 10)}%`;
              const isMax = day.count === maxCount && day.count > 0;
              return (
                <div 
                  key={idx} 
                  className={`flex-1 transition-all rounded-t ${isMax ? 'bg-secondary-fixed-dim/40 hover:bg-secondary-fixed-dim/60 cyan-glow' : 'bg-primary/20 hover:bg-primary/40'}`}
                  style={{ height: heightPct }}
                  title={day.title}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-on-surface-variant mt-2 font-mono px-4">
            {chartData.map((day, idx) => (
              <span key={idx}>{day.label}</span>
            ))}
          </div>
        </div>

        {/* AI engagement breakdown */}
        <div className="lg:col-span-4 glass-card rounded-xl p-5">
          <h3 className="text-base font-bold text-on-surface mb-3">AI Agent Engagement</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-on-surface font-medium">Design Engineering</span>
                <span className="text-secondary-fixed-dim font-bold">{designPct}%</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-1.5">
                <div className="bg-secondary-fixed-dim h-full rounded-full transition-all duration-500" style={{ width: `${designPct}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-on-surface font-medium">Material Science</span>
                <span className="text-primary font-bold">{materialPct}%</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-1.5">
                <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${materialPct}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-on-surface font-medium">Manufacturing</span>
                <span className="text-tertiary font-bold">{manufacturingPct}%</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-1.5">
                <div className="bg-tertiary h-full rounded-full transition-all duration-500" style={{ width: `${manufacturingPct}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Queries Table */}
      <section className="glass-card rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="px-5 py-3 border-b border-outline-variant/10 bg-surface-container-low/30">
          <h3 className="text-base font-bold text-on-surface">Recent System Activity</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-surface-variant/20 text-on-surface-variant border-b border-outline-variant/10 font-bold uppercase tracking-wider">
                <th className="p-4">Event Description</th>
                <th className="p-4">Department</th>
                <th className="p-4">Status</th>
                <th className="p-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {activity.length > 0 ? (
                activity.map((log, idx) => (
                  <tr key={idx} className="hover:bg-surface-variant/20 transition-colors">
                    <td className="p-4 font-medium text-on-surface">{formatActivityDescription(log.action, log.endpoint)}</td>
                    <td className="p-4">{getActivityDepartment(log.endpoint)}</td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 bg-tertiary-container/30 text-tertiary rounded font-bold uppercase text-[9px]">Verified</span>
                    </td>
                    <td className="p-4 text-on-surface-variant">{formatTimestamp(log.timestamp)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-on-surface-variant italic">No system activity logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
