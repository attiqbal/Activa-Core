import type { CompletionRequest, CompletionResult, ModelAdapter } from "../types.js";

/**
 * Works with any server that speaks the OpenAI chat API, which includes vLLM
 * on RunPod and most hosted open-model providers. This is the adapter for
 * the cheap open models.
 */
export class OpenAICompatibleAdapter implements ModelAdapter {
  readonly tiers: readonly ("standard" | "premium")[];

  constructor(
    readonly name: string,
    private baseUrl: string,
    private apiKey: string,
    private model: string,
    tiers: readonly ("standard" | "premium")[] = ["standard"],
  ) {
    this.tiers = tiers;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages: req.messages, max_tokens: req.maxTokens ?? 1024 }),
    });
    if (!res.ok) throw new Error(`${this.name} ${res.status}`);
    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      text: json.choices[0]?.message.content ?? "",
      provider: this.name,
      model: this.model,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }
}
