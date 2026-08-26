#!/usr/bin/env -S npx tsx
/**
 * Phase 3 — run five V2 test generations against the edge function.
 * Requires: SUPABASE_URL, SUPABASE_ANON_KEY (or VITE_*), TEST_USER_EMAIL, TEST_USER_PASSWORD
 *
 * Usage: npx tsx scripts/ai-studio-v3-generate-tests.ts
 */
import { createClient } from '@supabase/supabase-js';
import { PHASE3_BRIEFS } from '../src/lib/ai-studio/v2/phase3Briefs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!url || !anon) {
  console.error('Missing SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(1);
}
if (!email || !password) {
  console.error('Set TEST_USER_EMAIL and TEST_USER_PASSWORD to run live generations');
  process.exit(1);
}

const supabase = createClient(url, anon);

type Result = {
  briefId: string;
  ok: boolean;
  latencyMs: number;
  models?: string;
  cost?: number;
  archetype?: string;
  nodeCount?: number;
  sections?: string;
  designIntent?: string;
  error?: string;
};

async function streamGenerate(prompt: string, token: string): Promise<Result & { raw?: unknown }> {
  const started = Date.now();
  const res = await fetch(`${url}/functions/v1/ai-studio-generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, engine: 'v2', quality: 'studio' }),
  });

  if (!res.ok || !res.body) {
    return { briefId: '', ok: false, latencyMs: Date.now() - started, error: await res.text() };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let last: Record<string, unknown> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    for (const block of blocks) {
      if (!block.trim()) continue;
      let event = 'message';
      let dataLine = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      try {
        const data = JSON.parse(dataLine);
        last = { ...last, ...data, _event: event };
      } catch {
        /* skip */
      }
    }
  }

  const latencyMs = Date.now() - started;
  if (last._event === 'error' || last.error) {
    return { briefId: '', ok: false, latencyMs, error: String(last.error || 'error event') };
  }

  const designSpec = last.designSpec as { artDirection?: { archetype?: string }; designIntent?: { coreConcept?: string } } | undefined;
  const document = last.document as { pages?: { home?: { nodes?: Array<{ type: string; variant: string }> } } } | undefined;
  const meta = last.generationMeta as { tasks?: Array<{ costUsd: number }> } | undefined;
  const nodes = document?.pages?.home?.nodes || [];

  return {
    briefId: '',
    ok: true,
    latencyMs,
    models: last.llm as string | undefined,
    cost: meta?.tasks?.reduce((s, t) => s + (t.costUsd || 0), 0),
    archetype: designSpec?.artDirection?.archetype,
    nodeCount: nodes.length,
    sections: nodes.map((n) => `${n.type}/${n.variant}`).join(' → '),
    designIntent: designSpec?.designIntent?.coreConcept?.slice(0, 120),
    raw: last,
  };
}

async function main() {
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email: email!, password: password! });
  if (error || !auth.session) {
    console.error('Auth failed:', error?.message);
    process.exit(1);
  }
  const token = auth.session.access_token;
  const results: Result[] = [];

  for (const brief of PHASE3_BRIEFS) {
    console.log(`\n▶ ${brief.label}`);
    const r = await streamGenerate(brief.prompt, token);
    results.push({ ...r, briefId: brief.id });
    if (r.ok) {
      console.log(`  ✓ ${(r.latencyMs / 1000).toFixed(1)}s | ${r.models} | ~$${(r.cost || 0).toFixed(4)}`);
      console.log(`  archetype: ${r.archetype}`);
      console.log(`  sections (${r.nodeCount}): ${r.sections}`);
      console.log(`  intent: ${r.designIntent}…`);
    } else {
      console.log(`  ✗ ${r.error}`);
    }
  }

  console.log('\n── Summary ──');
  console.table(
    results.map((r) => ({
      brief: r.briefId,
      ok: r.ok,
      sec: (r.latencyMs / 1000).toFixed(1),
      nodes: r.nodeCount,
      archetype: r.archetype,
    }))
  );

  const archetypes = new Set(results.filter((r) => r.archetype).map((r) => r.archetype));
  const sectionSets = new Set(results.filter((r) => r.sections).map((r) => r.sections));
  console.log(`Unique archetypes: ${archetypes.size}/5`);
  console.log(`Unique section architectures: ${sectionSets.size}/5`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
