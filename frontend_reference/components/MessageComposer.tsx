"use client";

import { useState } from "react";

export function MessageComposer({ onSend }: { onSend: (content: string) => Promise<void> }) {
  const [value, setValue] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const content = value.trim();
    if (!content) return;
    setValue("");
    await onSend(content);
  }

  return (
    <form onSubmit={submit} className="border-t bg-white p-4">
      <div className="mx-auto flex max-w-3xl gap-3">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-12 flex-1 resize-none rounded border px-3 py-2 outline-none focus:border-teal-600"
          placeholder="Ask anything..."
        />
        <button className="rounded bg-teal-600 px-5 font-semibold text-white">Send</button>
      </div>
    </form>
  );
}
