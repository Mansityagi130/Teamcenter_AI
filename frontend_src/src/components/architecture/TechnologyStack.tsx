import React from 'react';
import { TechnologyStackItem } from './architectureDashboardData';

interface TechnologyStackProps {
  stackItems: TechnologyStackItem[];
}

export function TechnologyStack({ stackItems }: TechnologyStackProps) {
  return (
    <div className="glass-card rounded-3xl border border-outline-variant/10 p-6 bg-surface/80">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-on-surface">Technology Stack</h2>
          <p className="text-sm text-on-surface-variant">Core architecture and infrastructure layers.</p>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-secondary-fixed-dim">Enterprise</span>
      </div>
      <div className="grid gap-3">
        {stackItems.map((tech) => (
          <div key={tech.title} className="rounded-3xl border border-outline-variant/10 bg-surface-container/70 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-on-surface">{tech.title}</p>
              <span className="text-[10px] uppercase tracking-[0.2em] text-secondary-fixed-dim">{tech.status}</span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">{tech.purpose}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
