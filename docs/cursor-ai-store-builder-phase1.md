# Track B Phase 1 — Production Architecture Proof Report

**Branch:** `feature/cursor-ai-store-builder-phase1`  
**Base HEAD:** `38ff5e4ff368b3342693e4c635f468241ab54225` (free-trial release)  
**Status:** Architecture implemented. Live Cursor Cloud Agents lifecycle requires `CURSOR_API_KEY` (not present in this environment).  
**Phase 2:** NOT started — awaiting explicit approval.

---

## Branch / commits

- Clean start verified: HEAD includes `38ff5e4…`; dedicated branch `feature/cursor-ai-store-builder-phase1`.
- Phase 1 work is uncommitted on this branch (awaiting your commit instruction).
- Trial / Track A code was not modified.

---

## Existing PoC reused

From `tools/cursor-storefront-poc` (not turned into production as-is):

| Concept | Reuse |
|---|---|
| Isolated workspace template | Seeded → `tools/speedvendors-storefront-runtime/` |
| Editable-path allowlist | `.cursor/hooks/guardPolicy.mjs` (`EDITABLE_PREFIXES`) |
| Protected commerce files | `src/speedvendors/**` |
| Build validation | `npm run build` in runtime; stop-hook validate |
| Repair loop concept | Documented limited pass in `README_AGENT.md` (not unlimited) |
| Commerce mock/contract | Ported types + `SpeedVendorsCommerce` interface |
| SDK integration | **Local PoC only**; production path is Cloud REST. SDK used only for billing investigation (`Agent.getUsage`) |
| Cost experiment tooling | `tools/cursor-cloud-phase1` billing script |
| Hooks | Cloud-adapted `.cursor/hooks.json` + guard |
| Artifact/output | `artifacts/` directory + Versions table for SV ownership |

Local PoC remains developer-only; it is **not** the multi-tenant security boundary.

---

## Cursor API endpoints proven

| Endpoint | Client method | Live in this session |
|---|---|---|
| `POST /v1/agents` | `createAgent` | Blocked — no API key |
| `POST /v1/agents/{id}/runs` | `createRun` | Blocked |
| `GET /v1/agents/{id}` | `getAgent` | Blocked |
| `GET /v1/agents/{id}/runs/{runId}` | `getRun` | Blocked |
| `GET …/stream` (SSE + `Last-Event-ID`) | `streamRun` | Implemented; not live |
| `POST …/cancel` | `cancelRun` | Implemented; not live |
| `GET …/usage` | `getUsage` | Implemented; not live |
| `GET …/artifacts` + `/download` | `listArtifacts` / `getArtifactDownload` | Implemented; not live |
| `POST …/archive` | `archiveAgent` | Implemented; not live |
| `GET /v1/models` | `listModels` | Blocked |
| `GET /v1/me` | `getMe` | Blocked |
| `GET /v1/repositories` | `listRepositories` | Blocked |

Offline unit tests mock create/usage/SSE (10/10 pass).

**To run live:**

```bash
cd tools/cursor-cloud-phase1
export CURSOR_API_KEY=…   # Dashboard → API Keys; session only
npm run proof
npm run billing
npm run models
```

---

## Agent/run lifecycle

Designed & harnessed:

1. Create durable agent → store `bc-…` in `cursor_storefront_sessions.cursor_agent_id`.
2. Initial run ID stored on `cursor_storefront_runs`.
3. Follow-up via `createRun` on **same** agent (new `run-…` ID).
4. Cancel via `cancelRun`.
5. Archive via `archiveAgent`.

Gateway never accepts browser-supplied `agentId`.

---

## Streaming/status approach

- Preferred production pattern: **create run → persist IDs → poll `getRun` / short SSE with `Last-Event-ID` reconnect**.
- Edge does **not** hold a long-lived SSE proxy (timeout/disconnect risk).
- Cursor Cloud run continues independently of browser/gateway disconnect.
- Stream retention header `X-Cursor-Stream-Retention-Seconds` handled; on `410 stream_expired` fall back to `getRun`.

---

## Edge viability

**Sufficient for Phase 1 gateway** for:

- REST create/get/cancel/usage/artifacts
- Auth + ownership + entitlement + locking
- Persist-then-poll status

**Awkward / not recommended on Edge:**

- Long SSE proxying to browsers
- `@cursor/sdk` (Node; must not install in Edge Functions)

**Node required only for:** asynchronous billed-cost reconciliation via `Agent.getUsage()` (local/dev script is enough in Phase 1; optional tiny worker later). **No Fly/Railway/Cloud Run introduced.**

---

## Billing investigation

### REST token usage (`GET /v1/agents/{id}/usage`)

Documented fields (and client typed accordingly):

- `totalUsage`: `inputTokens`, `outputTokens`, `cacheWriteTokens`, `cacheReadTokens`, `totalTokens`
- Per run: `id`, optional `usageUuid`, `usage` (same token fields)
- **No `chargedCents` / `rawCostCents` on this endpoint**

### SDK `Agent.getUsage(agentId, { runId })`

- Returns `usage` + optional `cost: { rawCostCents, chargedCents }`
- `cost` may be **absent until billing settles** (“takes a moment”)
- `chargedCents` is actual charged (discounts + Cursor Token Fee); may be `0` for plan-included / BYOK / credit-grant

### Team Admin `POST /teams/filtered-usage-events`

- Has `chargedCents` per event (Enterprise Admin API)
- May 403 on non-admin / non-Enterprise keys — harness probes and records availability
- `usageUuid` is the intended correlation key to usage events / telemetry (`cursor.usage_event.id`)

### Distinctions stored in DB

| Field | Meaning |
|---|---|
| token columns | REST usage |
| `estimated_cost_cents` | Approximate local estimate — not a bill |
| `actual_raw_cost_cents` | SDK `rawCostCents` when settled |
| `actual_charged_cents` | SDK `chargedCents` when settled |
| `cost_reconciliation_status` | `pending` → `tokens_only` → `reconciled` / `unavailable` |

### Trial AI target

≈ **$2** actual Cursor spend (`budget_cents = 200`) prepared on entitlements — **not** faked as exact until live reconciliation is proven with our key.

### Node requirement

| Capability | Needs Node? |
|---|---|
| Cloud REST lifecycle | No (Edge OK) |
| Token usage | No |
| `chargedCents` via SDK | **Yes** (local/dev or future tiny job) |

---

## Isolated runtime

Path: `tools/speedvendors-storefront-runtime/`

- Builds successfully (`npm run build`).
- Contains only storefront presentation + protected commerce contract + hooks + `artifacts/`.
- **Security by absence:** no SV secrets, admin, billing, migrations, or other merchants.
- Must be published as a **separate private GitHub repo** for Cloud Agents (`CURSOR_RUNTIME_REPO_URL`). One template repo for all merchants — **not** one repo per merchant; **not** the main monorepo.
- Agent instructions: `README_AGENT.md`.
- Starting ref: typically `main`; agents may push `cursor/…` branches — **artifacts ingested by SpeedVendors** are the persistence boundary for merchant publish, not Cursor branches/URLs.

---

## Cloud hooks

Supported in Cloud Agents (repo `.cursor/hooks.json`):  
`beforeShellExecution`, `afterShellExecution`, `beforeReadFile`, `afterFileEdit`, `preToolUse`, `postToolUse`, `stop`, etc.

Implemented (defense in depth):

- Block prohibited shell programs / chaining
- Editable-path enforcement
- Sensitive filename detection
- `stop` validation for commerce contract presence

Main boundary remains isolated workspace.

---

## Commerce adapter

- Runtime contract: `src/speedvendors/{types,commerce,mockCommerce,hooks}.tsx`
- Bridge to real SV: `src/lib/ai-store-builder/commerceBridge.ts` maps store-api / `useStorefrontCommerce` shapes → presentation types
- AI = presentation; SV = products, prices, stock, cart, checkout, payments, orders
- No second checkout implemented; V1/V2 AI Studio untouched

---

## Database

Migration applied on project `mkkqbekhvcnwcheegjpy`:

- `cursor_ai_entitlements`
- `cursor_storefront_sessions` (merchant = `profiles.user_id`; stores `bc-…`)
- `cursor_storefront_runs` (tokens + estimated/actual cost fields + idempotency)
- `cursor_storefront_versions` (artifact ownership prep)
- RPCs: `cursor_ai_may_start_run`, `cursor_ai_claim_run`, `cursor_ai_release_run`

### RLS

- Authenticated: **SELECT own rows** (or superadmin)
- Writes: **service_role only** (gateway)
- Merchants cannot self-grant AI entitlement

### Live DB proof (test trial user `619aa227-…`)

1. Without AI entitlement → `allowed: false` / `ai_entitlement_disabled` or `no_app_access` path as applicable  
2. After harness entitlement enable → may start  
3. Claim A → ok  
4. Claim B (different idempotency) → `run_already_active` / `rejected_concurrency`  
5. Claim A retry → `reused: true`  
6. Release → may start again  

---

## Artifact proof

- Runtime `artifacts/` ready; harness instructs agent to write a marker file.
- Gateway `list_artifacts` / `download_artifact` uses Cursor Artifacts API then records `cursor_storefront_versions` with **temporary** URL warning.
- Production rule: **Cursor produces → SpeedVendors stores**; live site must not depend on Cursor presigned URLs.

Live download integrity check pending API key.

---

## Concurrency / idempotency

- App-level lock via `cursor_ai_claim_run` **before** any Cursor call
- Unique `(session_id, idempotency_key)`
- In-memory reference lock in `tools/cursor-cloud-phase1` for unit tests
- Does not rely on Cursor `409 agent_busy` as normal control (application claim/release is primary; Cursor busy is incidental)

---

## Feature flag / entitlement

- Frontend: `VITE_AI_STORE_BUILDER_CURSOR` via `src/lib/ai-store-builder/featureFlag.ts` (**defaults OFF**; visibility only)
- Backend: `cursor_ai_entitlements.backend_feature_enabled` + `enabled` — rejects before Cursor
- Sits **on top of** free trial / paid access (`user_has_speedvendors_access`)
- Ordinary merchants not activated in Phase 1 (only explicit harness entitlement row)

---

## Gateway

- `supabase/functions/cursor-storefront-gateway` + `_shared/cursorCloudClient.ts`
- `verify_jwt = true` in `config.toml`
- Actions: `status`, `start_run`, `get_run`, `cancel_run`, `list_artifacts`, `download_artifact`, `models`
- Secrets needed to deploy: `CURSOR_API_KEY`, optional `CURSOR_RUNTIME_REPO_URL`

Edge function **code** is in repo; deploy when you set the secret and approve.

---

## Tests / build

| Check | Result |
|---|---|
| `tools/cursor-cloud-phase1` unit tests | **10/10 pass** |
| `tools/cursor-cloud-phase1` typecheck | **pass** |
| `tools/speedvendors-storefront-runtime` build | **pass** |
| Live Cloud Agents proof | **pass** — see `docs/cursor-ai-store-builder-phase1-live-verification.md` |

---

## Live verification (closed)

Phase 1 live blockers from the architecture freeze are closed:

1. `CURSOR_API_KEY` configured in Edge secrets; harness probe OK.
2. Private runtime repo published; Cursor GitHub App restricted to runtime-only (`/v1/repositories` count = 1).
3. Initial + follow-up + artifacts (`/opt/cursor/artifacts/`) + REST cost + cancel + concurrency + entitlement proven.
4. Gateway deployed; unauthenticated → 401; no key leak.

Empirical cost samples (not pricing assumptions): initial ~49.9¢, follow-up ~10.1¢ chargedCents via REST.

---

## Recommendation for Phase 2

1. Explicit approval required before merchant AI Builder UI.
2. Keep Cursor GitHub App scoped to `speedvendors-storefront-runtime` only.
3. Artifact ingest: copy from Cursor download into SpeedVendors storage; mark versions `stored`.
4. Optional async cost reconciler for delayed settlements.

**STOP — do not begin Phase 2 until explicitly approved.**
