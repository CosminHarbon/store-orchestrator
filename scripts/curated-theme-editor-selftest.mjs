/**
 * Focused regression checks for curated-theme editor (Space / multi-word + contract).
 * Run: npm run test:curated-editor
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, '.tmp/curated-editor-selftest');
mkdirSync(outdir, { recursive: true });

const entry = join(outdir, 'entry.mjs');
writeFileSync(
  entry,
  `
export { softCapText, setContentPath } from '../src/lib/curated-themes/contentPath.ts';
export { createDraftConfig, validateStorefrontContentConfig, toRuntimeContentPayload } from '../src/lib/curated-themes/storefrontContentConfig.ts';
export { NOVATEE_CONTENT_DEFAULTS, NOVATEE_MANIFEST } from '../src/lib/curated-themes/novatee.ts';
export { NOVATEE_EDITOR_SCHEMA } from '../src/lib/curated-themes/novateeEditorSchema.ts';
export { validateCuratedThemeContract } from '../src/lib/curated-themes/validateThemeContract.ts';
export { isInteractiveKeyboardTarget } from '../src/lib/curated-themes/isInteractiveKeyboardTarget.ts';
export { mergeContentSlots } from '../src/lib/curated-themes/contentSlots.ts';
`.replaceAll('../src/', join(root, 'src/').replace(/\\/g, '/') + '/').replaceAll(join(root, 'src/') + '/', '../src/'),
);

// Simpler: write entry with absolute-ish relative from outdir to src
writeFileSync(
  entry,
  `
export { softCapText, setContentPath } from '../../src/lib/curated-themes/contentPath.ts';
export { createDraftConfig, validateStorefrontContentConfig, toRuntimeContentPayload } from '../../src/lib/curated-themes/storefrontContentConfig.ts';
export { NOVATEE_CONTENT_DEFAULTS, NOVATEE_MANIFEST } from '../../src/lib/curated-themes/novatee.ts';
export { NOVATEE_EDITOR_SCHEMA } from '../../src/lib/curated-themes/novateeEditorSchema.ts';
export { validateCuratedThemeContract } from '../../src/lib/curated-themes/validateThemeContract.ts';
export { isInteractiveKeyboardTarget } from '../../src/lib/curated-themes/isInteractiveKeyboardTarget.ts';
export { mergeContentSlots } from '../../src/lib/curated-themes/contentSlots.ts';
`,
);

const outfile = join(outdir, 'bundle.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
});

const mod = await import(pathToFileURL(outfile).href + '?t=' + Date.now());
const {
  softCapText,
  setContentPath,
  createDraftConfig,
  validateStorefrontContentConfig,
  toRuntimeContentPayload,
  NOVATEE_CONTENT_DEFAULTS,
  NOVATEE_MANIFEST,
  NOVATEE_EDITOR_SCHEMA,
  validateCuratedThemeContract,
  isInteractiveKeyboardTarget,
  mergeContentSlots,
} = mod;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const sentence = 'Wear the future with confidence';
let draft = createDraftConfig('novatee');
let built = '';
for (const ch of sentence) built = softCapText(built + ch, 120);
assert(built === sentence, `softCap must preserve spaces, got: "${built}"`);

draft = { ...draft, content: setContentPath(draft.content, 'hero.headline', built) };
assert(draft.content.hero.headline === sentence, 'editor draft keeps multi-word headline');

const mid = softCapText('Hello ', 120);
assert(mid === 'Hello ', `trailing space must survive softCap, got "${mid}"`);
draft = { ...draft, content: setContentPath(draft.content, 'announcement', mid) };
assert(draft.content.announcement === 'Hello ', 'announcement trailing space kept');

const saved = validateStorefrontContentConfig({
  ...draft,
  content: setContentPath(draft.content, 'announcement', '  Ship fast now  '),
});
assert(saved.content.announcement === 'Ship fast now', 'persist sanitize trims');

const fields = {
  'hero.eyebrow': 'New season drop',
  'hero.primaryCtaLabel': 'Shop the drop',
  footerTagline: 'Built for late nights and loud playlists',
  whyTitle: 'Made different. Worn different.',
};
for (const [path, text] of Object.entries(fields)) {
  let acc = '';
  for (const ch of text) acc = softCapText(acc + ch, 200);
  assert(acc === text, `field ${path} space regression`);
  draft = { ...draft, content: setContentPath(draft.content, path, acc) };
}

const roundTrip = validateStorefrontContentConfig(draft);
assert(roundTrip.content.hero.eyebrow === fields['hero.eyebrow'], 'round-trip eyebrow');
assert(roundTrip.content.hero.primaryCtaLabel === fields['hero.primaryCtaLabel'], 'round-trip cta');

const payload = toRuntimeContentPayload(draft);
assert(payload.themeId === 'novatee' && payload.allowPreviewQueryHints === false, 'payload');

const check = validateCuratedThemeContract({
  themeId: 'novatee',
  availableContentSlots: NOVATEE_MANIFEST.availableContentSlots,
  defaults: NOVATEE_CONTENT_DEFAULTS,
  editorSchema: NOVATEE_EDITOR_SCHEMA,
  supportedHeroMediaModes: NOVATEE_MANIFEST.supportedHeroMediaModes,
});
assert(check.ok, `contract errors: ${check.errors.join('; ')}`);

assert(isInteractiveKeyboardTarget(null) === false, 'null target');

const merged = mergeContentSlots(NOVATEE_CONTENT_DEFAULTS, {
  logo: { src: 'javascript:alert(1)' },
});
assert(merged.logo === null, 'unsafe logo rejected');

console.log('CURATED_EDITOR_SELFTEST_OK');
if (check.warnings.length) console.log('warnings:', check.warnings.slice(0, 10));
