import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToast, addTerminalLog } from '../store';
import apiClient from '../api';

interface PropertyInspectorPageProps {
  onNavigate: (view: string) => void;
}

interface PropertyRow {
  name: string;
  value: string;
  type: string;
}

export function PropertyInspectorPage({ onNavigate }: PropertyInspectorPageProps) {
  const dispatch = useDispatch();

  // Form Parameters
  const [objectType, setObjectType] = useState('Item');
  const [objectId, setObjectId] = useState('');
  const [loading, setLoading] = useState(false);

  // Search results
  const [propertiesList, setPropertiesList] = useState<PropertyRow[]>([]);
  const [rawJsonData, setRawJsonData] = useState<any>(null);

  // Filters (client-side)
  const [nameFilter, setNameFilter] = useState('');
  const [valueFilter, setValueFilter] = useState('');

  // Active Tab: table vs json
  const [displayTab, setDisplayTab] = useState<'table' | 'json'>('table');

  async function handleInspect(e: React.FormEvent) {
    e.preventDefault();
    const idVal = objectId.trim();
    if (!idVal) return;

    setLoading(true);
    setPropertiesList([]);
    setRawJsonData(null);
    dispatch(addTerminalLog({
      action: 'mcp_property_inspect_request',
      payload: { object_type: objectType, object_id: idVal }
    }));

    try {
      // 1. Fetch properties all
      const resProps = await apiClient.get(`/api/properties/all?object_type=${objectType}&object_id=${encodeURIComponent(idVal)}`);
      const propsDict = resProps.data || {};
      setRawJsonData(propsDict);

      // 2. Fetch schema to resolve data types dynamically
      let typesMap: Record<string, string> = {};
      try {
        const resSchema = await apiClient.get(`/api/metadata/types/${objectType}`);
        const schemaPropsList = resSchema.data?.properties || [];
        schemaPropsList.forEach((col: any) => {
          if (col.name) {
            typesMap[col.name] = col.type || 'TEXT';
          }
        });
      } catch (schemaErr) {
        console.warn('Failed to fetch schema metadata for types mapping:', schemaErr);
      }

      // Convert dict to row structure
      const rows: PropertyRow[] = Object.entries(propsDict).map(([k, v]) => ({
        name: k,
        value: String(v === null ? '' : v).trim(),
        type: typesMap[k] || 'TEXT',
      }));

      setPropertiesList(rows);
      dispatch(addToast({ message: `Loaded ${rows.length} properties for ${idVal}`, type: 'success' }));
      dispatch(addTerminalLog({
        action: 'mcp_property_inspect_success',
        payload: { object_id: idVal, property_count: rows.length }
      }));
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Inspection query failed', type: 'error' }));
      dispatch(addTerminalLog({
        action: 'mcp_property_inspect_failed',
        payload: { error: err.message }
      }));
    } finally {
      setLoading(false);
    }
  }

  // Copy value to clipboard helper
  function handleCopy(val: string, label: string) {
    navigator.clipboard.writeText(val);
    dispatch(addToast({ message: `Copied ${label} to clipboard`, type: 'success' }));
  }

  // Filter properties client-side
  const filteredProperties = propertiesList.filter((row) => {
    const matchesName = row.name.toLowerCase().includes(nameFilter.toLowerCase());
    const matchesValue = row.value.toLowerCase().includes(valueFilter.toLowerCase());
    return matchesName && matchesValue;
  });

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      
      {/* 1. Page Header */}
      <div className="pb-sm border-b border-outline-variant/10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-sm">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface">Teamcenter Property Inspector</h2>
          <p className="text-on-surface-variant text-xs mt-0.5">Dynamic attribute inspector linking direct database attributes and catalog schema layouts.</p>
        </div>
        <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/20 text-xs font-bold">
          <button
            type="button"
            className={`px-4 py-1.5 rounded-lg transition-all outline-none ${displayTab === 'table' ? 'bg-secondary-container/20 text-secondary-fixed-dim' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setDisplayTab('table')}
          >
            Table View
          </button>
          <button
            type="button"
            className={`px-4 py-1.5 rounded-lg transition-all outline-none ${displayTab === 'json' ? 'bg-secondary-container/20 text-secondary-fixed-dim' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setDisplayTab('json')}
          >
            JSON Raw Schema
          </button>
        </div>
      </div>

      {/* 2. Lookup Controls Grid */}
      <section className="grid grid-cols-12 gap-gutter">
        {/* Input Card Panel */}
        <div className="col-span-12 lg:col-span-4 space-y-gutter">
          <div className="glass-panel p-5 rounded-xl space-y-md border border-outline-variant/5">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
              <span className="material-symbols-outlined text-lg">search</span>
              Object Lookup Specifications
            </h3>

            <form onSubmit={handleInspect} className="space-y-md">
              <div>
                <label className="block text-xs text-on-surface-variant font-bold mb-1.5">Object Class / Type</label>
                <select
                  value={objectType}
                  onChange={(e) => setObjectType(e.target.value)}
                  className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1.5 px-2 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 cursor-pointer outline-none"
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
                <label className="block text-xs text-on-surface-variant font-bold mb-1.5">Object Unique ID</label>
                <div className="flex gap-xs items-center p-1 bg-background border border-outline-variant/30 rounded-lg focus-within:border-secondary-fixed-dim focus-within:ring-1 focus-within:ring-secondary-fixed-dim">
                  <span className="material-symbols-outlined text-on-surface-variant px-1.5 text-lg font-bold">fingerprint</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. VALVE_100 or VALVE_100/A"
                    value={objectId}
                    onChange={(e) => setObjectId(e.target.value)}
                    className="flex-1 bg-transparent border-none text-xs text-on-surface focus:ring-0 p-1 outline-none font-mono"
                  />
                </div>
                <p className="text-[9px] text-on-surface-variant mt-1 italic">
                  Note: Revision IDs can be compound strings e.g. item_id/revision_id.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-secondary-fixed-dim text-primary-container py-2.5 rounded-lg font-bold hover:brightness-110 active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 cyan-glow outline-none"
              >
                <span className="material-symbols-outlined text-sm">visibility</span>
                {loading ? 'Inspecting...' : 'Load Object Properties'}
              </button>
            </form>
          </div>

          {/* Client-side search filters */}
          {propertiesList.length > 0 && displayTab === 'table' && (
            <div className="glass-panel p-5 rounded-xl space-y-md border border-outline-variant/5">
              <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
                <span className="material-symbols-outlined text-lg">filter_list</span>
                Client-Side Property Filter
              </h3>

              <div className="space-y-sm">
                <div>
                  <label className="block text-[10px] text-on-surface-variant font-bold mb-1">Filter by Property Name</label>
                  <input
                    type="text"
                    placeholder="e.g. item_name, creator"
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1.5 px-2.5 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-on-surface-variant font-bold mb-1">Filter by Property Value</label>
                  <input
                    type="text"
                    placeholder="Filter results value..."
                    value={valueFilter}
                    onChange={(e) => setValueFilter(e.target.value)}
                    className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1.5 px-2.5 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column Display */}
        <div className="col-span-12 lg:col-span-8 space-y-gutter">
          {loading && (
            <div className="glass-panel p-10 rounded-xl flex items-center justify-center text-xs text-on-surface-variant italic gap-2 animate-pulse border border-outline-variant/5">
              <span className="material-symbols-outlined animate-spin text-sm">sync</span> Pulling lifecycle properties details...
            </div>
          )}

          {!loading && propertiesList.length === 0 && (
            <div className="glass-panel p-12 rounded-xl text-center space-y-3 border border-outline-variant/5">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant opacity-40">assignment</span>
              <h4 className="text-sm font-bold text-on-surface">No Object Selected</h4>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                Input type and credentials on the left form panel and inspect properties columns, value registers, and catalog types schema.
              </p>
            </div>
          )}

          {!loading && propertiesList.length > 0 && (
            <div className="w-full">
              {/* Display Tab: Table View */}
              {displayTab === 'table' && (
                <div className="glass-panel rounded-xl overflow-hidden border border-outline-variant/10 bg-surface/30">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-surface-variant/20 text-on-surface-variant border-b border-outline-variant/10 font-bold uppercase tracking-wider">
                          <th className="p-4">Property Name</th>
                          <th className="p-4">Property Value</th>
                          <th className="p-4">Type Mapping</th>
                          <th className="p-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/5">
                        {filteredProperties.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-on-surface-variant italic">
                              No properties matched the filters.
                            </td>
                          </tr>
                        ) : (
                          filteredProperties.map((row) => (
                            <tr key={row.name} className="hover:bg-secondary-container/5 transition-colors border-b border-outline-variant/5">
                              <td className="p-4 font-mono text-secondary-fixed-dim font-bold">{row.name}</td>
                              <td className="p-4 font-semibold text-on-surface truncate max-w-[200px]">{row.value || <span className="text-on-surface-variant opacity-50 italic">empty</span>}</td>
                              <td className="p-4">
                                <span className="px-2 py-0.5 rounded bg-surface border border-outline-variant/10 text-[9px] uppercase tracking-wider font-mono text-on-surface-variant font-bold">
                                  {row.type}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(row.value, row.name)}
                                  disabled={!row.value}
                                  className="p-1 hover:bg-secondary-container/20 text-secondary-fixed-dim rounded transition-colors disabled:opacity-30 disabled:pointer-events-none outline-none"
                                  title="Copy Value"
                                >
                                  <span className="material-symbols-outlined text-sm font-bold">content_copy</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Display Tab: JSON View */}
              {displayTab === 'json' && rawJsonData && (
                <div className="glass-panel rounded-xl p-5 border border-outline-variant/10 bg-surface/30 space-y-4">
                  <div className="flex justify-between items-center border-b border-outline-variant/10 pb-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">JSON Document Schema</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(JSON.stringify(rawJsonData, null, 2), 'JSON Data')}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] bg-secondary-container/20 border border-secondary-fixed-dim/30 text-secondary-fixed-dim rounded font-bold hover:bg-secondary-container/30 transition-all outline-none"
                    >
                      <span className="material-symbols-outlined text-xs">content_copy</span> Copy Raw JSON
                    </button>
                  </div>
                  <pre className="font-mono text-left bg-surface/80 p-4 rounded border border-outline-variant/5 text-[11px] text-[#74f5ff] overflow-x-auto max-h-[340px] select-all terminal-scroll">
                    {JSON.stringify(rawJsonData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
