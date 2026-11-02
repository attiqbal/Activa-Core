import { describe, expect, it } from "vitest";
import { AuditLog, EventBus, IdentityService, MockAdapter, ModelGateway, PermissionError } from "../src/index.js";

function setup() {
  const audit = new AuditLog();
  const bus = new EventBus();
  return { audit, bus, identity: new IdentityService(audit, bus) };
}

describe("workspaces and permissions", () => {
  it("creator becomes owner and the action is audited", async () => {
    const { identity, audit } = setup();
    const ws = await identity.createWorkspace("u1", { name: "Acme" });
    expect(identity.roleOf("u1", ws.id)).toBe("owner");
    expect(audit.list(ws.id).map((e) => e.action)).toContain("workspace.created");
  });

  it("defaults suit a global, English-first product", async () => {
    const { identity } = setup();
    const ws = await identity.createWorkspace("u1", { name: "Acme" });
    expect(ws.language).toBe("en");
    expect(ws.timeZone).toBe("UTC");
  });

  it("users cannot see or act in other workspaces", async () => {
    const { identity, audit } = setup();
    const a = await identity.createWorkspace("alice", { name: "A" });
    const b = await identity.createWorkspace("bob", { name: "B" });
    expect(identity.workspacesFor("alice").map((w) => w.id)).toEqual([a.id]);
    expect(identity.can("alice", b.id, "task.read")).toBe(false);
    expect(() => identity.addMember("alice", b.id, "alice", "owner")).toThrow(PermissionError);
    expect(audit.list(a.id).every((e) => e.workspaceId === a.id)).toBe(true);
  });

  it("roles limit what members can do", async () => {
    const { identity } = setup();
    const ws = await identity.createWorkspace("owner1", { name: "A" });
    identity.addMember("owner1", ws.id, "m1", "member");
    identity.addMember("owner1", ws.id, "v1", "viewer");
    expect(identity.can("m1", ws.id, "task.create")).toBe(true);
    expect(identity.can("m1", ws.id, "employee.hire")).toBe(false);
    expect(identity.can("v1", ws.id, "task.create")).toBe(false);
    expect(() => identity.addMember("m1", ws.id, "x", "admin")).toThrow(PermissionError);
  });
});

describe("events", () => {
  it("other modules can react to workspace creation without being wired in", async () => {
    const { identity, bus } = setup();
    const seen: string[] = [];
    bus.on("workspace.created", (e) => void seen.push(e.workspaceId));
    const ws = await identity.createWorkspace("u1", { name: "Acme" });
    expect(seen).toEqual([ws.id]);
  });
});

describe("audit log", () => {
  it("entries are immutable", () => {
    const audit = new AuditLog();
    const e = audit.record({ workspaceId: "w", actor: "system", action: "x" });
    expect(() => {
      (e as { action: string }).action = "y";
    }).toThrow();
  });
});

describe("model gateway", () => {
  it("sends routine work to the first adapter serving the tier", async () => {
    const cheap = new MockAdapter("open-model", ["standard"]);
    const strong = new MockAdapter("claude", ["standard", "premium"]);
    const gw = new ModelGateway([cheap, strong]);
    const r = await gw.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(r.provider).toBe("open-model");
    expect(strong.calls).toBe(0);
  });

  it("premium work skips adapters that do not serve premium", async () => {
    const cheap = new MockAdapter("open-model", ["standard"]);
    const strong = new MockAdapter("claude", ["standard", "premium"]);
    const gw = new ModelGateway([cheap, strong]);
    const r = await gw.complete({ messages: [{ role: "user", content: "hi" }], tier: "premium" });
    expect(r.provider).toBe("claude");
    expect(cheap.calls).toBe(0);
  });

  it("falls back to the next adapter when one fails", async () => {
    const down = new MockAdapter("gpu-down", ["standard"], true);
    const strong = new MockAdapter("claude");
    const gw = new ModelGateway([down, strong]);
    const r = await gw.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(r.provider).toBe("claude");
  });

  it("reports every failure if all adapters fail", async () => {
    const gw = new ModelGateway([new MockAdapter("a", ["standard"], true), new MockAdapter("b", ["standard"], true)]);
    await expect(gw.complete({ messages: [] })).rejects.toThrow(/a: boom; b: boom/);
  });
});
