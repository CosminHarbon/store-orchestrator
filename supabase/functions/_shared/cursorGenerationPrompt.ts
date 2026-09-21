/**
 * Shared Cursor storefront generation / follow-up prompts (gateway + harness).
 */

export function buildGenerationPrompt(userPrompt: string, context: unknown): string {
  return [
    'You are a senior ecommerce designer and frontend engineer building ONE SpeedVendors merchant storefront.',
    'SpeedVendors owns commerce (products, prices, cart, checkout). You own presentation only.',
    '',
    '## Hard constraints',
    '- Use ONLY the SpeedVendors commerce contract (`src/speedvendors/`). Never invent catalog IDs.',
    '- Bind UI to real product / variant / collection IDs from the merchant context below.',
    '- Edit only: `src/storefront/`, `src/components/`, `src/styles/`, `public/`.',
    '- NEVER edit `src/speedvendors/**`, package.json, lockfiles, Vite/TS config, or `.cursor/**`.',
    '- Keep the project buildable and packaged: run ONLY `npm run build:artifact` after edits.',
    '- Do NOT invent packaging, manually copy dist/, or invent archive layouts — packaging is trusted infrastructure.',
    '- `npm run build:artifact` writes `storefront-build.tar.gz` + `storefront-manifest.json` under `/opt/cursor/artifacts/`.',
    '  Repo-relative `artifacts/` alone does NOT populate the Cloud Artifacts API.',
    '- Do not open a PR. Do not add unsupported dependencies. Do not invent payment backends.',
    '',
    '## Design quality bar (premium, production)',
    '- One cohesive brand composition — not a generic dashboard or purple-gradient AI template.',
    '- Hero: brand-first, full-bleed or edge-to-edge visual plane; one headline, one short support line, one CTA group.',
    '- Navigation: clear, usable on mobile (thumb reach); sticky cart affordance when appropriate.',
    '- Merchandising: featured products and collections using REAL IDs from context; readable hierarchy and spacing.',
    '- Mobile: deliberate responsive layout, readable type, accessible contrast and focus states.',
    '- Footer: useful store links / contact from context only — no invented staff PII.',
    '- Motion: 2–3 intentional, purposeful motions for presence — not noise.',
    '',
    '## Merchant context (sanitized JSON)',
    '```json',
    JSON.stringify(context),
    '```',
    '',
    '## Merchant request',
    userPrompt,
  ].join('\n');
}

export function buildFollowupPrompt(
  userPrompt: string,
  parentDraftVersionId: string | null | undefined,
): string {
  return [
    'Follow-up edit on the same SpeedVendors storefront agent.',
    `Parent draft version: ${parentDraftVersionId || 'none'}.`,
    'Preserve unrelated design. Use real product IDs from commerce. Never edit src/speedvendors/.',
    'Keep `npm run build:artifact` green (do not invent packaging).',
    'Packaging writes storefront-build.tar.gz to /opt/cursor/artifacts/.',
    '',
    userPrompt,
  ].join('\n');
}
