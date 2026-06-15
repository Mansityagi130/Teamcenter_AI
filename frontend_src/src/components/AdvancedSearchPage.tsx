import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToast, addTerminalLog } from '../store';
import apiClient from '../api';

interface AdvancedSearchPageProps {
  onNavigate: (view: string) => void;
}

interface SearchFilterState {
  type: string;
  owner: string;
  status: string;
  startDate: string;
  endDate: string;
}

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilterState;
  sortBy: string;
  sortOrder: string;
}

export function AdvancedSearchPage({ onNavigate }: AdvancedSearchPageProps) {
  const dispatch = useDispatch();

  // Search Parameters
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilterState>({
    type: '',
    owner: '',
    status: '',
    startDate: '',
    endDate: '',
  });

  const [sortBy, setSortBy] = useState('relevance');
  const [sortOrder, setSortOrder] = useState('desc');

  // Pagination
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  // Results State
  const [results, setResults] = useState<any[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);

  // Saved Searches
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saveName, setSaveName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Load Saved Searches on Mount
  useEffect(() => {
    const raw = localStorage.getItem('teamcenter.savedSearches');
    if (raw) {
      try {
        setSavedSearches(JSON.parse(raw));
      } catch (e) {
        console.error('Failed to parse saved searches', e);
      }
    }
  }, []);

  // Save current search to localStorage
  function handleSaveSearch(e: React.FormEvent) {
    e.preventDefault();
    const name = saveName.trim();
    if (!name) return;

    const newSaved: SavedSearch = {
      id: 'search_' + Date.now(),
      name,
      query,
      filters,
      sortBy,
      sortOrder,
    };

    const updatedList = [...savedSearches, newSaved];
    setSavedSearches(updatedList);
    localStorage.setItem('teamcenter.savedSearches', JSON.stringify(updatedList));
    setSaveName('');
    setShowSaveDialog(false);
    dispatch(addToast({ message: `Search saved: ${name}`, type: 'success' }));
    dispatch(addTerminalLog({
      action: 'save_search_query',
      payload: { name }
    }));
  }

  // Load saved search params
  function loadSavedSearch(saved: SavedSearch) {
    setQuery(saved.query);
    setFilters(saved.filters);
    setSortBy(saved.sortBy);
    setSortOrder(saved.sortOrder);
    setOffset(0);
    dispatch(addToast({ message: `Loaded search: ${saved.name}`, type: 'info' }));
  }

  // Delete saved search
  function deleteSavedSearch(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = savedSearches.filter((s) => s.id !== id);
    setSavedSearches(updated);
    localStorage.setItem('teamcenter.savedSearches', JSON.stringify(updated));
    dispatch(addToast({ message: 'Saved search removed', type: 'info' }));
  }

  // Execute advanced search
  async function executeSearch(currentOffset: number = 0) {
    setLoading(true);
    dispatch(addTerminalLog({
      action: 'advanced_search_query',
      payload: { query, filters, sortBy, sortOrder, offset: currentOffset }
    }));

    try {
      // Build request body matching SearchRequest schema
      const reqFilters: any = {};
      if (filters.type) reqFilters.type = filters.type;
      if (filters.owner.trim()) reqFilters.owner = filters.owner.trim();
      if (filters.status.trim()) reqFilters.status = filters.status.trim();
      if (filters.startDate) reqFilters.start_date = filters.startDate;
      if (filters.endDate) reqFilters.end_date = filters.endDate;

      const payload = {
        query: query.trim() || undefined,
        filters: Object.keys(reqFilters).length > 0 ? reqFilters : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        limit,
        offset: currentOffset,
      };

      const res = await apiClient.post('/api/advanced-search/query', payload);
      setResults(res.data.results || []);
      setTotalResults(res.data.total_results || 0);
      setOffset(currentOffset);
      dispatch(addToast({ message: `Search yielded ${res.data.total_results || 0} results`, type: 'success' }));
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Advanced search execution failed', type: 'error' }));
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    executeSearch(0);
  }

  // Export Results as CSV
  function handleExportCSV() {
    if (results.length === 0) {
      dispatch(addToast({ message: 'No results available to export', type: 'warning' }));
      return;
    }

    const headers = ['Object Name', 'Object ID', 'Type', 'Status', 'Owner', 'Creation Date'];
    const rows = results.map((r) => [
      r.name || 'N/A',
      r.id || 'N/A',
      r.type || 'N/A',
      r.workflow_status || 'N/A',
      r.createdBy || 'N/A',
      r.createdAt || 'N/A',
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `teamcenter_search_export_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    dispatch(addToast({ message: 'Exported results to CSV file', type: 'success' }));
    dispatch(addTerminalLog({
      action: 'export_csv_results',
      payload: { row_count: rows.length }
    }));
  }

  // Quick Sort Handler Mapping
  function handleSortSelect(val: string) {
    if (val === 'newest') {
      setSortBy('createdat');
      setSortOrder('desc');
    } else if (val === 'oldest') {
      setSortBy('createdat');
      setSortOrder('asc');
    } else if (val === 'alpha') {
      setSortBy('name');
      setSortOrder('asc');
    }
  }

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(totalResults / limit) || 1;

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      
      {/* 1. Page Header */}
      <div className="pb-sm border-b border-outline-variant/10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-sm">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface">Advanced Search Engine</h2>
          <p className="text-on-surface-variant text-xs mt-0.5">Ranked multi-attribute querying and filtering across the entire PLM lifecycle database.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSaveDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-outline-variant/10 text-on-surface text-xs font-bold hover:bg-surface-variant/30 transition-all outline-none"
          >
            <span className="material-symbols-outlined text-sm">bookmark</span>
            Save Search
          </button>
          <button
            onClick={handleExportCSV}
            disabled={results.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary-container/10 border border-secondary-fixed-dim/30 text-secondary-fixed-dim text-xs font-bold hover:bg-secondary-container/20 transition-all disabled:opacity-40 disabled:pointer-events-none outline-none cyan-glow"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Export CSV
          </button>
        </div>
      </div>

      {/* Save Search Dialog Backdrop Modal */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <form onSubmit={handleSaveSearch} className="glass-panel p-6 rounded-xl space-y-4 max-w-sm w-full border border-outline-variant/20 shadow-2xl">
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-secondary-fixed-dim text-lg">bookmark</span>
              Save Current Search Query
            </h3>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              Save current parameters, filters, and sorting choices so you can reload them instantly.
            </p>
            <div>
              <label className="block text-[10px] text-on-surface-variant font-bold mb-1">Search Label Name</label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Active Revisions dev-owner"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1.5 px-2.5 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
              />
            </div>
            <div className="flex justify-end gap-sm pt-2">
              <button
                type="button"
                onClick={() => setShowSaveDialog(false)}
                className="px-3 py-1.5 text-xs bg-surface-variant text-on-surface font-semibold rounded-lg hover:bg-outline-variant/20 transition-all outline-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs bg-secondary-fixed-dim text-primary-container font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all outline-none"
              >
                Confirm Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Controls & Results Panels Layout */}
      <section className="grid grid-cols-12 gap-gutter">
        {/* Left Column Controls */}
        <div className="col-span-12 lg:col-span-4 space-y-gutter">
          {/* Main search form */}
          <div className="glass-panel p-5 rounded-xl space-y-md border border-outline-variant/5">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
              <span className="material-symbols-outlined text-lg">filter_alt</span>
              Filter Parameters
            </h3>

            <form onSubmit={handleSearchSubmit} className="space-y-md">
              {/* Keyword Query */}
              <div>
                <label className="block text-xs text-on-surface-variant font-bold mb-1.5">Free-text Keyword Query</label>
                <div className="flex gap-xs items-center p-1 bg-background border border-outline-variant/30 rounded-lg focus-within:border-secondary-fixed-dim focus-within:ring-1 focus-within:ring-secondary-fixed-dim">
                  <span className="material-symbols-outlined text-on-surface-variant px-1.5 text-lg">search</span>
                  <input
                    type="text"
                    placeholder="Search IDs, Names, Descriptions..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none text-xs text-on-surface focus:ring-0 p-1 outline-none"
                  />
                </div>
              </div>

              {/* Object Type Filter */}
              <div>
                <label className="block text-xs text-on-surface-variant font-bold mb-1.5">Object Type Filter</label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                  className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1.5 px-2 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 cursor-pointer outline-none"
                >
                  <option value="">All Object Types</option>
                  <option value="Item">Item</option>
                  <option value="ItemRevision">ItemRevision</option>
                  <option value="Dataset">Dataset</option>
                  <option value="Form">Form</option>
                  <option value="Folder">Folder</option>
                  <option value="Workflow">Workflow</option>
                </select>
              </div>

              {/* Owner field */}
              <div>
                <label className="block text-xs text-on-surface-variant font-bold mb-1.5">Owner ID (createdBy)</label>
                <input
                  type="text"
                  placeholder="e.g. system, user1"
                  value={filters.owner}
                  onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
                  className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1.5 px-2.5 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
                />
              </div>

              {/* Status field */}
              <div>
                <label className="block text-xs text-on-surface-variant font-bold mb-1.5">Release / Workflow Status</label>
                <input
                  type="text"
                  placeholder="e.g. Approved, Pending, Draft"
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="w-full bg-background border border-outline-variant/30 rounded-lg text-xs py-1.5 px-2.5 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
                />
              </div>

              {/* Date Ranges */}
              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-xs text-on-surface-variant font-bold mb-1">Created From</label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    className="w-full bg-background border border-outline-variant/30 rounded-lg text-[10px] py-1.5 px-2 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant font-bold mb-1">Created To</label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    className="w-full bg-background border border-outline-variant/30 rounded-lg text-[10px] py-1.5 px-2 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 outline-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-sm">
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setFilters({ type: '', owner: '', status: '', startDate: '', endDate: '' });
                  }}
                  className="w-[30%] bg-surface-variant text-on-surface py-2 rounded-lg font-bold hover:brightness-105 active:scale-95 transition-all text-xs outline-none"
                >
                  Clear
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-secondary-fixed-dim text-primary-container py-2 rounded-lg font-bold hover:brightness-110 active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5 cyan-glow outline-none"
                >
                  <span className="material-symbols-outlined text-sm">search</span> Search Teamcenter
                </button>
              </div>
            </form>
          </div>

          {/* Saved Searches panel */}
          <div className="glass-panel p-5 rounded-xl border border-outline-variant/5 space-y-md">
            <h3 className="text-xs uppercase font-bold tracking-wider text-secondary-fixed-dim flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
              <span className="material-symbols-outlined text-lg">bookmark</span>
              Saved Query Parameters
            </h3>

            <div className="space-y-sm max-h-[160px] overflow-y-auto pr-xs">
              {savedSearches.length === 0 ? (
                <p className="text-xs text-on-surface-variant italic text-center py-2">No saved queries. Save one above.</p>
              ) : (
                savedSearches.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => loadSavedSearch(s)}
                    className="p-2 rounded-lg bg-surface border border-outline-variant/5 hover:border-secondary-fixed-dim/30 flex justify-between items-center cursor-pointer transition-all active:scale-98 group"
                  >
                    <div className="truncate">
                      <p className="text-xs font-bold text-on-surface truncate">{s.name}</p>
                      <p className="text-[10px] text-on-surface-variant truncate">
                        {s.query ? `"${s.query}"` : 'All'} · {s.filters.type || 'All types'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteSavedSearch(s.id, e)}
                      className="p-1 hover:bg-error-container/10 hover:text-error rounded text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity outline-none"
                      title="Remove Saved Query"
                    >
                      <span className="material-symbols-outlined text-xs">close</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column Results */}
        <div className="col-span-12 lg:col-span-8 space-y-gutter">
          {/* Sorting / Pagination Toolbar */}
          <div className="glass-panel p-3.5 rounded-xl border border-outline-variant/5 flex flex-col md:flex-row justify-between items-center gap-sm text-xs font-semibold">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-on-surface-variant">Sorting:</span>
                <select
                  onChange={(e) => {
                    handleSortSelect(e.target.value);
                    setOffset(0);
                    // Trigger search if result already loaded
                    if (results.length > 0) {
                      setTimeout(() => executeSearch(0), 50);
                    }
                  }}
                  className="bg-background border border-outline-variant/20 rounded-lg text-xs py-0.5 pl-2 pr-7 text-on-surface focus:border-secondary-fixed-dim focus:ring-0 cursor-pointer outline-none font-bold"
                >
                  <option value="newest">Newest Created</option>
                  <option value="oldest">Oldest Created</option>
                  <option value="alpha">Alphabetical Name</option>
                </select>
              </div>

              <div className="h-4 w-[1px] bg-outline-variant/20 hidden md:block" />

              <span className="text-on-surface-variant">
                Results: <strong className="text-on-surface font-mono">{totalResults}</strong> matching objects found
              </span>
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => executeSearch(offset - limit)}
                  disabled={offset <= 0 || loading}
                  className="p-1 border border-outline-variant/10 rounded hover:bg-surface-variant/30 text-on-surface disabled:opacity-40 disabled:hover:bg-transparent outline-none"
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                <span className="text-on-surface-variant font-mono">
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                </span>
                <button
                  onClick={() => executeSearch(offset + limit)}
                  disabled={offset + limit >= totalResults || loading}
                  className="p-1 border border-outline-variant/10 rounded hover:bg-surface-variant/30 text-on-surface disabled:opacity-40 disabled:hover:bg-transparent outline-none"
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            )}
          </div>

          {/* Results table */}
          {loading && (
            <div className="glass-panel p-10 rounded-xl flex items-center justify-center text-xs text-on-surface-variant italic gap-2 animate-pulse">
              <span className="material-symbols-outlined animate-spin text-sm">sync</span> Executing SQL engine query...
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="glass-panel p-12 rounded-xl text-center space-y-3 border border-outline-variant/5">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant opacity-40">search_off</span>
              <h4 className="text-sm font-bold text-on-surface">No Results Found</h4>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                Adjust search queries or type filters on the left panel, and click Search to query the Teamcenter database.
              </p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="glass-panel rounded-xl overflow-hidden border border-outline-variant/10 bg-surface/30">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-surface-variant/20 text-on-surface-variant border-b border-outline-variant/10 font-bold uppercase tracking-wider">
                      <th className="p-4">Object Name</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Owner</th>
                      <th className="p-4">Creation Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    {results.map((r, idx) => (
                      <tr key={idx} className="hover:bg-secondary-container/5 transition-colors border-b border-outline-variant/5">
                        <td className="p-4">
                          <div>
                            <p className="font-bold text-on-surface text-xs">{r.name || 'N/A'}</p>
                            <p className="text-[10px] text-secondary-fixed-dim font-bold font-mono mt-0.5">{r.id}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded bg-secondary-container/10 border border-secondary-fixed-dim/20 text-secondary-fixed-dim text-[9px] uppercase tracking-wider font-bold">
                            {r.type || 'Item'}
                          </span>
                        </td>
                        <td className="p-4">
                          {r.workflow_status ? (
                            <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${
                              r.workflow_status.toLowerCase() === 'approved' ? 'bg-tertiary-container/30 text-tertiary' : 'bg-secondary-container/20 text-secondary-fixed-dim'
                            }`}>
                              {r.workflow_status}
                            </span>
                          ) : (
                            <span className="text-on-surface-variant text-[10px] italic">No status</span>
                          )}
                        </td>
                        <td className="p-4 font-semibold text-on-surface-variant">{r.createdBy || 'N/A'}</td>
                        <td className="p-4 text-on-surface-variant font-mono">{r.createdAt?.substring(0, 10) || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
