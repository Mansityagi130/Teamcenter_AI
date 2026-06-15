import React, { useMemo, useState } from 'react';
import { ArchitectureNode, HealthSource, getStatusLabel, statusBadgeColor } from './architectureDashboardData';

interface ArchitectureFlowDiagramProps {
  architectureNodes: ArchitectureNode[];
  health: HealthSource;
  walkthroughIndex: number | null;
}

const statusTone: Record<string, { dot: string; ring: string; label: string }> = {
  Healthy: {
    dot: 'bg-tertiary',
    ring: 'shadow-[0_0_0_4px_hsl(var(--md-sys-color-tertiary)/0.14),0_0_18px_hsl(var(--md-sys-color-tertiary)/0.45)]',
    label: 'Operational',
  },
  Degraded: {
    dot: 'bg-warning',
    ring: 'shadow-[0_0_0_4px_hsl(var(--md-sys-color-warning)/0.14),0_0_18px_hsl(var(--md-sys-color-warning)/0.45)]',
    label: 'Needs attention',
  },
  Offline: {
    dot: 'bg-error',
    ring: 'shadow-[0_0_0_4px_hsl(var(--md-sys-color-error)/0.14),0_0_18px_hsl(var(--md-sys-color-error)/0.45)]',
    label: 'Offline',
  },
  Unknown: {
    dot: 'bg-outline-variant',
    ring: 'shadow-[0_0_0_4px_hsl(var(--md-sys-color-outline-variant)/0.16)]',
    label: 'Telemetry pending',
  },
};

function normalizeStatus(status: string) {
  if (['Healthy', 'Degraded', 'Offline', 'Unknown'].includes(status)) {
    return status;
  }

  return getStatusLabel(status);
}

export function ArchitectureFlowDiagram({ architectureNodes, health, walkthroughIndex }: ArchitectureFlowDiagramProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const nodes = useMemo(
    () =>
      architectureNodes.map((node) => ({
        ...node,
        status: normalizeStatus(node.status),
      })),
    [architectureNodes]
  );

  const activeIndex = hoveredNode ? nodes.findIndex((node) => node.id === hoveredNode) : walkthroughIndex;
  const activeNode = activeIndex !== null && activeIndex >= 0 ? nodes[activeIndex] : null;
  const healthyCount = nodes.filter((node) => node.status === 'Healthy').length;
  const overallStatus = [health.backend, health.api, health.database, health.teamcenter].some((value) => getStatusLabel(value) === 'Degraded')
    ? 'Attention'
    : 'Nominal';

  return (
    <div className="rounded-3xl border border-outline-variant/10 bg-surface/80 p-4 shadow-xl shadow-scrim/5 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-bold text-on-surface">Connected Architecture Flow</h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            Live service chain from the React experience through AI orchestration, MCP execution, Teamcenter APIs, and PLM data.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <div className="rounded-2xl border border-outline-variant/10 bg-surface-container px-4 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">Flow Health</p>
            <p className="mt-1 text-sm font-bold text-on-surface">{healthyCount}/{nodes.length} Healthy</p>
          </div>
          <div className="rounded-2xl border border-outline-variant/10 bg-surface-container px-4 py-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">Status</p>
            <p className="mt-1 text-sm font-bold text-on-surface">{overallStatus}</p>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-outline-variant/10 bg-background/95 px-3 py-5 sm:px-6">
        <svg
          className="pointer-events-none absolute inset-x-0 top-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="architecture-flow-line" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--md-sys-color-secondary-fixed-dim))" stopOpacity="0.25" />
              <stop offset="50%" stopColor="hsl(var(--md-sys-color-secondary-fixed-dim))" stopOpacity="0.9" />
              <stop offset="100%" stopColor="hsl(var(--md-sys-color-secondary-fixed-dim))" stopOpacity="0.25" />
            </linearGradient>
            <marker id="architecture-arrow-head" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
              <path d="M0,0 L0,6 L6,3 z" fill="hsl(var(--md-sys-color-secondary-fixed-dim))" />
            </marker>
          </defs>

          <line x1="50" x2="50" y1="7" y2="93" stroke="hsl(var(--md-sys-color-outline-variant))" strokeOpacity="0.22" strokeWidth="0.28" />
          <line
            x1="50"
            x2="50"
            y1="7"
            y2="93"
            stroke="url(#architecture-flow-line)"
            strokeDasharray="2 1.6"
            strokeLinecap="round"
            strokeWidth="0.44"
            markerEnd="url(#architecture-arrow-head)"
            className="architecture-flow-dash"
          />
          <circle r="1.1" fill="hsl(var(--md-sys-color-secondary-fixed-dim))" opacity="0.9">
            <animateMotion dur="3s" repeatCount="indefinite" path="M50 7 L50 93" />
          </circle>
        </svg>

        <div className="relative mx-auto flex max-w-3xl flex-col gap-5">
          {nodes.map((node, index) => {
            const tone = statusTone[node.status] || statusTone.Unknown;
            const isActive = activeIndex === index;

            return (
              <div key={node.id} className="relative flex justify-center">
                <button
                  type="button"
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onFocus={() => setHoveredNode(node.id)}
                  onBlur={() => setHoveredNode(null)}
                  className={`group relative grid w-full max-w-[620px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border bg-surface/95 p-4 text-left shadow-lg outline-none transition-all duration-300 sm:gap-4 sm:p-5 ${
                    isActive
                      ? 'border-secondary-fixed-dim shadow-secondary-fixed-dim/20 ring-2 ring-secondary-fixed-dim/20'
                      : 'border-outline-variant/10 hover:border-secondary-fixed-dim/50 hover:shadow-secondary-fixed-dim/10'
                  }`}
                  aria-describedby={`architecture-tooltip-${node.id}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/10 bg-surface-container text-sm font-black text-secondary-fixed-dim">
                    {index + 1}
                  </span>

                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-on-surface sm:text-base">{node.name}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-on-surface-variant sm:text-sm">{node.purpose}</span>
                    <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">{node.tech}</span>
                  </span>

                  <span className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`h-3 w-3 rounded-full ${tone.dot} ${tone.ring} architecture-health-pulse`} />
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${statusBadgeColor(node.status)}`}>
                      {node.status}
                    </span>
                  </span>

                  <span
                    id={`architecture-tooltip-${node.id}`}
                    role="tooltip"
                    className="pointer-events-none absolute left-1/2 top-[calc(100%+0.7rem)] z-20 hidden w-[min(320px,calc(100vw-3rem))] -translate-x-1/2 rounded-2xl border border-outline-variant/20 bg-surface p-3 text-xs text-on-surface-variant shadow-2xl group-hover:block group-focus:block"
                  >
                    <span className="block font-bold text-on-surface">{node.name}</span>
                    <span className="mt-1 block leading-relaxed">{node.purpose}</span>
                    <span className="mt-2 block font-semibold text-secondary-fixed-dim">{tone.label} via {node.tech}</span>
                  </span>
                </button>

                {index < nodes.length - 1 && (
                  <div className="absolute -bottom-5 left-1/2 z-10 flex h-5 -translate-x-1/2 items-center justify-center text-secondary-fixed-dim">
                    <span className="material-symbols-outlined text-[22px] architecture-arrow-bob">arrow_downward</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container/70 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Selected Layer</p>
          <p className="mt-2 text-sm font-bold text-on-surface">{activeNode?.name || 'Hover a layer to inspect details'}</p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            {activeNode ? `${activeNode.purpose} Technology: ${activeNode.tech}.` : 'Each service node exposes its purpose, technology, and live health posture.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container/70 p-4 text-xs text-on-surface-variant">
          {Object.entries(statusTone).slice(0, 3).map(([status, tone]) => (
            <span key={status} className="inline-flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
              {status}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes architectureDash {
          to {
            stroke-dashoffset: -7.2;
          }
        }

        @keyframes architectureArrowBob {
          0%, 100% {
            transform: translateY(-1px);
            opacity: 0.72;
          }
          50% {
            transform: translateY(3px);
            opacity: 1;
          }
        }

        @keyframes architectureHealthPulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.18);
          }
        }

        .architecture-flow-dash {
          animation: architectureDash 1.4s linear infinite;
        }

        .architecture-arrow-bob {
          animation: architectureArrowBob 1.45s ease-in-out infinite;
        }

        .architecture-health-pulse {
          animation: architectureHealthPulse 2.2s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .architecture-flow-dash,
          .architecture-arrow-bob,
          .architecture-health-pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
