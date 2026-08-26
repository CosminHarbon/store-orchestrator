/**
 * AI Studio V2 Phase 1–2 self-test (no vitest required).
 * Run: npx --yes tsx scripts/ai-studio-v2-selftest.ts
 */
import { FLORIST_FIXTURE } from '../src/lib/ai-studio/fixtures';
import { adaptV1SpecToSiteDocument } from '../src/lib/ai-studio/v2/adaptV1';
import { brandDesignSystemFromSpec, critiqueScoreCardSchema, designSpecSchema } from '../src/lib/ai-studio/v2/designSpec';
import { V2_VARIETY_FIXTURES, varietyFingerprint } from '../src/lib/ai-studio/v2/fixtures';
import { routeForTask } from '../src/lib/ai-studio/v2/modelRouter';
import { applySiteOps } from '../src/lib/ai-studio/v2/siteOps';
import { listCompositions } from '../src/components/templates/ai/v2/registry';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function main() {
  const sample = V2_VARIETY_FIXTURES[0];
  assert(designSpecSchema.safeParse(sample.designSpec).success, 'DesignSpec parses');
  assert(sample.designSpec.designIntent.coreConcept.length > 20, 'designIntent present');
  assert(brandDesignSystemFromSpec(sample.designSpec).tokens.primary.startsWith('#'), 'BrandDesignSystem from DesignSpec');

  const scores = critiqueScoreCardSchema.parse({
    visualHierarchy: 8,
    composition: 9,
    typography: 8,
    imagery: 7,
    brandConsistency: 9,
    ecommerceUX: 8,
    mobile: 8,
    originality: 9,
    premiumPerception: 9,
  });
  assert(scores.premiumPerception === 9, 'critique score card shape ready');

  const { document } = adaptV1SpecToSiteDocument(FLORIST_FIXTURE);
  assert(document.version === 2, 'v1→v2 adapter produces SiteDocument v2');
  assert(document.meta.legacyLayoutId === FLORIST_FIXTURE.layoutId, 'legacy layout retained as meta only');

  const moved = applySiteOps(document, [
    { op: 'move', id: document.pages.home.nodes.find((n) => n.type === 'footer')!.id, afterId: document.pages.home.nodes[0].id },
  ]);
  assert(moved.pages.home.nodes[1].type === 'footer', 'SiteOps MOVE works');

  const styled = applySiteOps(document, [
    { op: 'style', id: document.pages.home.nodes.find((n) => n.type === 'hero')!.id, design: { minHeight: '100vh' } },
  ]);
  const hero = styled.pages.home.nodes.find((n) => n.type === 'hero')!;
  assert(hero.design.minHeight === '100vh', 'SiteOps STYLE works');

  assert(routeForTask('design_spec').primary === 'anthropic', 'model router Claude for design_spec');
  assert(routeForTask('site_ops').primary === 'openai', 'model router OpenAI for site_ops');
  assert(routeForTask('micro_edit').primary === 'deepseek', 'model router DeepSeek for micro_edit');

  const comps = listCompositions();
  assert(comps.length >= 15 && comps.length <= 20, `composition registry size ${comps.length}`);

  const fingerprints = V2_VARIETY_FIXTURES.map((f) => varietyFingerprint(f.document));
  const orders = new Set(fingerprints.map((f) => f.order));
  const heroes = new Set(fingerprints.map((f) => f.hero));
  assert(orders.size === 5, `5 distinct section orders (got ${orders.size})`);
  assert(heroes.size >= 2, `multiple hero variants across briefs (got ${heroes.size})`);

  for (const f of fingerprints) {
    console.log('  fixture:', f.order, '| hero=', f.hero, '| nav=', f.nav);
  }

  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll AI Studio V2 Phase 1–2 self-tests passed.');
}

main();
