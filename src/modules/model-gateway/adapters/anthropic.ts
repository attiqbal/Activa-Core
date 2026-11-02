import type { CompletionRequest, CompletionResult, ModelAdapter } from "../types.js";

/** Calls the Anthropic Messages API directly with fetch (no SDK dependency). */
export class AnthropicAdapter implements ModelAdapter {
  readonly name = "anthropic";
  readonly tiers = ["standard", "premium"] as const;

  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const messages = req.messages.filter((m) => m.role !== "system");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 1024,
        ...(system ? { system } : {}),
        messages,
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const json = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage: { input_tokens: number; output_tokens: number };
    };
    return {
      text: json.content.map((c) => c.text ?? "").join(""),
      provider: this.name,
      model: this.model,
      inputTokens: json.usage.input_tokens,
      outputTokens: json.usage.output_tokens,
    };
  }
}
