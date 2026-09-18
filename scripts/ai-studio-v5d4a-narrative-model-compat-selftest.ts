/**
 * Phase 5D.4A self-test — narrativeModel read-compatibility.
 * buildCreativeStrategySchema now parses creativeStrategy objects both with and
 * without narrativeModel (legacy rows keep it; future rows may omit it), while
 * generation still emits it and ensureCreativeStrategy still always normalizes to
 * a full CreativeStrategy with a valid narrativeModel. This file verifies both
 * directions and that nothing else moved.
 * Run: npx --yes tsx scripts/ai-studio-v5d4a-narrative-model-compat-selftest.ts
 */
import { z } from 'zod';
import { buildDesignSpecSchemas } from '../shared/ai-studio-v2/designSpecSchema.ts';
import {
  buildCreativeStrategySchema,
  ensureCreativeStrategy,
  inferCreativeStrategy,
  creativeStrategyPromptBlock,
  NARRATIVE_MODELS,
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

const FULL_STRATEGY: CreativeStrategy = {
  pageComposition: 'editorial_journey',
  narrativeModel: 'editorial',
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
    'Avoid a generic ecommerce spine (hero, manifesto, product rail, story, footer) — this is a compat-test fixture.',
};

// ── A. full current CreativeStrategy WITH narrativeModel — schema parsing succeeds ──
{
  const parsed = strategySchema.safeParse(FULL_STRATEGY);
  assert(parsed.success, 'A: full CreativeStrategy WITH narrativeModel parses');
  if (parsed.success) {
    assert(parsed.data.narrativeModel === 'editorial', 'A: narrativeModel value preserved by schema parse');
  }
}

// ── B. same CreativeStrategy WITHOUT narrativeModel — compat parsing succeeds ──
{
  const { narrativeModel: _drop, ...withoutNarrativeModel } = FULL_STRATEGY;
  const parsed = strategySchema.safeParse(withoutNarrativeModel);
  assert(parsed.success, 'B: CreativeStrategy WITHOUT narrativeModel still parses (read-compat)');
  if (parsed.success) {
    assert(parsed.data.narrativeModel === undefined, 'B: schema-level parse leaves narrativeModel undefined, not invented');
  }
}

// ── C. ensureCreativeStrategy(input without narrativeModel) infers a valid one ──
{
  const { narrativeModel: _drop, ...withoutNarrativeModel } = FULL_STRATEGY;
  const normalized = ensureCreativeStrategy({ creativeStrategy: withoutNarrativeModel });
  assert(
    (NARRATIVE_MODELS as readonly string[]).includes(normalized.narrativeModel),
    'C: ensureCreativeStrategy fills a valid narrativeModel when input omits it'
  );
  assert(normalized.pageComposition === 'editorial_journey', 'C: other explicit fields still preserved');
}

// ── D. ensureCreativeStrategy(input with explicit valid narrativeModel) preserves it ──
{
  const normalized = ensureCreativeStrategy({
    creativeStrategy: { ...FULL_STRATEGY, narrativeModel: 'chaptered' },
  });
  assert(normalized.narrativeModel === 'chaptered', 'D: explicit valid narrativeModel is preserved verbatim');
}

// ── E. invalid narrativeModel does not survive normalization ──
{
  const normalized = ensureCreativeStrategy({
    creativeStrategy: { ...FULL_STRATEGY, narrativeModel: 'not_a_real_value' as never },
  });
  assert(
    normalized.narrativeModel !== ('not_a_real_value' as unknown),
    'E: invalid narrativeModel is rejected, not passed through'
  );
  assert(
    (NARRATIVE_MODELS as readonly string[]).includes(normalized.narrativeModel),
    'E: normalization falls back to a valid inferred narrativeModel'
  );
}

// ── F. fresh inferCreativeStrategy(...) still returns narrativeModel ──
{
  const inferred = inferCreativeStrategy({});
  assert(typeof inferred.narrativeModel === 'string' && inferred.narrativeModel.length > 0, 'F: inferCreativeStrategy still returns a narrativeModel');
  assert(
    (NARRATIVE_MODELS as readonly string[]).includes(inferred.narrativeModel),
    'F: inferCreativeStrategy narrativeModel is a known enum value'
  );
}

// ── G. creativeStrategyPromptBlock() still includes narrativeModel ──
{
  const block = creativeStrategyPromptBlock();
  assert(block.includes('narrativeModel'), 'G: DesignSpec prompt still asks the LLM for narrativeModel');
  assert(
    NARRATIVE_MODELS.every((v) => block.includes(v)),
    'G: prompt still lists all 5 narrativeModel enum values'
  );
}

// ── H. all 5 canonical fixtures remain unchanged (still explicit, still valid) ──
{
  assert(V2_VARIETY_FIXTURES.length === 5, 'H: still exactly 5 canonical fixtures');
  const EXPECTED_NARRATIVE_MODELS = ['editorial', 'editorial', 'campaign', 'product_journey', 'editorial'];
  V2_VARIETY_FIXTURES.forEach((fixture, i) => {
    const cs = (fixture.designSpec as { creativeStrategy?: CreativeStrategy }).creativeStrategy;
    assert(!!cs, `H: fixture[${i}] (${fixture.id}) still has an explicit creativeStrategy`);
    assert(
      cs?.narrativeModel === EXPECTED_NARRATIVE_MODELS[i],
      `H: fixture[${i}] (${fixture.id}) narrativeModel unchanged (${EXPECTED_NARRATIVE_MODELS[i]})`
    );
  });
}

// ── I. old persisted-style DesignSpec WITH narrativeModel — designSpecSchema.safeParse succeeds ──
{
  const legacyStyle = V2_VARIETY_FIXTURES[0].designSpec;
  const parsed = designSpecSchema.safeParse(legacyStyle);
  assert(parsed.success, 'I: DesignSpec WITH narrativeModel still parses via designSpecSchema');
  if (parsed.success) {
    assert(parsed.data.creativeStrategy?.narrativeModel === 'editorial', 'I: narrativeModel value survives full DesignSpec parse');
  }
}

// ── J. future-style DesignSpec WITHOUT narrativeModel — designSpecSchema.safeParse succeeds ──
{
  const base = V2_VARIETY_FIXTURES[0].designSpec as unknown as { creativeStrategy?: Record<string, unknown> };
  const cloned = JSON.parse(JSON.stringify(base)) as { creativeStrategy?: Record<string, unknown> };
  if (cloned.creativeStrategy) delete cloned.creativeStrategy.narrativeModel;
  const futureStyle = { ...V2_VARIETY_FIXTURES[0].designSpec, ...cloned };
  const parsed = designSpecSchema.safeParse(futureStyle);
  assert(parsed.success, 'J: DesignSpec WITHOUT narrativeModel parses via designSpecSchema (forward-compat)');
  if (parsed.success) {
    assert(
      parsed.data.creativeStrategy?.narrativeModel === undefined,
      'J: absent narrativeModel is not invented at the raw schema-parse layer'
    );
  }
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nPhase 5D.4A narrativeModel compatibility self-tests passed.');
