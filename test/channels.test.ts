import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuditLog, ChannelError, ChannelRouter, EnergyMeter, EventBus, IdentityService, MockAdapter, ModelGateway, SlackChannel, WorkforceService, channelAllowed, parseSlackEvent, verifySlackSignature } from "../src/index.js";
import type { ChatChannel } from "../src/index.js";

const SECRET = "shh";
const sign = (ts: number, body: string) => `v0=${createHmac("sha256", SECRET).update(`v0:${ts}:${body}`).digest("hex")}`;

class Fake implements ChatChannel {
  readonly kind = "slack" as const;
  sent: { ws: string; conv: string; text: string }[] = [];
  async send(ws: string, conv: string, text: string) { this.sent.push({ ws, conv, text }); }
}

async function setup() {
  const audit = new AuditLog();
  const bus = new EventBus();
  const identity = new IdentityService(audit, bus);
  const energy = new EnergyMeter(identity, audit);
  const wf = new WorkforceService(identity, audit, bus, new ModelGateway([new MockAdapter()]), energy);
  const ws = await identity.createWorkspace("owner", { name: "Acme" });
  const fin = await wf.hire("owner", ws.id, "finance-manager");
  const mkt = await wf.hire("owner", ws.id, "marketing-manager");
  const router = new ChannelRouter(identity, wf, audit);
  const chat = new Fake();
  router.register(chat);
  router.connect("owner", { workspaceId: ws.id, channel: "slack", externalWorkspace: "T1", defaultEmployeeId: mkt.id }, []);
  router.linkUser("owner", ws.id, "slack", "T1", "U1");
  return { router, chat, energy, identity, ws: ws.id, fin, mkt };
}
const msg = (over = {}) => ({ channel: "slack" as const, externalWorkspace: "T1", externalUser: "U1", conversation: "D1", text: "hello", eventId: "E1", ...over });

describe("slack signature", () => {
  it("accepts a valid signature, rejects tampering and replays", () => {
    const body = '{"a":1}', now = 1_000_000;
    expect(verifySlackSignature(SECRET, String(now), body, sign(now, body), now)).toBe(true);
    expect(verifySlackSignature(SECRET, String(now), body + " ", sign(now, body), now)).toBe(false);
    expect(verifySlackSignature("other", String(now), body, sign(now, body), now)).toBe(false);
    expect(verifySlackSignature(SECRET, String(now), body, sign(now, body), now + 301)).toBe(false);
  });
});

describe("slack events", () => {
  const now = 2_000_000;
  const send = (payload: object) => { const raw = JSON.stringify(payload); return parseSlackEvent(SECRET, { timestamp: String(now), signature: sign(now, raw) }, raw, now); };
  it("answers the URL challenge", () => {
    expect(send({ type: "url_verification", challenge: "abc" }).result.body).toEqual({ challenge: "abc" });
  });
  it("rejects unsigned requests", () => {
    expect(parseSlackEvent(SECRET, { timestamp: String(now), signature: "v0=bad" }, "{}", now).result.status).toBe(401);
  });
  it("turns a direct message into an inbound message and strips the mention", () => {
    const r = send({ type: "event_callback", team_id: "T1", event_id: "E9", event: { type: "app_mention", user: "U1", channel: "C1", text: "<@UBOT> finance: runway?" } });
    expect(r.message).toMatchObject({ externalWorkspace: "T1", text: "finance: runway?", eventId: "E9" });
  });
  it("ignores bots, edits and un-mentioned channel chatter", () => {
    const base = { type: "event_callback", team_id: "T1", event_id: "E", };
    expect(send({ ...base, event: { type: "message", channel_type: "im", user: "U1", bot_id: "B", text: "x", channel: "D" } }).message).toBeUndefined();
    expect(send({ ...base, event: { type: "message", channel_type: "im", user: "U1", subtype: "message_changed", text: "x", channel: "D" } }).message).toBeUndefined();
    expect(send({ ...base, event: { type: "message", channel_type: "channel", user: "U1", text: "x", channel: "C" } }).message).toBeUndefined();
    expect(send({ ...base, event: { type: "message", channel_type: "im", user: "U1", text: "hi", channel: "D" } }).message).toBeDefined();
  });
});

describe("router", () => {
  it("replies from the default employee and routes by keyword", async () => {
    const { router, chat } = await setup();
    expect(await router.handle(msg())).toBe("replied");
    expect(await router.handle(msg({ eventId: "E2", text: "finance: what is our runway?" }))).toBe("replied");
    expect(chat.sent).toHaveLength(2);
  });
  it("ignores duplicate deliveries", async () => {
    const { router, chat } = await setup();
    await router.handle(msg());
    expect(await router.handle(msg())).toBe("duplicate");
    expect(chat.sent).toHaveLength(1);
  });
  it("does no work for unlinked people or unknown chat workspaces", async () => {
    const { router, chat } = await setup();
    expect(await router.handle(msg({ externalUser: "U2" }))).toBe("unlinked");
    expect(chat.sent[0]!.text).toMatch(/link your/i);
    expect(await router.handle(msg({ externalWorkspace: "T9", eventId: "E5" }))).toBe("ignored");
  });
  it("Slack is free; Teams needs the add-on; a chat workspace belongs to one organisation", async () => {
    expect(channelAllowed("slack", [])).toBe(true);
    expect(channelAllowed("teams", [])).toBe(false);
    expect(channelAllowed("teams", ["teams"])).toBe(true);
    const { router, identity, ws, mkt } = await setup();
    expect(() => router.connect("owner", { workspaceId: ws, channel: "teams", externalWorkspace: "X", defaultEmployeeId: mkt.id }, [])).toThrow(/paid add-on/);
    const other = await identity.createWorkspace("someone", { name: "Other" });
    expect(() => router.connect("someone", { workspaceId: other.id, channel: "slack", externalWorkspace: "T1", defaultEmployeeId: "x" }, [])).toThrow(ChannelError);
  });
  it("tells the person when energy runs out", async () => {
    const { router, chat, energy, ws } = await setup();
    energy.setPlan("owner", ws, { dailyQuotaPerEmployee: 0, monthlyOvertimeCap: 0, monthlyCostCapMicro: 1e12 });
    await router.handle(msg());
    expect(chat.sent[0]!.text).toMatch(/used up my energy/);
    energy.setPlan("owner", ws, { dailyQuotaPerEmployee: 5, monthlyOvertimeCap: 0, monthlyCostCapMicro: 1e12, expiresAt: "2000-01-01T00:00:00Z" });
    await router.handle(msg({ eventId: "E7" }));
    expect(chat.sent[1]!.text).toMatch(/trial has ended/);
  });
  it("Slack sender posts with the right token and surfaces API errors", async () => {
    let seen: any;
    const ok = new SlackChannel(() => "xoxb-1", (async (url: any, init: any) => { seen = { url, init }; return { json: async () => ({ ok: true }) }; }) as any);
    await ok.send("T1", "D1", "hi");
    expect(seen.init.headers.authorization).toBe("Bearer xoxb-1");
    const bad = new SlackChannel(() => "t", (async () => ({ json: async () => ({ ok: false, error: "channel_not_found" }) })) as any);
    await expect(bad.send("T1", "D1", "hi")).rejects.toThrow(/channel_not_found/);
  });
});
