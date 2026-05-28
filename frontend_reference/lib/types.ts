export type ChatSession = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
};

export type Usage = {
  tokens_used: number;
  token_limit: number;
  reset_at: string;
};
