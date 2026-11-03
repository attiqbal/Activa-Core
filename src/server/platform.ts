import type { Sink } from "../core/persistence.js";
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
  /** Remember a Slack bot token (and store it encrypted when storage is on). */
  let sink: (Sink & { flush(): Promise<void> }) | undefined;
  const saveSlackToken = (workspaceId: string, team: string, token: string) => {
    slackTokens.set(team, token);
    sink?.slackToken(workspaceId, team, token);
  };

  /**
   * Turn on durable storage: load everything saved, put it back into the services,
   * then start writing every new change behind them. Call once, before serving.
   */
  async function attachStore(store: Sink & { flush(): Promise<void>; load(): Promise<import("../core/persistence.js").Snapshot> }): Promise<void> {
    const s = await store.load();
    for (const w of s.workspaces) identity.restoreWorkspace(w);
    for (const m of s.memberships) identity.restoreMember(m.workspaceId, m.userId, m.role);
    for (const e of s.employees) workforce.restoreEmployee(e);
    for (const x of s.profiles) workforce.restoreProfile(x.workspaceId, x.profile);
    for (const x of s.accounts) ledger.restoreAccount(x.workspaceId, x.account);
    for (const e of s.entries) ledger.restoreEntry(e);
    for (const u of s.usage) energy.restoreUsage(u);
    for (const x of s.plans) energy.restorePlan(x.workspaceId, x.plan);
    for (const a of s.audit) audit.restore(a);
    for (const c of s.connections) router.restoreConnection(c);
    for (const l of s.links) router.restoreLink(l.key, l.userId);
    for (const t of s.slackTokens) slackTokens.set(t.team, t.token);
    sink = store;
    for (const part of [audit, identity, energy, workforce, ledger, router]) part.useSink(store);
  }

  const healthy = () => (sink as { healthy?: boolean } | undefined)?.healthy !== false;

  return { healthy, cfg, now, audit, bus, identity, energy, workforce, ledger, onboarding, router, slackTokens, saveSlackToken, attachStore };
}
export type Platform = ReturnType<typeof createPlatform>;
