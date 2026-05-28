import type { ChatSession } from "../lib/types";

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelect,
}: {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="border-r bg-slate-950 p-4 text-white">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold">History</h2>
        <a className="rounded bg-teal-600 px-3 py-2 text-sm font-semibold" href="/settings">Settings</a>
      </div>
      <div className="space-y-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelect(session.id)}
            className={`w-full rounded px-3 py-2 text-left text-sm ${session.id === activeSessionId ? "bg-white/15" : "hover:bg-white/10"}`}
          >
            <span className="block truncate font-medium">{session.title}</span>
            <span className="text-xs text-slate-300">{new Date(session.updated_at).toLocaleString()}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
