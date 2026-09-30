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
export { FOUNDATION_CONTENT_DEFAULTS, FOUNDATION_MANIFEST } from '../../src/lib/curated-themes/foundation.ts';
export { FOUNDATION_EDITOR_SCHEMA } from '../../src/lib/curated-themes/foundationEditorSchema.ts';
export { validateCuratedThemeContract } from '../../src/lib/curated-themes/validateThemeContract.ts';
export { isInteractiveKeyboardTarget } from '../../src/lib/curated-themes/isInteractiveKeyboardTarget.ts';
export { mergeContentSlots, mergeThemeContent } from '../../src/lib/curated-themes/contentSlots.ts';
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
  FOUNDATION_CONTENT_DEFAULTS,
  FOUNDATION_MANIFEST,
  FOUNDATION_EDITOR_SCHEMA,
  validateCuratedThemeContract,
  isInteractiveKeyboardTarget,
  mergeContentSlots,
  mergeThemeContent,
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

const foundationCheck = validateCuratedThemeContract({
  themeId: 'foundation',
  availableContentSlots: FOUNDATION_MANIFEST.availableContentSlots,
  defaults: FOUNDATION_CONTENT_DEFAULTS,
  editorSchema: FOUNDATION_EDITOR_SCHEMA,
  supportedHeroMediaModes: FOUNDATION_MANIFEST.supportedHeroMediaModes,
});
assert(foundationCheck.ok, `foundation contract errors: ${foundationCheck.errors.join('; ')}`);

const foundationDraft = createDraftConfig('foundation');
assert(foundationDraft.themeId === 'foundation', 'foundation draft themeId');
assert(foundationDraft.content.collectionsTitle, 'foundation defaults include collectionsTitle');

const novateeStripped = mergeThemeContent('novatee', NOVATEE_CONTENT_DEFAULTS, {
  collectionsTitle: 'Should not persist',
  editorialBody: 'Nope',
  sections: { order: ['marquee', 'collections', 'featured'], hidden: [] },
});
assert(!('collectionsTitle' in novateeStripped) || novateeStripped.collectionsTitle == null, 'novatee strips foundation fields');
assert(!(novateeStripped.sections?.order || []).includes('collections'), 'novatee drops foundation section ids');

const foundationMerged = mergeThemeContent('foundation', FOUNDATION_CONTENT_DEFAULTS, {
  collectionsTitle: 'Shop by room',
  sections: { order: ['collections', 'featured'], hidden: ['marquee'] },
});
assert(foundationMerged.collectionsTitle === 'Shop by room', 'foundation keeps extension fields');
assert((foundationMerged.sections?.order || []).includes('collections'), 'foundation keeps collections section');

// Foundation media draft persistence: hero / editorial / CTA / logo round-trip
const mediaDraft = createDraftConfig('foundation');
const heroUrl = 'https://images.example.com/hero-landscape.jpg';
const editorialUrl = 'https://images.example.com/editorial.jpg';
const ctaUrl = 'https://images.example.com/cta-bg.jpg';
const logoUrl = 'https://images.example.com/logo.png';
let mediaContent = setContentPath(mediaDraft.content, 'hero.mediaMode', 'image');
mediaContent = setContentPath(mediaContent, 'hero.image', { src: heroUrl, alt: 'Hero landscape' });
mediaContent = setContentPath(mediaContent, 'editorialMediaMode', 'image');
mediaContent = setContentPath(mediaContent, 'editorialMedia', { src: editorialUrl, alt: 'Editorial' });
mediaContent = setContentPath(mediaContent, 'ctaBackgroundImage', { src: ctaUrl, alt: 'Promo' });
mediaContent = setContentPath(mediaContent, 'logo', { src: logoUrl, alt: 'Logo' });
const persisted = validateStorefrontContentConfig({ ...mediaDraft, content: mediaContent });
assert(persisted.content.hero?.mediaMode === 'image', 'hero mediaMode persists');
assert(persisted.content.hero?.image?.src === heroUrl, 'hero image persists');
assert(persisted.content.editorialMediaMode === 'image', 'editorialMediaMode persists');
assert(persisted.content.editorialMedia?.src === editorialUrl, 'editorialMedia persists');
assert(persisted.content.ctaBackgroundImage?.src === ctaUrl, 'ctaBackgroundImage persists');
assert(persisted.content.logo?.src === logoUrl, 'logo persists');
const removed = validateStorefrontContentConfig({
  ...persisted,
  content: setContentPath(persisted.content, 'hero.image', null),
});
assert(removed.content.hero?.image == null, 'hero image remove persists as null');
const resetMode = validateStorefrontContentConfig({
  ...removed,
  content: setContentPath(removed.content, 'hero.mediaMode', 'template-art'),
});
assert(resetMode.content.hero?.mediaMode === 'template-art', 'reset hero to template-art');

// Theme switch: Foundation → Novatee → Foundation must not leak Foundation-only media
const asNovatee = validateStorefrontContentConfig({
  ...persisted,
  themeId: 'novatee',
  content: mergeThemeContent('novatee', NOVATEE_CONTENT_DEFAULTS, persisted.content),
});
assert(asNovatee.themeId === 'novatee', 'switched to novatee');
assert(
  !('ctaBackgroundImage' in asNovatee.content) || asNovatee.content.ctaBackgroundImage == null,
  'novatee strips ctaBackgroundImage',
);
assert(
  !('editorialMediaMode' in asNovatee.content) || asNovatee.content.editorialMediaMode == null,
  'novatee strips editorialMediaMode',
);
const backToFoundation = validateStorefrontContentConfig({
  themeId: 'foundation',
  content: mergeThemeContent('foundation', FOUNDATION_CONTENT_DEFAULTS, asNovatee.content),
  version: 1,
});
assert(backToFoundation.themeId === 'foundation', 'back to foundation');
assert(backToFoundation.content.hero?.mediaMode === 'template-art' || backToFoundation.content.hero?.mediaMode, 'foundation hero mode restored to defaults path');

console.log('CURATED_EDITOR_SELFTEST_OK');
if (check.warnings.length) console.log('novatee warnings:', check.warnings.slice(0, 10));
if (foundationCheck.warnings.length) console.log('foundation warnings:', foundationCheck.warnings.slice(0, 10));
