import type { AuditLog } from "../audit/index.js";
import type { IdentityService } from "../identity/index.js";
import type { WorkforceService, BusinessProfile } from "../workforce/index.js";
import type { Ledger } from "../ledger/index.js";
import { PLANS, type EnergyMeter } from "../energy/index.js";
import { TEMPLATES } from "../workforce/templates.js";

/** The standard team every customer gets. Everything else is an add-on. */
export const STANDARD_TEAM = ["finance-manager", "marketing-manager", "business-consultant"] as const;

export type TeamSize = "solo" | "2-10" | "11-50" | "51+";
export type Privacy = "shared" | "own-database" | "own-server" | "own-environment";

/** What the customer picks in the signup menu. */
export interface SignupChoices {
  businessName: string;
  businessType: string;
  description: string;
  country: string;
  currency?: string;
  teamSize: TeamSize;
  /** Rough size, for sizing assistants: monthly transactions. */
  monthlyVolume?: number;
  addOns?: string[];
  privacy?: Privacy;
  /** Months prepaid; 6+ upgrades privacy to own-database for free. */
  prepaidMonths?: number;
  trialDays?: 3 | 7;
}

export interface Blueprint {
  businessName: string;
  profile: BusinessProfile;
  employees: string[];
  /** Add-ons that are in the catalogue but have no employee yet. Saved so we can notify when ready. */
  waitlist: string[];
  assistants: { finance: number; marketing: number };
  privacy: Privacy;
  privacyNote: string;
  plan: keyof typeof PLANS;
  trialDays: number;
}

export interface Organisation {
  workspaceId: string;
  blueprint: Blueprint;
  trialEndsAt: string;
  employeeIds: string[];
}

export class SignupError extends Error {}

/** Turns menu choices into a plan for the organisation. Pure: no side effects, easy to test. */
export function buildBlueprint(c: SignupChoices): Blueprint {
  if (!c.businessName.trim()) throw new SignupError("business name is required");
  if (!c.country.trim()) throw new SignupError("country is required");
  const available = new Set(TEMPLATES.map((t) => t.key));
  const employees: string[] = [...STANDARD_TEAM];
  const waitlist: string[] = [];
  for (const a of c.addOns ?? []) {
    if (employees.includes(a) || waitlist.includes(a)) continue;
    (available.has(a) ? employees : waitlist).push(a);
  }
  // Bigger or busier businesses get more assistants under the Finance and Marketing managers.
  const big = c.teamSize === "11-50" || c.teamSize === "51+" || (c.monthlyVolume ?? 0) > 500;
  const assistants = { finance: big ? 2 : 0, marketing: big ? 1 : 0 };
  let privacy: Privacy = c.privacy ?? "shared";
  let privacyNote = "Your data is kept apart from every other customer's by strict access rules.";
  if (privacy === "shared" && (c.prepaidMonths ?? 0) >= 6) {
    privacy = "own-database";
    privacyNote = "Free upgrade: your data lives in its own database because you prepaid 6 months or more.";
  } else if (c.teamSize === "51+" && privacy === "shared") {
    privacy = "own-database";
    privacyNote = "Included for larger teams: your data lives in its own database.";
  }
  return {
    businessName: c.businessName.trim(),
    profile: { description: c.description, country: c.country, currency: c.currency, stage: c.businessType },
    employees,
    waitlist,
    assistants,
    privacy,
    privacyNote,
    plan: "trial",
    trialDays: c.trialDays ?? 7,
  };
}

/** Sets up a whole organisation in one go: workspace, profile, books, team, trial energy. */
export class OnboardingService {
  constructor(
    private identity: IdentityService,
    private workforce: WorkforceService,
    private ledger: Ledger,
    private energy: EnergyMeter,
    private audit: AuditLog,
    private now: () => Date = () => new Date(),
  ) {}

  async signUp(userId: string, choices: SignupChoices): Promise<Organisation> {
    const blueprint = buildBlueprint(choices);
    const ws = await this.identity.createWorkspace(userId, { name: blueprint.businessName });
    this.workforce.setProfile(userId, ws.id, blueprint.profile);
    this.ledger.open(userId, ws.id);
    const employeeIds: string[] = [];
    for (const key of blueprint.employees) employeeIds.push((await this.workforce.hire(userId, ws.id, key)).id);
    const trialEndsAt = new Date(this.now().getTime() + blueprint.trialDays * 86_400_000).toISOString();
    this.energy.setPlan(userId, ws.id, { ...PLANS.trial!, expiresAt: trialEndsAt });
    this.audit.record({
      workspaceId: ws.id,
      actor: `user:${userId}`,
      action: "organisation.provisioned",
      data: { privacy: blueprint.privacy, employees: blueprint.employees, waitlist: blueprint.waitlist, trialEndsAt },
    });
    return { workspaceId: ws.id, blueprint, trialEndsAt, employeeIds };
  }
}
