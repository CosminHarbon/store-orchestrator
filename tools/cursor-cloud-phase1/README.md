# Cursor Cloud Phase 1 — developer proof harness

Isolated from the merchant product UI. Proves SpeedVendors backend → Cursor Cloud Agents REST.

## Setup

```bash
cd tools/cursor-cloud-phase1
npm ci
npm test          # offline; no API key
npm run doctor    # shows whether CURSOR_API_KEY is set (never prints the value)
```

## API key (session only)

```bash
read -rs CURSOR_API_KEY && export CURSOR_API_KEY
# optional: private isolated runtime repo (never the main monorepo)
export CURSOR_RUNTIME_REPO_URL=https://github.com/YOUR_ORG/speedvendors-storefront-runtime
export CURSOR_RUNTIME_STARTING_REF=main
```

## Live proofs

```bash
npm run models          # GET /v1/models
npm run proof           # full lifecycle: create, stream/poll, usage, artifact, follow-up, cancel
npm run billing         # REST tokens vs SDK Agent.getUsage chargedCents settlement
```

Outputs land in `.proof-output/` (gitignored).

## Security

- `CURSOR_API_KEY` is never written to disk by these scripts.
- Browser never receives the key.
- Do not point Cloud Agents at the main `store-orchestrator` repository.
