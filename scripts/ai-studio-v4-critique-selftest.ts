#!/usr/bin/env -S npx tsx
/**
 * Phase 4 — critique scorecard guards, render verification, loop-control helpers (no LLM).
 * Run: npx tsx scripts/ai-studio-v4-critique-selftest.ts
 */
import { z } from 'zod';
import {
  buildCritiqueSchemas,
  meetsCritiqueStopThreshold,
  shouldRejectForDistinctivenessLoss,
  applyCritiqueCalibrationGuards,
  getActionableRecommendations,
  CRITIQUE_STOP_THRESHOLD,
  CRITIQUE_DIMENSION_KEYS,
  type CritiqueScoreCard,
  type CritiqueRecommendation,
} from '../shared/ai-studio-v2/critiqueScoreCard.ts';
import {
  buildExpectedRenderManifest,
  hashRenderRelevantSiteTree,
} from '../shared/ai-studio-v2/expectedRenderManifest.ts';
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures.ts';
import { validateSiteOpsAgainstDocument } from '../src/lib/ai-studio/v2/validateSiteOps.ts';
import { applySiteOps } from '../src/lib/ai-studio/v2/siteOps.ts';
import { routeForTask } from '../src/lib/ai-studio/v2/modelRouter.ts';
import {
  CRITIC_FAULT_FIXTURES,
  faultFixtureById,
} from '../src/lib/ai-studio/v2/criticFaultFixtures.ts';
import { evaluateFaultAcceptance } from '../src/lib/ai-studio/v2/evaluateFaultAcceptance.ts';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function dim(score: number, opts?: { observations?: string[]; evidence?: string[]; issues?: string[] }) {
  return {
    score,
    observations: opts?.observations?.length
      ? opts.observations
      : [`Observed dimension at score ${score} from screenshot.`],
    evidence: opts?.evidence ?? [],
    issues: opts?.issues ?? [],
    recommendations: [] as string[],
  };
}

function emptyRenderVerification() {
  return {
    nodes: [] as CritiqueScoreCard['renderVerification']['nodes'],
    summary: 'No material expected-vs-observed mismatches in this synthetic fixture.',
  };
}

function baseCard(overrides: Partial<CritiqueScoreCard> = {}): CritiqueScoreCard {
  const { critiqueScoreCardSchema } = buildCritiqueSchemas(z);
  return critiqueScoreCardSchema.parse({
    overall: dim(8),
    brandFit: dim(8),
    visualHierarchy: dim(7.5),
    composition: dim(7.5),
    typography: dim(7.5),
    spacing: dim(7.5),
    imagery: dim(7.5),
    color: dim(7.5),
    productPresentation: dim(7.5),
    ctaQuality: dim(7.5),
    sectionTransitions: dim(7.5),
    consistency: dim(7.5),
    premiumPerception: dim(8),
    distinctiveness: dim(8),
    mobileQuality: dim(7.5),
    criticalIssues: [],
    priorityFixes: [],
    approvedElements: [],
    renderIntentMismatch: { mismatches: [] },
    renderVerification: emptyRenderVerification(),
    rhythmNotes: [],
    genericnessNotes: [],
    confidence: 0.7,
    decision: 'refine',
    decisionReason: 'Strong commercial work with clear room for refinement before exceptional quality.',
    ...overrides,
  });
}

function actionableRec(partial?: Partial<CritiqueRecommendation>): CritiqueRecommendation {
  return {
    targetNodeId: 'hero_01',
    operation: 'style',
    problem: 'Hero vertical rhythm is too tight against the following section',
    desiredOutcome: 'Increase hero section spacing to restore page rhythm',
    property: 'design.spacing',
    currentValue: 'compact',
    suggestedValue: 'dramatic',
    reason: 'Adjacent sections collide; DesignSpec density expects airier hero',
    category: 'visual',
    severity: 'medium',
    actionable: true,
    confidence: 0.8,
    ...partial,
  };
}

function main() {
  const { critiqueScoreCardSchema, visualCritiqueOutputSchema } = buildCritiqueSchemas(z);

  assert(CRITIQUE_STOP_THRESHOLD.maxCycles === 3, 'max 3 cycles');
  assert(CRITIQUE_DIMENSION_KEYS.includes('overall'), 'overall dimension present');
  assert(CRITIQUE_DIMENSION_KEYS.includes('distinctiveness'), 'distinctiveness dimension present');

  // Rubber-stamp 10s without evidence must be capped; uneared pass → limited_by_registry (no actionable)
  const rubber = baseCard({
    overall: dim(9.5, { observations: ['Looks fine'] }),
    brandFit: dim(10, { observations: ['Matches brand'], evidence: [] }),
    typography: dim(10, { observations: ['Nice type'], evidence: ['only one'] }),
    premiumPerception: dim(10, { observations: ['Feels premium'] }),
    distinctiveness: dim(9, { observations: ['Somewhat unique'] }),
    decision: 'pass',
    decisionReason: 'Looks good overall with no meaningful issues visible in the screenshots.',
    confidence: 0.95,
  });
  const { scorecard: guarded, calibrationNotes } = applyCritiqueCalibrationGuards(rubber, []);
  assert(calibrationNotes.length > 0, 'calibration notes emitted for rubber-stamp');
  assert(guarded.brandFit.score <= 8, 'brandFit 10 without ≥2 evidence capped');
  assert(guarded.typography.score <= 8, 'typography 10 with <2 evidence capped');
  assert(guarded.decision === 'limited_by_registry', 'uneared pass → limited_by_registry without actionable recs');
  assert(meetsCritiqueStopThreshold(guarded), 'limited_by_registry stops the loop');

  // Refine without actionable property/value → limited_by_registry
  const vagueRec = actionableRec({
    property: undefined,
    suggestedValue: undefined,
    problem: 'Could feel more distinctive',
    desiredOutcome: 'More distinctive',
    actionable: true,
  });
  const vague = applyCritiqueCalibrationGuards(
    baseCard({
      decision: 'refine',
      decisionReason: 'Needs more distinctive composition and stronger section transitions overall.',
    }),
    [vagueRec]
  );
  assert(vague.scorecard.decision === 'limited_by_registry', 'vague refine → limited_by_registry');
  assert(vague.recommendations.every((r) => r.actionable === false), 'recs marked unactionable');
  assert(getActionableRecommendations(vague.recommendations).length === 0, 'zero actionable after guard');

  // Refine with actionable rec stays refine
  const goodRefine = applyCritiqueCalibrationGuards(
    baseCard({
      decision: 'refine',
      decisionReason: 'Hero spacing breaks page rhythm relative to neighboring sections.',
      renderVerification: {
        summary: 'Hero-to-next gap is anomalously large vs page rhythm.',
        nodes: [
          {
            nodeId: 'hero_01',
            type: 'hero',
            titleVisible: true,
            ctaVisible: true,
            imageryPlausible: true,
            notes: ['Large empty band below hero'],
            mismatches: [
              {
                type: 'abnormal_section_spacing',
                nodeId: 'hero_01',
                property: 'design.spacing',
                severity: 'high',
                evidence: 'Empty band between hero and next section far larger than other section gaps',
                viewport: 'both',
              },
            ],
          },
        ],
      },
    }),
    [actionableRec()]
  );
  assert(goodRefine.scorecard.decision === 'refine', 'actionable refine preserved');
  assert(getActionableRecommendations(goodRefine.recommendations).length === 1, 'one actionable rec');

  // Earned high score with evidence may keep 9
  const earned = baseCard({
    overall: dim(8.6, {
      observations: ['Cohesive premium page'],
      evidence: ['Restrained type scale', 'Deliberate negative space in hero'],
    }),
    brandFit: dim(9, {
      observations: ['Luxury serif + muted palette'],
      evidence: ['Display serif contrasts sans body', 'Palette stays within DesignSpec neutrals'],
    }),
    premiumPerception: dim(8.5, {
      observations: ['Quiet luxury feel'],
      evidence: ['Sparse hero', 'Restrained CTAs'],
    }),
    distinctiveness: dim(8.2, {
      observations: ['Editorial product_focus hero'],
      evidence: ['Asymmetric product stage', 'Avoids card-grid chrome'],
    }),
    decision: 'pass',
    decisionReason:
      'Further changes would risk over-designing and reducing intent fidelity; remaining gaps are minor.',
  });
  const earnedGuarded = applyCritiqueCalibrationGuards(earned, []).scorecard;
  assert(earnedGuarded.brandFit.score >= 9, 'earned 9 with evidence preserved');
  assert(meetsCritiqueStopThreshold(earnedGuarded), 'earned pass meets stop threshold');

  const mediocre = baseCard({
    overall: dim(6.5),
    brandFit: dim(6),
    premiumPerception: dim(6),
    distinctiveness: dim(5.5),
    decision: 'refine',
    decisionReason: 'Generic ecommerce stacking and weak mobile type hierarchy need work.',
    genericnessNotes: ['Predictable product card chrome', 'Default-looking nav'],
    rhythmNotes: ['Repeated left/right editorial splits feel monotonous'],
  });
  assert(!meetsCritiqueStopThreshold(mediocre), 'mediocre continues refinement');

  const before = earnedGuarded;
  const afterHomogenized = baseCard({
    overall: dim(9.2, {
      observations: ['Slightly cleaner'],
      evidence: ['Tighter alignment', 'More consistent gaps'],
    }),
    distinctiveness: dim(6, { observations: ['Now looks like a template'] }),
    decision: 'refine',
    decisionReason: 'Homogenized toward safe template.',
  });
  assert(
    shouldRejectForDistinctivenessLoss(before, afterHomogenized),
    'distinctiveness guard rejects homogenization'
  );

  const out = visualCritiqueOutputSchema.parse({
    scorecard: earnedGuarded,
    recommendations: [],
  });
  assert(out.recommendations.length === 0, 'pass allows empty recommendations');
  assert(out.scorecard.renderVerification.summary.length > 0, 'renderVerification required');

  assert(routeForTask('visual_critique').primary === 'openai', 'visual_critique routes to OpenAI');
  assert(routeForTask('site_ops').primary === 'openai', 'site_ops routes to OpenAI');

  // Fault fixtures + acceptance harness (no fixture leak to model — harness only)
  assert(CRITIC_FAULT_FIXTURES.length >= 6, 'fault fixtures include none + A–E');
  assert(faultFixtureById('invisible_hero_heading').acceptance?.mismatchTypes.length, 'TEST A acceptance');
  assert(faultFixtureById('excessive_section_gap').acceptance?.mismatchTypes.includes('abnormal_section_spacing'), 'TEST B spacing');
  assert(faultFixtureById('broken_product_crop').acceptance?.mismatchTypes.includes('broken_crop'), 'TEST C crop');
  assert(faultFixtureById('oversized_mobile_type').acceptance?.preferMobileViewport, 'TEST D mobile');
  assert(
    faultFixtureById('bad_typography_fallback').acceptance?.mismatchTypes.includes('typography_mismatch'),
    'TEST E typography'
  );

  // Synthetic acceptance: Fault A-like scorecard should pass harness
  const faultACard = baseCard({
    overall: dim(4.5, { issues: ['Hero title unreadable'] }),
    visualHierarchy: dim(3, { issues: ['Primary heading nearly invisible'] }),
    typography: dim(4, { issues: ['Title contrast fails'] }),
    color: dim(4, { issues: ['Title blends into background'] }),
    decision: 'refine',
    decisionReason: 'Hero heading is not visually readable against the background.',
    renderVerification: {
      summary: 'Hero title expected in manifest is not discernible in screenshots.',
      nodes: [
        {
          nodeId: 'hero_01',
          type: 'hero',
          titleVisible: false,
          ctaVisible: true,
          imageryPlausible: true,
          notes: ['Expected hero title not readable'],
          mismatches: [
            {
              type: 'missing_or_unreadable_element',
              nodeId: 'hero_01',
              property: 'content.title',
              severity: 'high',
              evidence: 'Hero heading text is nearly invisible against the image',
              viewport: 'both',
            },
          ],
        },
      ],
    },
  });
  const aEval = evaluateFaultAcceptance('invisible_hero_heading', faultACard);
  assert(aEval.passed, 'harness accepts well-grounded Fault A diagnosis');

  // Fault B: spacing — must not be excused by luxury alone (harness checks category)
  const faultBCard = baseCard({
    spacing: dim(3, { issues: ['Anomalous empty band between sections'] }),
    composition: dim(4, { issues: ['Broken vertical rhythm'] }),
    decision: 'refine',
    decisionReason: 'Gap between hero and next section breaks established page rhythm.',
    renderVerification: {
      summary: 'Abnormal inter-section gap inconsistent with page rhythm.',
      nodes: [
        {
          nodeId: 'hero_01',
          type: 'hero',
          notes: ['Huge empty band below'],
          mismatches: [
            {
              type: 'abnormal_section_spacing',
              nodeId: 'hero_01',
              severity: 'high',
              evidence: 'Empty band dwarfs other section gaps despite luxury density',
              viewport: 'desktop',
            },
          ],
        },
      ],
    },
  });
  assert(evaluateFaultAcceptance('excessive_section_gap', faultBCard).passed, 'harness accepts Fault B spacing');

  // expectedRenderManifest from production SiteTree
  const doc = V2_VARIETY_FIXTURES[0].document;
  const manifest = buildExpectedRenderManifest(doc);
  assert(manifest.nodes.length > 0, 'manifest has nodes');
  assert(manifest.sectionOrder.length === doc.pages.home.nodes.filter((n) => n.visible !== false).length, 'sectionOrder covers visible nodes');
  const hero = manifest.nodes.find((n) => n.type === 'hero');
  assert(hero, 'manifest includes hero');
  assert((hero?.expectedVisibleText?.length || 0) > 0, 'hero has expectedVisibleText');
  assert(!JSON.stringify(manifest).includes('v2-fault'), 'manifest has no fault CSS');
  assert(!JSON.stringify(manifest).includes('invisible_hero'), 'manifest has no fault fixture ids');

  const hash1 = hashRenderRelevantSiteTree(doc);
  const hash2 = hashRenderRelevantSiteTree(doc);
  assert(hash1 === hash2, 'hash is deterministic');

  const heroId = doc.pages.home.nodes.find((n) => n.type === 'hero')!.id;
  const good = validateSiteOpsAgainstDocument(doc, [
    { op: 'style', id: heroId, design: { minHeight: '80vh', spacing: 'compact' } },
  ]);
  assert(good.ops.length === 1, 'valid style SiteOp accepted');
  const applied = applySiteOps(doc, good.ops);
  assert(
    applied.pages.home.nodes.find((n) => n.id === heroId)?.design?.minHeight === '80vh',
    'style applies to hero'
  );
  const hashAfter = hashRenderRelevantSiteTree(applied);
  assert(hashAfter !== hash1, 'render-relevant hash changes after style op');

  const noopHash = hashRenderRelevantSiteTree(applySiteOps(doc, []));
  assert(noopHash === hash1, 'empty ops leave hash unchanged');

  const bad = validateSiteOpsAgainstDocument(doc, [
    { op: 'style', id: 'nope_99', design: { minHeight: '100vh' } },
  ]);
  assert(bad.ops.length === 0 && bad.rejected.length >= 1, 'unknown node rejected');

  const delNav = validateSiteOpsAgainstDocument(doc, [
    { op: 'delete', id: doc.pages.home.nodes.find((n) => n.type === 'nav')!.id },
  ]);
  assert(delNav.ops.length === 0, 'cannot delete nav');

  // Schema still parses limited_by_registry
  assert(
    critiqueScoreCardSchema.parse(baseCard({ decision: 'limited_by_registry' })).decision ===
      'limited_by_registry',
    'schema accepts limited_by_registry'
  );

  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll Phase 4 critic grounding + loop-control self-tests passed.');
  console.log('Manifest sample (first 2 nodes):', JSON.stringify(manifest.nodes.slice(0, 2), null, 2));
}

main();
