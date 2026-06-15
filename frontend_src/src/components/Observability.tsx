import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import apiClient from '../api';
import { addToast } from '../store';

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

export function Observability() {
  const dispatch = useDispatch();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    query: '',
    status: 'all',
    service: 'all',
    tool: 'all',
    startDate: '',
    endDate: '',
  });

  async function fetchObservability() {
    setLoading(true);
    try {
      const [metricsRes, trendsRes, errorsRes] = await Promise.all([
        apiClient.get('/api/logs/metrics', {
          params: {
            start_date: filters.startDate || undefined,
            end_date: filters.endDate || undefined,
            service: filters.service !== 'all' ? filters.service : undefined,
          },
        }),
        apiClient.get('/api/logs/trends', {
          params: {
            granularity: 'hour',
            start_date: filters.startDate || undefined,
            end_date: filters.endDate || undefined,
            service: filters.service !== 'all' ? filters.service : undefined,
          },
        }),
        apiClient.get('/api/logs/errors', {
          params: {
            page: 1,
            limit: 8,
            query: filters.query || undefined,
            status: filters.status !== 'all' ? filters.status : undefined,
            service: filters.service !== 'all' ? filters.service : undefined,
            tool: filters.tool !== 'all' ? filters.tool : undefined,
            start_date: filters.startDate || undefined,
            end_date: filters.endDate || undefined,
          },
        }),
      ]);

      setMetrics(metricsRes.data);
      setTrends(trendsRes.data.points || []);
      setErrors(errorsRes.data.logs || []);
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Failed to load monitoring data', type: 'error' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchObservability();
  }, []);

  const latencyPath = trends.length > 0 ? trends.map((point, index) => `${index * 40},${120 - Math.min(point.average_latency_ms, 120)} `).join(' ') : '';
  const errorPath = trends.length > 0 ? trends.map((point, index) => `${index * 40},${120 - Math.min(point.error_count * 2, 120)} `).join(' ') : '';

  function updateFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function handleRefresh() {
    fetchObservability();
    dispatch(addToast({ message: 'Observability dashboard refreshed', type: 'success' }));
  }

  const serviceOptions = ['all', 'http', 'teamcenter', 'mcp'];
  const statusOptions = ['all', 'error', 'success'];

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      <div className="pb-sm border-b border-outline-variant/10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-sm">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface">Observability & Activity Monitoring</h2>
          <p className="text-on-surface-variant text-xs mt-0.5">Enterprise telemetry for request throughput, API errors, Teamcenter usage, and MCP tool performance.</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary-fixed-dim text-primary-container rounded-lg font-bold text-xs hover:opacity-90 active:scale-95 transition-all shadow-md outline-none"
          disabled={loading}
        >
          <span className="material-symbols-outlined text-sm">refresh</span> Refresh Dashboard
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-md">
        <div className="glass-card p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">Total Requests</p>
            <h3 className="text-xl font-bold text-secondary-fixed-dim">{metrics?.total_requests ?? '—'}</h3>
            <p className="text-[9px] text-on-surface-variant mt-0.5">Traffic across API and Teamcenter layers</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-secondary-fixed-dim/10 flex items-center justify-center text-secondary-fixed-dim">
            <span className="material-symbols-outlined">insights</span>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">Active Sessions</p>
            <h3 className="text-xl font-bold text-on-surface">{metrics?.active_sessions ?? '—'}</h3>
            <p className="text-[9px] text-on-surface-variant mt-0.5">Unique active chat sessions</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-surface-variant flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined">group</span>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">Error Rate</p>
            <h3 className="text-xl font-bold text-tertiary">{metrics ? `${metrics.error_rate}%` : '—'}</h3>
            <p className="text-[9px] text-on-surface-variant mt-0.5">Percent of failed requests</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined">error_outline</span>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-1">Average Response Time</p>
            <h3 className="text-xl font-bold text-tertiary">{metrics ? `${metrics.average_latency_ms} ms` : '—'}</h3>
            <p className="text-[9px] text-on-surface-variant mt-0.5">Request latency across the platform</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined">speed</span>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-5 border border-outline-variant/10">
        <div className="flex flex-col xl:flex-row justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-on-surface">Filter telemetry</h3>
            <p className="text-[10px] text-on-surface-variant mt-1">Narrow logs by service, tool, date range and request status.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 w-full xl:w-auto">
            <select
              value={filters.service}
              onChange={(e) => updateFilter('service', e.target.value)}
              className="rounded-lg border border-outline-variant/20 bg-background px-3 py-2 text-xs"
            >
              {serviceOptions.map((option) => (
                <option key={option} value={option}>{option === 'all' ? 'All Services' : option}</option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="rounded-lg border border-outline-variant/20 bg-background px-3 py-2 text-xs"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>{option === 'all' ? 'All Status' : option}</option>
              ))}
            </select>
            <input
              type="text"
              value={filters.query}
              onChange={(e) => updateFilter('query', e.target.value)}
              placeholder="Search path, error, user"
              className="rounded-lg border border-outline-variant/20 bg-background px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={filters.tool}
              onChange={(e) => updateFilter('tool', e.target.value)}
              placeholder="Tool name"
              className="rounded-lg border border-outline-variant/20 bg-background px-3 py-2 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 w-full xl:w-[360px]">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => updateFilter('startDate', e.target.value)}
              className="rounded-lg border border-outline-variant/20 bg-background px-3 py-2 text-xs"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => updateFilter('endDate', e.target.value)}
              className="rounded-lg border border-outline-variant/20 bg-background px-3 py-2 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 border border-outline-variant/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Request Latency Trend</p>
                <h4 className="text-sm font-bold text-on-surface">Average latency per bucket</h4>
              </div>
              <span className="text-[10px] text-on-surface-variant">Hourly view</span>
            </div>
            <div className="relative h-40">
              <svg viewBox="0 0 320 140" className="w-full h-full">
                <path d={latencyPath ? `M ${latencyPath}` : 'M0,120 L320,120'} fill="none" stroke="#00dbe7" strokeWidth="2.5" />
                <path d={errorPath ? `M ${errorPath}` : 'M0,120 L320,120'} fill="none" stroke="#ff5252" strokeWidth="2.5" />
              </svg>
            </div>
          </div>
          <div className="w-full lg:w-[320px] grid gap-3">
            <div className="glass-card rounded-xl p-4 border border-outline-variant/10">
              <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Teamcenter Usage</p>
              <div className="mt-3 text-sm font-bold text-on-surface">{metrics?.teamcenter_usage?.request_count ?? '—'} requests</div>
              <p className="text-[10px] text-on-surface-variant mt-2">Error rate {metrics?.teamcenter_usage?.error_rate ?? 0}%</p>
              <p className="text-[10px] text-on-surface-variant">Average latency {metrics?.teamcenter_usage?.average_latency_ms ?? 0} ms</p>
            </div>
            <div className="glass-card rounded-xl p-4 border border-outline-variant/10">
              <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Top MCP Tools</p>
              <div className="mt-3 space-y-2 text-xs text-on-surface-variant">
                {metrics?.top_mcp_tools?.length ? (
                  metrics.top_mcp_tools.map((tool) => (
                    <div key={tool.tool_name} className="flex justify-between gap-2">
                      <span>{tool.tool_name}</span>
                      <span className="font-bold text-on-surface">{tool.usage_count}</span>
                    </div>
                  ))
                ) : (
                  <p className="italic">No tool activity yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-gutter">
        <div className="glass-card rounded-xl p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-on-surface">Recent Error Events</h3>
            <span className="text-[10px] text-on-surface-variant">Latest failures and diagnostics</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-surface-variant/20 text-on-surface-variant font-bold border-b border-outline-variant/10 uppercase tracking-wider">
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Service</th>
                  <th className="p-3">Path</th>
                  <th className="p-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {errors.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-on-surface-variant italic">No error events found.</td>
                  </tr>
                )}
                {errors.map((log, index) => (
                  <tr key={index} className="hover:bg-surface-variant/20 transition-colors border-b border-outline-variant/5">
                    <td className="p-3 font-mono text-on-surface-variant">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3">{log.service || 'application'}</td>
                    <td className="p-3 font-mono truncate max-w-[180px]">{log.path}</td>
                    <td className="p-3 text-on-surface-variant truncate max-w-[220px]">{log.error_message || 'Unknown error'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-card rounded-xl p-5 border border-outline-variant/10">
          <h3 className="text-sm font-bold text-on-surface">Latest Requests</h3>
          <div className="mt-4 space-y-3 text-xs text-on-surface-variant">
            {trends.slice(-5).reverse().map((point) => (
              <div key={point.bucket} className="flex justify-between gap-2 border-b border-outline-variant/10 pb-2">
                <span>{new Date(point.bucket).toLocaleString()}</span>
                <span>{point.request_count} reqs</span>
              </div>
            ))}
            {!trends.length && <p className="italic">No request metrics available yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
