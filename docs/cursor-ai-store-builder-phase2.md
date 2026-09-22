# Track B Phase 2 — Cursor AI Store Builder

**Branch:** `feature/cursor-ai-store-builder-phase2`  
**Base:** Phase 1 `f9d56b8`  
**Status:** Phase 2 accepted (2026-09-21). Infrastructure/commit-ready.  
**Publish:** Out of scope. `active_template` untouched. V1/V2 untouched.

---

## Packaging format (authoritative)

Agent runs **only** `npm run build:artifact` after presentation edits.

Trusted script (`scripts/package-artifact.mjs`):

1. Requires `dist/index.html` (post-`vite build`).
2. Rewrites absolute Vite asset URLs `"/assets/` → `"./assets/` in `index.html`.
3. Creates deterministic `tar -czf` of `dist/` contents (paths relative to dist root).
4. Writes when writable:
   - `artifacts/storefront-build.tar.gz` + `artifacts/storefront-manifest.json` (mirror / tests)
   - `/opt/cursor/artifacts/storefront-build.tar.gz` + companion manifest (Cloud Artifacts mount)

Manifest fields (`artifactFormatVersion: 1`):

| Field | Notes |
|---|---|
| entrypoint | `index.html` |
| archiveFilename | `storefront-build.tar.gz` |
| archiveSha256 | SHA-256 of archive bytes |
| fileCount / totalUncompressedBytes | from dist walk |
| buildTimestamp | ISO |
| runtimeCommitSha | `CURSOR_RUNTIME_COMMIT_SHA` or `git rev-parse HEAD` or `unknown` |
| protectedCommerceSha256 | map of source-file SHA-256 for protected `src/speedvendors/*` (not dist) |
| storeId / sessionId / runId / versionId | `null` placeholders (SV fills later) |

**Do not** invent packaging, manually copy `dist/`, or treat random `dist/assets/*.js` as a ready storefront.

---

## Ready lifecycle

```
captured + build_status=packaging
  → download storefront-build.tar.gz
  → build_status=verifying (gunzip + ustar path checks, require index.html)
  → optional protectedCommerceSha256 gate (skip if map absent / old packages)
  → upload archive + extract safe files to …/site/
  → status=stored + build_status=ready
  → session.current_draft_version_id = version (only on success)
```

On ingest failure: `status=failed`, `build_status=failed`, **do not** advance `current_draft_version_id`; session `pipeline_status=failed` (or `needs_recovery` when no usable artifact).

`BUILD_BLOCKED.txt` is never a ready artifact. `pickArtifactPath` prefers `storefront-build.tar.gz`, else manifest companion, else `null` for random JS.

---

## Preview

- Edge: `cursor-storefront-preview` serves `{storage_dir}/site/{safePath}`.
- Auth: short-lived HMAC token (`get_preview_token` / harness `phase2_preview_token`, TTL 5m) **or** Bearer JWT. Secret: `CURSOR_PREVIEW_HMAC_SECRET` or hashed `SUPABASE_SERVICE_ROLE_KEY` fallback.
- HTML serving rewrites `./assets/…` (and favicon) into the same query-param URL shape and injects `window.__SV_RUNTIME__` with the merchant `store_api_key` + store-api base so iframes get live commerce.
- Dev UI: `/dev/cursor-preview?version_id=` iframes `preview_url` (token query — iframes cannot set Authorization).

---

## Runtime source of truth / reseed

- **SoT:** private `CosminHarbon/speedvendors-storefront-runtime` (see `tools/speedvendors-storefront-runtime/RUNTIME_SOURCE_OF_TRUTH.md`).
- Monorepo `tools/speedvendors-storefront-runtime/` is a mirror for tests.
- **Current tip:** `6ced389a52e4a9e7e9716fd8586039fd17a9a053` (see `tools/speedvendors-storefront-runtime/RUNTIME_SHA`).
- Critical packaging fixes on tip: `npm ci` allowed for Cloud Agent bootstrap; shell tar into `/opt/cursor/artifacts`; pure Node fallback; fail if cloud archive &lt; 1KB.
- After packaging/guard changes: sync mirror → private tip, then **reseed** (new session) so Cloud Agents pick up `build:artifact` hooks. Old agents keep older workspace hooks until reseed.

### `create_replacement_session` semantics

`runtime_commit_sha` is **immutable** for a session. Upgrades require a new session row:

1. Load the merchant’s active session (status not `replaced` / `archived`).
2. Do **not** mutate the old `runtime_commit_sha`.
3. Mark old session `status=replaced`, set `replaced_at`, `replacement_reason`, then create a **new** session with `runtime_commit_sha` / `runtime_starting_ref` from `body.runtime_commit_sha` (required).
4. Copy `user_id` (+ optional `metadata.store_id`); new status `idle`; `metadata.seed_from_session_id`.
5. Set `replaced_by_session_id` on the old row. Old versions are **retained** (never deleted).
6. **Does not** create a Cursor agent in the stub. Call `start_generation` / harness `phase2_start` on the new session to provision an agent pinned to the new SHA.
7. Optional `create_agent=true` is ignored in the stub (logged only).

Gateway action: `create_replacement_session`.  
Harness: `phase2_reseed` (same semantics; may create a fresh session if none exists).

Partial unique index: at most one non-`replaced`/non-`archived` session per user.

Check:

```bash
bash tools/speedvendors-storefront-runtime/scripts/check-runtime-sync.sh
# or
node tools/cursor-cloud-phase1/scripts/sync-runtime-to-github.mjs
```

Regenerate protected commerce golden hashes after runtime source edits:

```bash
node tools/speedvendors-storefront-runtime/scripts/gen-protected-commerce-hashes.mjs
```

---

## Failure safety (no live Cursor)

Harness `phase2_simulate_artifact_failure`: given a session with `current_draft_version_id`, inserts a synthetic failed version and asserts the draft pointer is unchanged.

**Cited again in live proof (2026-09-21):** after v3 draft `902fa6c5…`, synthetic failed version `bd8827a7…` left `current_draft_version_id` unchanged.

---

## Live proof summary (2026-09-21) — packaging + preview complete

### Safe test store A
- `user_id`: `f30cbfb8-eeb4-4ccf-8c95-8a8de505d7e5` (internal “My Store”)
- Products: **7** · Variants: **11** · Collections: **0** · Images: present
- Entitlement: `admin_override` for Phase 2 only (not trial-wide)

### Active session (post-reseed)
| Field | Value |
|---|---|
| session | `318fa035-9d9d-4704-b171-e29b78ecca88` |
| agent | `bc-e581d88e-a7c1-4a94-8c71-f85ab60396e2` |
| runtime SHA | `6ced389a52e4a9e7e9716fd8586039fd17a9a053` |
| model | `composer-2.5` |
| current draft | `902fa6c5-1d68-41e9-a27b-ed676d2bae79` (injection retest; same archive as bestsellers) |

Replaced sessions retained: `7f48282d…` → `f9b54927…` → `5910333d…` → active `318fa035…`.

### Results table

| Proof | Result | IDs / notes | Cost |
|---|---|---|---|
| SV storage archive + `site/` | **OK** | v1 `54c5fa9d…` · sha `31504f95…` · 57347 B · index.html + JS/CSS/favicon in bucket | — |
| Hosted preview (HMAC) | **OK** | harness `phase2_preview_token` · HTML/JS/CSS HTTP 200 · runtime inject + asset rewrite deployed | — |
| Preview auth isolation | **OK** | A→B version token **404**; A token + B `version_id` fetch **401**; RLS select-own | — |
| Commerce E2E (store-api) | **OK** | Classic Crew Tee + variant · cart add/up/down/remove/re-add @ **145** · card checkout session `02df34d6…` (no payment) · no stripe/netopia in JS | — |
| Price authority | **OK** | Mini Pouch `3ef134f6…` 11.50→12.00 via SQL; store-api shows 12; same preview version; restored | — |
| Best-sellers follow-up | **OK** | same agent · parent=`54c5fa9d…` · v2 `a6ab77fb…` · 3 Store A IDs in bundle | **11.44¢** |
| Injection retest | **OK** | same agent · v3 `902fa6c5…` · **identical** archive sha to v2 (protected unchanged) | **3.07¢** |
| Context isolation A≠B | **OK** | sample product ID overlap = ∅ | — |
| Session recovery | **OK** | `phase2_status` after failure → ready; draft unchanged; replaced sessions preserved | — |
| Failure safety (draft pointer) | **OK** | synthetic fail `bd8827a7…`; draft stayed `902fa6c5…` | — |
| Initial generation (prior) | **OK** | v1 ready; no packaging repair on this agent | **37.77¢** |

**Live Cursor total (this session lineage):** ~**52.28¢** (37.77 + 11.44 + 3.07).

Sanitized machine report: `tools/cursor-cloud-phase1/.proof-output/phase2/final-proof.json`.

### Preview infra notes (deployed during proof)
- Harness mode `phase2_preview_token` (owner-checked HMAC mint without merchant JWT).
- `cursor-storefront-preview` rewrites HTML asset URLs for query-param serving and injects `window.__SV_RUNTIME__` (`storeApiKey` + `apiBase`) so live commerce works in hosted preview.
- Browser MCP was unavailable this session; asset/runtime checks done via HTTP.

### Remaining — Phase 3 (not this commit)
- **Interactive visual/cart browser QA** (desktop + ~390px): storefront render, product images, cart controls, no asset 404s. Cursor IDE browser MCP was blank this session; HTTP asset + store-api commerce paths are proven. Treat interactive browser QA as a **Phase 3 acceptance item**, not a Phase 2 infrastructure blocker.
- Merchant-facing builder UX / publish / `active_template` remain out of scope until Phase 3+.

**STOP — do not begin Phase 3 in this commit.**

---

## Architecture

Gateway actions: `prepare_context`, `start_generation`, `complete_run`, `followup_edit`, `get_version`, `list_versions`, `get_preview_token`, `create_replacement_session`.  
Harness Phase 2 modes: `phase2_context|start|poll|complete|followup|status|reseed|simulate_artifact_failure|preview_token`.  
Preview: `cursor-storefront-preview`.

