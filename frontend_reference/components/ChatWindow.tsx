import type { Message } from "../lib/types";

export function ChatWindow({ messages, draftResponse }: { messages: Message[]; draftResponse: string }) {
  return (
    <section className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block max-w-[80%] rounded-lg px-4 py-3 text-sm ${message.role === "user" ? "bg-teal-600 text-white" : "bg-white shadow"}`}>
              {message.content}
            </div>
          </div>
        ))}
        {draftResponse ? (
          <div className="text-left">
            <div className="inline-block max-w-[80%] rounded-lg bg-white px-4 py-3 text-sm shadow">{draftResponse}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
