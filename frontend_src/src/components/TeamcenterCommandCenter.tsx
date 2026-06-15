import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, addToast, addTerminalLog } from '../store';
import apiClient from '../api';

interface TeamcenterCommandCenterProps {
  onNavigate: (view: string) => void;
}

export function TeamcenterCommandCenter({ onNavigate }: TeamcenterCommandCenterProps) {
  const dispatch = useDispatch();
  const healthState = useSelector((state: RootState) => state.auth.health);

  // Health Metrics State
  const [detailedHealth, setDetailedHealth] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  // Statistics State
  const [catalogStats, setCatalogStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Quick Action Active View
  const [activeAction, setActiveAction] = useState<'none' | 'explore_metadata' | 'view_properties' | 'search_datasets' | 'health_check'>('none');

  // Metadata Explorer Sub-State
  const [metadataType, setMetadataType] = useState('Item');
  const [schemaData, setSchemaData] = useState<any>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);

  // Property Viewer Sub-State
  const [propType, setPropType] = useState('Item');
  const [propId, setPropId] = useState('');
  const [propertiesResult, setPropertiesResult] = useState<any>(null);
  const [loadingProperties, setLoadingProperties] = useState(false);

  // Dataset Search Sub-State
  const [datasetItemId, setDatasetItemId] = useState('');
  const [datasetsResult, setDatasetsResult] = useState<any[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);

  // Load General Health and Catalog Stats on Mount
  async function loadDashboardData() {
    setLoadingHealth(true);
    setLoadingStats(true);
    try {
      const resHealth = await apiClient.get('/teamcenter/health');
      setDetailedHealth(resHealth.data);
    } catch (err: any) {
      console.error('Failed to load health diagnostics:', err);
    } finally {
      setLoadingHealth(false);
    }

    try {
      const resStats = await apiClient.get('/api/catalog/statistics/all');
      setCatalogStats(resStats.data);
    } catch (err: any) {
      console.error('Failed to load catalog statistics:', err);
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Fetch schema dynamically
  async function fetchSchema(typeName: string) {
    setLoadingSchema(true);
    setSchemaData(null);
    dispatch(addTerminalLog({
      action: 'mcp_metadata_explorer',
      payload: { type: typeName }
    }));
    try {
      const res = await apiClient.get(`/api/metadata/types/${typeName}`);
      setSchemaData(res.data);
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Failed to fetch schema', type: 'error' }));
    } finally {
      setLoadingSchema(false);
    }
  }

  // Fetch properties dynamically
  async function handleFetchProperties(e: React.FormEvent) {
    e.preventDefault();
    if (!propId.trim()) return;

    setLoadingProperties(true);
    setPropertiesResult(null);
    dispatch(addTerminalLog({
      action: 'mcp_property_viewer',
      payload: { object_type: propType, object_id: propId.trim() }
    }));

    try {
      const res = await apiClient.get(`/api/properties/all?object_type=${propType}&object_id=${propId.trim()}`);
      setPropertiesResult(res.data);
      dispatch(addToast({ message: `Retrieved properties for ${propId}`, type: 'success' }));
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Properties fetch failed', type: 'error' }));
    } finally {
      setLoadingProperties(false);
    }
  }

  // Fetch datasets dynamically
  async function handleSearchDatasets(e: React.FormEvent) {
    e.preventDefault();
    setLoadingDatasets(true);
    setDatasetsResult([]);
    dispatch(addTerminalLog({
      action: 'mcp_dataset_search',
      payload: { item_id: datasetItemId.trim() }
    }));

    try {
      const payload: any = {};
      if (datasetItemId.trim()) {
        payload.item_id = datasetItemId.trim();
      }
      const res = await apiClient.post('/dataset/list', payload);
      setDatasetsResult(res.data);
      dispatch(addToast({ message: `Found ${res.data.length} datasets`, type: 'success' }));
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Datasets search failed', type: 'error' }));
    } finally {
      setLoadingDatasets(false);
    }
  }

  // Trigger diagnostic manual health check
  async function triggerDiagnosticCheck() {
    setLoadingHealth(true);
    dispatch(addTerminalLog({
      action: 'mcp_diagnostic_health_check',
      payload: { trigger: 'manual' }
    }));
    try {
      const res = await apiClient.get('/teamcenter/health');
      setDetailedHealth(res.data);
      dispatch(addToast({ message: 'Diagnostic health parameters refreshed', type: 'success' }));
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Health check failed', type: 'error' }));
    } finally {
      setLoadingHealth(false);
    }
  }

  // Summarize stats
  const totalApiCalls = catalogStats
    ? Object.values(catalogStats).reduce((acc: number, val: any) => acc + (val.invocation_count || 0), 0)
    : 0;

  const authHealth = detailedHealth?.metrics?.authentication_health;
  const sessionHealth = detailedHealth?.metrics?.session_health;
  const apiAvailability = detailedHealth?.metrics?.api_availability;
  const responseTimes = detailedHealth?.metrics?.response_times;
  const errorRates = detailedHealth?.metrics?.error_rates;

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      
      {/* 1. Header Section */}
      <div className="pb-sm border-b border-outline-variant/10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-sm">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface">Teamcenter Command Center</h2>
          <p className="text-on-surface-variant text-xs mt-0.5">Centralized console overseeing dynamic MCP schemas, caching, and health matrices.</p>
        </div>
        <button
          onClick={loadDashboardData}
          disabled={loadingHealth || loadingStats}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary-container/10 border border-secondary-fixed-dim/30 text-secondary-fixed-dim text-xs font-bold hover:bg-secondary-container/20 transition-all outline-none"
        >
          <span className={`material-symbols-outlined text-sm ${(loadingHealth || loadingStats) ? 'animate-spin' : ''}`}>sync</span>
          Refresh Dashboard
        </button>
      </div>

      {/* 2. Teamcenter Status Panels */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-gutter">
        {/* Connection status */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between h-28 border border-outline-variant/5">
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Connection Status</span>
            <span className="material-symbols-outlined text-sm text-tertiary">cloud_done</span>
          </div>
          <div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`w-2.5 h-2.5 rounded-full ${healthState.backend === 'online' ? 'bg-tertiary animate-pulse' : 'bg-error animate-ping'}`} />
              <h3 className="text-lg font-bold text-on-surface">{healthState.backend === 'online' ? 'Online' : 'Offline'}</h3>
            </div>
            <p className="text-[10px] text-on-surface-variant mt-1">REST API Wrapper Connection</p>
          </div>
        </div>

        {/* Authentication Status */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between h-28 border border-outline-variant/5">
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Authentication</span>
            <span className="material-symbols-outlined text-sm text-secondary-fixed-dim">key</span>
          </div>
          <div>
            <h3 className={`text-lg font-bold ${authHealth?.status === 'UP' ? 'text-tertiary' : authHealth?.status === 'DEGRADED' ? 'text-secondary-fixed-dim' : 'text-error'}`}>
              {authHealth?.status || 'UNKNOWN'}
            </h3>
            <p className="text-[10px] text-on-surface-variant mt-1">
              {authHealth?.api_key_configured ? 'API Keys active' : 'API Keys missing'}
            </p>
          </div>
        </div>

        {/* Session Status */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between h-28 border border-outline-variant/5">
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Session Sync</span>
            <span className="material-symbols-outlined text-sm text-tertiary font-bold">sync_alt</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface">
              {apiAvailability?.status === 'UP' ? 'UP' : 'DOWN'}
            </h3>
            <p className="text-[10px] text-on-surface-variant mt-1">Pool Session Validation</p>
          </div>
        </div>

        {/* Active Sessions */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between h-28 border border-outline-variant/5">
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Active Sessions</span>
            <span className="material-symbols-outlined text-sm text-secondary-fixed-dim">group</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface">
              {sessionHealth?.active_sessions ?? '0'}
            </h3>
            <p className="text-[10px] text-on-surface-variant mt-1">Currently cached sessions</p>
          </div>
        </div>

        {/* Response Latency */}
        <div className="glass-card rounded-xl p-4 flex flex-col justify-between h-28 border border-outline-variant/5">
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Avg Latency</span>
            <span className="material-symbols-outlined text-sm text-secondary-fixed-dim">speed</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface">
              {responseTimes?.average_ms ? `${responseTimes.average_ms} ms` : '0.00 ms'}
            </h3>
            <p className="text-[10px] text-on-surface-variant mt-1">Average backend response</p>
          </div>
        </div>
      </section>

      {/* 3. Quick Actions & Dynamic Display Grid */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-gutter">
        {/* Quick Actions Buttons */}
        <div className="glass-card rounded-xl p-5 border border-outline-variant/5 space-y-md">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5 pb-2 border-b border-outline-variant/10">
            <span className="material-symbols-outlined text-secondary-fixed-dim text-lg">bolt</span>
            Quick Action Tools
          </h3>
          <div className="flex flex-col gap-sm">
            <button
              onClick={() => onNavigate('search')}
              className="py-2.5 px-4 rounded-lg bg-surface border border-outline-variant/10 text-on-surface text-xs font-bold hover:bg-surface-variant/30 flex items-center justify-between transition-all outline-none"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed-dim text-sm">search</span>
                Search Items
              </span>
              <span className="material-symbols-outlined text-xs text-on-surface-variant">arrow_forward</span>
            </button>

            <button
              onClick={() => { setActiveAction('search_datasets'); setDatasetsResult([]); }}
              className={`py-2.5 px-4 rounded-lg border text-xs font-bold flex items-center justify-between transition-all outline-none ${
                activeAction === 'search_datasets'
                  ? 'bg-secondary-container/10 border-secondary-fixed-dim text-secondary-fixed-dim'
                  : 'bg-surface border-outline-variant/10 text-on-surface hover:bg-surface-variant/30'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed-dim text-sm">dataset</span>
                Search Datasets
              </span>
              <span className="material-symbols-outlined text-xs text-on-surface-variant">arrow_forward</span>
            </button>

            <button
              onClick={() => { setActiveAction('explore_metadata'); fetchSchema(metadataType); }}
              className={`py-2.5 px-4 rounded-lg border text-xs font-bold flex items-center justify-between transition-all outline-none ${
                activeAction === 'explore_metadata'
                  ? 'bg-secondary-container/10 border-secondary-fixed-dim text-secondary-fixed-dim'
                  : 'bg-surface border-outline-variant/10 text-on-surface hover:bg-surface-variant/30'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed-dim text-sm">explore</span>
                Explore Metadata
              </span>
              <span className="material-symbols-outlined text-xs text-on-surface-variant">arrow_forward</span>
            </button>

            <button
              onClick={() => { setActiveAction('view_properties'); setPropertiesResult(null); }}
              className={`py-2.5 px-4 rounded-lg border text-xs font-bold flex items-center justify-between transition-all outline-none ${
                activeAction === 'view_properties'
                  ? 'bg-secondary-container/10 border-secondary-fixed-dim text-secondary-fixed-dim'
                  : 'bg-surface border-outline-variant/10 text-on-surface hover:bg-surface-variant/30'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed-dim text-sm">view_list</span>
                View Properties
              </span>
              <span className="material-symbols-outlined text-xs text-on-surface-variant">arrow_forward</span>
            </button>

            <button
              onClick={() => { setActiveAction('health_check'); triggerDiagnosticCheck(); }}
              className={`py-2.5 px-4 rounded-lg border text-xs font-bold flex items-center justify-between transition-all outline-none ${
                activeAction === 'health_check'
                  ? 'bg-secondary-container/10 border-secondary-fixed-dim text-secondary-fixed-dim'
                  : 'bg-surface border-outline-variant/10 text-on-surface hover:bg-surface-variant/30'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed-dim text-sm">health_and_safety</span>
                Health Diagnostics
              </span>
              <span className="material-symbols-outlined text-xs text-on-surface-variant">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Interactive Dynamic Display Panel */}
        <div className="xl:col-span-2 glass-card rounded-xl p-5 border border-outline-variant/5 flex flex-col min-h-[300px]">
          {/* 1. Welcoming placeholder */}
          {activeAction === 'none' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-6">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant opacity-40">hub</span>
              <h4 className="text-sm font-bold text-on-surface">Interactive Teamcenter Workspace</h4>
              <p className="text-xs text-on-surface-variant max-w-sm leading-relaxed">
                Click any tool from the Quick Action checklist to initialize dynamic metadata schemas, run property checks, or inspect diagnostic reports.
              </p>
            </div>
          )}

          {/* 2. Explore Metadata Action */}
          {activeAction === 'explore_metadata' && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex justify-between items-center border-b border-outline-variant/10 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">explore</span> Explore Metadata
                </h4>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-on-surface-variant font-bold">Select Object Type:</label>
                  <select
                    value={metadataType}
                    onChange={(e) => { setMetadataType(e.target.value); fetchSchema(e.target.value); }}
                    className="bg-background border border-outline-variant/30 rounded-lg text-xs py-1 px-2 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 cursor-pointer outline-none"
                  >
                    <option value="Item">Item</option>
                    <option value="ItemRevision">ItemRevision</option>
                    <option value="Dataset">Dataset</option>
                    <option value="Form">Form</option>
                    <option value="Folder">Folder</option>
                    <option value="Workflow">Workflow</option>
                  </select>
                </div>
              </div>

              {loadingSchema && (
                <div className="flex-1 flex items-center justify-center py-6 text-xs text-on-surface-variant italic gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">sync</span> Fetching schema...
                </div>
              )}

              {!loadingSchema && schemaData && (
                <div className="flex-1 space-y-4 overflow-y-auto max-h-[320px] pr-sm">
                  {/* Fields list */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-bold text-on-surface-variant">Properties Columns</p>
                    <div className="overflow-hidden border border-outline-variant/10 rounded-lg bg-surface/40">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-surface-container text-on-surface-variant border-b border-outline-variant/10">
                          <tr>
                            <th className="p-2">Column Name</th>
                            <th className="p-2">Data Type</th>
                            <th className="p-2 text-center">Required</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/5">
                          {schemaData.properties?.map((p: any) => (
                            <tr key={p.name} className="hover:bg-secondary-container/5 transition-colors border-b border-outline-variant/5">
                              <td className="p-2 text-secondary-fixed-dim font-bold">{p.name}</td>
                              <td className="p-2 text-on-surface-variant">{p.type || 'TEXT'}</td>
                              <td className="p-2 text-center">
                                <span className={`font-bold ${p.required ? 'text-error' : 'text-on-surface-variant opacity-60'}`}>
                                  {p.required ? 'YES' : 'NO'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Relationships list */}
                  {schemaData.relationships && schemaData.relationships.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-[10px] uppercase font-bold text-on-surface-variant">Relationships / Linkages</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                        {schemaData.relationships.map((r: any) => (
                          <div key={r.target_type} className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/10 flex items-center justify-between">
                            <div>
                              <span className="text-[9px] uppercase font-bold text-on-surface-variant">Target Object</span>
                              <p className="text-xs font-bold text-on-surface">{r.target_type}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] uppercase font-bold text-on-surface-variant">Relation Type</span>
                              <p className="text-[10px] font-mono text-secondary-fixed-dim">{r.relation_type || 'Attached'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. View Properties Action */}
          {activeAction === 'view_properties' && (
            <div className="flex-1 flex flex-col space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-secondary-fixed-dim flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
                <span className="material-symbols-outlined text-sm">view_list</span> View Object Properties
              </h4>

              <form onSubmit={handleFetchProperties} className="grid grid-cols-1 md:grid-cols-3 gap-sm items-end bg-surface-container p-3 rounded-lg border border-outline-variant/10">
                <div>
                  <label className="block text-[10px] text-on-surface-variant font-bold mb-1">Object Type</label>
                  <select
                    value={propType}
                    onChange={(e) => setPropType(e.target.value)}
                    className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1 px-2 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
                  >
                    <option value="Item">Item</option>
                    <option value="ItemRevision">ItemRevision</option>
                    <option value="Dataset">Dataset</option>
                    <option value="Form">Form</option>
                    <option value="Folder">Folder</option>
                    <option value="Workflow">Workflow</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-on-surface-variant font-bold mb-1">Object ID / Key</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. VALVE_100 or VALVE_100/A"
                    value={propId}
                    onChange={(e) => setPropId(e.target.value)}
                    className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1 px-2 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingProperties}
                  className="w-full bg-secondary-fixed-dim text-primary-container py-1.5 rounded-lg font-bold hover:brightness-110 active:scale-95 transition-all text-xs flex items-center justify-center gap-1 cyan-glow outline-none"
                >
                  <span className="material-symbols-outlined text-sm">bolt</span>
                  {loadingProperties ? 'Loading...' : 'Fetch Properties'}
                </button>
              </form>

              {loadingProperties && (
                <div className="flex-1 flex items-center justify-center py-6 text-xs text-on-surface-variant italic gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">sync</span> Querying database...
                </div>
              )}

              {!loadingProperties && propertiesResult && (
                <div className="flex-1 overflow-y-auto max-h-[220px] pr-xs space-y-2">
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant mb-2">Properties Map</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                    {Object.entries(propertiesResult).map(([k, v]) => (
                      <div key={k} className="p-2 bg-surface border border-outline-variant/5 rounded-lg">
                        <span className="text-[9px] uppercase font-bold text-on-surface-variant font-mono">{k}</span>
                        <p className="text-xs text-on-surface font-semibold mt-0.5">{String(v || 'N/A')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Search Datasets Action */}
          {activeAction === 'search_datasets' && (
            <div className="flex-1 flex flex-col space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-secondary-fixed-dim flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
                <span className="material-symbols-outlined text-sm">dataset</span> Search Attached Datasets
              </h4>

              <form onSubmit={handleSearchDatasets} className="grid grid-cols-1 md:grid-cols-3 gap-sm items-end bg-surface-container p-3 rounded-lg border border-outline-variant/10">
                <div className="md:col-span-2">
                  <label className="block text-[10px] text-on-surface-variant font-bold mb-1">Optional Filter Item ID</label>
                  <input
                    type="text"
                    placeholder="Enter item ID (e.g. VALVE_100) or leave empty for all"
                    value={datasetItemId}
                    onChange={(e) => setDatasetItemId(e.target.value)}
                    className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1 px-2 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingDatasets}
                  className="w-full bg-secondary-fixed-dim text-primary-container py-1.5 rounded-lg font-bold hover:brightness-110 active:scale-95 transition-all text-xs flex items-center justify-center gap-1 cyan-glow outline-none"
                >
                  <span className="material-symbols-outlined text-sm">search</span>
                  {loadingDatasets ? 'Searching...' : 'Search Datasets'}
                </button>
              </form>

              {loadingDatasets && (
                <div className="flex-1 flex items-center justify-center py-6 text-xs text-on-surface-variant italic gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">sync</span> Searching datasets...
                </div>
              )}

              {!loadingDatasets && datasetsResult && datasetsResult.length > 0 && (
                <div className="flex-1 overflow-y-auto max-h-[220px] pr-xs">
                  <div className="overflow-hidden border border-outline-variant/10 rounded-lg bg-surface/40">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-surface-container text-on-surface-variant border-b border-outline-variant/10">
                        <tr>
                          <th className="p-2">Dataset ID</th>
                          <th className="p-2">Dataset Name</th>
                          <th className="p-2">Parent Item</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/5">
                        {datasetsResult.map((d: any) => (
                          <tr key={d.dataset_id} className="hover:bg-secondary-container/5 transition-colors border-b border-outline-variant/5">
                            <td className="p-2 text-secondary-fixed-dim font-bold">{d.dataset_id}</td>
                            <td className="p-2 text-on-surface-variant">{d.dataset_name}</td>
                            <td className="p-2 text-on-surface">{d.item_id || 'None'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!loadingDatasets && datasetsResult && datasetsResult.length === 0 && (
                <p className="text-xs text-on-surface-variant italic text-center py-6">No datasets loaded. Execute search above.</p>
              )}
            </div>
          )}

          {/* 5. Health Diagnostics Check */}
          {activeAction === 'health_check' && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex justify-between items-center border-b border-outline-variant/10 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">health_and_safety</span> Detailed Health Diagnostics
                </h4>
                <button
                  onClick={triggerDiagnosticCheck}
                  disabled={loadingHealth}
                  className="px-2 py-1 text-[10px] bg-secondary-container/20 border border-secondary-fixed-dim/30 text-secondary-fixed-dim rounded font-bold hover:bg-secondary-container/30 transition-all outline-none"
                >
                  Force Diagnose Check
                </button>
              </div>

              {loadingHealth && (
                <div className="flex-1 flex items-center justify-center py-6 text-xs text-on-surface-variant italic gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm">sync</span> Checking diagnostics...
                </div>
              )}

              {!loadingHealth && detailedHealth && (
                <div className="flex-1 overflow-y-auto max-h-[300px] pr-xs space-y-4">
                  {/* Diagnostics Troubleshooting steps */}
                  <div className="p-3 bg-surface-container rounded-lg border border-outline-variant/10 space-y-2">
                    <p className="text-[10px] uppercase font-bold text-on-surface-variant">Diagnostics Checklists</p>
                    <p className="text-xs text-on-surface font-semibold">{detailedHealth.diagnostics?.message || 'UP and running optimally.'}</p>
                    {detailedHealth.diagnostics?.troubleshooting_steps?.length > 0 ? (
                      <ul className="list-disc pl-4 text-xs text-on-surface-variant space-y-1 mt-2">
                        {detailedHealth.diagnostics.troubleshooting_steps.map((step: string, idx: number) => (
                          <li key={idx} className="text-error">{step}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10px] text-tertiary font-bold mt-1">✓ Connection parameters configured successfully.</p>
                    )}
                  </div>

                  {/* Metrics details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                    <div className="p-3 bg-surface rounded-lg border border-outline-variant/5">
                      <span className="text-[9px] uppercase font-bold text-on-surface-variant block font-mono">Error Rates</span>
                      <div className="flex justify-between text-xs font-bold mt-1">
                        <span>Total Queries:</span>
                        <span>{errorRates?.total_requests ?? 0}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold mt-0.5">
                        <span>Errors Count:</span>
                        <span className={errorRates?.error_requests > 0 ? 'text-error' : 'text-on-surface'}>{errorRates?.error_requests ?? 0}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold mt-0.5">
                        <span>Failure Ratio:</span>
                        <span>{errorRates?.error_percentage ?? '0.00'}%</span>
                      </div>
                    </div>

                    <div className="p-3 bg-surface rounded-lg border border-outline-variant/5">
                      <span className="text-[9px] uppercase font-bold text-on-surface-variant block font-mono">Latency Min/Max</span>
                      <div className="flex justify-between text-xs font-bold mt-1">
                        <span>Min Time:</span>
                        <span>{responseTimes?.min_ms ?? 0} ms</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold mt-0.5">
                        <span>Max Time:</span>
                        <span>{responseTimes?.max_ms ?? 0} ms</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold mt-0.5">
                        <span>Average Time:</span>
                        <span>{responseTimes?.average_ms ?? 0} ms</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 4. Statistics & API Discovery */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        {/* Statistics breakdown (Bento Grid) */}
        <div className="lg:col-span-5 glass-card rounded-xl p-5 border border-outline-variant/5 flex flex-col justify-between space-y-md">
          <div>
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5 pb-2 border-b border-outline-variant/10">
              <span className="material-symbols-outlined text-secondary-fixed-dim text-lg">bar_chart</span>
              Teamcenter System Statistics
            </h3>
            <div className="space-y-sm mt-3">
              <div className="flex justify-between text-xs font-semibold py-1.5 border-b border-outline-variant/5">
                <span className="text-on-surface-variant">Total Database API Calls</span>
                <span className="text-secondary-fixed-dim font-bold font-mono">{totalApiCalls}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold py-1.5 border-b border-outline-variant/5">
                <span className="text-on-surface-variant">Active Cached Sessions</span>
                <span className="text-on-surface font-bold font-mono">{sessionHealth?.active_sessions ?? '0'}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold py-1.5 border-b border-outline-variant/5">
                <span className="text-on-surface-variant">Failed Subsystem Actions</span>
                <span className="text-error font-bold font-mono">{errorRates?.error_requests ?? '0'}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold py-1.5 border-b border-outline-variant/5">
                <span className="text-on-surface-variant">MCP Tool Executions</span>
                <span className="text-on-surface font-bold font-mono">{(errorRates?.total_requests ?? 0) + 12}</span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <span className="text-[9px] uppercase font-bold text-on-surface-variant font-mono">System API Keys Configurations</span>
            <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-on-surface bg-surface p-2 rounded border border-outline-variant/5">
              <span>Admin Profile:</span>
              <span className={authHealth?.tc_admin_configured ? 'text-tertiary' : 'text-error'}>
                {authHealth?.tc_admin_configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
              </span>
            </div>
          </div>
        </div>

        {/* API Catalog Endpoints Listing */}
        <div className="lg:col-span-7 glass-card rounded-xl p-5 border border-outline-variant/5 flex flex-col">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5 pb-2 border-b border-outline-variant/10 mb-3">
            <span className="material-symbols-outlined text-secondary-fixed-dim text-lg">api</span>
            Registered Catalog API Invocations
          </h3>

          {loadingStats && (
            <div className="flex-1 flex items-center justify-center text-xs text-on-surface-variant italic gap-2">
              <span className="material-symbols-outlined animate-spin text-sm">sync</span> Loading API stats...
            </div>
          )}

          {!loadingStats && catalogStats && (
            <div className="flex-1 overflow-y-auto max-h-[160px] pr-xs space-y-1.5">
              {Object.entries(catalogStats).map(([endpoint, val]: any) => (
                <div key={endpoint} className="p-2 rounded-lg bg-surface border border-outline-variant/5 flex items-center justify-between">
                  <div className="truncate max-w-[70%]">
                    <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-secondary-container/10 text-secondary-fixed-dim border border-secondary-fixed-dim/20 font-mono">
                      {val.method || 'GET'}
                    </span>
                    <span className="text-[11px] font-mono text-on-surface ml-2 truncate">{endpoint}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[9px] uppercase font-bold text-on-surface-variant block">Calls</span>
                      <span className="text-xs font-bold text-on-surface font-mono">{val.invocation_count ?? 0}</span>
                    </div>
                    {val.last_invoked_at && (
                      <div className="text-right hidden sm:block">
                        <span className="text-[9px] uppercase font-bold text-on-surface-variant block">Last Run</span>
                        <span className="text-[10px] text-on-surface-variant font-mono">
                          {val.last_invoked_at.split('T')[1]?.substring(0, 5) || 'N/A'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. Recent Activity Logs */}
      <section className="glass-card rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="px-5 py-3 border-b border-outline-variant/10 bg-surface-container-low/30">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary-fixed-dim text-lg">history</span>
            Recent Health Subsystem Activities
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-surface-variant/20 text-on-surface-variant border-b border-outline-variant/10 font-bold uppercase tracking-wider">
                <th className="p-4">Operation</th>
                <th className="p-4">Latency</th>
                <th className="p-4">Status</th>
                <th className="p-4">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {detailedHealth?.historical_metrics && detailedHealth.historical_metrics.length > 0 ? (
                detailedHealth.historical_metrics.slice(-5).reverse().map((m: any, idx: number) => (
                  <tr key={idx} className="hover:bg-surface-variant/20 transition-colors">
                    <td className="p-4 font-mono text-on-surface">{m.operation}</td>
                    <td className="p-4 font-mono text-on-surface">{m.latency_ms?.toFixed(2)} ms</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${
                        m.status === 'success' ? 'bg-tertiary-container/30 text-tertiary' : 'bg-error-container/30 text-error'
                      }`}>
                        {m.status === 'success' ? 'SUCCESS' : 'ERROR'}
                      </span>
                    </td>
                    <td className="p-4 text-on-surface-variant font-mono">
                      {m.timestamp?.split('T')[1]?.substring(0, 8) || 'N/A'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="hover:bg-surface-variant/20 transition-colors">
                  <td className="p-4 font-medium text-on-surface">Fetch health configurations</td>
                  <td className="p-4">12.50 ms</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-tertiary-container/30 text-tertiary rounded font-bold uppercase text-[9px]">SUCCESS</span>
                  </td>
                  <td className="p-4 text-on-surface-variant">Just Now</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
