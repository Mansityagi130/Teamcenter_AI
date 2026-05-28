"use client";

import { useEffect, useState } from "react";
import { api, streamMessage } from "../lib/api";
import type { ChatSession, Message, Usage } from "../lib/types";
import { ChatSidebar } from "./ChatSidebar";
import { ChatWindow } from "./ChatWindow";
import { MessageComposer } from "./MessageComposer";
import { TokenCounter } from "./TokenCounter";

export function ChatLayout() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draftResponse, setDraftResponse] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ChatSession[]>("/chat/sessions").then((rows) => {
      setSessions(rows);
      setActiveSessionId(rows[0]?.id || "");
    }).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    api<Message[]>(`/chat/sessions/${activeSessionId}/messages`).then(setMessages).catch((err) => setError(err.message));
  }, [activeSessionId]);

  async function send(content: string) {
    if (!activeSessionId) return;
    setError("");
    setDraftResponse("");
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      role: "user",
      content,
      input_tokens: 0,
      output_tokens: 0,
      created_at: new Date().toISOString(),
    }]);
    try {
      await streamMessage(
        activeSessionId,
        content,
        (chunk) => setDraftResponse((prev) => prev + chunk),
        () => api<{ usage: Usage }>("/settings/profile").then((profile: any) => setUsage(profile.usage)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message failed");
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-[280px_1fr]">
      <ChatSidebar sessions={sessions} activeSessionId={activeSessionId} onSelect={setActiveSessionId} />
      <section className="flex min-w-0 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-white px-6">
          <h1 className="text-lg font-semibold">AI Chat</h1>
          <TokenCounter usage={usage} />
        </header>
        {error ? <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">{error}</div> : null}
        <ChatWindow messages={messages} draftResponse={draftResponse} />
        <MessageComposer onSend={send} />
      </section>
    </main>
  );
}
