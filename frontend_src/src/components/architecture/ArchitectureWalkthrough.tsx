import React from 'react';
import { WalkthroughStep } from './architectureDashboardData';

interface ArchitectureWalkthroughProps {
  isWalkthroughActive: boolean;
  walkthroughIndex: number | null;
  walkthroughSteps: WalkthroughStep[];
  handleWalkthrough: () => void;
}

export function ArchitectureWalkthrough({ isWalkthroughActive, walkthroughIndex, walkthroughSteps, handleWalkthrough }: ArchitectureWalkthroughProps) {
  const activeStep = walkthroughSteps[walkthroughIndex ?? 0];

  return (
    <div className="glass-card rounded-3xl border border-outline-variant/10 bg-surface/80 p-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-secondary-fixed-dim">Architecture Walkthrough</p>
          <h2 className="text-2xl font-extrabold text-on-surface">Guided system flow with AI-enabled operations.</h2>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            Activate the walkthrough to highlight each layer in the production architecture from frontend to PLM data.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={handleWalkthrough}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 bg-secondary-container/10 border border-secondary-fixed-dim/20 text-secondary-fixed-dim text-sm font-semibold hover:bg-secondary-container/20 transition-all outline-none"
          >
            <span className="material-symbols-outlined">tour</span>
            {isWalkthroughActive ? 'Stop Walkthrough' : 'Show Architecture Walkthrough'}
          </button>
          <div className="rounded-3xl border border-outline-variant/10 bg-surface-container/80 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-secondary-fixed-dim">Current step</p>
            <p className="mt-3 text-sm font-semibold text-on-surface">{activeStep.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">{activeStep.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
