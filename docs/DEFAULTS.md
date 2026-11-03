# Defaults chosen while building (change any of these)

Open questions were answered with sensible defaults so work could continue. Each is easy to change.

| Question | Default | Where |
|---|---|---|
| Free trial length | 7 days (3 also allowed in signup choices) | `onboarding/index.ts` |
| Trial limits | 300 energy per employee per day, no overtime, $5 real-cost cap, ends after trial | `energy/index.ts` `PLANS.trial` |
| What 1 energy means | $0.001 of real provider cost, so cheap models burn less | `energy/index.ts` |
| Starter / growth plans | 1,000 / 3,000 energy per day; overtime 10,000 / 40,000 per month | `PLANS` |
| Free privacy upgrade | Own database for 6+ months prepaid, or team of 51+ | `buildBlueprint` |
| Assistants | 2 finance + 1 marketing for teams of 11+ or over 500 transactions a month | `buildBlueprint` |
| Money | Whole minor units (cents/pence) everywhere, no decimals | `ledger` |
| Books | Append-only; mistakes fixed by a reversal entry; no tax advice | `ledger`, `db/001_init.sql` |
| Storage | Postgres with row-level security, app connects as non-owner role | `db/001_init.sql` |
| Language | English only, global | |
| Add-ons without an employee yet | Saved to a waitlist on the organisation | `buildBlueprint` |

## Admin manager onboarding and the basic package (added 2026-11-03)

| Question | Default | Where |
|---|---|---|
| Basic package | Finance manager, Marketing manager, Business consultant, HR manager | `onboarding/index.ts` `STANDARD_TEAM` |
| Team price shown on the website | £41/mo for 4 employees (4 × £12, 15% team discount), was £37 for 3. Example price only | `web/index.html`, `web/app.html` |
| Admin manager vs "Team lead" | Same thing: the free Team lead is renamed Admin manager. Free, never sold, hired for every organisation, not counted in the package | `workforce/templates.ts` `kind: "manager"` |
| Where the Admin manager contacts the owner | Dashboard by default. Slack if chosen. Teams only with the Teams add-on, otherwise dashboard | `buildBlueprint` `contact` |
| Chat app chosen but not connected yet | Every message always lands in the dashboard inbox; chat copies wait and are sent in order once the app is connected and the owner has linked their account (`deliverPending`) | `admin-manager/index.ts` |
| Welcome and setup messages | Written from templates, not by a model, so they use no energy and are always accurate | `admin-manager/messages.ts` |
| Setup form | 12 questions for the basic team, only "goals" and "customers" required; employee-specific questions only appear if that employee is hired | `admin-manager/form.ts` |
| "Training" | The form answers each employee needs are stored as training notes and added to that employee's instructions. The Admin manager gets all answers. No model fine-tuning | `WorkforceService.train` |
| Storage | Shared privacy: a folder in shared storage (5 GB trial, 20 GB starter, 50 GB growth). Any "own" privacy tier: a standalone drive of 100 GB | `drivePlan` |
| Models | Everyone: document search model. Standard tier: open model. Premium employees: Claude via API (never downloaded). Shared customers attach to the shared model pool; standalone customers get the open models downloaded to their own drive | `modelsFor`, `installMode` |
| Rollback | Each step (profile, storage, models, training, final checks) is journaled. A failure undoes finished steps newest first, and the owner can undo a finished setup. If an undo itself fails, the run is marked `rollback_failed` and the state `needs_attention` instead of claiming success | `admin-manager/provisioning.ts` |
| Re-running setup | Only after a rollback (one active setup per organisation) | `AdminManager.submitForm` |
| HR manager limits | Drafts only (never hires, dismisses or contacts anyone), staff data confidential, no protected-characteristic criteria, no legal advice | `templates.ts` |

Storage and model provisioners are in-memory stand-ins (`InMemoryStorageProvisioner`, `InMemoryModelProvisioner`) behind interfaces, ready for real bucket prefixes, RunPod volumes and the model pool. Model sizes are planning figures.

Provider prices in `energy` are planning estimates, not quotes. Real numbers come from measured usage.
