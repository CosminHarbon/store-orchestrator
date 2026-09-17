# AI Studio (Premium design agent)

Curated storefront composer: hand-built nav / hero / card / section variants + live catalog + Premium checkout. **Not** freeform React/HTML generation.

## Required Edge Function secrets

Set in Supabase → Project Settings → Edge Functions → Secrets (or CLI):

```bash
# Required for Studio-quality generate + hard redesign (Claude preferred)
supabase secrets set ANTHROPIC_API_KEY='sk-ant-...'

# Fallback / alternate studio path
supabase secrets set OPENAI_API_KEY='sk-...'

# Cheap micro-refines (FAQ, one color, one headline)
supabase secrets set DEEPSEEK_API_KEY='sk-...'
```

| Secret | Used for |
|--------|----------|
| `ANTHROPIC_API_KEY` | Generate + design refine (Claude Sonnet) — **needs billing credits** |
| `OPENAI_API_KEY` | Automatic fallback when Anthropic fails (credit/auth/rate limit) |
| `DEEPSEEK_API_KEY` | Micro refine + last-resort design fallback |

If Anthropic returns “credit balance too low”, Studio now falls through to OpenAI, then DeepSeek. Top up Anthropic at https://console.anthropic.com for best quality.

Without Anthropic/OpenAI, Studio quality falls back to DeepSeek/heuristics and the UI shows an honest notice.

## Message kinds

`ai_messages.kind`: `generate` | `refine` | `refine-design` | `publish` | `chat`  
Design-refine uses `refine-design` so daily Claude redesigns can be capped separately (10/day).

## Deploy

```bash
supabase functions deploy ai-studio-generate --project-ref <ref>
supabase functions deploy ai-studio-refine --project-ref <ref>
supabase functions deploy ai-studio-publish --project-ref <ref>
```

## Daily caps (per user)

- Generate: 100 (see note below — code marks this as a temporary elevation)
- Design refine: 10
- All refine: 30

> **Known drift (found during the 2026-09 AI Studio architecture audit):** `GENERATE_LIMIT` in
> `supabase/functions/_shared/aiStudio.ts` is currently `100`, with an inline comment reading
> *"Temporary elevated limit for Phase 3–4 lab testing — restore to 5 before production hardening."*
> This doc previously said `5`, which matched that comment's stated target but not the live code.
> Runtime behavior was intentionally left unchanged as part of this pass — restoring a 20x-lower
> merchant-facing quota is a product decision, not a docs fix. Whoever owns AI Studio should
> explicitly decide whether `100` is now the real intended cap (and update the code comment) or
> whether it should be restored to `5` (or some other value) before/at production hardening.

## Model routing

1. **Generate / design refine** → Claude → GPT-4o → DeepSeek/heuristic
2. **Micro refine** → DeepSeek → GPT-4o-mini → Claude

## V2 (in progress)

See [ai-studio-v2.md](./ai-studio-v2.md). Feature-flagged SiteTree renderer; V1 remains default when `VITE_AI_STUDIO_V2` is unset.
