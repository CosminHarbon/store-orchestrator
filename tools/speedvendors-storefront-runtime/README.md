# SpeedVendors Storefront Runtime

Isolated Cloud Agent workspace for merchant storefront generation.

**This repository (or this directory published as its own private GitHub repo) is the ONLY
code the merchant Cloud Agent should receive.**

It must NEVER contain:

- Supabase service-role keys / Cursor API keys / Stripe / Netopia / Oblio secrets
- Admin dashboard, billing backend, auth internals, database migrations
- Other merchants' data
- The main SpeedVendors monorepo

## Layout

```
speedvendors-storefront-runtime/
  package.json
  README_AGENT.md          ← agent instructions (repository-level)
  artifacts/               ← Cursor artifacts API output directory
  .cursor/hooks.json       ← cloud-supported command hooks (defense in depth)
  .cursor/hooks/           ← guard policy
  public/                  ← editable images
  src/
    storefront/            ← ONLY editable presentation (App, sections, theme.css)
    speedvendors/          ← PROTECTED commerce + UI (cart/checkout/product chrome)
```

## Editable vs protected

| May edit | Must not edit |
|---|---|
| `src/storefront/**`, `public/**` | `src/speedvendors/**`, `package.json`, lockfiles, vite/tsconfig, scripts, `.cursor/**`, secrets |

## Commerce

AI controls **presentation**. SpeedVendors controls **commerce** (products, prices, stock, cart, checkout, payments, orders) via `src/speedvendors/*`.

## Cloud Agents wiring

Publish this tree as a **private** GitHub repo (one template for all merchants — not one repo per merchant).

Cloud Agent create:

```json
{
  "repos": [{ "url": "https://github.com/ORG/speedvendors-storefront-runtime", "startingRef": "main" }],
  "autoCreatePR": false
}
```

Persistence boundary for merchant designs: **artifacts ingested into SpeedVendors storage**, not permanent dependence on Cursor branches or presigned URLs.

## Local build

```bash
npm ci
npm run build
```
