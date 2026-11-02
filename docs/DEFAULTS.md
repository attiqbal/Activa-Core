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

Provider prices in `energy` are planning estimates, not quotes. Real numbers come from measured usage.
