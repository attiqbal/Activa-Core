import { describe, expect, it } from "vitest";
import { AuditLog, EnergyMeter, EventBus, IdentityService, ModelGateway, PermissionError, WorkforceService, costMicro } from "../src/index.js";
import type { CompletionResult, ModelAdapter } from "../src/modules/model-gateway/types.js";

class Fixed implements ModelAdapter {
  readonly name = "anthropic";
  readonly tiers = ["standard", "premium"] as const;
  constructor(private inTok: number, private outTok: number) {}
  async complete(): Promise<CompletionResult> {
    return { text: "ok", provider: "anthropic", model: "m", inputTokens: this.inTok, outputTokens: this.outTok };
  }
}

async function setup(inTok = 1000, outTok = 1000, clock = { d: new Date("2026-03-10T10:00:00Z") }) {
  const audit = new AuditLog();
  const bus = new EventBus();
  const identity = new IdentityService(audit, bus);
  const energy = new EnergyMeter(identity, audit, () => clock.d);
  const wf = new WorkforceService(identity, audit, bus, new ModelGateway([new Fixed(inTok, outTok)]), energy);
  const ws = await identity.createWorkspace("owner", { name: "Acme" });
  const emp = await wf.hire("owner", ws.id, "marketing-manager");
  return { identity, energy, wf, ws: ws.id, emp: emp.id, clock };
}

describe("energy", () => {
  it("converts real cost into energy (1 energy = $0.001)", () => {
    expect(costMicro("anthropic", 1000, 1000)).toBe(6000);
    expect(costMicro("mock", 5000, 5000)).toBe(0);
    expect(costMicro("openai-compatible", 1000, 1000)).toBeLessThan(costMicro("anthropic", 1000, 1000));
  });

  it("records energy on each task and shows what is left today", async () => {
    const { wf, energy, ws, emp } = await setup();
    const t = await wf.assign("owner", ws, emp, "post ideas");
    expect(t.status).toBe("ready_for_review");
    expect(t.energyUsed).toBe(6);
    expect(energy.remainingToday("owner", ws, emp)).toBe(300 - 6);
  });

  it("stops work when the daily quota is used (trial has no overtime)", async () => {
    const { wf, ws, emp } = await setup(40_000, 20_000); // 140 energy per task
    expect((await wf.assign("owner", ws, emp, "a")).status).toBe("ready_for_review");
    expect((await wf.assign("owner", ws, emp, "b")).status).toBe("ready_for_review");
    expect((await wf.assign("owner", ws, emp, "c")).status).toBe("ready_for_review"); // 280 < 300 before this one
    const blocked = await wf.assign("owner", ws, emp, "d");
    expect(blocked).toMatchObject({ status: "no_energy", reason: "daily_quota_used" });
  });

  it("quota resets the next day", async () => {
    const { wf, ws, emp, clock } = await setup(400_000, 0);
    await wf.assign("owner", ws, emp, "a");
    expect((await wf.assign("owner", ws, emp, "b")).status).toBe("no_energy");
    clock.d = new Date("2026-03-11T00:05:00Z");
    expect((await wf.assign("owner", ws, emp, "c")).status).toBe("ready_for_review");
  });

  it("allows paid overtime up to a cap, then stops", async () => {
    const { wf, energy, ws, emp } = await setup(400_000, 0); // 400 energy per task
    energy.setPlan("owner", ws, { dailyQuotaPerEmployee: 300, monthlyOvertimeCap: 500, monthlyCostCapMicro: 1e12 });
    await wf.assign("owner", ws, emp, "a"); // uses quota (400 > 300)
    const o1 = await wf.assign("owner", ws, emp, "b"); // overtime 400
    expect(o1.status).toBe("ready_for_review");
    await wf.assign("owner", ws, emp, "c"); // overtime 800 (started under cap of 500)
    expect(await wf.assign("owner", ws, emp, "d")).toMatchObject({ status: "no_energy", reason: "overtime_cap_reached" });
    expect(energy.monthSummary("owner", ws).overtimeEnergy).toBe(800);
  });

  it("monthly cost cap protects margin even with overtime", async () => {
    const { wf, energy, ws, emp } = await setup(400_000, 0);
    energy.setPlan("owner", ws, { dailyQuotaPerEmployee: 1e9, monthlyOvertimeCap: 0, monthlyCostCapMicro: 700_000 });
    await wf.assign("owner", ws, emp, "a");
    await wf.assign("owner", ws, emp, "b");
    expect(await wf.assign("owner", ws, emp, "c")).toMatchObject({ reason: "monthly_cost_cap_reached" });
  });

  it("only owners see cost; members see energy", async () => {
    const { identity, energy, ws, emp } = await setup();
    identity.addMember("owner", ws, "m", "member");
    expect(energy.remainingToday("m", ws, emp)).toBe(300);
    expect(() => energy.monthSummary("m", ws)).toThrow(PermissionError);
    expect(() => energy.setPlan("m", ws, { dailyQuotaPerEmployee: 1, monthlyOvertimeCap: 0, monthlyCostCapMicro: 1 })).toThrow(PermissionError);
  });
});
