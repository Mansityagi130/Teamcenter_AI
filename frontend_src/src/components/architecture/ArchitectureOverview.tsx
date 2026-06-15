import React from 'react';
import { ArchitectureNode, HealthSource, ToolStats, formatNumber, getStatusLabel, statusBadgeColor } from './architectureDashboardData';
import { ArchitectureFlowDiagram } from './ArchitectureFlowDiagram';

interface ArchitectureOverviewProps {
  architectureNodes: ArchitectureNode[];
  health: HealthSource;
  toolStats: ToolStats;
  loading: boolean;
  walkthroughIndex: number | null;
}

export function ArchitectureOverview({ architectureNodes, health, toolStats, loading, walkthroughIndex }: ArchitectureOverviewProps) {
  return (
    <div className="glass-card rounded-3xl border border-outline-variant/10 p-6 bg-surface/80 xl:pb-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-on-surface">System Architecture Overview</h2>
            <p className="text-sm text-on-surface-variant max-w-2xl">
              Visualize the end-to-end component chain from user interaction to Teamcenter PLM data.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-outline-variant/10 bg-surface-container px-4 py-2 text-xs font-semibold text-on-surface-variant">
            <span className="material-symbols-outlined text-base">pulse</span>
            {loading ? 'Synchronizing telemetry...' : 'Live status snapshot'}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <ArchitectureFlowDiagram
              architectureNodes={architectureNodes}
              health={health}
              walkthroughIndex={walkthroughIndex}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-outline-variant/10 bg-surface/80 p-5">
                <h3 className="text-sm font-bold text-on-surface mb-3">Architecture Health Summary</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Backend', value: health.backend },
                    { label: 'API Layer', value: health.api },
                    { label: 'Database', value: health.database },
                    { label: 'Teamcenter', value: health.teamcenter },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-sm">
                      <span className="text-on-surface-variant">{item.label}</span>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusBadgeColor(getStatusLabel(item.value))}`}>
                        {getStatusLabel(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-outline-variant/10 bg-surface/80 p-5">
                <h3 className="text-sm font-bold text-on-surface mb-3">MCP Layer Snapshot</h3>
                <div className="grid grid-cols-2 gap-3 text-sm text-on-surface-variant">
                  <div className="rounded-3xl bg-surface-container/80 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-2">Total Tools</p>
                    <p className="text-xl font-bold text-on-surface">{formatNumber(toolStats.totalTools)}</p>
                  </div>
                  <div className="rounded-3xl bg-surface-container/80 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-2">Active Tools</p>
                    <p className="text-xl font-bold text-on-surface">{formatNumber(toolStats.activeTools)}</p>
                  </div>
                  <div className="rounded-3xl bg-surface-container/80 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-2">Success Rate</p>
                    <p className="text-xl font-bold text-on-surface">{toolStats.successRate}%</p>
                  </div>
                  <div className="rounded-3xl bg-surface-container/80 p-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-2">Avg Exec</p>
                    <p className="text-xl font-bold text-on-surface">{toolStats.averageExecutionMs} ms</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
