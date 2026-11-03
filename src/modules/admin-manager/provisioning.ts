import { newId } from "../../core/ids.js";
import type { AuditLog } from "../audit/index.js";
import type { Privacy } from "../onboarding/index.js";

// ---------------------------------------------------------------------------
// Step journal: every setup step is recorded, and every step knows how to undo
// itself. If a step fails, the steps already done are undone in reverse order,
// so a customer is never left half set up. A finished setup can also be rolled
// back by the owner.
// ---------------------------------------------------------------------------

export interface StepContext {
  workspaceId: string;
  userId: string;
  /** Outputs of earlier steps in this run, by step key. */
  outputs: Record<string, unknown>;
}

export interface SetupStep {
  key: string;
  /** Plain words, shown to the owner as progress. */
  title: string;
  /** Does the work. A step that fails part way must clean up its own partial work before throwing. */
  run(ctx: StepContext): Promise<unknown>;
  /** Reverses the step using only what it returned from run. */
  undo(ctx: StepContext, output: unknown): Promise<void>;
}

export type StepStatus = "pending" | "running" | "done" | "failed" | "undone" | "undo_failed";
export type RunStatus = "running" | "completed" | "rolled_back" | "rollback_failed";

export interface StepRecord {
  key: string;
  title: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface SetupRun {
  id: string;
  workspaceId: string;
  status: RunStatus;
  steps: StepRecord[];
  startedAt: string;
  finishedAt?: string;
  /** Key of the step that failed, when a run was rolled back automatically. */
  failedStep?: string;
  /** Why it was rolled back: a failed step or the owner asking. */
  rollbackReason?: "step_failed" | "owner_request";
}

export class StepRunner {
  constructor(
    private audit: AuditLog,
    private now: () => Date = () => new Date(),
    /** Called after every change so the owner can watch progress live. */
    private onChange: (run: SetupRun) => void = () => {},
  ) {}

  async run(userId: string, workspaceId: string, steps: readonly SetupStep[]): Promise<SetupRun> {
    const run: SetupRun = {
      id: newId("setup"),
      workspaceId,
      status: "running",
      steps: steps.map((s) => ({ key: s.key, title: s.title, status: "pending" })),
      startedAt: this.now().toISOString(),
    };
    const ctx: StepContext = { workspaceId, userId, outputs: {} };
    this.audit.record({ workspaceId, actor: "employee:admin-manager", action: "setup.started", target: run.id, data: { steps: steps.map((s) => s.key) } });
    this.onChange(run);
    for (const [i, step] of steps.entries()) {
      const rec = run.steps[i]!;
      rec.status = "running";
      rec.startedAt = this.now().toISOString();
      this.onChange(run);
      try {
        const output = await step.run(ctx);
        ctx.outputs[step.key] = output;
        rec.output = output;
        rec.status = "done";
        rec.finishedAt = this.now().toISOString();
        this.audit.record({ workspaceId, actor: "employee:admin-manager", action: "setup.step_done", target: run.id, data: { step: step.key } });
        this.onChange(run);
      } catch (err) {
        rec.status = "failed";
        rec.error = err instanceof Error ? err.message : String(err);
        rec.finishedAt = this.now().toISOString();
        run.failedStep = step.key;
        this.audit.record({ workspaceId, actor: "employee:admin-manager", action: "setup.step_failed", target: run.id, data: { step: step.key, error: rec.error } });
        await this.rollback(userId, run, steps, "step_failed");
        return run;
      }
    }
    run.status = "completed";
    run.finishedAt = this.now().toISOString();
    this.audit.record({ workspaceId, actor: "employee:admin-manager", action: "setup.completed", target: run.id });
    this.onChange(run);
    return run;
  }

  /** Undoes every finished step, newest first. Keeps going if one undo fails, and says so. */
  async rollback(userId: string, run: SetupRun, steps: readonly SetupStep[], reason: "step_failed" | "owner_request"): Promise<SetupRun> {
    run.rollbackReason = reason;
    const ctx: StepContext = {
      workspaceId: run.workspaceId,
      userId,
      outputs: Object.fromEntries(run.steps.filter((r) => r.status === "done").map((r) => [r.key, r.output])),
    };
    let ok = true;
    for (let i = run.steps.length - 1; i >= 0; i--) {
      const rec = run.steps[i]!;
      if (rec.status !== "done") continue;
      const step = steps.find((s) => s.key === rec.key);
      try {
        if (!step) throw new Error("step definition missing");
        await step.undo(ctx, rec.output);
        rec.status = "undone";
        this.audit.record({ workspaceId: run.workspaceId, actor: "employee:admin-manager", action: "setup.step_undone", target: run.id, data: { step: rec.key } });
      } catch (err) {
        ok = false;
        rec.status = "undo_failed";
        rec.error = err instanceof Error ? err.message : String(err);
        this.audit.record({ workspaceId: run.workspaceId, actor: "employee:admin-manager", action: "setup.undo_failed", target: run.id, data: { step: rec.key, error: rec.error } });
      }
      this.onChange(run);
    }
    run.status = ok ? "rolled_back" : "rollback_failed";
    run.finishedAt = this.now().toISOString();
    this.audit.record({ workspaceId: run.workspaceId, actor: reason === "owner_request" ? `user:${userId}` : "employee:admin-manager", action: `setup.${run.status}`, target: run.id, data: { reason } });
    this.onChange(run);
    return run;
  }
}

// ---------------------------------------------------------------------------
// Storage: a shared drive (the customer's own folder in shared storage) or a
// standalone drive (a volume used by this customer only), set by privacy tier.
// ---------------------------------------------------------------------------

export type DriveKind = "shared" | "standalone";

export interface DriveSpec {
  workspaceId: string;
  kind: DriveKind;
  quotaGb: number;
}

export interface Drive extends DriveSpec {
  id: string;
  /** Where the files live, for example a bucket prefix or a volume id. */
  location: string;
}

export interface StorageProvisioner {
  create(spec: DriveSpec): Promise<Drive>;
  remove(driveId: string): Promise<void>;
}

/** Shared privacy uses a shared drive; any "own" tier gets a standalone drive. */
export function drivePlan(privacy: Privacy, plan: string): { kind: DriveKind; quotaGb: number } {
  if (privacy === "shared") return { kind: "shared", quotaGb: plan === "growth" ? 50 : plan === "starter" ? 20 : 5 };
  // Room for the customer's files plus their own copy of the open models.
  return { kind: "standalone", quotaGb: 100 };
}

/** Stand-in until real storage (bucket prefixes and RunPod network volumes) is wired in. */
export class InMemoryStorageProvisioner implements StorageProvisioner {
  readonly drives = new Map<string, Drive>();
  async create(spec: DriveSpec): Promise<Drive> {
    const id = newId("drive");
    const location = spec.kind === "shared" ? `shared://customers/${spec.workspaceId}/` : `volume://${id}`;
    const drive: Drive = { ...spec, id, location };
    this.drives.set(id, drive);
    return drive;
  }
  async remove(driveId: string): Promise<void> {
    this.drives.delete(driveId);
  }
}

// ---------------------------------------------------------------------------
// Models: open models run on our GPUs, the strongest model is a paid API.
// Shared customers are attached to the shared model pool (nothing to download);
// standalone customers get their own copy of the open models on their drive.
// ---------------------------------------------------------------------------

export interface ModelNeed {
  id: string;
  purpose: string;
  /** "open-weights" can be downloaded and run by us; "api" is called through the Model Gateway. */
  source: "open-weights" | "api";
  /** Rough download size, used to check the drive has room. Planning figure only. */
  sizeGb: number;
}

export const MODEL_CATALOGUE = {
  embeddings: { id: "qwen3-embedding-0.6b", purpose: "Searching your documents", source: "open-weights", sizeGb: 2 },
  standard: { id: "qwen3.6-35b-a3b", purpose: "Everyday work (Standard skill)", source: "open-weights", sizeGb: 40 },
  premium: { id: "claude-sonnet", purpose: "Hard steps and calculations (Premium)", source: "api", sizeGb: 0 },
} as const satisfies Record<string, ModelNeed>;

/** Which models a team needs, from its employees' tiers. Everyone gets document search. */
export function modelsFor(tiers: readonly ("standard" | "premium")[]): ModelNeed[] {
  const needs: ModelNeed[] = [MODEL_CATALOGUE.embeddings];
  // Standard work always has an open model, and premium employees also use it for routine steps.
  if (tiers.length) needs.push(MODEL_CATALOGUE.standard);
  if (tiers.includes("premium")) needs.push(MODEL_CATALOGUE.premium);
  return needs;
}

export type InstallMode = "shared-pool" | "download" | "api";

export interface ModelInstall {
  id: string;
  workspaceId: string;
  modelId: string;
  mode: InstallMode;
  /** Drive the weights were downloaded to (download mode only). */
  driveId?: string;
}

export interface ModelProvisioner {
  install(workspaceId: string, need: ModelNeed, mode: InstallMode, drive: Drive): Promise<ModelInstall>;
  uninstall(installId: string): Promise<void>;
}

export function installMode(need: ModelNeed, drive: Drive): InstallMode {
  if (need.source === "api") return "api";
  return drive.kind === "standalone" ? "download" : "shared-pool";
}

/** Stand-in until downloads to RunPod volumes and pool registration are wired in. */
export class InMemoryModelProvisioner implements ModelProvisioner {
  readonly installs = new Map<string, ModelInstall>();
  async install(workspaceId: string, need: ModelNeed, mode: InstallMode, drive: Drive): Promise<ModelInstall> {
    const inst: ModelInstall = { id: newId("model"), workspaceId, modelId: need.id, mode, ...(mode === "download" ? { driveId: drive.id } : {}) };
    this.installs.set(inst.id, inst);
    return inst;
  }
  async uninstall(installId: string): Promise<void> {
    this.installs.delete(installId);
  }
}
