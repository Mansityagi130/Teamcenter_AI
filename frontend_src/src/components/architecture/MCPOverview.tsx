import React from 'react';
import { ToolStats } from './architectureDashboardData';

interface MCPOverviewProps {
  activeModel: string | null;
  toolStats: ToolStats;
}

export function MCPOverview({ activeModel, toolStats }: MCPOverviewProps) {
  return (
    <div className="glass-card rounded-3xl border border-outline-variant/10 p-6 bg-surface/80">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-on-surface">MCP Layer Overview</h2>
          <p className="text-sm text-on-surface-variant">AI model coordination, tool health and service status.</p>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-secondary-fixed-dim">AI Ops</span>
      </div>
      <div className="space-y-4">
        <div className="rounded-3xl bg-surface-container/80 p-4 border border-outline-variant/10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">AI Model</p>
          <p className="text-sm font-semibold text-on-surface">{activeModel?.toUpperCase() || 'Gemini'}</p>
        </div>
        <div className="rounded-3xl bg-surface-container/80 p-4 border border-outline-variant/10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">Available Tools</p>
          <p className="text-sm font-semibold text-on-surface">{toolStats.totalTools} tools</p>
        </div>
        <div className="rounded-3xl bg-surface-container/80 p-4 border border-outline-variant/10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">Tool Categories</p>
          <div className="flex flex-wrap gap-2">
            {toolStats.categories.slice(0, 4).map((category) => (
              <span key={category} className="rounded-full bg-primary-container/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
                {category}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-3xl bg-surface-container/80 p-4 border border-outline-variant/10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">Tool Health</p>
          <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <span className="h-2.5 w-2.5 rounded-full bg-tertiary" />
            Operational
          </div>
        </div>
      </div>
    </div>
  );
}
