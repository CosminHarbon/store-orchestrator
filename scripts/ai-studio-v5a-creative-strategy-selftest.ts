/**
 * Phase 5A self-test — CreativeStrategy schema, inference, fingerprint, commerce bands.
 * Run: npx --yes tsx scripts/ai-studio-v5a-creative-strategy-selftest.ts
 */
import { z } from 'zod';
import { buildDesignSpecSchemas } from '../shared/ai-studio-v2/designSpecSchema.ts';
import {
  ensureCreativeStrategy,
  buildArchitectureFingerprint,
  commerceEntryBandWarning,
  PAGE_COMPOSITIONS,
  HERO_PHILOSOPHIES,
  COMMERCE_ENTRIES,
} from '../shared/ai-studio-v2/creativeStrategy.ts';
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures.ts';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const { designSpecSchema, withCreativeStrategy } = buildDesignSpecSchemas(z);

const base = V2_VARIETY_FIXTURES[0].designSpec;
assert(designSpecSchema.safeParse(base).success, 'legacy fixture DesignSpec still parses without creativeStrategy');

const ensured = withCreativeStrategy(base as never);
assert(!!ensured.creativeStrategy, 'withCreativeStrategy fills creativeStrategy');
assert(
  (PAGE_COMPOSITIONS as readonly string[]).includes(ensured.creativeStrategy.pageComposition),
  'inferred pageComposition is a known enum'
);
assert(
  ensured.creativeStrategy.distinctivenessBrief.length >= 24,
  'distinctivenessBrief is specific enough'
);

const surprise = withCreativeStrategy({
  ...(base as object),
  creativeMode: 'surprise',
  creativeStrategy: {
    pageComposition: 'playful_blocks',
    heroPhilosophy: 'typography_first',
    commerceEntry: 'immediate',
    commerceModel: 'dense_catalogue',
    rhythm: 'rapid_contrast',
    density: 'high',
    asymmetry: 'high',
    typographyRole: 'dominant_structural',
    imageryRole: 'supporting',
    navigationBehavior: 'bold_campaign',
    experimentationLevel: 'high',
    distinctivenessBrief:
      'Avoid cinematic hero → manifesto → product rail. Open with typography and immediate catalogue density.',
  },
} as never);
assert(surprise.creativeStrategy.pageComposition === 'playful_blocks', 'explicit creativeStrategy preserved');
assert(surprise.creativeStrategy.experimentationLevel === 'high', 'surprise allows high experimentation');

const faithful = withCreativeStrategy({
  ...(base as object),
  creativeMode: 'faithful',
  creativeStrategy: {
    ...surprise.creativeStrategy,
    experimentationLevel: 'high',
  },
} as never);
assert(
  faithful.creativeStrategy.experimentationLevel === 'medium',
  'faithful clamps experimentationLevel high → medium'
);

const nodes = V2_VARIETY_FIXTURES[0].document.pages.home.nodes;
const fp = buildArchitectureFingerprint({
  designSpec: ensured,
  nodes,
  silhouettePlan: ['chrome', 'full_bleed', 'statement', 'spotlight', 'rail', 'chrome'],
});
assert(fp.sectionCount === nodes.filter((n) => n.visible !== false).length, 'fingerprint sectionCount');
assert(fp.silhouetteSequence[0] === 'chrome', 'fingerprint uses provided silhouettePlan');
assert(typeof fp.commerceEntryIndex === 'number', 'fingerprint has commerceEntryIndex');

assert(
  commerceEntryBandWarning('delayed', 2)?.includes('delayed'),
  'delayed commerce warns when product appears too early'
);
assert(commerceEntryBandWarning('immediate', 2) == null, 'immediate commerce ok at index 2');

assert(
  !(HERO_PHILOSOPHIES as readonly string[]).includes('no_classic_hero'),
  'no hero-less philosophy in Phase 5A enums'
);
assert((COMMERCE_ENTRIES as readonly string[]).includes('delayed'), 'delayed commerce entry exists');

const street = ensureCreativeStrategy({
  creativeMode: 'surprise',
  artDirection: { density: 'dense', archetype: 'street_campaign' },
  productPresentation: 'street',
  ux: { discovery: 'drop and grid', navStyle: 'bold solid' },
});
const tech = ensureCreativeStrategy({
  creativeMode: 'balanced',
  artDirection: { density: 'balanced', archetype: 'precision_audio' },
  productPresentation: 'tech',
  ux: { discovery: 'spec story', navStyle: 'minimal' },
});
assert(
  street.pageComposition !== tech.pageComposition || street.heroPhilosophy !== tech.heroPhilosophy,
  'street vs tech inference differs in composition or hero philosophy'
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nPhase 5A CreativeStrategy self-tests passed.');
console.log('Sample strategy (luxury fixture):', JSON.stringify(ensured.creativeStrategy, null, 2));
console.log('Sample fingerprint:', JSON.stringify(fp, null, 2));
