import React from 'react';
import { RequestStep, statusBadgeColor } from './architectureDashboardData';

interface RequestLifecycleProps {
  requestSteps: RequestStep[];
  walkthroughIndex: number | null;
}

export function RequestLifecycle({ requestSteps, walkthroughIndex }: RequestLifecycleProps) {
  const isStepHighlighted = (index: number) => walkthroughIndex === index;

  return (
    <div className="glass-card rounded-3xl border border-outline-variant/10 p-6 bg-surface/80">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-on-surface">Request Lifecycle</h2>
          <p className="text-sm text-on-surface-variant">Step-based execution flow from prompt to rendered answer.</p>
        </div>
        <span className="text-xs uppercase tracking-[0.2em] text-secondary-fixed-dim">Realtime</span>
      </div>
      <div className="space-y-4">
        {requestSteps.map((step, index) => (
          <div
            key={step.title}
            className={`rounded-3xl border p-4 transition-all ${
              isStepHighlighted(index)
                ? 'border-secondary-fixed-dim bg-secondary-container/10 shadow-lg'
                : 'border-outline-variant/10 bg-surface-container/80'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-on-surface">{step.title}</p>
                <p className="text-xs text-on-surface-variant mt-1">{index === 0 ? 'Source prompt begins here.' : 'System step continues.'}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${statusBadgeColor(step.status === 'Success' ? 'Healthy' : step.status)}`}>
                {step.status}
              </span>
            </div>
            {index < requestSteps.length - 1 && (
              <div className="mt-4 flex items-center gap-2 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-sm">arrow_downward</span>
                <span>Continues to next layer</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
