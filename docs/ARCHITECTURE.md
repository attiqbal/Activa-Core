# Architecture (Stage 1)

A modular monolith in TypeScript: one application, strict module boundaries.

## Rules

1. Each module owns its own data. No module reads another module's storage directly.
2. Modules call each other through published interfaces and communicate by domain events (`src/core/events.ts`).
3. AI employees never touch storage or the system directly. Every action goes through a capability that checks permission, budget and audit.
4. Every record carries a workspace id. One workspace must never see another's data. Tests enforce this.
5. Global from day one: English at launch but text in translation files, money as smallest unit plus currency code, times in UTC, per-country tax rules as add-on packs.
6. AI costs: all model calls go through the Model Gateway. Cheap open models serve routine work, a stronger model serves hard steps and acts as fallback.

## Modules built so far

| Module | Path | Status |
|---|---|---|
| Events | `src/core/events.ts` | in-process bus |
| Audit | `src/modules/audit` | append-only, in memory |
| Identity | `src/modules/identity` | workspaces, roles, permissions, in memory |
| Model Gateway | `src/modules/model-gateway` | tier routing and fallback; Anthropic, OpenAI-compatible (vLLM on RunPod, hosted open models) and mock adapters |

## Next

PostgreSQL storage with row-level security by workspace, then Workforce (employee templates), Work (tasks), Messaging, Agent Runtime, Capability Registry, Metering and Budgets, Approvals, and the Catalogue (agent store). Storage is currently in memory behind simple classes so the real database can replace it module by module.
