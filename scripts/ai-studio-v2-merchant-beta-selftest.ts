/**
 * B1 merchant-facing AI Studio V2 entry — self-test.
 *
 * SCOPE: two kinds of checks, kept explicitly separate:
 *
 *  (a) RUNTIME checks — real function calls, real return values. Used for
 *      everything that is pure logic (the feature-flag helpers).
 *
 *  (b) STRUCTURAL / SOURCE-CONTRACT checks — this repo has no component test
 *      runner (no vitest/jest/@testing-library — confirmed absent from
 *      package.json) and this task does not add one. Verifying that
 *      WebsiteBuilder actually *renders* AIStudioV2 when the flag is on, that
 *      a keystroke in the textarea actually reaches streamV2Generate, or that
 *      the preview visually reflects a fresh draft, requires a real browser/
 *      dev-server pass — see the manual QA plan. What CAN be honestly proven
 *      without one is the source contract: the right imports, the right
 *      prop wiring, and the absence of forbidden imports/calls. Each such
 *      check below is labeled "[structural]" and never claims to prove UI
 *      behavior — only that the code is wired the way B1 requires.
 *
 * Run: npx --yes tsx scripts/ai-studio-v2-merchant-beta-selftest.ts
 */
import fs from 'node:fs';
import {
  isAiStudioV2Enabled,
  isAiStudioV2MerchantBetaEnabled,
} from '../src/lib/ai-studio/v2/featureFlag.ts';
import { specCssVariables } from '../src/lib/ai-studio/mapToBuilder.ts';
import { FLORIST_FIXTURE } from '../src/lib/ai-studio/fixtures.ts';
import { brandTokensToCssVars } from '../src/lib/ai-studio/v2/tokens.ts';
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures.ts';
import { brandDesignSystemFromSpec } from '../src/lib/ai-studio/v2/designSpec.ts';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

console.log('\n=== A/M. Feature-flag runtime behavior (real function calls) ===\n');

// A. Merchant beta flag defaults OFF when env absent.
// Under plain tsx (no Vite define pass), import.meta.env is not populated —
// this genuinely exercises the same "unset" path a misconfigured/fresh
// deployment would hit, not a mock.
assert(isAiStudioV2MerchantBetaEnabled() === false, 'A. Merchant beta flag defaults OFF when env absent');

// M. The existing public-rendering flag is untouched by the new flag and
// remains independently false-by-default under the same runtime — proves
// the two are genuinely separate functions with separate defaults, not one
// flag renamed/aliased to the other.
assert(isAiStudioV2Enabled() === false, 'M. Public V2 rendering flag (isAiStudioV2Enabled) unaffected, still defaults OFF');
assert(
  isAiStudioV2MerchantBetaEnabled !== (isAiStudioV2Enabled as unknown),
  'M2. Merchant-entry flag and public-rendering flag are distinct functions',
);

console.log(
  '\nNote: this runtime only proves the OFF/default path. Proving the ON path ' +
    'flips WebsiteBuilder\'s rendering requires either a Vite-built bundle with ' +
    'VITE_AI_STUDIO_V2_MERCHANT_BETA=true, or a real browser pass — see the ' +
    'structural checks below for what is proven instead, and the manual QA ' +
    'plan for the real behavioral proof.\n',
);

const websiteBuilderSrc = fs.readFileSync('src/components/website-builder/WebsiteBuilder.tsx', 'utf8');
const aiStudioV2Src = fs.readFileSync('src/components/ai-studio/AIStudioV2.tsx', 'utf8');
const aiStudioV1Src = fs.readFileSync('src/components/ai-studio/AIStudio.tsx', 'utf8');
const aiStorefrontTemplateSrc = fs.readFileSync(
  'src/components/templates/ai/AiStorefrontTemplate.tsx',
  'utf8',
);

console.log('=== B/C/K. WebsiteBuilder flagged switch [structural] ===\n');

assert(
  /isAiStudioV2MerchantBetaEnabled\(\)/.test(websiteBuilderSrc),
  'B. WebsiteBuilder checks isAiStudioV2MerchantBetaEnabled()',
);
assert(
  /isAiStudioV2MerchantBetaEnabled\(\)\)\s*\{\s*return <AIStudioV2/.test(websiteBuilderSrc),
  'B2. Flag-on branch renders <AIStudioV2 ...>',
);
assert(
  /return\s*\(\s*<AIStudio\b/.test(websiteBuilderSrc) && /<AIStudioV2\b/.test(websiteBuilderSrc),
  'C/K. Both <AIStudio> (V1, flag-off fallback) and <AIStudioV2> are present — V1 not deleted, still reachable',
);
assert(
  !/AiStudioV2GenerateLab|ai-studio-v2-generate/.test(websiteBuilderSrc),
  'B3. WebsiteBuilder does not redirect merchants to the DEV Generate Lab route',
);

console.log('\n=== D/E. Generation wiring uses V2 client + freeform prompt [structural] ===\n');

assert(
  /import\s*\{[^}]*streamV2Generate[^}]*\}\s*from\s*['"]@\/lib\/ai-studio\/v2\/generateClient['"]/.test(
    aiStudioV2Src,
  ),
  'D. AIStudioV2 imports streamV2Generate from the V2 generate client',
);
assert(
  !/streamStudioFunction|ai-studio-refine|PHASE3_BRIEFS/.test(aiStudioV2Src),
  "D2. AIStudioV2 never calls the V1 SSE client, V1 refine endpoint, or the fixed dev-lab brief list",
);
assert(
  /streamV2Generate\(\s*text\s*,/.test(aiStudioV2Src),
  'E. streamV2Generate is called with a variable (the merchant\'s typed prompt), not a string literal',
);
assert(
  /<Textarea[\s\S]{0,200}value=\{prompt\}/.test(aiStudioV2Src),
  'E2. A freeform <Textarea> is bound to the prompt state that feeds generation',
);

console.log('\n=== F/G/H. Real merchant preview [structural] ===\n');

assert(
  /import AiStorefrontTemplate from ['"]@\/components\/templates\/ai\/AiStorefrontTemplate['"]/.test(
    aiStudioV2Src,
  ),
  'F. AIStudioV2 renders the shared AiStorefrontTemplate (no second/duplicate renderer)',
);
assert(
  !/useShowcaseCommerce|SHOWCASE_CATALOGS/.test(aiStudioV2Src),
  'G. AIStudioV2 never imports the DEV Generate Lab\'s fixture commerce (useShowcaseCommerce/SHOWCASE_CATALOGS)',
);
assert(
  /<AiStorefrontTemplate[\s\S]{0,200}apiKey=\{apiKey\}/.test(aiStudioV2Src),
  'H. The real merchant apiKey prop is passed into the preview',
);
assert(
  /siteDocumentOverride=\{document\}/.test(aiStudioV2Src) && /brandSystemOverride=\{brandSystem\}/.test(aiStudioV2Src),
  'F2. Preview is fed via AiStorefrontTemplate\'s existing override props (no new renderer, no duplicated SiteTree parsing)',
);

console.log('\n=== I. Immediate post-generation refresh cannot show a stale draft ===\n');

assert(
  /setDocument\(last\.document\)/.test(aiStudioV2Src),
  'I. A successful generation writes the SSE result straight into the override-bound state',
);
assert(
  /siteDocumentOverride\s*&&\s*brandSystemOverride\)\s*\{\s*\/\/ Caller supplies the full V2 payload directly/.test(
    aiStorefrontTemplateSrc,
  ) || /siteDocumentOverride && brandSystemOverride\) \{\n\s*\/\/ Caller supplies the full V2 payload directly/.test(aiStorefrontTemplateSrc),
  'I2. AiStorefrontTemplate short-circuits its own DB/public fetch when both V2 overrides are supplied (fixed in this change — previously it could silently overwrite loadedSpec from an unrelated published/legacy V1 record or FLORIST_FIXTURE, which won priority over the override in the cssVars/fonts derivation)',
);
assert(
  /if \(siteDocumentOverride && brandSystemOverride\) \{\s*\n\s*return \{ document: siteDocumentOverride, brandSystem: brandSystemOverride \};/.test(
    aiStorefrontTemplateSrc,
  ),
  'I3. v2Payload resolution still gives the override absolute priority over any internally-fetched document',
);

console.log('\n=== J. No automatic publish after generation [structural] ===\n');

{
  const genStart = aiStudioV2Src.indexOf('const runGenerate');
  const genEnd = aiStudioV2Src.indexOf('\n  };', genStart);
  const runGenerateBody = genStart >= 0 && genEnd > genStart ? aiStudioV2Src.slice(genStart, genEnd) : '';
  assert(runGenerateBody.length > 0, 'J-setup. Located runGenerate function body for inspection');
  assert(
    !/publishAiStorefront/.test(runGenerateBody),
    'J. runGenerate never calls publishAiStorefront — generation/regeneration cannot auto-publish',
  );
}
assert(
  /const publish = async \(\) => \{[\s\S]{0,20}if \(!document\) return;/.test(aiStudioV2Src),
  'J2. Publish is a separate, explicit, user-triggered action gated on having a document',
);

console.log('\n=== L. No SiteTree/schema/migration changes introduced ===\n');

const migrationFiles = fs.readdirSync('supabase/migrations');
assert(
  !migrationFiles.some((f) => /merchant.?beta/i.test(f)),
  'L. No new "merchant beta" migration file was added — B1 required none',
);
assert(
  fs.existsSync('supabase/migrations/20260821200000_ai_studio_v2_foundation.sql'),
  'L2. The pre-existing V2 foundation migration is untouched/still present (not replaced)',
);
assert(
  !/from\(['"]ai_storefronts['"]\)/.test(aiStudioV2Src),
  'L3. AIStudioV2 never queries ai_storefronts directly — persistence stays behind the existing generateClient/publishAiStorefront helpers',
);

console.log('\n=== M2. AiStorefrontTemplate never references the merchant-entry flag ===\n');

assert(
  !/isAiStudioV2MerchantBetaEnabled/.test(aiStorefrontTemplateSrc),
  'M3. Public storefront renderer does not import/use the merchant-entry Beta flag at all — turning it off cannot affect public rendering',
);
assert(
  /isAiStudioV2Enabled\(\)/.test(aiStorefrontTemplateSrc),
  'M4. Public storefront renderer still uses the original isAiStudioV2Enabled() for its own fallback logic, unchanged',
);

console.log('\n=== B1.1 regression: preview view-state reset on regenerate ===\n');

assert(
  /const \[previewKey, setPreviewKey\] = useState\(0\)/.test(aiStudioV2Src),
  'B1.1-1. A remount key exists to reset AiStorefrontTemplate/useStorefrontCommerce state on regenerate',
);
assert(
  /setPreviewKey\(\(k\) => k \+ 1\)/.test(aiStudioV2Src),
  'B1.1-2. The remount key is bumped after a successful generation',
);
assert(
  /<AiStorefrontTemplate\s*\n\s*key=\{previewKey\}/.test(aiStudioV2Src),
  'B1.1-3. The remount key is actually wired onto the rendered AiStorefrontTemplate',
);

console.log('\n=== B1.1 regression: conversationId threaded across (re)generate calls ===\n');

assert(
  /streamV2Generate\(\s*\n\s*text,[\s\S]{0,150}\{ conversationId \}/.test(aiStudioV2Src),
  'B1.1-4. runGenerate passes the current conversationId into streamV2Generate',
);
assert(
  /if \(last\.conversationId\) setConversationId\(last\.conversationId\)/.test(aiStudioV2Src),
  'B1.1-5. A successful generation captures the returned conversationId for the next call',
);

console.log('\n=== B1.2 regression: dark-surface/foreground leak — deterministic fix ===\n');

// [structural] the outer wrapper's color/background are pinned to Premium's
// own custom properties, not left to depend on brandTokensToCssVars'/
// specCssVariables' literal values or on ai.css-vs-premium.css cascade order.
assert(
  /color:\s*'var\(--prem-ink\)'/.test(aiStorefrontTemplateSrc) &&
    /background:\s*'var\(--prem-bg\)'/.test(aiStorefrontTemplateSrc),
  'B1.2-1. Outer wrapper color/background are pinned to var(--prem-ink)/var(--prem-bg) literal strings, not a resolved brand value',
);
{
  const memoStart = aiStorefrontTemplateSrc.indexOf('const cssVars = useMemo');
  const memoEnd = aiStorefrontTemplateSrc.indexOf('\n  }, [spec, v2Payload?.brandSystem]);', memoStart);
  const memoBody = memoStart >= 0 && memoEnd > memoStart ? aiStorefrontTemplateSrc.slice(memoStart, memoEnd) : '';
  assert(memoBody.length > 0, 'B1.2-setup. Located cssVars useMemo body for inspection');
  assert(
    /\.\.\.vars,/.test(memoBody),
    'B1.2-2. All other custom properties (--ai-*/--prem-* from specCssVariables/brandTokensToCssVars) are still spread through unchanged',
  );
}

// [runtime] V1 regression proof: --prem-ink/--prem-bg (what color/background
// now resolve through) already equal --ai-text/--ai-bg (what the pre-B1.1
// code used to set color/background to directly) for the V1 path — so this
// change computes to the exact same visual color for V1. Not asserted from
// reading the source a second time — actually calling the real function.
{
  const v1Vars = specCssVariables(FLORIST_FIXTURE) as Record<string, string>;
  assert(
    v1Vars['--prem-ink'] === v1Vars['--ai-text'],
    'B1.2-3 [runtime]. V1: --prem-ink already equals --ai-text (specCssVariables) — pinning color to var(--prem-ink) is a no-op change vs. the original literal t.text',
  );
  assert(
    v1Vars['--prem-bg'] === v1Vars['--ai-bg'],
    'B1.2-4 [runtime]. V1: --prem-bg already equals --ai-bg (specCssVariables) — pinning background to var(--prem-bg) is a no-op change vs. the original literal t.background',
  );
}

// [runtime] V2 proof: brandTokensToCssVars never sets --prem-ink/--prem-bg/
// --prem-surface itself, so var(--prem-ink)/var(--prem-bg) on the outer
// wrapper resolve via premium.css's own dark-mode-paired declarations, not
// via any brand-dependent value — this is what makes the fix deterministic
// regardless of which brand (light- or dark-oriented) was generated.
{
  const v2Fixture = V2_VARIETY_FIXTURES[0];
  const brand = brandDesignSystemFromSpec(v2Fixture.designSpec);
  const v2Vars = brandTokensToCssVars(brand) as unknown as Record<string, unknown>;
  assert(
    !('--prem-ink' in v2Vars) && !('--prem-bg' in v2Vars) && !('--prem-surface' in v2Vars),
    'B1.2-5 [runtime]. V2: brandTokensToCssVars never sets --prem-ink/--prem-bg/--prem-surface — pinning to them is safe from any V2 brand leaking back in',
  );
  assert(
    '--ai-text' in v2Vars && '--ai-bg' in v2Vars,
    'B1.2-6 [runtime]. V2: brandTokensToCssVars still sets --ai-text/--ai-bg for SiteTreeRenderer\'s own .ai-v2-root to consume independently',
  );
}

console.log('\n=== K2. V1 AIStudio internals untouched ===\n');

assert(
  /streamStudioFunction/.test(aiStudioV1Src) && /publishAiStorefront/.test(aiStudioV1Src),
  'K2. V1 AIStudio.tsx still uses its original V1 client calls (file not gutted/repointed)',
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nai-studio-v2 merchant-beta selftest passed (runtime flag checks + structural wiring — not a substitute for the manual QA pass)');
