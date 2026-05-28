"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ActivityLog } from "./ActivityLog";
import { ApiKeyCard } from "./ApiKeyCard";

type Profile = {
  user: { email: string; display_name?: string; created_at: string };
  api_key: { key_prefix: string; version: number; last_used_at?: string; rotated_at?: string };
  usage: { tokens_used: number; token_limit: number; reset_at: string };
};

export function SettingsPanel() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activity, setActivity] = useState<any>({ token_logs: [], activity_logs: [] });
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<Profile>("/settings/profile").then(setProfile);
    api("/settings/activity").then(setActivity);
  }, []);

  async function regenerate() {
    const data = await api<{ api_key: string; key_prefix: string }>("/auth/api-key/regenerate", { method: "POST" });
    setMessage("New key generated. Store it now; it will not be shown again.");
    setProfile((prev) => prev ? { ...prev, api_key: { ...prev.api_key, key_prefix: data.key_prefix, version: prev.api_key.version + 1 } } : prev);
    return data.api_key;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-sm text-slate-600">Profile, API key, usage, and help.</p>
          </div>
          <a className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white" href="/">Back to chat</a>
        </header>

        {message ? <div className="rounded border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{message}</div> : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-white p-5 shadow-sm md:col-span-2">
            <h2 className="mb-3 font-semibold">User Profile</h2>
            <dl className="grid gap-3 text-sm">
              <div><dt className="text-slate-500">Email</dt><dd className="font-medium">{profile?.user.email}</dd></div>
              <div><dt className="text-slate-500">Display name</dt><dd className="font-medium">{profile?.user.display_name || "Not set"}</dd></div>
              <div><dt className="text-slate-500">Joined</dt><dd>{profile ? new Date(profile.user.created_at).toLocaleString() : ""}</dd></div>
            </dl>
          </div>
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-semibold">Daily Usage</h2>
            <div className="text-3xl font-semibold">{profile?.usage.tokens_used.toLocaleString() || 0}</div>
            <p className="text-sm text-slate-500">of {profile?.usage.token_limit.toLocaleString() || 0} tokens</p>
            <p className="mt-3 text-xs text-slate-500">Resets {profile ? new Date(profile.usage.reset_at).toLocaleString() : ""}</p>
          </div>
        </section>

        <ApiKeyCard apiKey={profile?.api_key || null} onRegenerate={regenerate} />
        <ActivityLog data={activity} />

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Help / FAQ</h2>
          <div className="space-y-3 text-sm text-slate-700">
            <p><strong>Why can I hit a limit?</strong> Every request counts input and output tokens against a strict 24-hour quota.</p>
            <p><strong>Where is my API key stored?</strong> Only a hash is stored in the database. The raw key is shown once when generated.</p>
            <p><strong>How do tools work?</strong> The backend invokes MCP tools on behalf of the AI agent and records tool calls for auditing.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
