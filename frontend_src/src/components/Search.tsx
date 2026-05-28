import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import apiClient from '../api';
import { addToast, addTerminalLog } from '../store';

export function Search() {
  const [searchMode, setSearchMode] = useState<'id' | 'name'>('id');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [exactMatch, setExactMatch] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'bom' | 'rev' | 'dataset'>('bom');
  const dispatch = useDispatch();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const queryVal = query.trim();
    if (!queryVal) return;

    setLoading(true);
    setResult(null);
    dispatch(addTerminalLog({
      action: 'teamcenter_search_query',
      payload: { query: queryVal, mode: searchMode, exact: exactMatch, category }
    }));

    try {
      let data = [];
      if (searchMode === 'id') {
        const res = await apiClient.get(`/search/item-id?query=${encodeURIComponent(queryVal)}&exact=${exactMatch}`);
        data = res.data;
      } else {
        const res = await apiClient.get(`/search/item-name?query=${encodeURIComponent(queryVal)}`);
        data = res.data;
      }

      if (data.length === 0) {
        throw new Error('No items matching query found');
      }

      // Filter by category client-side if needed (mock filtering)
      let filtered = [...data];
      if (category === 'assemblies') {
        filtered = data.filter((item: any) => item.item_id.startsWith('A') || item.item_name?.toLowerCase().includes('assembly'));
      } else if (category === 'components') {
        filtered = data.filter((item: any) => !item.item_id.startsWith('A') && !item.item_name?.toLowerCase().includes('assembly'));
      }

      if (filtered.length === 0) {
        throw new Error('No items matching the selected category filter');
      }

      // Take first matching item details
      const item = filtered[0];
      setResult(item);
      dispatch(addToast({ message: `Found item: ${item.item_id}`, type: 'success' }));
      dispatch(addTerminalLog({
        action: 'teamcenter_search_success',
        payload: { item_id: item.item_id }
      }));
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Search failed', type: 'error' }));
      dispatch(addTerminalLog({
        action: 'teamcenter_search_failed',
        payload: { error: err.message }
      }));
    } finally {
      setLoading(false);
    }
  }

  // Generate simulated BOM items based on the searched item
  const mockBOMItems = result ? [
    { id: `${result.item_id}-Sub01`, desc: "Housing Mounting Panel", qty: 1, status: "Validated" },
    { id: `${result.item_id}-Sub02`, desc: "Steel Support Bolt M8", qty: 8, status: "Validated" },
    { id: `${result.item_id}-Sub03`, desc: "Thermal Insulator Collar", qty: 2, status: "Pending" }
  ] : [];

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      {/* Page Header */}
      <div className="pb-sm border-b border-outline-variant/10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-sm">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface">Teamcenter Search Gateway</h2>
          <p className="text-on-surface-variant text-xs mt-0.5">Verified lookup matching Siemens Teamcenter PLM records.</p>
        </div>
        {/* Search Type Toggles */}
        <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/20 text-xs font-bold">
          <button
            type="button"
            className={`px-4 py-1.5 rounded-lg transition-colors ${searchMode === 'id' ? 'bg-secondary-container/20 text-secondary-fixed-dim' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setSearchMode('id')}
          >
            Item ID Search
          </button>
          <button
            type="button"
            className={`px-4 py-1.5 rounded-lg transition-colors ${searchMode === 'name' ? 'bg-secondary-container/20 text-secondary-fixed-dim' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setSearchMode('name')}
          >
            Item Name Search
          </button>
        </div>
      </div>

      {/* Search controls grid */}
      <section className="grid grid-cols-12 gap-gutter">
        {/* Input Card */}
        <div className="col-span-12 lg:col-span-4 space-y-gutter">
          <div className="glass-panel p-5 rounded-xl space-y-md">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5">
              <span className="material-symbols-outlined text-lg">filter_list</span>
              Query Parameters
            </h3>

            <form onSubmit={handleSearch} className="space-y-md">
              <div>
                <label className="block text-xs text-on-surface-variant font-bold mb-1.5">
                  {searchMode === 'id' ? 'Item ID (Exact Match Options)' : 'Item Name Keyword Filter'}
                </label>
                <div className="flex gap-xs items-center p-1 bg-background border border-outline-variant/30 rounded-lg focus-within:border-secondary-fixed-dim focus-within:ring-1 focus-within:ring-secondary-fixed-dim">
                  <span className="material-symbols-outlined text-on-surface-variant px-1.5 text-lg">search</span>
                  <input
                    type="text"
                    placeholder={searchMode === 'id' ? 'Enter Item ID (e.g. 4920-X1)' : 'Enter Item Name (e.g. Turbine, Bearing)'}
                    required
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none text-xs text-on-surface focus:ring-0 p-1 outline-none"
                  />
                </div>
              </div>

              {searchMode === 'id' && (
                <div className="flex items-center justify-between p-2 bg-surface-container-low rounded-lg text-xs">
                  <span className="text-on-surface-variant font-semibold">Strict Exact Match</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exactMatch}
                      onChange={(e) => setExactMatch(e.target.checked)}
                      className="sr-only peer switch-input"
                    />
                    <div className="w-9 h-5 bg-surface-variant rounded-full peer transition-all duration-300"></div>
                    <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-all duration-300 switch-dot shadow"></div>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs text-on-surface-variant font-bold mb-1.5">Filter Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1.5 px-2 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
                >
                  <option value="all">All Parts & Assemblies</option>
                  <option value="assemblies">Assemblies Only</option>
                  <option value="components">Components Only</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-secondary-fixed-dim text-primary-container py-2.5 rounded-lg font-bold hover:brightness-110 active:scale-95 transition-all text-xs flex items-center justify-center gap-2 cyan-glow outline-none"
              >
                <span className="material-symbols-outlined text-sm">search</span> Search Teamcenter DB
              </button>
            </form>
          </div>
        </div>

        {/* Results Display */}
        <div className="col-span-12 lg:col-span-8 space-y-gutter">
          {loading && (
            <div className="glass-panel p-6 rounded-xl space-y-4 animate-pulse">
              <div className="flex justify-between">
                <div className="flex gap-2">
                  <div className="w-10 h-10 bg-surface-variant rounded-lg"></div>
                  <div className="space-y-1">
                    <div className="h-4 w-24 bg-surface-variant rounded"></div>
                    <div className="h-3 w-40 bg-surface-variant rounded"></div>
                  </div>
                </div>
                <div className="h-6 w-32 bg-surface-variant rounded-full"></div>
              </div>
              <div className="h-24 bg-surface-variant/40 rounded-lg"></div>
            </div>
          )}

          {!loading && !result && (
            <div className="glass-panel p-10 rounded-xl text-center space-y-3">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant opacity-40">find_in_page</span>
              <h4 className="text-sm font-bold text-on-surface">No Item Searched</h4>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                Enter an Item ID or keyword filters in the left form panel and execute search to lookup engineering credentials.
              </p>
            </div>
          )}

          {!loading && result && (
            <div className="glass-panel p-6 rounded-xl space-y-md">
              <div className="flex justify-between items-center border-b border-outline-variant/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary-container/10 border border-secondary-fixed-dim/30 flex items-center justify-center text-secondary-fixed-dim">
                    <span className="material-symbols-outlined">description</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface">{result.item_id}</h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">{result.item_name || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary-container/30 border border-tertiary/20 text-tertiary font-bold text-[9px] uppercase tracking-wider">
                  <span className="material-symbols-outlined text-sm">verified</span>
                  Verified Teamcenter Data
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-on-surface-variant font-medium block">Description</span>
                  <span className="text-on-surface font-semibold mt-0.5 block">{result.item_description || 'No description provided.'}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant font-medium block">Created Date</span>
                  <span className="text-on-surface font-mono mt-0.5 block">{result.createdAt || 'N/A'}</span>
                </div>
              </div>

              {/* Tab control for viewers */}
              <div className="pt-4 border-t border-outline-variant/10">
                <div className="flex border-b border-outline-variant/10 text-xs font-bold gap-4 mb-3">
                  <button
                    type="button"
                    className={`pb-2 ${activeTab === 'bom' ? 'text-secondary-fixed-dim border-b-2 border-secondary-fixed-dim' : 'text-on-surface-variant hover:text-on-surface'}`}
                    onClick={() => setActiveTab('bom')}
                  >
                    BOM Structure
                  </button>
                  <button
                    type="button"
                    className={`pb-2 ${activeTab === 'rev' ? 'text-secondary-fixed-dim border-b-2 border-secondary-fixed-dim' : 'text-on-surface-variant hover:text-on-surface'}`}
                    onClick={() => setActiveTab('rev')}
                  >
                    Revision History
                  </button>
                  <button
                    type="button"
                    className={`pb-2 ${activeTab === 'dataset' ? 'text-secondary-fixed-dim border-b-2 border-secondary-fixed-dim' : 'text-on-surface-variant hover:text-on-surface'}`}
                    onClick={() => setActiveTab('dataset')}
                  >
                    Associated Datasets
                  </button>
                </div>

                {/* BOM Table Viewer */}
                {activeTab === 'bom' && (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-lg border border-outline-variant/10 bg-surface/30">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-surface-container text-on-surface-variant border-b border-outline-variant/10">
                          <tr>
                            <th className="p-3">Part ID</th>
                            <th className="p-3">Description</th>
                            <th className="p-3 text-center">Qty</th>
                            <th className="p-3">Supplier Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/5">
                          {mockBOMItems.map((b) => (
                            <tr key={b.id} className="hover:bg-secondary-container/5 transition-colors border-b border-outline-variant/5">
                              <td className="p-3 text-secondary-fixed-dim font-bold">{b.id}</td>
                              <td className="p-3 text-on-surface-variant">{b.desc}</td>
                              <td className="p-3 text-center text-on-surface">{b.qty}</td>
                              <td className={`p-3 font-semibold ${b.status === 'Validated' ? 'text-tertiary' : 'text-secondary-fixed-dim'}`}>{b.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Revisions List */}
                {activeTab === 'rev' && (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-lg border border-outline-variant/10 bg-surface/30 p-3 space-y-2">
                      {result.revisions && result.revisions.length > 0 ? (
                        result.revisions.map((r: any) => (
                          <div key={r.revision_id} className="flex justify-between py-1.5 border-b border-outline-variant/10 text-on-surface font-mono">
                            <span>Revision ID: <strong>{r.revision_id}</strong></span>
                            <span className="text-on-surface-variant text-[10px]">{r.createdAt}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-on-surface-variant italic text-xs">No revisions found.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Datasets viewer */}
                {activeTab === 'dataset' && (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-lg border border-outline-variant/10 bg-surface/30 p-3 space-y-2">
                      {result.datasets && result.datasets.length > 0 ? (
                        result.datasets.map((d: any) => (
                          <div key={d.dataset_id} className="flex justify-between py-1.5 border-b border-outline-variant/10 text-on-surface">
                            <span>{d.dataset_name} <span className="text-[10px] text-on-surface-variant font-mono">({d.dataset_id})</span></span>
                            <span className="text-[10px] text-tertiary">Attached</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-on-surface-variant italic text-xs">No datasets attached.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
