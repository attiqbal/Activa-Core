/**
 * The one interface every AI model provider implements. AI employees never
 * talk to a provider directly, so providers (Claude, open models hosted on
 * RunPod, others) can be added or swapped without touching employee logic.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  /** "standard" can run on a cheap open model; "premium" asks for the strongest. */
  tier?: "standard" | "premium";
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelAdapter {
  readonly name: string;
  /** Tiers this adapter is willing to serve. */
  readonly tiers: readonly ("standard" | "premium")[];
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
