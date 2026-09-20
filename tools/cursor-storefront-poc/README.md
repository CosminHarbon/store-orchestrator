# SpeedVendors × Cursor SDK — storefront proof of concept

Developer-only PoC that proves this flow:

```
merchant design prompt
  → isolated storefront workspace
  → Cursor SDK edits React/CSS
  → protected commerce files are verified
  → storefront build runs
  → result and exact AI usage are reported
```

**Out of scope on purpose:** production deployment, merchant-facing UI, billing, Supabase persistence, publishing.
The PoC never publishes anything and never talks to Supabase, Vercel, Netopia, Oblio or any courier.

> ## ⚠️ Local-runtime security limitation
>
> **This local PoC is for developer-controlled prompts only. It must not be exposed to real merchants.**
> **Production requires VM/container-level isolation or Cursor Cloud with a dedicated storefront repository.**
>
> The local Cursor sandbox limits writes and network, but it does **not** restrict reads outside the workspace.
> The controls below (hooks, tool restrictions, post-run verification) reduce risk for a developer running their own
> prompts; they are not a multi-tenant security boundary.

## Requirements

- **Node.js ≥ 22.13** (required by `@cursor/sdk`; checked at startup). The main app's runtime requirements are unchanged.
- A Cursor API key, only for live runs.

## Install

```bash
cd tools/cursor-storefront-poc
npm ci             # PoC package (Cursor SDK, tsx, typescript)
npm run setup      # installs the storefront template's dependencies once (they are copied into each workspace)
npm run doctor     # node version, SDK import, whether CURSOR_API_KEY is set (value never shown), template deps
```

## API key — safe setup

`CURSOR_API_KEY` is read **only** from `process.env`, at the moment of a live run. It is never written to a file, never
logged, never passed to the storefront build (the build gets a minimal environment), never exposed through `VITE_*`,
and the template contains no SDK import (a test enforces this).

```bash
# for this terminal session only — do NOT put it in .env, a script, or shell history you sync
read -rs CURSOR_API_KEY && export CURSOR_API_KEY
```

## Dry run and tests (no API key, no cost)

```bash
npm run typecheck                                   # PoC package incl. SDK types
npm test                                            # 200+ offline tests; no Cursor call
npm run generate -- --merchant dry-demo \
  --prompt "Create a premium minimalist fashion store" --dry-run
npm run preview -- --merchant dry-demo              # http://127.0.0.1:4173
npm run reset -- --merchant dry-demo --yes
```

`--dry-run` creates the workspace, runs every safety check and the build, and makes **no** Cursor call.
Do not reuse a dry-run merchant id for a live run (reset it first) — the live run needs to create the agent.

What the tests cover: slug validation, path traversal, workspace creation, protected-file hashing and tamper detection
(including restore), allowed-path validation, reset path safety, the hook policy (every blocked category), the full
pipeline with a fake Cursor driver (violations, repair limits, timeouts, follow-ups), the baseline storefront build, and
template hygiene.

## Live run (later — first controlled generation)

```bash
export CURSOR_API_KEY=...   # see above
npm run generate -- \
  --merchant demo-fashion \
  --prompt "Create a premium minimalist fashion store with a transparent navigation, large product photography and subtle scroll animations."

npm run followup -- --merchant demo-fashion --prompt "Make the product grid three columns on desktop and the header solid on scroll."
npm run build:workspace -- --merchant demo-fashion
npm run preview -- --merchant demo-fashion
npm run reset -- --merchant demo-fashion --yes
```

Options: `--timeout-min N` (default 10; the Cursor run is cancelled when exceeded), `--json` (machine-readable report),
`--root DIR` (workspaces root). Workspaces live in `<repo>/.cursor-storefront-workspaces/<merchant>/` (gitignored):

```
<merchant>/workspace/        agent cwd — the storefront project (a real copy, no symlinks to the main repo)
<merchant>/state.json        agent id + trusted baseline hashes      (outside the agent's cwd)
<merchant>/agent-store/      Cursor local agent store                (outside the agent's cwd)
<merchant>/runs/*.json       full report of every run                (outside the agent's cwd)
<merchant>/hook-log.jsonl    every hook decision (proves hooks ran)  (outside the agent's cwd)
```

## What Cursor may and may not edit

| | Paths |
|---|---|
| ✅ **May edit** (create/modify/delete) | `src/storefront/**`, `src/components/**`, `src/styles/**`, `public/**` |
| ⛔ **May not edit** | `src/speedvendors/**` (commerce contract + mock), `src/main.tsx`, `index.html`, `package.json`, `package-lock.json` / any lockfile, `vite.config.*`, `tsconfig.*`, `scripts/**`, `.cursor/**`, any `.env*`, anything else outside the four editable areas |

The design layer talks to commerce **only** through `src/speedvendors` (`useMerchant`, `useCategories`, `useProducts`,
`useProduct`, `useCart`, `useCheckout`). It does not implement payment, order or delivery logic. The PoC template uses
deterministic mock data and inline SVG art — no network, no credentials.

## How the run is protected

1. **Before every run:** merchant id validated as a strict slug; workspace scanned for symlinks and credential-like
   files; protected files compared with the trusted baseline (restored if they drifted); baseline snapshot taken.
2. **During the run (`@cursor/sdk` local runtime):**
   `cwd` = the merchant workspace (never the main repo) · model `composer-2.5` · `sandboxOptions.enabled` ·
   `autoReview` · `settingSources: ['project']` (no user/team/plugin layers) ·
   `disallowedTools`: `task`, `mcp`, `webSearch`, `webFetch`, `generateImage`, `askQuestion` ·
   one durable agent per merchant (`Agent.create` first, `Agent.resume` for follow-ups) ·
   `.cursor/hooks.json` (fail-closed `beforeShellExecution`, `beforeReadFile`, `preToolUse`) running `hooks/guard.mjs`.
   The shell policy is an **allowlist**: only `npm run build`, `npx tsc --noEmit` and read-only `ls/cat/head/tail/wc/grep/rg/find`
   inside the workspace; no chaining/redirection/substitution; git, supabase, vercel, curl/wget/ssh, `rm`/`mv`/`cp`/`chmod`,
   package installs/publish and any path outside the workspace are refused. Writes are allowed only under the editable paths.
3. **After every run (authoritative, does not depend on hooks):** every file is re-hashed; changed files are listed;
   any change outside the editable paths, any symlink, or any credential file marks the run **failed**, restores the
   file from the trusted template (or deletes it) and skips build/repair. Nothing is ever published.
4. **Build:** the PoC runs `npm run build` itself (minimal env, timeout, sanitised output). If it fails, **one** repair
   run is allowed with the sanitised errors; then build again; stop after the second failure.
5. **Report:** merchantId, agentId, runId, status, model, duration, changed files, build status, input/output/cache/total
   tokens (`run.wait().usage`), charged and raw cost (`agent.getUsage()`), and whether cost is still pending. Cost is
   **never estimated**: if Cursor has not returned it (it can lag), the report says `pending`.

### Known limits (read before trusting it)

- **Hooks are unverified in a live run.** The `hooks.json` schema is taken from the official docs and the SDK docs say
  local SDK agents load `.cursor/hooks.json`, but this repo has not yet observed the local runtime invoking them. After
  the first live run, check `hook-log.jsonl` (and the `hookDecisions` line of the report): if it is empty, the hooks did
  not run and only the sandbox, `disallowedTools` and the post-run verification protected that run.
- Hook tool input field names (`path`, `file_path`, …) are matched by pattern; unknown write tools fail closed, so a
  too-strict denial on the first run is possible (the agent is told why). The post-run check is the real guarantee.
- `permissions.json` only has allowlists and an advisory `autoRun` block — it cannot deny anything.
- `node_modules` is not hashed except `node_modules/.package-lock.json`; dependency tampering is detected via that file
  and `package.json`/lockfile hashes, not by content-hashing installed packages.
- The workspace lives inside the repo tree (gitignored), so the agent could read the repository if it tries; hooks deny
  reads outside the workspace, the local sandbox does not.
- `@cursor/sdk@1.0.31` transitively depends on `undici` with published advisories and **no upstream fix available** at
  the time of writing (`npm audit --omit=dev`). This is a developer-only tool with no inbound server; revisit on SDK updates.
- Any files the SDK itself creates inside the workspace (for example under `.cursor/`) will be flagged as protected-file
  changes on a first live run. If that happens, the report lists them; decide then whether to allow-list a specific path.

## What production must change

- Run each merchant in **VM/container-level isolation** (or **Cursor Cloud** with a dedicated storefront repository per
  merchant/tenant); no shared filesystem, no host reads, egress allowlist, per-run credentials, resource/time quotas.
- Replace the mock with the real SpeedVendors commerce adapter (public store-api) behind the same `SpeedVendorsCommerce`
  interface; keep payment/checkout/delivery logic on the platform side.
- Store workspaces, agent ids, reports and usage in durable storage; link usage to billing/quotas.
- Human review + preview URL before any publish; a separate, audited publish step (this PoC has none).
- Treat merchant prompts as untrusted input end to end (the wrapper is defence-in-depth, not a boundary).

## Files

```
src/cli.ts              commands: generate | followup | build | preview | reset | create | doctor
src/createWorkspace.ts  workspace creation, hooks/permissions generation, state, safe reset
src/runAgent.ts         Cursor SDK driver (create/resume, send, stream, cancel-on-timeout, usage, dispose)
src/pipeline.ts         preflight → agent → verify/restore → build → ≤1 repair → report
src/protectedFiles.ts   slug/path validation, hashing, diffing, evaluation, restoration
src/buildStorefront.ts  independent build (minimal env, timeout, sanitised output)
src/prompt.ts           strict instruction + merchant-request wrapper + repair prompt
src/report.ts           report types, aggregation (no estimation), formatting
src/sanitize.ts         path/secret redaction and truncation
hooks/guardPolicy.mjs   pure allow/deny policy (also unit-tested)   hooks/guard.mjs  hook entry point
template/               standalone Vite + React + TS storefront with the SpeedVendors commerce contract + mock
tests/                  offline test suite
```
