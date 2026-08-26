/**
 * Phase 5A pipeline-survival self-test.
 * Proves creativeStrategy / silhouettePlan / architectureFingerprint survive:
 *   Creative Director → parse → DesignSpec repair → SSE serialization → client parse
 * Run: npx --yes tsx scripts/ai-studio-v5a-pipeline-survival-selftest.ts
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  buildDesignSpecSchemas,
  getDesignSpecRepairPrompt,
} from '../shared/ai-studio-v2/designSpecSchema.ts';
import { buildArchitectureFingerprint } from '../shared/ai-studio-v2/creativeStrategy.ts';
import { designSpecSchema as clientDesignSpecSchema } from '../src/lib/ai-studio/v2/designSpec.ts';
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

// Edge function builds its schemas from the same shared builder.
const { designSpecSchema: edgeDesignSpecSchema, withCreativeStrategy } = buildDesignSpecSchemas(z);
const parseDesignSpecPayload = (json: unknown) =>
  edgeDesignSpecSchema.safeParse({ version: 1, ...(json as object) });

const AUTHORED_STRATEGY = {
  pageComposition: 'typography_led',
  narrativeModel: 'chaptered',
  heroPhilosophy: 'typography_first',
  commerceEntry: 'delayed',
  commerceModel: 'collection_first',
  rhythm: 'long_short_long',
  density: 'low',
  asymmetry: 'medium',
  typographyRole: 'dominant_structural',
  imageryRole: 'supporting',
  navigationBehavior: 'quiet_overlay',
  experimentationLevel: 'medium',
  distinctivenessBrief:
    'No cinematic hero. Open on a typographic manifesto and delay commerce until the third beat.',
} as const;

const base = V2_VARIETY_FIXTURES[0].designSpec as Record<string, unknown>;

// ── 1. Creative Director output → parse ─────────────────────────────────────
const directorPayload = { ...base, creativeMode: 'balanced', creativeStrategy: AUTHORED_STRATEGY };
const firstParse = parseDesignSpecPayload(directorPayload);
assert(firstParse.success, 'Director payload with creativeStrategy parses on the edge schema');
assert(
  firstParse.success && firstParse.data.creativeStrategy?.commerceEntry === 'delayed',
  'edge parse preserves authored creativeStrategy (zod does not strip it)'
);

// ── 2. Forced validation failure → DesignSpec repair path ───────────────────
const tooLong = { ...directorPayload, designIntent: { ...(base.designIntent as object), coreConcept: 'x'.repeat(4000) } };
assert(!parseDesignSpecPayload(tooLong).success, 'overlong coreConcept fails validation (forces repair)');

const repairPrompt = getDesignSpecRepairPrompt('designIntent.coreConcept too long');
assert(
  repairPrompt.includes('creativeStrategy'),
  'repair prompt instructs the model to preserve creativeStrategy'
);

// Repair response that complies: shortened field, strategy carried over verbatim.
const repairedPayload = {
  ...directorPayload,
  designIntent: { ...(base.designIntent as object), coreConcept: 'A typographic manifesto for a quiet atelier.' },
  creativeStrategy: AUTHORED_STRATEGY,
};
const repairedParse = parseDesignSpecPayload(repairedPayload);
assert(repairedParse.success, 'repaired DesignSpec parses');
assert(
  repairedParse.success &&
    JSON.stringify(repairedParse.data.creativeStrategy) === JSON.stringify(AUTHORED_STRATEGY),
  'repair path preserves the authored creativeStrategy unchanged'
);

// Adversarial repair: model drops creativeStrategy entirely.
const strippedRepair = { ...repairedPayload } as Record<string, unknown>;
delete strippedRepair.creativeStrategy;
const strippedParse = parseDesignSpecPayload(strippedRepair);
assert(strippedParse.success, 'repair response without creativeStrategy still parses (optional field)');
const backfilled = withCreativeStrategy((strippedParse.success ? strippedParse.data : {}) as never);
assert(
  !!backfilled.creativeStrategy?.pageComposition,
  'withCreativeStrategy backfills when repair drops creativeStrategy (never undefined downstream)'
);

// ── 3. SSE serialization → client parse ─────────────────────────────────────
const finalSpec = withCreativeStrategy((repairedParse.success ? repairedParse.data : {}) as never);
const overWire = JSON.parse(JSON.stringify(finalSpec));
assert(!!overWire.creativeStrategy, 'creativeStrategy survives SSE JSON serialization');

const clientParse = clientDesignSpecSchema.safeParse(overWire);
assert(clientParse.success, 'client designSpecSchema parses the wire DesignSpec');
assert(
  clientParse.success && clientParse.data.creativeStrategy?.heroPhilosophy === 'typography_first',
  'client parse does NOT strip creativeStrategy'
);

// ── 4. Site Architect silhouettePlan + fingerprint ──────────────────────────
const nodes = V2_VARIETY_FIXTURES[0].document.pages.home.nodes;
const silhouettePlan = ['chrome', 'statement', 'editorial_pause', 'spotlight', 'rail', 'chrome'];
const fingerprint = buildArchitectureFingerprint({
  designSpec: finalSpec,
  nodes,
  silhouettePlan,
});
const meta = JSON.parse(
  JSON.stringify({ engine: 'v2', schemaVersion: 2, silhouettePlan, architectureFingerprint: fingerprint })
);
assert(Array.isArray(meta.silhouettePlan) && meta.silhouettePlan.length === 6, 'silhouettePlan survives meta serialization');
assert(!!meta.architectureFingerprint?.sectionCount, 'architectureFingerprint survives meta serialization');

// Fingerprint must be derived from the real tree, not a constant.
const trimmed = buildArchitectureFingerprint({
  designSpec: finalSpec,
  nodes: nodes.slice(0, Math.max(2, nodes.length - 2)),
  silhouettePlan: null,
});
assert(
  trimmed.sectionCount !== fingerprint.sectionCount,
  'fingerprint changes with the generated architecture (derived, not faked)'
);

// ── 5. Edge source guards (cross-runtime file, cannot be imported here) ─────
const edgeSrc = readFileSync(new URL('../supabase/functions/_shared/aiStudioV2.ts', import.meta.url), 'utf8');
assert(
  /siteArchitectureOutputSchema[\s\S]{0,1200}silhouettePlan/.test(edgeSrc),
  'edge siteArchitectureOutputSchema declares silhouettePlan'
);
assert(edgeSrc.includes('silhouettePlan = arch.silhouettePlan'), 'edge captures silhouettePlan from architect output');
assert(/"silhouettePlan":/.test(edgeSrc), 'Site Architect prompt asks for silhouettePlan in its JSON contract');
assert(edgeSrc.includes('Preserve silhouettePlan when present'), 'SiteTree repair prompt preserves silhouettePlan');
assert(
  /const generationMeta: V2GenerationMeta = \{[\s\S]*silhouettePlan,[\s\S]*architectureFingerprint,/.test(edgeSrc),
  'generationMeta carries silhouettePlan + architectureFingerprint'
);
assert(edgeSrc.includes('designSpec = withCreativeStrategy(designSpec)'), 'edge applies withCreativeStrategy after repair');
assert((edgeSrc.match(/\[Phase5A\]/g) || []).length >= 4, 'edge emits the four [Phase5A] trace logs');

// ── 6. Commentary must never fail a structurally valid tree ─────────────────
// Regression: the strategy-first prompt asks for a 7-dimension explanation, which
// overflowed the old 900-char cap and killed whole generations at schema parse.
const archParseCalls = edgeSrc.match(/siteArchitectureOutputSchema\.safeParse\(/g) || [];
const clampedParseCalls =
  edgeSrc.match(/siteArchitectureOutputSchema\.safeParse\(\s*clampArchitectureCommentary\(/g) || [];
assert(archParseCalls.length >= 3, 'edge parses architecture output at every stage (initial + both repairs)');
assert(
  clampedParseCalls.length === archParseCalls.length,
  'every architecture parse clamps commentary first (no prose-length hard reject)'
);
assert(
  /architectureNotes = notes\.slice\(0, ARCHITECTURE_NOTES_MAX\)/.test(edgeSrc),
  'over-long architectureNotes is truncated, not rejected'
);
assert(
  /delete obj\.silhouettePlan/.test(edgeSrc),
  'an unusable silhouettePlan is dropped, not fatal'
);
assert(!/architectureNotes: z\.string\(\)\.max\(900\)/.test(edgeSrc), 'the 900-char architectureNotes cap is gone');
assert(/BUDGET: 800 characters max/.test(edgeSrc), 'architect prompt states an explicit notes budget');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nPhase 5A pipeline-survival self-tests passed.');
