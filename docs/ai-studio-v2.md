# AI Studio V2 — Architecture

Feature branch: `feature/ai-website-studio-v2`

## Status

| Phase | Status |
|-------|--------|
| 1 — Foundation (schemas, adapter, flag, DB, router table) | Done |
| 2 — SiteTree renderer + 18 compositions | Done |
| 3 — AI pipeline (Brief → DesignSpec → SiteTree → render) | **Done** |
| 4 — Visual critic + targeted SiteOps refinement | **Done** |
| 5+ — Remix, version history, Studio UI | **Not started** |
| Dual-path publish (V1 `published_spec` + V2 `published_document`) | **Hardened (code; deploy Edge Functions to activate)** |

## Phase 4 pipeline

```text
Generate (Phase 3) → user clicks "Refine visually"
  → modern-screenshot desktop 1280 + mobile 390 (ephemeral)
  → POST ai-studio-v2-critique (OpenAI vision)
  → CritiqueScoreCard + recommendations
  → site_ops mapping (OpenAI structured) → validate registry
  → applySiteOps (client) → persist draft_document
  → up to 3 cycles; stop on pass / threshold / distinctiveness guard
```

Screenshots are never persisted long-term. Persist scorecard, SiteOps, cycle metadata, cost/latency only.

## Phase 3 pipeline

```text
User brief
  → design_spec task (Brand / Creative Director — Claude primary)
  → BrandDesignSystem (derived, persisted)
  → site_architecture task (Site Architect — Claude primary)
  → Zod + registry validation
  → site_ops repair if needed (OpenAI primary)
  → persist schema_version=2
  → SiteTreeRenderer
```

V1 generation remains at `POST ai-studio-generate` without `engine: 'v2'`.
V2 never uses `inferLayoutId`, layout IDs, or V1 template stacking.

## Dev routes (DEV only)

| Route | Purpose |
|-------|---------|
| `/ai-studio-v2-showcase` | Visual review of 18 compositions + 5 fixture stores |
| `/ai-studio-v2-generate` | Phase 3 generate lab — live AI → DesignSpec → SiteTree → preview |

Generate lab requires sign-in (uses your Supabase session + edge function).

### Run five test briefs (CLI)

```bash
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_ANON_KEY=<anon-key>
export TEST_USER_EMAIL=...
export TEST_USER_PASSWORD=...
npx tsx scripts/ai-studio-v3-generate-tests.ts
```

Deploy edge function after changes:

```bash
supabase functions deploy ai-studio-generate --project-ref mkkqbekhvcnwcheegjpy
```

## Mental model

```text
DesignSpec (why + brand memory + designIntent)
  → BrandDesignSystem (persistent tokens)
  → SiteDocument / SiteTree (what + stable node ids)
  → Composition registry (hand-built React)
  → Live commerce bindings (ProductPresentation / useStorefrontCommerce)
```

AI never owns checkout/payments. AI never emits storefront HTML/JS.

## Key modules

| Path | Role |
|------|------|
| `supabase/functions/_shared/aiStudioV2.ts` | V2 edge pipeline |
| `shared/ai-studio-v2/designSpecSchema.ts` | **Canonical** DesignSpec schema + prompts (client + edge) |
| `src/lib/ai-studio/v2/designSpec.ts` | Client re-exports + critique extensions |
| `src/lib/ai-studio/v2/siteTree.ts` | SiteDocument / SiteNode |
| `src/lib/ai-studio/v2/compositionCatalog.ts` | Registry vocabulary for AI + validation |
| `src/lib/ai-studio/v2/validateSiteTree.ts` | Pre-render client validation |
| `src/lib/ai-studio/v2/generateClient.ts` | SSE client for `engine: 'v2'` |
| `src/lib/ai-studio/v2/phase3Briefs.ts` | Five approved test briefs |
| `src/lib/ai-studio/v2/modelRouter.ts` | Task → provider routes (config table) |
| `src/lib/ai-studio/v2/adaptV1.ts` | Legacy fallback only — not V2 generation |
| `src/components/templates/ai/v2/*` | Registry + compositions + renderer |

## Model routing (Phase 3)

| Task | Primary | Fallback | Used for |
|------|---------|----------|----------|
| `design_spec` | Claude | OpenAI | Brand + DesignSpec |
| `site_architecture` | Claude | OpenAI | SiteTree composition |
| `site_ops` | OpenAI | Claude, DeepSeek | Structure repair |
| `classify_intent`, `micro_edit` | DeepSeek | OpenAI | Future cheap ops |

Executor: `chatJsonForTask()` in `supabase/functions/_shared/aiStudio.ts`.

## Persistence (V2 success)

`ai_storefronts`:

- `schema_version = 2`
- `draft_document` (SiteTree)
- `design_spec`
- `brand_design_system`
- `creative_mode`

V1 `draft_spec` is **not** overwritten. Generation metadata (models, latency, retries) is stored on the assistant message `brief_json`.

## Legacy layouts

`atelier | editorial | luxeDark | minimal | warmMarket` are **migration/fallback only**.

## Self-test

```bash
npx --yes tsx scripts/ai-studio-v2-selftest.ts
npx --yes tsx scripts/ai-studio-publish-dual-path-selftest.ts
```

Public `store-api/config` exposes `ai_published_document` + `ai_brand_design_system` (never `draft_*` or `design_spec`). V2 publish merges brand tokens into existing `template_customization` without wiping logo/hero/builder fields.

## DB (additive)

Migration `20260821200000_ai_studio_v2_foundation.sql` adds:

- `schema_version`, `draft_document`, `published_document`, `design_spec`, `brand_design_system`, `creative_mode`
