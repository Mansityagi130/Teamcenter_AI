import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import apiClient from '../api';
import { RootState } from '../store';
import {
  DEFAULT_TEAMCENTER_MAP,
  DEFAULT_TOOL_STATS,
  WALKTHROUGH_STEPS,
  getStatusLabel,
  TECHNOLOGY_STACK,
  ToolDatum,
  ToolStats,
  HealthSource,
  TeamcenterNode,
  ArchitectureNode,
  RequestStep,
  Metrics,
  TechnologyStackItem,
  WalkthroughStep,
  formatNumber,
} from '../components/architecture/architectureDashboardData';

interface ArchitectureDashboardHook {
  loading: boolean;
  error: string | null;
  health: HealthSource;
  tools: ToolDatum[];
  toolStats: ToolStats;
  teamcenterMap: TeamcenterNode[];
  walkthroughIndex: number | null;
  isWalkthroughActive: boolean;
  architectureNodes: ArchitectureNode[];
  requestSteps: RequestStep[];
  metrics: Metrics;
  activeModel: string | null;
  walkthroughSteps: WalkthroughStep[];
  handleWalkthrough: () => void;
  formatNumber: (value: number) => string;
  techStack: TechnologyStackItem[];
}

export function useArchitectureDashboard(): ArchitectureDashboardHook {
  const activeModel = useSelector((state: RootState) => state.settings.activeModel);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthSource>({});
  const [tools, setTools] = useState<ToolDatum[]>([]);
  const [toolStats, setToolStats] = useState<ToolStats>(DEFAULT_TOOL_STATS);
  const [teamcenterMap, setTeamcenterMap] = useState<TeamcenterNode[]>(DEFAULT_TEAMCENTER_MAP);
  const [walkthroughIndex, setWalkthroughIndex] = useState<number | null>(null);
  const [isWalkthroughActive, setIsWalkthroughActive] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const cleanup = () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };

    return cleanup;
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const [backendRes, apiRes, dbRes, mcpToolsRes, mcpStatsRes, tcHealthRes] = await Promise.allSettled([
          apiClient.get('/health/backend'),
          apiClient.get('/health/api'),
          apiClient.get('/health/database'),
          apiClient.get('/api/mcp/tools'),
          apiClient.get('/api/mcp/tools/statistics'),
          apiClient.get('/teamcenter/health'),
        ]);

        setHealth({
          backend: backendRes.status === 'fulfilled' ? backendRes.value.data?.status : undefined,
          api: apiRes.status === 'fulfilled' ? apiRes.value.data?.status : undefined,
          database: dbRes.status === 'fulfilled' ? dbRes.value.data?.status : undefined,
          teamcenter: tcHealthRes.status === 'fulfilled' ? tcHealthRes.value.data?.status : undefined,
        });

        if (mcpToolsRes.status === 'fulfilled' && Array.isArray(mcpToolsRes.value.data)) {
          setTools(
            mcpToolsRes.value.data.map((tool: any) => ({
              name: tool.name,
              category: tool.category || 'uncategorized',
              status: tool.status || 'active',
              usage_count: tool.usage_count,
              success_rate: tool.success_rate,
            }))
          );
        }

        if (mcpStatsRes.status === 'fulfilled' && mcpStatsRes.value.data) {
          const payload = mcpStatsRes.value.data;
          setToolStats({
            totalTools: payload.total_tools || DEFAULT_TOOL_STATS.totalTools,
            activeTools: payload.active_tools || DEFAULT_TOOL_STATS.activeTools,
            successRate: payload.overall?.overall_success_rate || DEFAULT_TOOL_STATS.successRate,
            averageExecutionMs: payload.overall?.overall_avg_execution_time || DEFAULT_TOOL_STATS.averageExecutionMs,
            categories: Array.isArray(payload.categories) ? payload.categories : DEFAULT_TOOL_STATS.categories,
          });
        }

        if (tcHealthRes.status === 'fulfilled' && tcHealthRes.value.data) {
          const summary = tcHealthRes.value.data;
          const mapEntries = DEFAULT_TEAMCENTER_MAP.map((node) => {
            const lower = node.label.toLowerCase();
            const status = summary.components?.[lower]?.status || summary.status || 'Healthy';
            const lastActivity = summary.components?.[lower]?.last_activity || node.lastActivity;

            return {
              ...node,
              health: getStatusLabel(status),
              lastActivity,
            };
          });
          setTeamcenterMap(mapEntries);
        }
      } catch (general) {
        console.error('System architecture load failed', general);
        setError('Unable to load architecture details. Using sample data.');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const architectureNodes = useMemo<ArchitectureNode[]>(() => {
    const backendStatus = getStatusLabel(health.backend);
    const apiStatus = getStatusLabel(health.api);
    const databaseStatus = getStatusLabel(health.database);
    const teamcenterStatus = getStatusLabel(health.teamcenter);

    return [
      {
        id: 'frontend',
        name: 'React Frontend',
        purpose: 'User interaction layer',
        tech: 'React + TypeScript + Redux',
        status: 'Healthy',
      },
      {
        id: 'backend',
        name: 'FastAPI Backend',
        purpose: 'API orchestration and session routing',
        tech: 'FastAPI + Python',
        status: backendStatus,
      },
      {
        id: 'gemini',
        name: 'Gemini AI Layer',
        purpose: 'Natural language understanding and answer generation',
        tech: `${activeModel?.toUpperCase() || 'Gemini'}`,
        status: apiStatus,
      },
      {
        id: 'workflow',
        name: 'Workflow Engine',
        purpose: 'Tool selection and execution coordination',
        tech: 'Python Workflow Orchestration',
        status: databaseStatus,
      },
      {
        id: 'mcp',
        name: 'MCP Server',
        purpose: 'Tool registry, execution context and traceability',
        tech: 'Model Context Protocol',
        status: tools.length > 0 ? 'Healthy' : 'Unknown',
      },
      {
        id: 'teamcenter',
        name: 'Teamcenter APIs',
        purpose: 'PLM object access and lifecycle services',
        tech: 'Teamcenter REST / OData',
        status: teamcenterStatus,
      },
      {
        id: 'plmdata',
        name: 'PLM Data',
        purpose: 'Item objects, BOMs, datasets, and workflows',
        tech: 'Teamcenter Data Layer',
        status: databaseStatus,
      },
    ];
  }, [health, activeModel, tools.length]);

  const requestSteps = useMemo<RequestStep[]>(() => {
    const success = health.backend !== 'Offline' && health.api !== 'Offline';
    return [
      { title: 'User Prompt', status: 'Success' },
      { title: 'Frontend API Call', status: 'Success' },
      { title: 'FastAPI Endpoint', status: getStatusLabel(health.backend) },
      { title: 'Gemini Analysis', status: getStatusLabel(health.api) },
      { title: 'Tool Selection', status: 'Success' },
      { title: 'MCP Execution', status: tools.length > 0 ? 'Success' : 'Pending' },
      { title: 'Teamcenter Query', status: getStatusLabel(health.teamcenter) },
      { title: 'Response Generation', status: success ? 'Success' : 'Degraded' },
      { title: 'Frontend Rendering', status: 'Success' },
    ];
  }, [health, tools.length]);

  const metrics = useMemo<Metrics>(() => ({
    totalApiCalls: tools.reduce((sum, tool) => sum + (tool.usage_count || 0), 0) || 12874,
    totalMcpExecutions: toolStats.totalTools * 129,
    averageResponseTime: toolStats.averageExecutionMs,
    systemHealth: [health.backend, health.api, health.database, health.teamcenter].every((value) => getStatusLabel(value) === 'Healthy')
      ? 'Healthy'
      : 'Attention',
    toolSuccessRate: `${toolStats.successRate}%`,
    connectedServices: 7,
  }), [health, toolStats, tools]);

  const handleWalkthrough = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (isWalkthroughActive) {
      setWalkthroughIndex(null);
      setIsWalkthroughActive(false);
      return;
    }

    setIsWalkthroughActive(true);
    setWalkthroughIndex(0);

    timerRef.current = window.setInterval(() => {
      setWalkthroughIndex((currentIndex) => {
        if (currentIndex === null) {
          return 1;
        }

        const nextIndex = currentIndex + 1;
        if (nextIndex >= WALKTHROUGH_STEPS.length) {
          if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setIsWalkthroughActive(false);
          return null;
        }

        return nextIndex;
      });
    }, 2400);
  };

  return {
    loading,
    error,
    health,
    tools,
    toolStats,
    teamcenterMap,
    walkthroughIndex,
    isWalkthroughActive,
    architectureNodes,
    requestSteps,
    metrics,
    activeModel: activeModel || null,
    walkthroughSteps: WALKTHROUGH_STEPS,
    handleWalkthrough,
    formatNumber,
    techStack: TECHNOLOGY_STACK,
  };
}
