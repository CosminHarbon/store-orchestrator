#!/usr/bin/env -S npx tsx
/**
 * Phase 4 — render verification + expectedRenderManifest selftest (no LLM).
 * Run: npx tsx scripts/ai-studio-v4-render-verification-selftest.ts
 */
import { z } from 'zod';
import {
  buildCritiqueSchemas,
  RENDER_MISMATCH_TYPES,
  type CritiqueScoreCard,
} from '../shared/ai-studio-v2/critiqueScoreCard.ts';
import {
  buildExpectedRenderManifest,
  hashRenderRelevantSiteTree,
} from '../shared/ai-studio-v2/expectedRenderManifest.ts';
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures.ts';
import { PHASE3_BRIEFS } from '../src/lib/ai-studio/v2/phase3Briefs.ts';
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

function dim(score: number) {
  return {
    score,
    observations: [`Observed at ${score}`],
    evidence: [] as string[],
    issues: [] as string[],
    recommendations: [] as string[],
  };
}

function cardWithMismatch(
  type: (typeof RENDER_MISMATCH_TYPES)[number],
  nodeId: string,
  nodeType: string,
  extras?: Partial<CritiqueScoreCard>
): CritiqueScoreCard {
  const { critiqueScoreCardSchema } = buildCritiqueSchemas(z);
  return critiqueScoreCardSchema.parse({
    overall: dim(5),
    brandFit: dim(6),
    visualHierarchy: dim(5),
    composition: dim(5),
    typography: dim(5),
    spacing: dim(5),
    imagery: dim(5),
    color: dim(5),
    productPresentation: dim(5),
    ctaQuality: dim(6),
    sectionTransitions: dim(5),
    consistency: dim(6),
    premiumPerception: dim(5),
    distinctiveness: dim(6),
    mobileQuality: dim(5),
    criticalIssues: [],
    priorityFixes: [{ summary: `${type} on ${nodeId}`, severity: 'high', nodeId }],
    approvedElements: [],
    renderIntentMismatch: { mismatches: [] },
    renderVerification: {
      summary: `Detected ${type} on ${nodeId}`,
      nodes: [
        {
          nodeId,
          type: nodeType,
          notes: [`Mismatch ${type}`],
          mismatches: [
            {
              type,
              nodeId,
              severity: 'high',
              evidence: `Screenshot shows ${type} for ${nodeId}`,
              viewport: type === 'mobile_typography' ? 'mobile' : 'both',
            },
          ],
        },
      ],
    },
    rhythmNotes: [],
    genericnessNotes: [],
    confidence: 0.75,
    decision: 'refine',
    decisionReason: `Concrete ${type} defect requires registry-safe SiteOps if available.`,
    ...extras,
  });
}

function main() {
  assert(RENDER_MISMATCH_TYPES.includes('abnormal_section_spacing'), 'spacing mismatch type');
  assert(RENDER_MISMATCH_TYPES.includes('missing_or_unreadable_element'), 'missing element type');
  assert(RENDER_MISMATCH_TYPES.includes('broken_crop'), 'crop type');
  assert(RENDER_MISMATCH_TYPES.includes('mobile_typography'), 'mobile type');
  assert(RENDER_MISMATCH_TYPES.includes('typography_mismatch'), 'typography mismatch type');

  const doc = V2_VARIETY_FIXTURES[0].document;
  const manifest = buildExpectedRenderManifest(doc);

  assert(manifest.nodes.every((n) => n.nodeId && n.type && n.variant), 'manifest nodes shaped');
  assert(
    !manifest.nodes.some((n) => 'faultId' in n || 'expectedFailure' in n),
    'no fixture fields on manifest nodes'
  );

  // Atelier-like luxury brief exists for live testing reference
  const atelier = PHASE3_BRIEFS.find(
    (b) => /atelier|luxury|fashion/i.test(b.id) || /atelier/i.test(b.label || '')
  );
  assert(atelier || PHASE3_BRIEFS.length > 0, 'phase3 briefs available for live Atelier run');

  assert(
    evaluateFaultAcceptance(
      'invisible_hero_heading',
      cardWithMismatch('missing_or_unreadable_element', 'hero_01', 'hero', {
        visualHierarchy: { ...dim(3), issues: ['Title unreadable'] },
        typography: { ...dim(3), issues: ['Low contrast title'] },
      })
    ).passed,
    'A acceptance'
  );
  assert(
    evaluateFaultAcceptance(
      'excessive_section_gap',
      cardWithMismatch('abnormal_section_spacing', 'hero_01', 'hero', {
        spacing: { ...dim(3), issues: ['Abnormal gap'] },
      })
    ).passed,
    'B acceptance'
  );
  assert(
    evaluateFaultAcceptance(
      'broken_product_crop',
      cardWithMismatch('broken_crop', 'productSpotlight_01', 'productSpotlight', {
        imagery: { ...dim(3), issues: ['Broken crop'] },
        productPresentation: { ...dim(3), issues: ['Crop fails'] },
      })
    ).passed,
    'C acceptance'
  );
  assert(
    evaluateFaultAcceptance(
      'oversized_mobile_type',
      cardWithMismatch('mobile_typography', 'hero_01', 'hero', {
        mobileQuality: { ...dim(3), issues: ['Oversized mobile type'] },
        typography: { ...dim(4), issues: ['Mobile overflow'] },
      })
    ).passed,
    'D acceptance'
  );
  assert(
    evaluateFaultAcceptance(
      'bad_typography_fallback',
      cardWithMismatch('typography_mismatch', 'hero_01', 'hero', {
        typography: { ...dim(3), issues: ['Wrong typeface'] },
        brandFit: { ...dim(4), issues: ['Brand type broken'] },
        premiumPerception: { ...dim(4), issues: ['Cheap system font'] },
      })
    ).passed,
    'E acceptance'
  );

  // Wrong attribution should fail structured path (nav blamed for hero title)
  const wrongNav = cardWithMismatch('contrast_or_readability', 'nav_01', 'nav', {
    visualHierarchy: { ...dim(3), issues: ['Nav contrast'] },
  });
  const wrongEval = evaluateFaultAcceptance('invisible_hero_heading', wrongNav);
  assert(!wrongEval.passed, 'harness rejects nav-only blame for invisible hero heading');

  const h1 = hashRenderRelevantSiteTree(doc);
  const h2 = hashRenderRelevantSiteTree({
    pages: {
      home: {
        nodes: doc.pages.home.nodes.map((n) =>
          n.type === 'hero'
            ? { ...n, design: { ...(n.design || {}), spacing: 'compact' as const } }
            : n
        ),
      },
    },
  });
  assert(h1 !== h2, 'spacing change alters hash');

  console.log('\nexpectedRenderManifest example (Atelier-like fixture):');
  console.log(JSON.stringify(manifest, null, 2).slice(0, 1800));
  console.log(manifest.nodes.length > 8 ? '\n…truncated…' : '');

  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nRender-verification self-tests passed.');
}

main();
