# Cursor / SpeedVendors storefront artifacts

Trusted packaging (`npm run build:artifact`) writes:

- `storefront-build.tar.gz` — full `dist/` archive (relative paths, requires `index.html`)
- `storefront-manifest.json` — format version 1 metadata

Cloud Agents must also land these under `/opt/cursor/artifacts/` (Artifacts API mount).
This repo-local folder is for local tests and mirror verification only.
