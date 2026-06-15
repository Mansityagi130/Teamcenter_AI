import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import apiClient from '../api';
import { addToast, addTerminalLog } from '../store';

interface ServiceSummary {
  service: string;
  category: string;
  description: string;
  operation_count: number;
}

interface OperationMetadata {
  service: string;
  operation: string;
  endpoint: string;
  method: string;
  category: string;
  description: string;
  parameters: Record<string, any>;
  request_schema: Record<string, any>;
  response_schema: Record<string, any>;
}

const DEFAULT_PAYLOAD = '{\n  "item_id": "ITEM_001"\n}';
const DEFAULT_HEADERS = '{}';
const DEFAULT_PARAMS = '{}';

function formatJson(value: any) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJson(value: string, fieldName: string) {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid JSON in ${fieldName}.`);
  }
}

export function ApiExplorerPage({ onNavigate }: { onNavigate: (view: string) => void }) {
  const dispatch = useDispatch();
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [selectedService, setSelectedService] = useState<string>('');
  const [serviceOperations, setServiceOperations] = useState<OperationMetadata[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<OperationMetadata | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<OperationMetadata[]>([]);
  const [requestBody, setRequestBody] = useState(DEFAULT_PAYLOAD);
  const [requestHeaders, setRequestHeaders] = useState(DEFAULT_HEADERS);
  const [requestParams, setRequestParams] = useState(DEFAULT_PARAMS);
  const [responseText, setResponseText] = useState('');
  const [apiResult, setApiResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadServices() {
      try {
        const res = await apiClient.get('/api/explorer/services');
        setServices(res.data);
      } catch (err: any) {
        dispatch(addToast({ message: err.message || 'Failed to load services', type: 'error' }));
      }
    }
    loadServices();
  }, [dispatch]);

  const loadServiceDetails = async (service: string) => {
    setSelectedService(service);
    setSelectedOperation(null);
    setServiceOperations([]);
    setApiResult(null);
    setResponseText('');
    try {
      const res = await apiClient.get(`/api/explorer/service/${encodeURIComponent(service)}`);
      setServiceOperations(res.data.operations || []);
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Failed to load service details', type: 'error' }));
    }
  };

  const loadOperationDetails = async (operation: OperationMetadata) => {
    setSelectedOperation(operation);
    setError(null);
    setApiResult(null);
    setResponseText('');

    const defaultBody = Object.keys(operation.parameters || {}).length
      ? JSON.stringify(
          Object.fromEntries(
            Object.entries(operation.parameters).map(([key, value]) => [key, value.type === 'String' ? '' : null])
          ),
          null,
          2
        )
      : DEFAULT_PAYLOAD;

    setRequestBody(defaultBody);
    setRequestHeaders(DEFAULT_HEADERS);
    setRequestParams(DEFAULT_PARAMS);
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setApiResult(null);
    setResponseText('');

    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await apiClient.post('/api/explorer/search', { keyword: searchTerm.trim() });
      setSearchResults(res.data);
      if (res.data.length === 0) {
        dispatch(addToast({ message: 'No API matches found', type: 'warning' }));
      }
    } catch (err: any) {
      dispatch(addToast({ message: err.message || 'Search failed', type: 'error' }));
    }
  };

  const handleExecute = async () => {
    if (!selectedOperation) {
      setError('Please select an operation before executing.');
      return;
    }

    let headers = {};
    let params = {};
    let payload: any = undefined;

    try {
      headers = parseJson(requestHeaders, 'headers');
      params = parseJson(requestParams, 'query params');
      payload = requestBody.trim() ? JSON.parse(requestBody) : undefined;
    } catch (err: any) {
      setError(err.message);
      return;
    }

    setLoading(true);
    setError(null);
    setResponseText('');
    setApiResult(null);

    dispatch(addTerminalLog({ action: 'search_teamcenter_api', payload: { service: selectedOperation.service, operation: selectedOperation.operation } }));

    try {
      const res = await apiClient.post('/api/explorer/execute', {
        service_name: selectedOperation.service,
        operation_name: selectedOperation.operation,
        method: selectedOperation.method,
        headers: Object.keys(headers).length ? headers : undefined,
        params: Object.keys(params).length ? params : undefined,
        payload,
      });
      setApiResult(res.data);
      setResponseText(formatJson(res.data));
      dispatch(addToast({ message: 'API executed successfully', type: 'success' }));
    } catch (err: any) {
      setError(err.detail || err.message || 'API execution failed');
      dispatch(addToast({ message: err.detail || err.message || 'Execution failed', type: 'error' }));
    } finally {
      setLoading(false);
    }
  };

  const selectedPanelSource = useMemo(() => {
    if (selectedOperation) {
      return selectedOperation;
    }
    if (searchResults.length > 0) {
      return searchResults[0];
    }
    return null;
  }, [selectedOperation, searchResults]);

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      <div className="pb-sm border-b border-outline-variant/10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-sm">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface">Teamcenter API Explorer</h2>
          <p className="text-on-surface-variant text-xs mt-0.5">Discover services, inspect operations, view schemas, and execute Teamcenter APIs directly.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1.1fr_1rem] gap-gutter">
        <section className="glass-card rounded-xl border border-outline-variant/10 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-on-surface">Service Catalog</h3>
              <p className="text-xs text-on-surface-variant">Browse available Teamcenter API services.</p>
            </div>
          </div>

          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {services.map((item) => (
              <button
                key={item.service}
                type="button"
                onClick={() => loadServiceDetails(item.service)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${item.service === selectedService ? 'border-secondary-container bg-secondary-container/10' : 'border-outline-variant/20 bg-surface-container hover:border-secondary-fixed-dim/40'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-on-surface">{item.service}</span>
                  <span className="rounded-full bg-surface-variant px-2 py-0.5 text-[11px] text-on-surface-variant">{item.operation_count}</span>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant line-clamp-2">{item.description}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-card rounded-xl border border-outline-variant/10 p-4 space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-on-surface">Search APIs</h3>
              <p className="text-xs text-on-surface-variant">Search services and operations by keyword.</p>
            </div>

            <form onSubmit={handleSearch} className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search API by keyword..."
                className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary-fixed-dim"
              />
              <button
                type="submit"
                className="rounded-lg bg-secondary-container px-4 py-2 text-sm font-bold text-secondary-fixed-dim hover:bg-secondary-container/90 transition-all outline-none"
              >
                Search
              </button>
            </form>

            <div className="grid gap-3">
              <h4 className="text-sm font-semibold text-on-surface">Operations</h4>
              <div className="max-h-[280px] overflow-y-auto pr-1 space-y-2">
                {(searchResults.length ? searchResults : serviceOperations).map((operation) => (
                  <button
                    key={`${operation.service}/${operation.operation}`}
                    type="button"
                    onClick={() => loadOperationDetails(operation)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${selectedOperation?.endpoint === operation.endpoint ? 'border-secondary-container bg-secondary-container/10' : 'border-outline-variant/20 bg-surface-container hover:border-secondary-fixed-dim/40'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-on-surface">{operation.operation}</span>
                      <span className="rounded-full bg-surface-variant px-2 py-0.5 text-[11px] text-on-surface-variant">{operation.method}</span>
                    </div>
                    <p className="mt-1 text-xs text-on-surface-variant line-clamp-2">{operation.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-gutter">
        <section className="glass-card rounded-xl border border-outline-variant/10 p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-on-surface">Request Schema</h3>
              <p className="text-xs text-on-surface-variant">View the request schema for the selected Teamcenter operation.</p>
            </div>
            <span className="rounded-full bg-surface-variant px-3 py-1 text-[11px] text-on-surface-variant">
              {selectedOperation?.method || 'None'}
            </span>
          </div>

          <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-4 text-sm text-on-surface overflow-x-auto">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
              {selectedOperation ? formatJson(selectedOperation.request_schema) : 'Select an operation to inspect its request schema.'}
            </pre>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-on-surface">Parameters</h4>
            {selectedOperation ? (
              Object.entries(selectedOperation.parameters).length ? (
                <div className="space-y-2">
                  {Object.entries(selectedOperation.parameters).map(([key, param]) => (
                    <div key={key} className="rounded-xl border border-outline-variant/10 bg-surface-container p-3 text-sm">
                      <div className="font-semibold text-on-surface">{key}</div>
                      <div className="text-xs text-on-surface-variant">{param.description}</div>
                      <div className="text-[11px] text-on-surface-variant">Type: {param.type}, Required: {param.required ? 'Yes' : 'No'}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">This operation does not take any request parameters.</p>
              )
            ) : (
              <p className="text-sm text-on-surface-variant">Select an operation to view request details.</p>
            )}
          </div>
        </section>

        <section className="glass-card rounded-xl border border-outline-variant/10 p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-on-surface">Response Schema</h3>
              <p className="text-xs text-on-surface-variant">Preview the output schema for the selected operation.</p>
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-4 text-sm text-on-surface overflow-x-auto">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
              {selectedOperation ? formatJson(selectedOperation.response_schema) : 'Response schema is shown after selecting an operation.'}
            </pre>
          </div>
        </section>
      </div>

      <section className="glass-card rounded-xl border border-outline-variant/10 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-on-surface">API Testing</h3>
            <p className="text-xs text-on-surface-variant">Send a request to the selected Teamcenter operation and inspect the result.</p>
          </div>
          <button
            type="button"
            onClick={handleExecute}
            disabled={!selectedOperation || loading}
            className="rounded-lg bg-secondary-container px-4 py-2 text-sm font-bold text-secondary-fixed-dim hover:bg-secondary-container/90 transition-all disabled:cursor-not-allowed disabled:opacity-50 outline-none"
          >
            {loading ? 'Executing…' : 'Execute API'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <label className="space-y-2 text-sm text-on-surface-variant">
            Request Headers (JSON)
            <textarea
              rows={4}
              value={requestHeaders}
              onChange={(event) => setRequestHeaders(event.target.value)}
              className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none resize-none"
            />
          </label>
          <label className="space-y-2 text-sm text-on-surface-variant">
            Query Params (JSON)
            <textarea
              rows={4}
              value={requestParams}
              onChange={(event) => setRequestParams(event.target.value)}
              className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none resize-none"
            />
          </label>
        </div>

        <label className="space-y-2 text-sm text-on-surface-variant">
          Request Body (JSON)
          <textarea
            rows={10}
            value={requestBody}
            onChange={(event) => setRequestBody(event.target.value)}
            className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none resize-none"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>
        ) : null}

        <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-4 text-sm text-on-surface overflow-x-auto">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-on-surface">JSON Response</span>
            <span className="text-xs text-on-surface-variant">{loading ? 'Waiting...' : apiResult ? 'Received' : 'No response yet'}</span>
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">{responseText || 'Execute an operation to see the API response here.'}</pre>
        </div>
      </section>
    </div>
  );
}
