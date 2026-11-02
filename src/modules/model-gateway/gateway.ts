import type { CompletionRequest, CompletionResult, ModelAdapter } from "./types.js";

/**
 * Picks an adapter for a request and falls back to the next one on failure.
 * Adapters are tried in registration order among those serving the tier, so
 * registering the cheap open model first sends routine work there and keeps
 * a stronger model as the fallback.
 */
export class ModelGateway {
  constructor(private adapters: ModelAdapter[]) {
    if (adapters.length === 0) throw new Error("ModelGateway needs at least one adapter");
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const tier = req.tier ?? "standard";
    const candidates = this.adapters.filter((a) => a.tiers.includes(tier));
    if (candidates.length === 0) throw new Error(`no adapter serves tier "${tier}"`);
    const errors: string[] = [];
    for (const adapter of candidates) {
      try {
        return await adapter.complete(req);
      } catch (err) {
        errors.push(`${adapter.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(`all adapters failed: ${errors.join("; ")}`);
  }
}
