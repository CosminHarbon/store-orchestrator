/**
 * Phase 5D.4B self-test — narrativeModel removal.
 * Phase 5D.4A made buildCreativeStrategySchema accept narrativeModel as optional
 * (read-compat only). This phase removes it from the active CreativeStrategy
 * contract entirely: the enum, the type field, the schema key, inference,
 * normalization, and the prompt line are all gone. Because the underlying Zod
 * object schema is non-strict, a legacy `narrativeModel` key on an old persisted
 * row/draft is now simply an unrecognized key — it parses fine and is silently
 * stripped, never validated, never re-emitted.
 * Run: npx --yes tsx scripts/ai-studio-v5d4b-narrative-model-removal-selftest.ts
 */
import { z } from 'zod';
import { buildDesignSpecSchemas } from '../shared/ai-studio-v2/designSpecSchema.ts';
import {
  buildCreativeStrategySchema,
  ensureCreativeStrategy,
  inferCreativeStrategy,
  creativeStrategyPromptBlock,
  type CreativeStrategy,
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

const strategySchema = buildCreativeStrategySchema(z);
const { designSpecSchema } = buildDesignSpecSchemas(z);

const CURRENT_STRATEGY: CreativeStrategy = {
  pageComposition: 'editorial_journey',
  heroPhilosophy: 'atmosphere_first',
  commerceEntry: 'mid',
  commerceModel: 'flagship_then_rail',
  rhythm: 'even',
  density: 'medium',
  asymmetry: 'medium',
  typographyRole: 'balanced',
  imageryRole: 'balanced',
  navigationBehavior: 'solid_compact',
  experimentationLevel: 'medium',
  distinctivenessBrief:
    'Avoid a generic ecommerce spine (hero, manifesto, product rail, story, footer) — this is a removal-test fixture.',
};

// ── A. ACTIVE SCHEMA — current CreativeStrategy WITHOUT narrativeModel parses ──
{
  const parsed = strategySchema.safeParse(CURRENT_STRATEGY);
  assert(parsed.success, 'A: 12-field CreativeStrategy (no narrativeModel) parses');
  if (parsed.success) {
    assert(Object.keys(parsed.data).length === 12, 'A: parsed strategy has exactly 12 fields');
  }
}

// ── B. LEGACY INPUT — raw persisted-style object WITH narrativeModel: 'editorial' + all 12 current fields ──
const LEGACY_WITH_NARRATIVE_MODEL = { ...CURRENT_STRATEGY, narrativeModel: 'editorial' };
{
  const parsed = strategySchema.safeParse(LEGACY_WITH_NARRATIVE_MODEL);
  assert(parsed.success, "B: legacy CreativeStrategy WITH narrativeModel: 'editorial' still parses");

  // ── C. LEGACY FIELD STRIPPED — parsed output must not contain narrativeModel ──
  if (parsed.success) {
    assert(!('narrativeModel' in parsed.data), 'C: legacy narrativeModel is stripped from the parsed CreativeStrategy');
  }
}

// ── D. OTHER LEGACY ENUM VALUES — an old/unvalidated value also just gets stripped ──
{
  const legacyChaptered = { ...CURRENT_STRATEGY, narrativeModel: 'chaptered' };
  const parsedChaptered = strategySchema.safeParse(legacyChaptered);
  assert(parsedChaptered.success, "D: legacy narrativeModel: 'chaptered' still parses (unknown key, not validated)");
  if (parsedChaptered.success) {
    assert(!('narrativeModel' in parsedChaptered.data), "D: 'chaptered' is stripped, not preserved");
  }

  // Prove the value is no longer validated at all — even a value that was never a real enum member parses.
  const neverValidValue = { ...CURRENT_STRATEGY, narrativeModel: 'not_a_real_historical_value' };
  const parsedBogus = strategySchema.safeParse(neverValidValue);
  assert(parsedBogus.success, 'D: an arbitrary narrativeModel string (never a valid enum member) still parses — value is no longer validated');
  if (parsedBogus.success) {
    assert(!('narrativeModel' in parsedBogus.data), 'D: the arbitrary value is stripped, not preserved');
  }
}

// ── E. FRESH INFERENCE — inferCreativeStrategy(...) returns no narrativeModel ──
{
  const inferred = inferCreativeStrategy({});
  assert(!('narrativeModel' in inferred), 'E: inferCreativeStrategy no longer returns narrativeModel');
  assert(Object.keys(inferred).length === 12, 'E: inferCreativeStrategy returns exactly 12 fields');
}

// ── F. NORMALIZATION — ensureCreativeStrategy(...) returns no narrativeModel ──
{
  const normalizedEmpty = ensureCreativeStrategy({});
  assert(!('narrativeModel' in normalizedEmpty), 'F: ensureCreativeStrategy({}) returns no narrativeModel');

  const normalizedFromLegacy = ensureCreativeStrategy({
    creativeStrategy: LEGACY_WITH_NARRATIVE_MODEL as Partial<CreativeStrategy>,
  });
  assert(
    !('narrativeModel' in normalizedFromLegacy),
    'F: ensureCreativeStrategy strips narrativeModel even when the raw input explicitly carries it'
  );
  assert(Object.keys(normalizedFromLegacy).length === 12, 'F: normalized output has exactly 12 fields');
}

// ── G. PROMPT — creativeStrategyPromptBlock() no longer asks for narrativeModel ──
{
  const block = creativeStrategyPromptBlock();
  assert(!block.includes('"narrativeModel"'), 'G: prompt no longer declares a narrativeModel field key');
  assert(
    !block.includes('editorial|campaign|catalogue|chaptered|product_journey'),
    'G: prompt no longer lists the narrativeModel enum line'
  );
  // Sanity: the surrounding fields (which legitimately reuse some of the same English
  // words, e.g. commerceModel's "dense_catalogue" or navigationBehavior's "bold_campaign")
  // are still present — proving this isn't a false pass from an empty/broken prompt.
  assert(block.includes('"pageComposition"'), 'G: prompt still declares pageComposition (sanity check)');
  assert(block.includes('dense_catalogue'), 'G: prompt still legitimately contains "catalogue" via commerceModel (sanity check)');
  assert(block.includes('bold_campaign'), 'G: prompt still legitimately contains "campaign" via navigationBehavior (sanity check)');
}

// ── H. DESIGN SPEC — current DesignSpec without narrativeModel parses ──
{
  const current = V2_VARIETY_FIXTURES[0].designSpec;
  const parsed = designSpecSchema.safeParse(current);
  assert(parsed.success, 'H: current DesignSpec (creativeStrategy has no narrativeModel) parses via designSpecSchema');
  if (parsed.success) {
    assert(
      !parsed.data.creativeStrategy || !('narrativeModel' in parsed.data.creativeStrategy),
      'H: parsed DesignSpec.creativeStrategy has no narrativeModel'
    );
  }
}

// ── I. OLD PERSISTED DESIGN SPEC — creativeStrategy contains narrativeModel; parses and strips it ──
{
  const base = V2_VARIETY_FIXTURES[0].designSpec as unknown as { creativeStrategy?: Record<string, unknown> };
  const legacyStyle = JSON.parse(JSON.stringify(base)) as { creativeStrategy?: Record<string, unknown> };
  if (legacyStyle.creativeStrategy) legacyStyle.creativeStrategy.narrativeModel = 'editorial';
  const merged = { ...V2_VARIETY_FIXTURES[0].designSpec, ...legacyStyle };

  const parsed = designSpecSchema.safeParse(merged);
  assert(parsed.success, 'I: old persisted-style DesignSpec WITH narrativeModel still parses');
  if (parsed.success) {
    assert(
      !parsed.data.creativeStrategy || !('narrativeModel' in parsed.data.creativeStrategy),
      'I: narrativeModel is discarded from the parsed old-style DesignSpec, all 12 other fields intact'
    );
    assert(
      parsed.data.creativeStrategy?.pageComposition === (base as { creativeStrategy?: { pageComposition?: string } }).creativeStrategy?.pageComposition,
      'I: other creativeStrategy fields (e.g. pageComposition) survive the old-style parse unchanged'
    );
  }
}

// ── J. FIXTURES — all 5 canonical fixtures have no narrativeModel; other values unchanged ──
{
  assert(V2_VARIETY_FIXTURES.length === 5, 'J: still exactly 5 canonical fixtures');
  const EXPECTED_PAGE_COMPOSITIONS = [
    'editorial_journey',
    'editorial_journey',
    'dense_campaign',
    'technical_story',
    'editorial_journey',
  ];
  V2_VARIETY_FIXTURES.forEach((fixture, i) => {
    const cs = (fixture.designSpec as { creativeStrategy?: CreativeStrategy }).creativeStrategy;
    assert(!!cs, `J: fixture[${i}] (${fixture.id}) still has an explicit creativeStrategy`);
    assert(!cs || !('narrativeModel' in cs), `J: fixture[${i}] (${fixture.id}) creativeStrategy has no narrativeModel key`);
    assert(
      cs?.pageComposition === EXPECTED_PAGE_COMPOSITIONS[i],
      `J: fixture[${i}] (${fixture.id}) pageComposition unchanged (${EXPECTED_PAGE_COMPOSITIONS[i]})`
    );
  });
}

// ── K. VISUAL/RESOLUTION INVARIANTS — Phase 5B/5C/5D resolved layouts are unchanged ──
{
  function findNode(fixtureId: string, nodeId: string) {
    const fixture = V2_VARIETY_FIXTURES.find((f) => f.id === fixtureId);
    return fixture?.document.pages.home.nodes.find((n) => n.id === nodeId);
  }

  const CASES: Array<{ label: string; fixtureId: string; nodeId: string; layout: string }> = [
    { label: 'Villa Pelle spotlight', fixtureId: 'luxury_fashion', nodeId: 'spotlight_01', layout: 'imageDominant' },
    { label: 'Lumen Lab spotlight', fixtureId: 'modern_skincare', nodeId: 'spotlight_01', layout: 'feature' },
    { label: 'BLOCK FORM spotlight', fixtureId: 'streetwear', nodeId: 'spotlight_01', layout: 'structuredFeature' },
    { label: 'BLOCK FORM productGrid', fixtureId: 'streetwear', nodeId: 'products_01', layout: 'dense' },
    { label: 'Auric productGrid', fixtureId: 'electronics', nodeId: 'products_01', layout: 'asymmetricFeature' },
    { label: 'Hearth & Grove productGrid', fixtureId: 'artisan_food', nodeId: 'products_01', layout: 'standardEditorial' },
  ];
  for (const { label, fixtureId, nodeId, layout } of CASES) {
    const node = findNode(fixtureId, nodeId);
    assert(
      node?.content?.layout === layout,
      `K: ${label} (${fixtureId}/${nodeId}) still resolves to '${layout}' (got '${node?.content?.layout}')`
    );
  }
}

// ── L. OCCURRENCE GUARD — zero active-source narrativeModel references remain ──
{
  const { execSync } = await import('node:child_process');
  const repoRoot = new URL('..', import.meta.url).pathname;
  let grepOut = '';
  try {
    grepOut = execSync(
      `grep -rl "narrativeModel" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "/android/" | grep -v "/ios/" | grep -v "/.claude/worktrees/"`,
      { cwd: repoRoot, encoding: 'utf8' }
    );
  } catch (e: unknown) {
    // grep exits 1 when there are no matches — that's the success case here.
    grepOut = (e as { stdout?: string }).stdout || '';
  }
  const hits = grepOut.split('\n').map((l) => l.trim()).filter(Boolean);
  const allowed = hits.every((h) => h.endsWith('ai-studio-v5d4b-narrative-model-removal-selftest.ts'));
  assert(
    allowed,
    `L: no active-source narrativeModel references outside this removal test (found: ${JSON.stringify(hits)})`
  );
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nPhase 5D.4B narrativeModel removal self-tests passed.');
