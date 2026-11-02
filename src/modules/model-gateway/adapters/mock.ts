import type { CompletionRequest, CompletionResult, ModelAdapter } from "../types.js";

/** For tests and local development: no network, no cost. */
export class MockAdapter implements ModelAdapter {
  calls = 0;
  constructor(
    readonly name = "mock",
    readonly tiers: readonly ("standard" | "premium")[] = ["standard", "premium"],
    private fail = false,
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls++;
    if (this.fail) throw new Error("boom");
    const last = req.messages[req.messages.length - 1]?.content ?? "";
    return { text: `echo: ${last}`, provider: this.name, model: "mock-1", inputTokens: 1, outputTokens: 1 };
  }
}
