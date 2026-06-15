import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, addToast, addTerminalLog } from '../store';
import apiClient from '../api';

interface McpToolExplorerProps {
  onNavigate: (view: string) => void;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
    title?: string;
  };
  outputSchema?: Record<string, any>;
  category: string;
  status: string;
}

interface ToolStats {
  tool_name: string;
  usage_count: number;
  success_rate: number;
  avg_execution_time: number;
}

interface OverallStats {
  total_usage_count: number;
  overall_success_rate: number;
  overall_avg_execution_time: number;
}

export function McpToolExplorer({ onNavigate }: McpToolExplorerProps) {
  const dispatch = useDispatch();
  const role = useSelector((state: RootState) => state.auth.role);

  // Tools list & statistics
  const [tools, setTools] = useState<McpTool[]>([]);
  const [stats, setStats] = useState<Record<string, ToolStats>>({});
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [selectedToolName, setSelectedToolName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Testing state
  const [enableExecution, setEnableExecution] = useState(false);
  const [testArguments, setTestArguments] = useState<Record<string, any>>({});
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [executionLatency, setExecutionLatency] = useState<number | null>(null);

  // Fetch tools and stats
  async function loadData() {
    setLoading(true);
    try {
      // 1. Fetch tools
      const toolsRes = await apiClient.get('/api/mcp/tools');
      setTools(toolsRes.data || []);
      
      // Select the first tool by default
      if (toolsRes.data && toolsRes.data.length > 0 && !selectedToolName) {
        setSelectedToolName(toolsRes.data[0].name);
      }

      // 2. Fetch statistics
      const statsRes = await apiClient.get('/api/mcp/tools/statistics');
      if (statsRes.data) {
        setOverallStats(statsRes.data.overall || null);
        const statsMap: Record<string, ToolStats> = {};
        (statsRes.data.tools || []).forEach((t: ToolStats) => {
          statsMap[t.tool_name] = t;
        });
        setStats(statsMap);
      }
    } catch (err: any) {
      console.error('Failed to load MCP Explorer details:', err);
      dispatch(addToast({ 
        message: err.response?.data?.detail || 'Failed to load MCP tool metadata', 
        type: 'error' 
      }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (role === 'Administrator') {
      loadData();
    }
  }, [role]);

  // Clean form inputs whenever selected tool changes
  useEffect(() => {
    setTestArguments({});
    setExecutionResult(null);
    setExecutionLatency(null);
  }, [selectedToolName]);

  const selectedTool = tools.find((t) => t.name === selectedToolName);

  // Handle dynamic form field updates
  function handleArgChange(paramName: string, value: any, type: string) {
    let parsedValue = value;
    if (type === 'integer' || type === 'number') {
      parsedValue = value === '' ? '' : Number(value);
    } else if (type === 'boolean') {
      parsedValue = value === 'true';
    } else if (type === 'object' || type === 'array') {
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
    }
    setTestArguments((prev) => ({
      ...prev,
      [paramName]: parsedValue,
    }));
  }

  // Trigger test tool execution
  async function handleRunTest(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedToolName) return;
    if (!enableExecution) {
      dispatch(addToast({ message: 'Please unlock tool execution safety switch first', type: 'warning' }));
      return;
    }

    setExecuting(true);
    setExecutionResult(null);
    setExecutionLatency(null);

    dispatch(addTerminalLog({
      action: 'mcp_tool_test_execution',
      payload: { tool_name: selectedToolName, arguments: testArguments }
    }));

    const startTime = performance.now();
    try {
      const res = await apiClient.post('/api/mcp/tools/execute', {
        tool_name: selectedToolName,
        arguments: testArguments
      });
      const endTime = performance.now();
      
      setExecutionLatency(Math.round(endTime - startTime));
      setExecutionResult(res.data);
      dispatch(addToast({ message: `Successfully executed ${selectedToolName}`, type: 'success' }));
      
      // Reload stats to reflect new count
      const statsRes = await apiClient.get('/api/mcp/tools/statistics');
      if (statsRes.data) {
        setOverallStats(statsRes.data.overall || null);
        const statsMap: Record<string, ToolStats> = {};
        (statsRes.data.tools || []).forEach((t: ToolStats) => {
          statsMap[t.tool_name] = t;
        });
        setStats(statsMap);
      }
    } catch (err: any) {
      const endTime = performance.now();
      setExecutionLatency(Math.round(endTime - startTime));
      
      const errDetail = err.response?.data?.detail;
      setExecutionResult(errDetail || { status: 'error', message: err.message });
      
      dispatch(addToast({ 
        message: `Execution of ${selectedToolName} failed`, 
        type: 'error' 
      }));
    } finally {
      setExecuting(false);
    }
  }

  // Filter tools
  const filteredTools = tools.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Extract categories dynamically
  const categories = ['all', ...Array.from(new Set(tools.map((t) => t.category)))];

  // Access Denied Screen for non-admins
  if (role !== 'Administrator') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-gutter bg-background">
        <div className="glass-panel p-8 max-w-md rounded-2xl border border-outline-variant/10 shadow-2xl space-y-md">
          <span className="material-symbols-outlined text-6xl text-error">gpp_maybe</span>
          <h2 className="font-headline-lg text-xl font-bold text-on-surface">Access Denied</h2>
          <p className="text-on-surface-variant text-xs leading-relaxed">
            The Model Context Protocol (MCP) Tool Explorer is restricted to administrators. Standard users are not permitted to inspect or execute system tools.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="w-full bg-secondary-container/20 border border-secondary-fixed-dim/30 text-secondary-fixed-dim font-bold py-2.5 rounded-lg text-xs hover:bg-secondary-container/30 transition-all active:scale-95 outline-none"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      
      {/* Page Header */}
      <div className="pb-sm border-b border-outline-variant/10 flex flex-col md:flex-row justify-between items-start md:items-end gap-sm">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed-dim">terminal</span>
            MCP Tool Explorer
          </h2>
          <p className="text-on-surface-variant text-xs mt-0.5">
            Model Context Protocol registry dashboard allowing developer inspections, manual execution, and analytics monitoring.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-4.5 py-2 text-xs bg-surface border border-outline-variant/20 text-on-surface rounded-lg font-bold hover:bg-surface-variant/30 transition-all active:scale-98 outline-none"
        >
          <span className={`material-symbols-outlined text-xs ${loading ? 'animate-spin' : ''}`}>sync</span>
          Sync Tools Registry
        </button>
      </div>

      {/* Overall Stats Bento Cards */}
      {overallStats && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
          <div className="glass-panel p-5 rounded-xl border border-outline-variant/5 flex items-center gap-4 bg-surface/30">
            <div className="p-3 rounded-lg bg-secondary-container/10 border border-secondary-fixed-dim/20 text-secondary-fixed-dim">
              <span className="material-symbols-outlined text-2xl font-bold">query_stats</span>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Total Executions</p>
              <h3 className="text-xl font-bold text-on-surface mt-1">{overallStats.total_usage_count}</h3>
            </div>
          </div>

          <div className="glass-panel p-5 rounded-xl border border-outline-variant/5 flex items-center gap-4 bg-surface/30">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
              <span className="material-symbols-outlined text-2xl font-bold">check_circle</span>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Success Rate</p>
              <h3 className="text-xl font-bold text-green-400 mt-1">{overallStats.overall_success_rate}%</h3>
            </div>
          </div>

          <div className="glass-panel p-5 rounded-xl border border-outline-variant/5 flex items-center gap-4 bg-surface/30">
            <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <span className="material-symbols-outlined text-2xl font-bold">speed</span>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Avg Response Latency</p>
              <h3 className="text-xl font-bold text-cyan-400 mt-1">{overallStats.overall_avg_execution_time} ms</h3>
            </div>
          </div>
        </section>
      )}

      {/* Main Grid View */}
      <section className="grid grid-cols-12 gap-gutter">
        
        {/* Sidebar Tools Navigation List */}
        <div className="col-span-12 lg:col-span-4 space-y-gutter">
          <div className="glass-panel p-4 rounded-xl border border-outline-variant/5 space-y-md bg-surface/20 flex flex-col max-h-[650px]">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5 border-b border-outline-variant/10 pb-2 flex-shrink-0">
              <span className="material-symbols-outlined text-lg">widgets</span>
              Registered MCP Tools ({filteredTools.length})
            </h3>

            {/* Filter inputs */}
            <div className="space-y-sm flex-shrink-0">
              <div className="flex gap-xs items-center p-1 bg-background border border-outline-variant/30 rounded-lg focus-within:border-secondary-fixed-dim">
                <span className="material-symbols-outlined text-on-surface-variant px-1 text-base">search</span>
                <input
                  type="text"
                  placeholder="Filter by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none text-xs text-on-surface focus:ring-0 p-0.5 outline-none"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1 px-2 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 cursor-pointer outline-none capitalize"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 space-y-1 pr-xs max-h-[460px] terminal-scroll">
              {loading ? (
                <div className="p-10 text-center text-xs text-on-surface-variant italic animate-pulse">
                  Querying tool registry schemas...
                </div>
              ) : filteredTools.length === 0 ? (
                <div className="p-8 text-center text-xs text-on-surface-variant italic">
                  No MCP tools matched query search.
                </div>
              ) : (
                filteredTools.map((tool) => {
                  const isSelected = tool.name === selectedToolName;
                  const toolStats = stats[tool.name];
                  return (
                    <button
                      key={tool.name}
                      type="button"
                      onClick={() => setSelectedToolName(tool.name)}
                      className={`w-full text-left p-3 rounded-lg border transition-all flex flex-col gap-1 outline-none ${
                        isSelected 
                          ? 'bg-secondary-container/10 border-secondary-fixed-dim/30 text-secondary-fixed-dim shadow-md' 
                          : 'border-transparent hover:bg-surface-variant/20 hover:border-outline-variant/10 text-on-surface'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold truncate max-w-[190px]">{tool.name}</span>
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-[10px] text-on-surface-variant font-medium mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-surface/50 border border-outline-variant/15 text-[8px] uppercase tracking-wider font-mono">
                          {tool.category}
                        </span>
                        {toolStats && toolStats.usage_count > 0 && (
                          <span className="opacity-80">
                            Calls: {toolStats.usage_count} ({toolStats.success_rate}%)
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Selected Tool Details & Testing Workspace */}
        <div className="col-span-12 lg:col-span-8 space-y-gutter">
          {selectedTool ? (
            <div className="space-y-gutter">
              
              {/* Tool Specs details */}
              <div className="glass-panel p-5 rounded-xl border border-outline-variant/5 bg-surface/20 space-y-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-sm border-b border-outline-variant/10 pb-3">
                  <div>
                    <h3 className="font-mono text-base font-bold text-on-surface">{selectedTool.name}</h3>
                    <p className="text-[10px] text-on-surface-variant font-medium mt-0.5 uppercase tracking-wider flex items-center gap-1.5">
                      Category: <span className="text-secondary-fixed-dim">{selectedTool.category}</span>
                      &bull; Status: <span className="text-green-400">ACTIVE</span>
                    </p>
                  </div>
                  
                  {stats[selectedTool.name] && (
                    <div className="flex gap-md bg-surface/40 p-2 rounded-lg border border-outline-variant/10 text-right text-[11px] font-mono leading-tight">
                      <div>
                        <span className="text-on-surface-variant text-[9px] block uppercase font-sans">Calls</span>
                        <span className="font-bold text-on-surface">{stats[selectedTool.name].usage_count}</span>
                      </div>
                      <div className="border-l border-outline-variant/10 pl-md">
                        <span className="text-on-surface-variant text-[9px] block uppercase font-sans">Success</span>
                        <span className="font-bold text-green-400">{stats[selectedTool.name].success_rate}%</span>
                      </div>
                      <div className="border-l border-outline-variant/10 pl-md">
                        <span className="text-on-surface-variant text-[9px] block uppercase font-sans">Avg Latency</span>
                        <span className="font-bold text-cyan-400">{stats[selectedTool.name].avg_execution_time}ms</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-sm text-xs">
                  <h4 className="font-bold text-on-surface-variant">Description</h4>
                  <p className="text-on-surface leading-relaxed p-3 bg-surface/50 border border-outline-variant/5 rounded-lg whitespace-pre-line font-mono text-[11px]">
                    {selectedTool.description}
                  </p>
                </div>

                {/* Input arguments schema lists */}
                <div className="space-y-sm">
                  <h4 className="font-bold text-on-surface-variant text-xs">Inputs & Arguments Schema</h4>
                  {selectedTool.inputSchema && selectedTool.inputSchema.properties && Object.keys(selectedTool.inputSchema.properties).length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-outline-variant/10 bg-surface/30">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-surface-variant/20 border-b border-outline-variant/10 font-bold uppercase text-[9px] tracking-wider text-on-surface-variant">
                            <th className="p-3">Parameter</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Requirement</th>
                            <th className="p-3">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/5 font-mono text-[11px]">
                          {Object.entries(selectedTool.inputSchema.properties).map(([name, schema]: [string, any]) => {
                            const isRequired = selectedTool.inputSchema.required?.includes(name);
                            return (
                              <tr key={name} className="hover:bg-secondary-container/5">
                                <td className="p-3 font-bold text-secondary-fixed-dim">{name}</td>
                                <td className="p-3">
                                  <span className="px-1.5 py-0.5 rounded bg-surface border border-outline-variant/10 text-[9px] font-bold text-on-surface-variant uppercase">
                                    {schema.type || 'string'}
                                  </span>
                                </td>
                                <td className="p-3">
                                  {isRequired ? (
                                    <span className="text-error font-bold">REQUIRED</span>
                                  ) : (
                                    <span className="text-on-surface-variant opacity-60">OPTIONAL</span>
                                  )}
                                </td>
                                <td className="p-3 text-on-surface leading-normal font-sans text-xs">{schema.description || 'No description provided.'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface-variant italic p-3 bg-surface/40 border border-outline-variant/5 rounded-lg">
                      No arguments required for this tool.
                    </p>
                  )}
                </div>
              </div>

              {/* Dynamic Execution Testing Panel */}
              <div className="glass-panel p-5 rounded-xl border border-outline-variant/5 bg-surface/20 space-y-md">
                <div className="flex justify-between items-center border-b border-outline-variant/10 pb-2">
                  <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-lg">play_circle</span>
                    Interactive Testing Workspace
                  </h3>
                  
                  {/* Safety lock switch */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">
                      Unlock Manual Execution
                    </span>
                    <input
                      type="checkbox"
                      checked={enableExecution}
                      onChange={(e) => setEnableExecution(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-9 h-5 bg-surface-container border border-outline-variant/20 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-on-surface-variant/60 after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-secondary-fixed-dim peer-checked:after:bg-primary-container"></div>
                  </label>
                </div>

                <form onSubmit={handleRunTest} className="space-y-md">
                  {selectedTool.inputSchema && selectedTool.inputSchema.properties && Object.keys(selectedTool.inputSchema.properties).length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md p-3 bg-surface/40 border border-outline-variant/5 rounded-lg">
                      {Object.entries(selectedTool.inputSchema.properties).map(([name, schema]: [string, any]) => {
                        const isRequired = selectedTool.inputSchema.required?.includes(name);
                        return (
                          <div key={name} className="space-y-1">
                            <label className="block text-xs font-bold text-on-surface-variant">
                              {name} {isRequired && <span className="text-error">*</span>}
                            </label>
                            
                            {schema.type === 'boolean' ? (
                              <select
                                value={testArguments[name] === undefined ? 'false' : String(testArguments[name])}
                                onChange={(e) => handleArgChange(name, e.target.value, schema.type)}
                                disabled={executing}
                                className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1.5 px-2.5 text-on-surface focus:border-secondary-fixed-dim outline-none cursor-pointer"
                              >
                                <option value="false">False</option>
                                <option value="true">True</option>
                              </select>
                            ) : (
                              <input
                                type={schema.type === 'integer' || schema.type === 'number' ? 'number' : 'text'}
                                required={isRequired}
                                placeholder={schema.description || `Enter ${name}...`}
                                value={testArguments[name] === undefined ? '' : testArguments[name]}
                                onChange={(e) => handleArgChange(name, e.target.value, schema.type)}
                                disabled={executing}
                                className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1.5 px-2.5 text-on-surface focus:border-secondary-fixed-dim outline-none font-mono"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={executing || !enableExecution}
                    className="w-full bg-secondary-fixed-dim text-primary-container py-2.5 rounded-lg font-bold hover:brightness-110 active:scale-98 transition-all text-xs flex items-center justify-center gap-1.5 cyan-glow disabled:opacity-30 disabled:pointer-events-none outline-none"
                  >
                    <span className="material-symbols-outlined text-sm font-bold">play_arrow</span>
                    {executing ? 'Executing MCP Action...' : 'Run Test Tool'}
                  </button>
                </form>

                {/* Execution Results Terminal Output Box */}
                {(executionResult !== null || executing) && (
                  <div className="space-y-sm">
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">
                      <span>Execution Response Terminal</span>
                      {executionLatency && (
                        <span className="text-cyan-400 font-mono">
                          Duration: {executionLatency} ms
                        </span>
                      )}
                    </div>
                    <div className="glass-panel p-4 rounded-lg bg-surface-container border border-outline-variant/10 relative">
                      {executing ? (
                        <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 animate-pulse">
                          <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                          CALLING_MCP_RPC_SERVER_INVOKING_METHOD...
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center border-b border-outline-variant/5 pb-2">
                            <span className="text-[9px] uppercase font-bold tracking-wider font-mono text-green-400">
                              STATUS: SUCCESS (200 OK)
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(JSON.stringify(executionResult, null, 2));
                                dispatch(addToast({ message: 'Copied output payload to clipboard', type: 'success' }));
                              }}
                              className="flex items-center gap-1 text-[9px] bg-secondary-container/10 border border-secondary-fixed-dim/20 text-secondary-fixed-dim px-2 py-0.5 rounded font-bold hover:bg-secondary-container/20 transition-all outline-none"
                            >
                              <span className="material-symbols-outlined text-[10px] font-bold">content_copy</span> Copy Output
                            </button>
                          </div>
                          
                          <pre className="font-mono text-left text-[11px] text-[#74f5ff] overflow-x-auto max-h-[300px] select-all terminal-scroll bg-[#0b1216] p-3 rounded border border-outline-variant/5">
                            {JSON.stringify(executionResult, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel p-12 rounded-xl text-center space-y-3 border border-outline-variant/5 bg-surface/10">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant opacity-40">terminal</span>
              <h4 className="text-sm font-bold text-on-surface">No Tool Selected</h4>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                Select an available Model Context Protocol tool from the left navigation catalog panel to inspect schemas, view telemetry logs, and verify manual endpoints executions.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
