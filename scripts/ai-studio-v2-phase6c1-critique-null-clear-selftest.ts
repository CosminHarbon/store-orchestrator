/**
 * Phase 6C.1 — proves the EXACT critique-output shape visualCriticPrompt.ts documents (a
 * responsive.mobile.placement null clear) actually parses and survives validateOpsAgainstTree
 * end to end on the EDGE (Deno) critique path — not the client siteOps.ts, which is a
 * separate, independently-typed schema (see Phase 6C.1 audit).
 *
 * Run: ./.tools/deno run --allow-env --no-lock scripts/ai-studio-v2-phase6c1-critique-null-clear-selftest.ts
 *
 * Uses --no-lock deliberately, not --lock=deno.lock: `deno run` (unlike `deno check`) can
 * update deno.lock's integrity entries for the remote zod import as a side effect of actually
 * executing the module graph, even with --lock passed — --no-lock skips lock involvement
 * entirely so running this script can never modify the committed lockfile.
 *
 * Deliberately does NOT import runVisualCritiqueCycle (which needs a live admin client/LLM
 * config) — only the pure schema + validation pieces this concern actually needs.
 */
import {
  siteOpsResponseSchema,
  validateOpsAgainstTree,
} from '../supabase/functions/_shared/aiStudioV2Critique.ts';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const document = {
  pages: {
    home: {
      nodes: [
        { id: 'nav_01', type: 'nav', variant: 'minimal', content: {} },
        { id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: {} },
        {
          id: 'story_01',
          type: 'editorialSplit',
          variant: 'image_text',
          content: {},
          responsive: { mobile: { placement: { afterId: 'products_01' } } },
        },
        { id: 'products_01', type: 'productGrid', variant: 'editorial', content: {} },
        { id: 'footer_01', type: 'footer', variant: 'minimal_commerce', content: {} },
      ],
    },
  },
};

// A. concrete placement — exact shape from getSiteOpsFromCritiqueSystemPrompt's own example.
{
  const raw = {
    ops: [
      {
        op: 'update',
        id: 'story_01',
        patch: { responsive: { mobile: { placement: { beforeId: 'products_01' } } } },
      },
    ],
    rejected: [],
  };
  const parsed = siteOpsResponseSchema.safeParse(raw);
  assert(parsed.success, 'A: siteOpsResponseSchema parses a concrete placement update op');
  if (parsed.success) {
    const { ops, rejected } = validateOpsAgainstTree(document, parsed.data.ops);
    assert(ops.length === 1 && rejected.length === 0, 'A: validateOpsAgainstTree accepts a concrete placement patch');
  }
}

// B. THE DOCUMENTED CLEAR SHAPE — visualCriticPrompt.ts's own null-clear example, verbatim.
{
  const raw = {
    ops: [
      {
        op: 'update',
        id: 'story_01',
        patch: { responsive: { mobile: { placement: null } } },
      },
    ],
    rejected: [],
  };
  const parsed = siteOpsResponseSchema.safeParse(raw);
  assert(parsed.success, 'B: siteOpsResponseSchema parses the documented placement:null clear shape');
  if (parsed.success) {
    const { ops, rejected } = validateOpsAgainstTree(document, parsed.data.ops);
    assert(
      ops.length === 1 && rejected.length === 0,
      'B: validateOpsAgainstTree accepts the documented placement:null clear (does not throw/reject it)'
    );
  }
}

// C. contentOrder: null
{
  const raw = {
    ops: [{ op: 'update', id: 'story_01', patch: { responsive: { mobile: { contentOrder: null } } } }],
    rejected: [],
  };
  const parsed = siteOpsResponseSchema.safeParse(raw);
  assert(parsed.success, 'C: siteOpsResponseSchema parses responsive.mobile.contentOrder: null');
  if (parsed.success) {
    const { ops, rejected } = validateOpsAgainstTree(document, parsed.data.ops);
    assert(ops.length === 1 && rejected.length === 0, 'C: validateOpsAgainstTree accepts contentOrder: null');
  }
}

// D. whole mobile clear
{
  const raw = {
    ops: [{ op: 'update', id: 'story_01', patch: { responsive: { mobile: null } } }],
    rejected: [],
  };
  const parsed = siteOpsResponseSchema.safeParse(raw);
  assert(parsed.success, 'D: siteOpsResponseSchema parses responsive.mobile: null');
  if (parsed.success) {
    const { ops, rejected } = validateOpsAgainstTree(document, parsed.data.ops);
    assert(ops.length === 1 && rejected.length === 0, 'D: validateOpsAgainstTree accepts mobile: null');
  }
}

// E. whole responsive clear
{
  const raw = {
    ops: [{ op: 'update', id: 'story_01', patch: { responsive: null } }],
    rejected: [],
  };
  const parsed = siteOpsResponseSchema.safeParse(raw);
  assert(parsed.success, 'E: siteOpsResponseSchema parses responsive: null');
  if (parsed.success) {
    const { ops, rejected } = validateOpsAgainstTree(document, parsed.data.ops);
    assert(ops.length === 1 && rejected.length === 0, 'E: validateOpsAgainstTree accepts responsive: null');
  }
}

// Sanity: a genuinely invalid placement (self-reference) is still rejected by the edge
// pre-filter, proving the null-acceptance above isn't just "everything passes unchecked".
{
  const raw = {
    ops: [{ op: 'update', id: 'story_01', patch: { responsive: { mobile: { placement: { beforeId: 'story_01' } } } } }],
    rejected: [],
  };
  const parsed = siteOpsResponseSchema.safeParse(raw);
  if (parsed.success) {
    const { ops, rejected } = validateOpsAgainstTree(document, parsed.data.ops);
    assert(ops.length === 0 && rejected.length === 1, 'sanity: a self-referencing placement is still rejected, not silently accepted');
  }
}

if (failed > 0) {
  console.error(`\n${failed} Phase 6C.1 critique null-clear self-test(s) FAILED.`);
  Deno.exit(1);
} else {
  console.log('\nAll Phase 6C.1 critique null-clear self-tests passed.');
}
