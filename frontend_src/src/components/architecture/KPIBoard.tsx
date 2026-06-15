import React from 'react';
import { Metrics, formatNumber } from './architectureDashboardData';

interface KPIBoardProps {
  metrics: Metrics;
}

export function KPIBoard({ metrics }: KPIBoardProps) {
  return (
    <div className="glass-card rounded-3xl border border-outline-variant/10 p-6 bg-surface/80">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-on-surface">Live KPI Board</h3>
          <p className="text-xs text-on-surface-variant">Executive metrics for interview-ready review.</p>
        </div>
        <span className="text-xs font-semibold text-on-surface-variant">Updated now</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-surface-container/80 p-4 border border-outline-variant/10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">Total API Calls</p>
          <p className="text-2xl font-bold text-on-surface mt-3">{formatNumber(metrics.totalApiCalls)}</p>
        </div>
        <div className="rounded-3xl bg-surface-container/80 p-4 border border-outline-variant/10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">MCP Executions</p>
          <p className="text-2xl font-bold text-on-surface mt-3">{formatNumber(metrics.totalMcpExecutions)}</p>
        </div>
        <div className="rounded-3xl bg-surface-container/80 p-4 border border-outline-variant/10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">Avg Response Time</p>
          <p className="text-2xl font-bold text-on-surface mt-3">{metrics.averageResponseTime} ms</p>
        </div>
        <div className="rounded-3xl bg-surface-container/80 p-4 border border-outline-variant/10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">System Health</p>
          <p className="text-2xl font-bold text-on-surface mt-3">{metrics.systemHealth}</p>
        </div>
      </div>
    </div>
  );
}
