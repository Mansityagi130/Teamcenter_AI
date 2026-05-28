import type { Usage } from "../lib/types";

export function TokenCounter({ usage }: { usage: Usage | null }) {
  if (!usage) return <span className="text-sm text-slate-500">Tokens loading</span>;
  const remaining = usage.token_limit - usage.tokens_used;
  return (
    <div className="text-right text-sm">
      <div className="font-semibold">{remaining.toLocaleString()} tokens left</div>
      <div className="text-slate-500">{usage.tokens_used.toLocaleString()} / {usage.token_limit.toLocaleString()}</div>
    </div>
  );
}
