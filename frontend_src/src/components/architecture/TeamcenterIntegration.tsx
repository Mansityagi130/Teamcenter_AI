import React from 'react';
import { TeamcenterNode, statusBadgeColor } from './architectureDashboardData';

interface TeamcenterIntegrationProps {
  teamcenterMap: TeamcenterNode[];
}

export function TeamcenterIntegration({ teamcenterMap }: TeamcenterIntegrationProps) {
  return (
    <div className="glass-card rounded-3xl border border-outline-variant/10 p-6 bg-surface/80">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-on-surface">Teamcenter Integration</h2>
          <p className="text-sm text-on-surface-variant">Key client and backend integration points.</p>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-secondary-fixed-dim">PLM</span>
      </div>
      <div className="grid gap-3">
        {teamcenterMap.map((item) => (
          <div key={item.label} className="rounded-3xl border border-outline-variant/10 bg-surface-container/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-on-surface">{item.label}</p>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{item.description}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${statusBadgeColor(item.health)}`}>
                {item.health}
              </span>
            </div>
            <p className="mt-3 text-[11px] text-on-surface-variant">Last activity: {item.lastActivity}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
