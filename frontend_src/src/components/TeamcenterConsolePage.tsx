import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToast, addTerminalLog } from '../store';
import apiClient from '../api';

interface TeamcenterConsolePageProps {
  onNavigate: (view: string) => void;
}

interface ConsoleHistoryEntry {
  id: string;
  timestamp: string;
  serviceName: string;
  operationName: string;
  method: string;
  params: string;
  headers: string;
  payload: string;
  response: string;
  status: string;
}

const HISTORY_KEY = 'teamcenter-console-history';
const DEFAULT_HEADERS = '{}';
const DEFAULT_PARAMS = '{}';
const DEFAULT_PAYLOAD = '{\n  "item_id": "ITEM_001"\n}';

function safeParseJson(value: string, fieldName: string) {
  if (!value.trim()) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid JSON for ${fieldName}. Please check the syntax.`);
  }
}

function formatJson(value: any) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function TeamcenterConsolePage({ onNavigate }: TeamcenterConsolePageProps) {
  const dispatch = useDispatch();
  const [serviceName, setServiceName] = useState('item');
  const [operationName, setOperationName] = useState('search');
  const [method, setMethod] = useState('POST');
  const [paramsJson, setParamsJson] = useState(DEFAULT_PARAMS);
  const [headersJson, setHeadersJson] = useState(DEFAULT_HEADERS);
  const [payloadJson, setPayloadJson] = useState(DEFAULT_PAYLOAD);
  const [timeout, setTimeoutValue] = useState(10);
  const [maxRetries, setMaxRetries] = useState(3);
  const [responseText, setResponseText] = useState('');
  const [responseData, setResponseData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ConsoleHistoryEntry[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ConsoleHistoryEntry[];
        setHistory(parsed.slice(0, 20));
      } catch {
        localStorage.removeItem(HISTORY_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const addHistory = (entry: ConsoleHistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  };

  const handleExecute = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    setResponseData(null);
    setResponseText('');

    if (!serviceName.trim() || !operationName.trim()) {
      setError('Service name and operation name are required.');
      setLoading(false);
      return;
    }

    let headers: any = {};
    let params: any = {};
    let payload: any = undefined;

    try {
      headers = safeParseJson(headersJson, 'headers');
      params = safeParseJson(paramsJson, 'query params');
      payload = payloadJson.trim() ? JSON.parse(payloadJson) : undefined;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const requestBody = {
      service_name: serviceName.trim(),
      operation_name: operationName.trim(),
      method,
      headers: Object.keys(headers).length ? headers : undefined,
      params: Object.keys(params).length ? params : undefined,
      payload,
      timeout,
      max_retries: maxRetries,
    };

    dispatch(addTerminalLog({
      action: 'tc_raw_execute',
      payload: requestBody,
    }));

    try {
      const res = await apiClient.post('/api/teamcenter/raw', requestBody);
      const data = res.data;
      setResponseData(data);
      setResponseText(formatJson(data));
      dispatch(addToast({ message: 'Raw Teamcenter request completed', type: 'success' }));

      addHistory({
        id: `${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        serviceName: serviceName.trim(),
        operationName: operationName.trim(),
        method,
        params: paramsJson,
        headers: headersJson,
        payload: payloadJson,
        response: formatJson(data),
        status: data?.success ? 'success' : 'error',
      });
    } catch (err: any) {
      const message = err?.message || 'Raw execution failed';
      setError(message);
      setResponseData(null);
      setResponseText('');
      dispatch(addToast({ message, type: 'error' }));
    } finally {
      setLoading(false);
    }
  };

  const loadHistoryItem = (entry: ConsoleHistoryEntry) => {
    setServiceName(entry.serviceName);
    setOperationName(entry.operationName);
    setMethod(entry.method);
    setParamsJson(entry.params);
    setHeadersJson(entry.headers);
    setPayloadJson(entry.payload);
    setResponseText(entry.response);
    try {
      setResponseData(JSON.parse(entry.response));
    } catch {
      setResponseData(entry.response);
    }
    dispatch(addToast({ message: 'Loaded request from history', type: 'info' }));
  };

  const clearResponse = () => {
    setResponseData(null);
    setResponseText('');
    setError(null);
  };

  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      <div className="pb-sm border-b border-outline-variant/10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-sm">
        <div>
          <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface">Teamcenter Raw Console</h2>
          <p className="text-on-surface-variant text-xs mt-0.5">Execute generic Teamcenter services and operations dynamically with raw request payloads.</p>
        </div>
        <button
          onClick={() => onNavigate('teamcenter')}
          className="px-3 py-1.5 rounded-lg bg-secondary-container/10 border border-secondary-fixed-dim/30 text-secondary-fixed-dim text-xs font-bold hover:bg-secondary-container/20 transition-all outline-none"
        >
          Back to Teamcenter Home
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-gutter">
        <section className="glass-card rounded-xl border border-outline-variant/10 p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-2 text-sm text-on-surface-variant">
              Service name
              <input
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
                className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary-fixed-dim"
                placeholder="item"
              />
            </label>
            <label className="space-y-2 text-sm text-on-surface-variant">
              Operation name
              <input
                value={operationName}
                onChange={(event) => setOperationName(event.target.value)}
                className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary-fixed-dim"
                placeholder="search"
              />
            </label>
            <label className="space-y-2 text-sm text-on-surface-variant">
              HTTP method
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary-fixed-dim"
              >
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-2 text-sm text-on-surface-variant">
              Timeout (seconds)
              <input
                type="number"
                min={1}
                value={timeout}
                onChange={(event) => setTimeoutValue(Number(event.target.value))}
                className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary-fixed-dim"
              />
            </label>
            <label className="space-y-2 text-sm text-on-surface-variant">
              Retry attempts
              <input
                type="number"
                min={0}
                value={maxRetries}
                onChange={(event) => setMaxRetries(Number(event.target.value))}
                className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary-fixed-dim"
              />
            </label>
            <div className="flex items-end justify-end">
              <button
                onClick={clearResponse}
                type="button"
                className="rounded-lg border border-outline-variant/60 bg-surface-container px-4 py-2 text-sm text-on-surface hover:bg-surface-variant transition-all outline-none"
              >
                Clear Response
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-2 text-sm text-on-surface-variant md:col-span-1">
              Query params (JSON)
              <textarea
                rows={4}
                value={paramsJson}
                onChange={(event) => setParamsJson(event.target.value)}
                className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary-fixed-dim resize-none"
              />
            </label>
            <label className="space-y-2 text-sm text-on-surface-variant md:col-span-1">
              Headers (JSON)
              <textarea
                rows={4}
                value={headersJson}
                onChange={(event) => setHeadersJson(event.target.value)}
                className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary-fixed-dim resize-none"
              />
            </label>
            <label className="space-y-2 text-sm text-on-surface-variant md:col-span-1">
              Request payload (JSON)
              <textarea
                rows={4}
                value={payloadJson}
                onChange={(event) => setPayloadJson(event.target.value)}
                className="w-full rounded-lg border border-outline-variant/60 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary-fixed-dim resize-none"
              />
            </label>
          </div>

          {error ? (
            <div className="rounded-xl border border-error/20 bg-error/10 p-3 text-sm text-error">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-on-surface-variant">
              Enter the Teamcenter service and operation, then execute a raw call with an arbitrary payload.
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleExecute}
              className="inline-flex items-center justify-center rounded-lg bg-secondary-container px-4 py-3 text-sm font-bold text-secondary-fixed-dim hover:bg-secondary-container/90 transition-all disabled:cursor-not-allowed disabled:opacity-50 outline-none"
            >
              {loading ? 'Executing…' : 'Execute Raw Operation'}
            </button>
          </div>
        </section>

        <section className="glass-card rounded-xl border border-outline-variant/10 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-on-surface">Response Preview</h3>
              <p className="text-xs text-on-surface-variant">Latest response from /api/teamcenter/raw endpoint.</p>
            </div>
            <span className="rounded-full bg-surface-variant px-3 py-1 text-xs text-on-surface-variant">
              {loading ? 'Running' : 'Idle'}
            </span>
          </div>

          <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-4 text-sm text-on-surface overflow-x-auto">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">{responseText || 'No response yet. Submit an operation to begin.'}</pre>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-on-surface">History</h4>
            {history.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No history recorded yet.</p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {history.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => loadHistoryItem(entry)}
                    className="w-full rounded-xl border border-outline-variant/10 bg-surface-container p-3 text-left hover:border-secondary-container/40 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-on-surface">{entry.serviceName}/{entry.operationName}</div>
                        <div className="text-xs text-on-surface-variant">{entry.method} · {entry.timestamp}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${entry.status === 'success' ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error'}`}>
                        {entry.status}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-on-surface-variant line-clamp-2">{entry.response || 'No response body captured.'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
