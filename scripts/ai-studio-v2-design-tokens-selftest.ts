#!/usr/bin/env -S npx tsx
/**
 * AI Studio V2 — Design Tokens (radius/shadow/buttonStyle) self-test (no vitest, no LLM).
 * Run: npx --yes tsx scripts/ai-studio-v2-design-tokens-selftest.ts
 *
 * Covers Phase 2 "real design tokens + CTA/button system":
 *  1. radius token survives DesignSpec -> BrandDesignSystem -> CSS var
 *  2. radius is actually consumed by renderer CSS (not a dead custom property)
 *  3. shadow token survives DesignSpec -> BrandDesignSystem -> CSS var
 *  4. shadow is actually consumed by renderer CSS, scoped to real "card"/surface contexts
 *  5. buttonStyle is reachable for all 4 schema values (ghost was previously unreachable)
 *  6. every valid buttonStyle maps to a real, distinct CSS treatment
 *  7. product CTA (.ai-v2-pp-add/.ai-v2-pp-cta) participates in the same buttonStyle system
 *  8. the hero-on-image ghost CTA keeps its contrast-safe white treatment regardless of
 *     the brand's buttonStyle token (it is a legibility requirement, not a brand choice)
 *  9. an invalid buttonStyle/radius/shadow value is rejected at the schema boundary,
 *     never reaches CSS as a silently-broken custom property
 * 10. a fully-defaulted DesignSpec (no explicit tokens) still resolves to sane values
 * 11. the newsletter submit CTA participates in the shared text-CTA class
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { designSpecSchema, designTokensSchema, brandDesignSystemFromSpec, type DesignSpec } from '../src/lib/ai-studio/v2/designSpec';
import { brandTokensToCssVars } from '../src/lib/ai-studio/v2/tokens';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

/** Minimal but fully valid DesignSpec — only the fields this test cares about vary. */
function minimalSpec(overrides: {
  ctaStyle?: string;
  radius?: 'sharp' | 'soft' | 'mixed';
  shadow?: 'none' | 'soft' | 'lift';
} = {}): DesignSpec {
  return designSpecSchema.parse({
    version: 1,
    brand: {
      businessType: 'test goods',
      audience: 'test audience',
      positioning: 'test positioning',
      personality: ['test'],
    },
    designIntent: {
      coreConcept: 'Test concept for design-token selftest coverage, not a real brand.',
      emotionalGoal: 'calm confidence',
      visualHierarchy: 'title dominates, then product, then footer',
      compositionPrinciples: ['sparse rhythm'],
      photographyDirection: 'studio light, negative space',
      typographyDirection: 'serif display, restrained body',
      interactionDirection: 'minimal chrome',
      premiumCharacteristics: ['whitespace'],
      avoidPatterns: ['clutter'],
    },
    artDirection: {
      archetype: 'test_archetype',
      typography: { display: 'Playfair Display', body: 'Inter' },
      colorStrategy: {
        primary: '#112233',
        background: '#FFFFFF',
        text: '#111111',
        accent: '#AA3300',
        secondary: '#EEEEEE',
      },
      photography: { style: 'studio', treatment: 'clean' },
      radius: overrides.radius ?? 'soft',
      shadow: overrides.shadow ?? 'soft',
    },
    ux: {
      primaryConversion: 'add to cart',
      ctaStyle: overrides.ctaStyle ?? 'solid buttons',
      navStyle: 'minimal',
      discovery: 'grid browse',
      mobileStrategy: 'stacked single column',
    },
    pageIntent: {
      homeNarrative: 'hero, then products, then footer',
    },
  });
}

const here = path.dirname(fileURLToPath(import.meta.url));
const v2Css = fs.readFileSync(path.join(here, '../src/components/templates/ai/v2/v2.css'), 'utf8');
const compositionsSrc = fs.readFileSync(
  path.join(here, '../src/components/templates/ai/v2/compositions.tsx'),
  'utf8'
);

/** Isolates one rule's declaration block by a unique, exact selector snippet
 *  (not a full CSS parser — sufficient because every selector probed here is unique
 *  in the file and has no nested braces). */
function ruleBlock(css: string, selectorSnippet: string): string {
  const idx = css.indexOf(selectorSnippet);
  if (idx < 0) return '';
  const braceStart = css.indexOf('{', idx);
  const braceEnd = css.indexOf('}', braceStart);
  if (braceStart < 0 || braceEnd < 0) return '';
  return css.slice(braceStart, braceEnd);
}

/* 1 & 3. radius/shadow token survives DesignSpec -> BrandDesignSystem -> CSS var -------- */

const RADIUS_CASES: Array<['sharp' | 'soft' | 'mixed', 'sharp' | 'soft' | 'rounded', string]> = [
  ['sharp', 'sharp', '0px'],
  ['soft', 'soft', '0.75rem'],
  ['mixed', 'rounded', '1rem'],
];
for (const [artRadius, expectedToken, expectedCssValue] of RADIUS_CASES) {
  const brand = brandDesignSystemFromSpec(minimalSpec({ radius: artRadius }));
  assert(
    brand.tokens.radius === expectedToken,
    `artDirection.radius='${artRadius}' survives into brand.tokens.radius='${expectedToken}' (got '${brand.tokens.radius}')`
  );
  const cssVars = brandTokensToCssVars(brand) as Record<string, string>;
  assert(
    cssVars['--ai-radius'] === expectedCssValue,
    `brand.tokens.radius='${expectedToken}' produces --ai-radius: ${expectedCssValue} (got ${cssVars['--ai-radius']})`
  );
}

const SHADOW_CASES: Array<['none' | 'soft' | 'lift', string]> = [
  ['none', 'none'],
  ['soft', '0 8px 30px rgba(0,0,0,.08)'],
  ['lift', '0 18px 50px rgba(0,0,0,.12)'],
];
for (const [shadow, expectedCssValue] of SHADOW_CASES) {
  const brand = brandDesignSystemFromSpec(minimalSpec({ shadow }));
  assert(brand.tokens.shadow === shadow, `artDirection.shadow='${shadow}' survives into brand.tokens.shadow unchanged`);
  const cssVars = brandTokensToCssVars(brand) as Record<string, string>;
  assert(
    cssVars['--ai-shadow'] === expectedCssValue,
    `brand.tokens.shadow='${shadow}' produces --ai-shadow: ${expectedCssValue} (got ${cssVars['--ai-shadow']})`
  );
}

/* 2. radius is actually consumed (not a dead custom property) --------------------------- */

assert(/var\(--ai-radius/.test(ruleBlock(v2Css, '.ai-v2-btn {')), 'primary .ai-v2-btn consumes var(--ai-radius)');
assert(
  /var\(--ai-radius/.test(ruleBlock(v2Css, '.ai-v2-btn-ghost {')),
  'secondary .ai-v2-btn-ghost consumes var(--ai-radius) for shape (fill stays hardcoded, see test 8)'
);
assert(
  /var\(--ai-radius/.test(ruleBlock(v2Css, '.ai-v2-pp-add,\n.ai-v2-pp-cta {')),
  'product CTA (.ai-v2-pp-add/.ai-v2-pp-cta) consumes var(--ai-radius)'
);
assert(
  /var\(--ai-radius/.test(ruleBlock(v2Css, '.ai-v2-pp-street .ai-v2-pp-media {')),
  'street product tile consumes var(--ai-radius)'
);
assert(
  /var\(--ai-radius/.test(ruleBlock(v2Css, '.ai-v2-pp-tech .ai-v2-pp-media {')),
  'tech product tile consumes var(--ai-radius)'
);
// Deliberately NOT rounded: full-bleed editorial/hero imagery keeps sharp edges regardless
// of the radius token, same as real editorial art direction never rounds a hero photo.
assert(
  !/border-radius/.test(ruleBlock(v2Css, '.ai-v2-hero-media {')),
  'hero media is never rounded by the radius token (full-bleed art direction is preserved)'
);
assert(
  !/border-radius/.test(ruleBlock(v2Css, '.ai-v2-pp-luxury .ai-v2-pp-media')),
  'luxury product media stays unrounded (full-bleed editorial imagery, not a card)'
);

/* 4. shadow is actually consumed, scoped to real surfaces ------------------------------- */

assert(/var\(--ai-shadow/.test(ruleBlock(v2Css, '.ai-v2-nav-minimal {')), 'floating/sticky nav consumes var(--ai-shadow)');
assert(
  !/var\(--ai-shadow/.test(ruleBlock(v2Css, '.ai-v2-nav-transparent {')),
  'transparent/immersive hero nav is never shadowed (would fight the overlay art direction)'
);
assert(
  /var\(--ai-shadow/.test(ruleBlock(v2Css, '.ai-v2-pp-street .ai-v2-pp-media {')),
  'street product tile consumes var(--ai-shadow)'
);
assert(
  /var\(--ai-shadow/.test(ruleBlock(v2Css, '.ai-v2-pp-tech .ai-v2-pp-media {')),
  'tech product tile consumes var(--ai-shadow)'
);
assert(
  !/box-shadow/.test(ruleBlock(v2Css, '.ai-v2-pp-luxury .ai-v2-pp-media')),
  'luxury product media never gets tech-style elevation, even when shadow token is not "none"'
);
assert(/var\(--ai-shadow/.test(ruleBlock(v2Css, '.ai-v2-btn {')), 'primary filled CTA consumes var(--ai-shadow)');

/* 5. buttonStyle is reachable for all 4 schema values ------------------------------------ */

const CTA_CASES: Array<[string, 'solid' | 'outline' | 'pill' | 'ghost']> = [
  ['solid buttons, confident commerce', 'solid'],
  ['outline buttons, understated', 'outline'],
  ['pill shaped CTA, soft and friendly', 'pill'],
  ['ghost buttons, minimal chrome', 'ghost'],
  // ambiguous phrase from the system prompt's own example: outline wins when both appear
  ['outline ghost buttons, understated', 'outline'],
];
for (const [ctaStyle, expected] of CTA_CASES) {
  const brand = brandDesignSystemFromSpec(minimalSpec({ ctaStyle }));
  assert(
    brand.tokens.buttonStyle === expected,
    `ux.ctaStyle='${ctaStyle}' maps to buttonStyle='${expected}' (got '${brand.tokens.buttonStyle}')`
  );
}

/* 6. every valid buttonStyle maps to a real, distinct CSS treatment --------------------- */

for (const style of ['outline', 'ghost', 'pill']) {
  const selector = `[data-button-style='${style}']`;
  assert(v2Css.includes(selector), `v2.css has a real [data-button-style='${style}'] treatment (not a dead enum value)`);
}
assert(
  ruleBlock(v2Css, ".ai-v2-btn {").includes('background: var(--ai-primary)'),
  "'solid' (the schema default) is the unmarked base .ai-v2-btn fill — no data-attribute needed"
);

/* 7. product CTA participates in the same buttonStyle system ---------------------------- */

assert(
  v2Css.includes("[data-button-style='outline'] .ai-v2-pp-add") &&
    v2Css.includes("[data-button-style='outline'] .ai-v2-pp-cta"),
  'product quick-add/CTA reskin under buttonStyle=outline, same as the primary hero/commerce CTA'
);
assert(
  v2Css.includes("[data-button-style='pill'] .ai-v2-pp-add") && v2Css.includes("[data-button-style='pill'] .ai-v2-pp-cta"),
  'product quick-add/CTA go pill-shaped under buttonStyle=pill, same as the primary CTA'
);

/* 8. hero-on-image ghost CTA keeps its contrast-safe fill regardless of buttonStyle ----- */

const ghostBlock = ruleBlock(v2Css, '.ai-v2-btn-ghost {');
assert(/color:\s*#fff/.test(ghostBlock), '.ai-v2-btn-ghost keeps hardcoded white text (legibility over hero imagery)');
assert(
  v2Css.includes(':not(.ai-v2-btn-ghost)'),
  'buttonStyle outline/ghost overrides explicitly exclude .ai-v2-btn-ghost so they cannot override its contrast-safe fill'
);

/* 9. invalid token values are rejected at the schema boundary, never reach CSS ---------- */

assert(
  !designTokensSchema.safeParse({
    primary: '#112233',
    background: '#FFFFFF',
    text: '#111111',
    accent: '#AA3300',
    secondary: '#EEEEEE',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    buttonStyle: 'neon', // not a real enum value
  }).success,
  'an invalid buttonStyle is rejected by designTokensSchema before it could ever reach a CSS attribute selector'
);
assert(
  !designSpecSchema.safeParse({ ...minimalSpec(), artDirection: { ...minimalSpec().artDirection, radius: 'ultra-rounded' } })
    .success,
  'an invalid radius value is rejected by designSpecSchema'
);

/* 10. fully-defaulted DesignSpec still resolves to sane values -------------------------- */

const defaulted = designSpecSchema.parse({
  version: 1,
  brand: { businessType: 'goods', audience: 'everyone', positioning: 'good value', personality: ['friendly'] },
  designIntent: {
    coreConcept: 'A default fallback concept used when the architect omits tokens entirely.',
    emotionalGoal: 'trust',
    visualHierarchy: 'product first',
    compositionPrinciples: ['clear'],
    photographyDirection: 'clean product shots',
    typographyDirection: 'legible sans',
    interactionDirection: 'obvious',
    premiumCharacteristics: ['clarity'],
    avoidPatterns: ['confusion'],
  },
  artDirection: {
    archetype: 'default_archetype',
    typography: { display: 'Inter', body: 'Inter' },
    colorStrategy: { primary: '#000000', background: '#FFFFFF', text: '#000000', accent: '#000000', secondary: '#DDDDDD' },
    photography: { style: 'plain', treatment: 'plain' },
  },
  ux: {
    primaryConversion: 'buy now',
    ctaStyle: 'standard buttons',
    navStyle: 'standard nav',
    discovery: 'browse',
    mobileStrategy: 'responsive',
  },
  pageIntent: { homeNarrative: 'shop the catalog' },
});
const defaultBrand = brandDesignSystemFromSpec(defaulted);
assert(
  defaultBrand.tokens.radius === 'soft' && defaultBrand.tokens.shadow === 'soft' && defaultBrand.tokens.buttonStyle === 'solid',
  `a fully-defaulted DesignSpec resolves to sane token defaults (radius=soft, shadow=soft, buttonStyle=solid); got ${JSON.stringify(defaultBrand.tokens.radius)}/${JSON.stringify(defaultBrand.tokens.shadow)}/${JSON.stringify(defaultBrand.tokens.buttonStyle)}`
);
let defaultCssVarsOk = true;
try {
  brandTokensToCssVars(defaultBrand);
} catch {
  defaultCssVarsOk = false;
}
assert(defaultCssVarsOk, 'brandTokensToCssVars does not throw on a fully-defaulted brand system');

/* 11. newsletter submit CTA participates in the shared text-CTA class ------------------- */

const newsletterFnStart = compositionsSrc.indexOf('export function NewsletterQuiet');
assert(newsletterFnStart >= 0, 'NewsletterQuiet composition exists');
const newsletterFnSrc = compositionsSrc.slice(newsletterFnStart, newsletterFnStart + 1200);
assert(
  /className="ai-v2-btn-text"/.test(newsletterFnSrc),
  'newsletter submit button uses the shared .ai-v2-btn-text CTA class instead of a bespoke one-off'
);

console.log(failed === 0 ? '\nAll AI Studio V2 design-token self-tests passed.' : `\n${failed} self-test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
