"use client";

import { useState } from "react";

type ApiKeyInfo = {
  key_prefix: string;
  version: number;
  last_used_at?: string;
  rotated_at?: string;
};

export function ApiKeyCard({
  apiKey,
  onRegenerate,
}: {
  apiKey: ApiKeyInfo | null;
  onRegenerate: () => Promise<string>;
}) {
  const [revealedKey, setRevealedKey] = useState("");

  async function regenerate() {
    const raw = await onRegenerate();
    setRevealedKey(raw);
  }

  async function copy() {
    if (revealedKey) await navigator.clipboard.writeText(revealedKey);
  }

  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">API Key</h2>
          <p className="text-sm text-slate-500">Send this as X-API-KEY. Only the hash is stored server-side.</p>
        </div>
        <button onClick={regenerate} className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white">Regenerate</button>
      </div>
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div><span className="text-slate-500">Prefix</span><div className="font-mono">{apiKey?.key_prefix || "none"}</div></div>
        <div><span className="text-slate-500">Version</span><div>{apiKey?.version || 0}</div></div>
        <div><span className="text-slate-500">Last used</span><div>{apiKey?.last_used_at || "Never"}</div></div>
      </div>
      {revealedKey ? (
        <div className="mt-4 rounded bg-slate-950 p-3 font-mono text-sm text-white">
          <div className="mb-2 break-all">{revealedKey}</div>
          <button onClick={copy} className="rounded bg-teal-600 px-3 py-2 font-sans text-sm font-semibold">Copy</button>
        </div>
      ) : null}
    </section>
  );
}
