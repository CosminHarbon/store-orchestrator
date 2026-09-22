# Runtime source of truth

**Canonical repository:** [`CosminHarbon/speedvendors-storefront-runtime`](https://github.com/CosminHarbon/speedvendors-storefront-runtime) (private).

**Monorepo mirror:** `tools/speedvendors-storefront-runtime/` inside `store-orchestrator`.

## Policy

1. The **private GitHub repo is the source of truth** for Cloud Agent workspaces and runtime pins.
2. The monorepo path is a **development / test mirror**. After local tests pass, sync mirror → private tip (push or PR), then pin agents to that commit SHA.
3. Do **not** treat Cloud Agent workspace drift as authoritative. Reseed durable agents after packaging-hook changes.
4. Packaging is trusted infrastructure: agents run only `npm run build:artifact`. Do not invent archives.

## Sync check

```bash
# From monorepo root (requires network + git credentials for the private tip):
bash tools/speedvendors-storefront-runtime/scripts/check-runtime-sync.sh
```

Optional env:

- `RUNTIME_REMOTE_URL` — override clone URL (default `git@github.com:CosminHarbon/speedvendors-storefront-runtime.git`)
- `RUNTIME_SHA` — expected tip SHA (or file `tools/speedvendors-storefront-runtime/RUNTIME_SHA`)

## Expected tip file

`RUNTIME_SHA` (optional) may contain a single commit SHA that the mirror is known to match. The check script prints local hashes of key files and compares against the remote tip when reachable.
