# Phase 1 Live Verification Status

**Date:** 2026-09-21  
**Branch:** `feature/cursor-ai-store-builder-phase1` (Phase 1 product code still **uncommitted** pending approval)  
**Verdict:** Live Cloud Agents architecture proof **PASSED**. Stop before Phase 2. Do not treat as merchant-ready.

Evidence: `tools/cursor-cloud-phase1/.proof-output/live-orchestrated/report.json`

---

## 1. API identity

| Check | Result |
|---|---|
| Supabase secret `CURSOR_API_KEY` | Valid User key (replaced mid-session) |
| `GET /v1/me` via Edge harness | **OK** — `apiKeyName=speedvendors`, `userId=345997721` |
| Key never leaves Edge | Confirmed: harness/gateway responses have no `crsr_` / key material |

## 2. Models

| Check | Result |
|---|---|
| `GET /v1/models` | **38** models |
| Chosen for Phase 1 | `composer-2.5` |

## 3. Runtime repository

| Item | Status |
|---|---|
| Private repo | https://github.com/CosminHarbon/speedvendors-storefront-runtime |
| Visibility | **PRIVATE** |
| Starting ref | `main` (tip includes `/opt/cursor/artifacts` hook allow + docs) |
| Visible to Cursor `/v1/repositories` | **Yes** (among GitHub connections) |

**Security note:** Cursor GitHub App restricted to **only** `CosminHarbon/speedvendors-storefront-runtime`. Verified via harness `probe` → `/v1/repositories`: count **1**, URL only the runtime repo; `store-orchestrator` and `speed-vendors` **not** visible.

## 4. Initial Cloud Agent run

| Field | Value |
|---|---|
| Agent | `bc-8932d8b0-5779-4d96-9ff9-e19ff0c51f58` |
| Run | `run-2a3f7a48-6272-408d-8d98-2270fec15e9f` |
| Status | **FINISHED** (~113s) |
| Model | `composer-2.5` |
| DB run | `e2967572-c337-40e3-a6d0-8e42ffc83056` |

## 5. Follow-up (same agent)

| Field | Value |
|---|---|
| Run | `run-76b2799c-694a-4fb1-b845-c96dcd82de5a` |
| Status | **FINISHED** (~21s) |
| API note | `deferOnBusy` is **not** accepted by current createRun schema — removed from clients |

## 6. Artifacts (list / download / checksum / version)

| Field | Value |
|---|---|
| Write path (VM) | `/opt/cursor/artifacts/phase1-live-marker.txt` |
| API path | `artifacts/phase1-live-marker.txt` |
| List | **OK** (can lag briefly after FINISHED) |
| Download | **OK** — size 28, integrity `SPEEDVENDORS_PHASE1_LIVE_OK` |
| SHA-256 | `edac2c828c4ea0294de0207184151ed41025c86bd222c23925589bdbcfa0d0fc` |
| Version row | Inserted into `cursor_storefront_versions` |

**Lesson:** Repo-relative `artifacts/` alone does **not** populate the Artifacts API. Agents must write under `/opt/cursor/artifacts/`. Runtime hooks now allow that mount; `README_AGENT.md` documents it.

## 7. Usage + billed cost (REST)

No SDK required for cost on this account — REST `/usage` returns `cost.rawCostCents` / `chargedCents`.

| Run | chargedCents (approx) |
|---|---|
| Initial storefront | **49.94** |
| Follow-up hero | **10.12** |
| Artifact write attempts (sum of small proofs) | ~10–51 each depending on retries |

## 8. Cancel

| Field | Value |
|---|---|
| Run | `run-15f0efd7-8255-4cd5-82a2-b0db4fe686d0` |
| Status | **CANCELLED** |
| Note | Cancel is async; poll `get_run` until terminal (do not assume immediate CANCELLED) |

## 9. Concurrency

| Check | Result |
|---|---|
| SV DB lock `cursor_ai_claim_run` while run active | **Blocked** with `run_already_active` |
| Cursor `agent_busy` (409) | Observed when creating a second run without cancel |

SV entitlement/concurrency is the primary control; Cursor busy is secondary.

## 10. Entitlement

| Check | Result |
|---|---|
| Disable entitlement → `cursor_ai_may_start_run` | **denied** (`ai_entitlement_disabled`) |
| Re-enable | **allowed** (`plan_kind=trial`) |

## 11. Edge gateway

| Item | Status |
|---|---|
| Deployed | `cursor-storefront-gateway` on project `mkkqbekhvcnwcheegjpy` |
| Merchant UI | **Not** built (Phase 1 stop) |
| Unauth call | Rejects without leaking API key |

Developer harness: `cursor-phase1-harness` (token-gated).

## 12. Runtime security (review)

- Private runtime repo: storefront + commerce contract + hooks only  
- No `.env`, Stripe/Netopia/Oblio secrets, or service-role keys in agent workspace  
- Hooks deny edits outside allowlisted prefixes + allow `/opt/cursor/artifacts/`  
- Temporary artifact download URLs expire (~15m); SV stores sha256 + owned copy intent  

## Fixes applied during live proof

1. Removed invalid `deferOnBusy` from createRun bodies  
2. Allowed `artifacts/` + `/opt/cursor/artifacts/` in runtime hook policy  
3. Forced `CURSOR_RUNTIME_STARTING_REF=main` so agents pick up hook updates  
4. Cancel probe returns immediately; local poller waits for `CANCELLED`  
5. Artifact capture falls back to known path when list lags  

## Phase 1 commit verdict

**Architecture live proof: complete.**  
**Do not commit** the monorepo Phase 1 tree until you explicitly approve.  
**Do not start Phase 2** until approved.

Note: an accidental monorepo push of `guardPolicy.mjs` was immediately **reverted** on `feature/cursor-ai-store-builder-phase1` (`e5a04e6` → `da6e976`). Runtime changes live on the **private** repo `main`.
