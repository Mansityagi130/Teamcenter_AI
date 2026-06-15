import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { ErrorBoundary } from './ErrorBoundary';
import { useArchitectureDashboard } from '../hooks/useArchitectureDashboard';
import { ArchitectureOverview } from './architecture/ArchitectureOverview';
import { KPIBoard } from './architecture/KPIBoard';
import { RequestLifecycle } from './architecture/RequestLifecycle';
import { MCPOverview } from './architecture/MCPOverview';
import { TeamcenterIntegration } from './architecture/TeamcenterIntegration';
import { TechnologyStack } from './architecture/TechnologyStack';
import { ArchitectureWalkthrough } from './architecture/ArchitectureWalkthrough';

export function SystemArchitectureDashboard({ onNavigate }: { onNavigate: (view: string) => void }) {
  const username = useSelector((state: RootState) => state.auth.username);
  const {
    loading,
    error,
    health,
    toolStats,
    teamcenterMap,
    walkthroughIndex,
    isWalkthroughActive,
    architectureNodes,
    requestSteps,
    metrics,
    activeModel,
    walkthroughSteps,
    handleWalkthrough,
    techStack,
  } = useArchitectureDashboard();

  return (
    <ErrorBoundary>
      <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.4em] text-secondary-fixed-dim">System Architecture</p>
            <h1 className="text-3xl md:text-4xl font-extrabold text-on-surface">Enterprise Architecture Dashboard</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-on-surface-variant">
              A guided operational view of the PLM AI Assistant stack, combining live health telemetry with workflow, MCP, and Teamcenter integration details.
              {username ? ` Welcome back, ${username}.` : ''}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleWalkthrough}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 bg-secondary-container/10 border border-secondary-fixed-dim/20 text-secondary-fixed-dim text-sm font-semibold hover:bg-secondary-container/20 transition-all outline-none"
            >
              <span className="material-symbols-outlined">tour</span>
              {isWalkthroughActive ? 'Stop Walkthrough' : 'Show Architecture Walkthrough'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('mcp')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 bg-primary-container text-primary-fixed-dim text-sm font-semibold hover:bg-primary/90 transition-all outline-none"
            >
              <span className="material-symbols-outlined">settings_ethernet</span>
              Open MCP Explorer
            </button>
          </div>
        </section>

        <ArchitectureWalkthrough
          isWalkthroughActive={isWalkthroughActive}
          walkthroughIndex={walkthroughIndex}
          walkthroughSteps={walkthroughSteps}
          handleWalkthrough={handleWalkthrough}
        />

        <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter">
          <div className="xl:col-span-8">
            <ArchitectureOverview
              architectureNodes={architectureNodes}
              health={health}
              toolStats={toolStats}
              loading={loading}
              walkthroughIndex={walkthroughIndex}
            />
          </div>

          <aside className="xl:col-span-4 flex flex-col gap-4">
            <KPIBoard metrics={metrics} />
            <TechnologyStack stackItems={techStack} />
          </aside>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-7 gap-gutter">
          <div className="xl:col-span-4">
            <RequestLifecycle requestSteps={requestSteps} walkthroughIndex={walkthroughIndex} />
          </div>
          <div className="xl:col-span-3 flex flex-col gap-4">
            <MCPOverview activeModel={activeModel} toolStats={toolStats} />
            <TeamcenterIntegration teamcenterMap={teamcenterMap} />
          </div>
        </section>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="glass-card rounded-3xl border border-outline-variant/10 p-6 bg-surface/80 animate-pulse h-48" />
            ))}
          </div>
        ) : (
          error && (
            <div className="rounded-3xl border border-warning/30 bg-warning-container/10 p-5 text-sm text-warning">
              {error}
            </div>
          )
        )}
      </div>
    </ErrorBoundary>
  );
}
