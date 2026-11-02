import { describe, expect, it } from "vitest";
import {
  AuditLog,
  EventBus,
  IdentityService,
  MockAdapter,
  ModelGateway,
  PermissionError,
  TEMPLATES,
  WorkforceService,
} from "../src/index.js";
import type { CompletionRequest, CompletionResult, ModelAdapter } from "../src/modules/model-gateway/types.js";

function setup(adapters: ModelAdapter[] = [new MockAdapter()]) {
  const audit = new AuditLog();
  const bus = new EventBus();
  const identity = new IdentityService(audit, bus);
  const workforce = new WorkforceService(identity, audit, bus, new ModelGateway(adapters));
  return { audit, bus, identity, workforce };
}

class Recorder implements ModelAdapter {
  readonly name = "recorder";
  readonly tiers = ["standard", "premium"] as const;
  last?: CompletionRequest;
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.last = req;
    return { text: "draft", provider: "recorder", model: "r", inputTokens: 5, outputTokens: 7 };
  }
}

describe("templates", () => {
  it("starts with the three agreed employees", () => {
    expect(TEMPLATES.map((t) => t.key).sort()).toEqual(["finance-manager", "market-analyst", "marketing-manager"]);
  });
});

describe("hiring", () => {
  it("owner can hire, and it is audited", async () => {
    const { identity, workforce, audit } = setup();
    const ws = await identity.createWorkspace("owner", { name: "Acme" });
    const e = await workforce.hire("owner", ws.id, "marketing-manager");
    expect(e.name).toBe("Marketing manager");
    expect(audit.list(ws.id).map((x) => x.action)).toContain("employee.hired");
  });

  it("members and outsiders cannot hire", async () => {
    const { identity, workforce } = setup();
    const ws = await identity.createWorkspace("owner", { name: "Acme" });
    identity.addMember("owner", ws.id, "m", "member");
    await expect(workforce.hire("m", ws.id, "marketing-manager")).rejects.toThrow(PermissionError);
    await expect(workforce.hire("stranger", ws.id, "marketing-manager")).rejects.toThrow(PermissionError);
  });

  it("rejects unknown templates", async () => {
    const { identity, workforce } = setup();
    const ws = await identity.createWorkspace("owner", { name: "Acme" });
    await expect(workforce.hire("owner", ws.id, "nope")).rejects.toThrow(/unknown employee template/);
  });
});

describe("assigning work", () => {
  it("returns a draft for review and records usage", async () => {
    const { identity, workforce, audit } = setup();
    const ws = await identity.createWorkspace("owner", { name: "Acme" });
    const e = await workforce.hire("owner", ws.id, "marketing-manager");
    const t = await workforce.assign("owner", ws.id, e.id, "Write a launch post");
    expect(t.status).toBe("ready_for_review");
    expect(t.deliverable).toContain("Write a launch post");
    expect(audit.list(ws.id).map((x) => x.action)).toEqual(
      expect.arrayContaining(["task.created", "task.completed"]),
    );
  });

  it("gives the model the role instructions and the business profile", async () => {
    const rec = new Recorder();
    const { identity, workforce } = setup([rec]);
    const ws = await identity.createWorkspace("owner", { name: "Acme" });
    workforce.setProfile("owner", ws.id, { description: "A bakery in Lagos", tone: "warm" });
    const e = await workforce.hire("owner", ws.id, "marketing-manager");
    await workforce.assign("owner", ws.id, e.id, "Write a post");
    const system = rec.last?.messages[0]?.content ?? "";
    expect(system).toContain("Marketing manager");
    expect(system).toContain("A bakery in Lagos");
  });

  it("finance work asks for the premium tier", async () => {
    const rec = new Recorder();
    const { identity, workforce } = setup([rec]);
    const ws = await identity.createWorkspace("owner", { name: "Acme" });
    const e = await workforce.hire("owner", ws.id, "finance-manager");
    await workforce.assign("owner", ws.id, e.id, "Forecast cash");
    expect(rec.last?.tier).toBe("premium");
  });

  it("another workspace cannot use my employee", async () => {
    const { identity, workforce } = setup();
    const a = await identity.createWorkspace("alice", { name: "A" });
    const b = await identity.createWorkspace("bob", { name: "B" });
    const e = await workforce.hire("alice", a.id, "market-analyst");
    await expect(workforce.assign("bob", b.id, e.id, "Research")).rejects.toThrow(/employee not found/);
    await expect(workforce.assign("bob", a.id, e.id, "Research")).rejects.toThrow(PermissionError);
  });

  it("viewers cannot assign work", async () => {
    const { identity, workforce } = setup();
    const ws = await identity.createWorkspace("owner", { name: "Acme" });
    identity.addMember("owner", ws.id, "v", "viewer");
    const e = await workforce.hire("owner", ws.id, "market-analyst");
    await expect(workforce.assign("v", ws.id, e.id, "Research")).rejects.toThrow(PermissionError);
  });

  it("marks the task failed, not crashed, when every model is down", async () => {
    const { identity, workforce, audit } = setup([new MockAdapter("down", ["standard", "premium"], true)]);
    const ws = await identity.createWorkspace("owner", { name: "Acme" });
    const e = await workforce.hire("owner", ws.id, "marketing-manager");
    const t = await workforce.assign("owner", ws.id, e.id, "Post");
    expect(t.status).toBe("failed");
    expect(audit.list(ws.id).map((x) => x.action)).toContain("task.failed");
  });
});
