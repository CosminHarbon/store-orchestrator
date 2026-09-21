/**
 * Shared Cursor storefront generation / follow-up prompts (gateway + harness).
 * Permanent architecture rules live in runtime README_AGENT.md — keep dynamic prompts small.
 */

export type EditSize = 'small' | 'medium' | 'large';

/** Heuristic classification — no extra model call. */
export function classifyEditSize(prompt: string): EditSize {
  const p = prompt.trim().toLowerCase();
  if (!p) return 'medium';

  const largeHints =
    /\b(redesign|rebuild|rebrand|entire|whole|from scratch|completely|overhaul|full.?site|new look|start over)\b/;
  if (largeHints.test(p)) return 'large';

  const smallHints =
    /\b(smaller|larger|shorter|taller|nudge|slightly|font|typography|spacing|padding|margin|color|colour|hero|nav|logo|copyright|footer text|button text|1px|2px|%\s*shorter|%\s*smaller)\b/;
  const mediumHints =
    /\b(add|section|featured|best.?seller|collection|footer|header|merchandis|grid|banner|announcement)\b/;

  if (smallHints.test(p) && !mediumHints.test(p) && p.length < 180) return 'small';
  if (mediumHints.test(p) && !largeHints.test(p)) return 'medium';
  if (p.length < 120 && smallHints.test(p)) return 'small';
  return 'medium';
}

export function buildGenerationPrompt(userPrompt: string, context: unknown): string {
  return [
    'Design ONE SpeedVendors merchant storefront. Presentation only — commerce is protected.',
    '',
    '## Edit only (see README_AGENT.md)',
    '- `src/storefront/**` and `public/**`',
    '- Compose protected exports from `src/speedvendors` (Header, Footer, ProductGrid, FeaturedProducts, ProductDetail, CartDrawer, CheckoutForm, CheckoutButton, …).',
    '- Never edit `src/speedvendors/**`, package.json, lockfiles, or configs. No new dependencies.',
    '- Prefer restyling the existing shell (`theme.css` + sections) over a greenfield rewrite.',
    '- Run `npm run build:artifact` ONCE at the end. Do not open a PR.',
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
  opts?: { editSize?: EditSize },
): string {
  const size = opts?.editSize ?? classifyEditSize(userPrompt);
  const sizeBlock =
    size === 'small'
      ? [
          '## Edit size: SMALL',
          '- Change only what the merchant asked. Expected: 1–3 files under src/storefront/.',
          '- Do NOT inspect or rewrite unrelated files. Do NOT explore the repo.',
        ]
      : size === 'medium'
        ? [
            '## Edit size: MEDIUM',
            '- Prefer adding/adjusting one section. Reuse FeaturedProducts / ProductGrid with real IDs.',
            '- Do not rewrite the whole storefront.',
          ]
        : [
            '## Edit size: LARGE',
            '- Cohesive redesign is OK, but still only edit src/storefront/** and public/**.',
            '- Keep protected commerce components; do not reimplement checkout/cart.',
          ];

  return [
    'Follow-up edit on the same SpeedVendors storefront agent.',
    `Parent draft version: ${parentDraftVersionId || 'none'}.`,
    'Rules: README_AGENT.md. Never edit src/speedvendors/. No new deps.',
    'Run `npm run build:artifact` once at the end (packaging → /opt/cursor/artifacts/).',
    '',
    ...sizeBlock,
    '',
    '## Merchant request',
    userPrompt,
  ].join('\n');
}

/** Tiny repair prompt — exact error only, no full merchant context dump. */
export function buildRepairPrompt(opts: {
  buildError: string;
  relevantFiles?: string[];
}): string {
  const files = (opts.relevantFiles || []).slice(0, 8);
  return [
    'REPAIR ONLY — fix the compile/build error below. Do not redesign.',
    'Edit only src/storefront/** (or public/**). Never touch src/speedvendors/**.',
    'Keep CheckoutForm / CheckoutButton / cart wiring unchanged.',
    'After the fix, run `npm run build:artifact` once.',
    '',
    '## Error',
    opts.buildError.slice(0, 4000),
    '',
    files.length ? `## Likely files\n${files.map((f) => `- ${f}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
