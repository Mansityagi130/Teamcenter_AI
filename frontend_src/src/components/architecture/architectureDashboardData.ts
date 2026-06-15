export interface ToolDatum {
  name: string;
  category: string;
  status: string;
  usage_count?: number;
  success_rate?: number;
}

export interface HealthSource {
  backend?: string;
  api?: string;
  database?: string;
  teamcenter?: string;
}

export interface TeamcenterNode {
  label: string;
  description: string;
  lastActivity: string;
  health: string;
}

export interface ToolStats {
  totalTools: number;
  activeTools: number;
  successRate: number;
  averageExecutionMs: number;
  categories: string[];
}

export interface ArchitectureNode {
  id: string;
  name: string;
  purpose: string;
  tech: string;
  status: string;
}

export interface RequestStep {
  title: string;
  status: string;
}

export interface Metrics {
  totalApiCalls: number;
  totalMcpExecutions: number;
  averageResponseTime: number;
  systemHealth: string;
  toolSuccessRate: string;
  connectedServices: number;
}

export interface TechnologyStackItem {
  title: string;
  purpose: string;
  status: string;
}

export interface WalkthroughStep {
  id: string;
  title: string;
  description: string;
}

export const DEFAULT_TOOL_STATS: ToolStats = {
  totalTools: 14,
  activeTools: 11,
  successRate: 94,
  averageExecutionMs: 288,
  categories: ['search', 'workflow', 'metadata', 'auditing'],
};

export const DEFAULT_TEAMCENTER_MAP: TeamcenterNode[] = [
  { label: 'Objects', description: 'Metadata, part revisions and classification.', lastActivity: '2 min ago', health: 'Healthy' },
  { label: 'BOM', description: 'Multi-level BOM relationships and change history.', lastActivity: '4 min ago', health: 'Healthy' },
  { label: 'Datasets', description: 'CAD, specifications and payload delivery.', lastActivity: '6 min ago', health: 'Healthy' },
  { label: 'Workflows', description: 'Lifecycle tasks and Teamcenter approvals.', lastActivity: '1 min ago', health: 'Healthy' },
];

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: 'frontend',
    title: 'Frontend',
    description: 'The React UX captures user intent and renders the PLM assistant interface with enterprise-grade responsiveness.',
  },
  {
    id: 'backend',
    title: 'Backend',
    description: 'FastAPI provides API orchestration, authentication, and session routing between UI and the AI layer.',
  },
  {
    id: 'gemini',
    title: 'Gemini',
    description: 'Gemini performs semantic analysis, prompt engineering, and model orchestration for every user query.',
  },
  {
    id: 'workflow',
    title: 'Workflow',
    description: 'The workflow engine converts AI intent into tool selection, action plans, and stateful execution.',
  },
  {
    id: 'mcp',
    title: 'MCP',
    description: 'The MCP server dispatches tools, tracks execution metadata, and acts as the model context integration layer.',
  },
  {
    id: 'teamcenter',
    title: 'Teamcenter',
    description: 'Teamcenter APIs connect to PLM data, BOM objects, datasets, and lifecycle workflows for production delivery.',
  },
];

export const TECHNOLOGY_STACK: TechnologyStackItem[] = [
  { title: 'React', purpose: 'UI rendering + client state', status: 'Ready' },
  { title: 'TypeScript', purpose: 'Type-safe component contracts', status: 'Stable' },
  { title: 'Redux', purpose: 'Application state and sessions', status: 'Operational' },
  { title: 'Tailwind', purpose: 'Enterprise visual system', status: 'Consistent' },
  { title: 'Vite', purpose: 'Fast developer feedback loop', status: 'Optimized' },
  { title: 'FastAPI', purpose: 'API request orchestration', status: 'Responsive' },
  { title: 'Python', purpose: 'Backend execution runtime', status: 'Reliable' },
  { title: 'MCP', purpose: 'Tool context orchestration', status: 'Instrumented' },
  { title: 'Gemini', purpose: 'AI reasoning layer', status: 'Model ready' },
  { title: 'SSE Streaming', purpose: 'Realtime status and logs', status: 'Connected' },
  { title: 'Logging', purpose: 'Audit and traceability', status: 'Captured' },
  { title: 'Observability', purpose: 'Operational insights', status: 'Monitored' },
];

export const ARCHITECTURE_FLOW_NODES = [
  { id: 'frontend', label: 'React Frontend', description: 'Modern UI layer handling user input and state.', color: 'bg-surface' },
  { id: 'backend', label: 'FastAPI', description: 'Backend API orchestration and session handling.', color: 'bg-surface' },
  { id: 'gemini', label: 'Gemini', description: 'AI reasoning and prompt generation.', color: 'bg-surface' },
  { id: 'workflow', label: 'Workflow Engine', description: 'Tool selection and execution coordination.', color: 'bg-surface' },
  { id: 'mcp', label: 'MCP', description: 'Model Context Protocol execution layer.', color: 'bg-surface' },
  { id: 'teamcenter', label: 'Teamcenter', description: 'PLM API integration and object services.', color: 'bg-surface' },
  { id: 'plmdata', label: 'PLM Data', description: 'Persistent product data and digital twin artifacts.', color: 'bg-surface' },
];

export function getStatusLabel(value: string | undefined) {
  if (!value) return 'Unknown';
  if (/offline|fail|error/i.test(value)) return 'Degraded';
  if (/online|ok|healthy|success/i.test(value)) return 'Healthy';
  return 'Unknown';
}

export function statusBadgeColor(status: string) {
  switch (status) {
    case 'Healthy':
      return 'bg-tertiary text-tertiary';
    case 'Degraded':
      return 'bg-warning text-warning';
    case 'Offline':
      return 'bg-error text-error';
    default:
      return 'bg-surface text-on-surface-variant';
  }
}

export function formatNumber(value: number) {
  return value.toLocaleString();
}
