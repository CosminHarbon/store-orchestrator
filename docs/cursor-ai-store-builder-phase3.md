# Track B Phase 3 — Cursor AI Store Builder (merchant UX)

**Branch:** `feature/cursor-ai-store-builder-phase3`  
**Base:** Phase 2 `2a1701bcf69f7d264050b1b4eed6379fba99d518`  
**Runtime:** `6ced389a52e4a9e7e9716fd8586039fd17a9a053`  
**Status:** Implementation + live UI proofs (STOP before commit — user review).  
**Out of scope:** publish, domains, Vercel, `active_template`, free-trial, Track A, V1/V2 studio changes.

---

## Builder entry

Website Builder hub → **Build with AI** (gated by `VITE_AI_STORE_BUILDER_CURSOR=true` + backend entitlement).

## First-time experience

Empty state: “Build your store with AI”, inspiration chips, catalog count, **Generate my store**. Attach slot disabled (“coming soon”).

## Main builder

Chat left / preview right; device Desktop|Tablet|Mobile; Versions sheet; Start over; Draft pill + “live storefront has not changed”; Publishing disabled.

## Critical fixes during Phase 3 QA

1. **`get_run` 404** — PostgREST `!inner` join failed; load run then session separately (gateway v12+).
2. **`complete_run` null `.id`** — `.single()` on sessions without active filter; use `loadActiveSession` (gateway v13+).
3. **Preview HTML `text/plain` + nosniff** — Supabase Edge/platform forces preview GET bodies to a Content-Type unsuitable for direct iframe navigation (`text/plain` + nosniff). Phase 3 uses **iframe `srcdoc`** after a same-dashboard fetch, with absolute asset URLs from the preview rewriter. This is a **temporary preview transport workaround only** — Phase 4 hosting/deployment must serve storefronts as `text/html` from a proper dedicated web origin. Do not let `srcdoc` define production architecture.

## Preview security (srcdoc sandbox)

AI-generated storefront HTML is untrusted. The builder iframe uses:

```text
sandbox="allow-scripts allow-forms"
```

Intentionally **omitted**:

- `allow-same-origin` — combining this with `allow-scripts` on dashboard `srcdoc` would share the SpeedVendors origin and collapse isolation (parent DOM / localStorage / sessionStorage / cookies / auth). **Forbidden for Phase 3.**
- `allow-popups` / `allow-popups-to-escape-sandbox` — not required for draft commerce preview.

Granted only what draft commerce needs: React scripts + checkout form fields. The storefront runs in an **opaque unique origin**; parent-isolation proofs deny `window.parent.document` / storage / cookie / `window.top` navigation.

Proof scripts:

- `tools/cursor-cloud-phase1/tests/phase3PreviewSandbox.test.ts`
- `tools/cursor-cloud-phase1/scripts/previewIsolationProof.mjs`

## Cost reconciliation

Cursor may return token usage before `chargedCents` settles. Gateway persists tokens with `cost_reconciliation_status = tokens_only` and **never** invents `actual_charged_cents` from estimates. Delayed settle via:

- `persistUsageIfPossible` on terminal `get_run` / `complete_run`
- `reconcilePendingRunCosts` (best-effort batch on gateway traffic)
- explicit `reconcile_run_cost` action

Merchant UI stays independent of billing latency (no charged cents in merchant payloads).

## Live proofs (test store `f30cbfb8…`)

| Flow | Result |
|---|---|
| Entry + resume draft | OK |
| UI follow-up “Make the hero smaller…” | Run `a8a1293c…` → Cursor FINISHED → after fix `complete_run` → version `72e31b55…` **Hero update** (v5) |
| Same agent | `bc-e581d88e-…` unchanged |
| Previous draft kept during run | draft stayed `902fa6c5…` until complete |
| Cart QA (Playwright setContent) | Product → Add to cart → Cart 1 → qty+ → Checkout form (no Place order) |
| **Sandboxed srcdoc commerce** | Opaque origin + `allow-scripts allow-forms` — products/images/prices/detail/variants/cart/qty/remove/checkout form OK; store-api CORS `*` sufficient |
| Parent isolation | All parent DOM/storage/cookie/top-nav attempts → SecurityError |
| **Flow A empty-state Generate** | Start-over empty → UI Generate → run `2702a277…` → ~24.5 min → draft `0ec69556…` / later `efc82fe5…` **Initial AI design**; repairs required (v1–v6); charged `234.4152` cents |
| **Refresh during run** | Follow-up `9627ef30…` → browser refresh → same `active_run_id`, draft unchanged, progress recovered, no duplicate Cursor run |
| **Cancel** | Run `77a6915f…` → Cursor `CANCELLED`, lock released, draft preserved, may_start again |
| **Exhausted credits** | Budget/runs exhausted → UI “AI limit reached” + allowance message; `rejected_entitlement` / `no_cursor`; draft+versions remain; entitlement restored |
| Mobile ~390 | Chat/Preview tabs; no horizontal overflow |
| Restore | older version → `needs_design_sync=true`; restore back OK |
| `active_template` | remains `ai` |
| Merchant status leak | no agent id / chargedCents / service-role / CURSOR_API_KEY |
| Cost settle (run `a8a1293c…`) | initially `tokens_only` / null charged → after reconcile `actual_charged_cents=17.1312`, `reconciled` |

## Open locally

```bash
# .env.local
VITE_AI_STORE_BUILDER_CURSOR=true
VITE_CURSOR_RUNTIME_SHA=6ced389a52e4a9e7e9716fd8586039fd17a9a053
npm run dev
```

## Tests

```bash
cd tools/cursor-cloud-phase1 && npm test   # 42 pass
node tools/cursor-cloud-phase1/scripts/previewIsolationProof.mjs  # from /tmp/pw-cart with playwright
npm run build
```

**STOP — do not begin Phase 4. Do not commit until user accepts.**
