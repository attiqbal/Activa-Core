import { EventBus } from "../core/events.js";
import { AuditLog } from "../modules/audit/index.js";
import { ChannelRouter, SlackChannel } from "../modules/channels/index.js";
import { EnergyMeter } from "../modules/energy/index.js";
import { IdentityService } from "../modules/identity/index.js";
import { Ledger } from "../modules/ledger/index.js";
import { AnthropicAdapter } from "../modules/model-gateway/adapters/anthropic.js";
import { MockAdapter } from "../modules/model-gateway/adapters/mock.js";
import { ModelGateway } from "../modules/model-gateway/gateway.js";
import { OnboardingService } from "../modules/onboarding/index.js";
import { WorkforceService } from "../modules/workforce/index.js";

export interface PlatformConfig {
  anthropicApiKey?: string;
  anthropicModel?: string;
  sessionSecret: string;
  /** Dev-only sign-in by email, no verification. Must stay off in production. */
  allowDevAuth: boolean;
  slack?: { clientId: string; clientSecret: string; signingSecret: string; redirectUri: string };
  now?: () => Date;
  http?: typeof fetch;
}

/** Wires every module together. One place, so the server and tests build the same system. */
export function createPlatform(cfg: PlatformConfig) {
  const now = cfg.now ?? (() => new Date());
  const audit = new AuditLog();
  const bus = new EventBus();
  const identity = new IdentityService(audit, bus);
  const energy = new EnergyMeter(identity, audit, now);
  const gateway = new ModelGateway([
    cfg.anthropicApiKey ? new AnthropicAdapter(cfg.anthropicApiKey, cfg.anthropicModel ?? "claude-haiku-5-5") : new MockAdapter(),
  ]);
  const workforce = new WorkforceService(identity, audit, bus, gateway, energy);
  const ledger = new Ledger(identity, audit);
  const onboarding = new OnboardingService(identity, workforce, ledger, energy, audit, now);
  const router = new ChannelRouter(identity, workforce, audit);
  /** Bot tokens by Slack team. Held in memory for now; encrypted storage comes with Postgres wiring. */
  const slackTokens = new Map<string, string>();
  router.register(new SlackChannel((team) => slackTokens.get(team) ?? "", cfg.http));
  return { cfg, now, audit, bus, identity, energy, workforce, ledger, onboarding, router, slackTokens };
}
export type Platform = ReturnType<typeof createPlatform>;
