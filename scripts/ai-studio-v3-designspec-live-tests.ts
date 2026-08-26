#!/usr/bin/env -S npx tsx
/**
 * Live V2 pipeline tests — DesignSpec → SiteTree → validation.
 * Requires: SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD
 *
 * Usage: npx tsx scripts/ai-studio-v3-designspec-live-tests.ts
 */
import { createClient } from '@supabase/supabase-js';
import { PHASE3_BRIEFS } from '../src/lib/ai-studio/v2/phase3Briefs';

const EXTRA_BRIEFS = [
  {
    id: 'swiss_watch',
    label: 'Swiss watch — AUREN',
    prompt:
      'Create an online store for a premium Swiss mechanical watchmaker. The brand is called AUREN. It makes extremely limited watches for collectors. The website should feel quiet, architectural, obsessive about craftsmanship and distinctly Swiss. Avoid the typical luxury ecommerce look. The products should feel like objects of engineering rather than fashion accessories.',
  },
  {
    id: 'genz_coffee_ro',
    label: 'Gen-Z coffee — RO',
    prompt:
      'Create an online store for a Gen-Z Romanian brand selling high-end specialty coffee concentrates. It should feel playful, experimental and culturally relevant without looking childish. The brand should feel premium but not luxury. Avoid the typical beige coffee aesthetic.',
  },
];

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!url || !anon) {
  console.error('Missing SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(1);
}
if (!email || !password) {
  console.error('Set TEST_USER_EMAIL and TEST_USER_PASSWORD');
  process.exit(1);
}

const supabase = createClient(url, anon);

type Row = {
  id: string;
  ok: boolean;
  sec: string;
  repair?: boolean;
  archetype?: string;
  nodes?: number;
  error?: string;
};

async function runBrief(id: string, prompt: string, token: string): Promise<Row> {
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
    return { id, ok: false, sec: ((Date.now() - started) / 1000).toFixed(1), error: await res.text() };
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

  const sec = ((Date.now() - started) / 1000).toFixed(1);
  if (last._event === 'error' || last.error) {
    return { id, ok: false, sec, error: String(last.message || last.error) };
  }

  const designSpec = last.designSpec as { artDirection?: { archetype?: string } } | undefined;
  const document = last.document as { pages?: { home?: { nodes?: unknown[] } } } | undefined;
  const meta = last.generationMeta as { retries?: number; tasks?: Array<{ task: string }> } | undefined;
  const repair = meta?.tasks?.some((t) => t.task === 'design_spec_repair') ?? false;

  return {
    id,
    ok: true,
    sec,
    repair,
    archetype: designSpec?.artDirection?.archetype,
    nodes: document?.pages?.home?.nodes?.length,
  };
}

async function main() {
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email: email!, password: password! });
  if (error || !auth.session) {
    console.error('Auth failed:', error?.message);
    process.exit(1);
  }
  const token = auth.session.access_token;

  const briefs = [
    ...PHASE3_BRIEFS.map((b) => ({ id: b.id, label: b.label, prompt: b.prompt })),
    ...EXTRA_BRIEFS,
  ];

  const rows: Row[] = [];
  for (const b of briefs) {
    console.log(`\n▶ ${b.label}`);
    const r = await runBrief(b.id, b.prompt, token);
    rows.push(r);
    if (r.ok) {
      console.log(`  ✓ ${r.sec}s | archetype=${r.archetype} | nodes=${r.nodes}${r.repair ? ' | designSpec repair used' : ''}`);
    } else {
      console.log(`  ✗ ${r.error}`);
    }
  }

  console.log('\n── Summary ──');
  console.table(rows);
  const ok = rows.filter((r) => r.ok).length;
  console.log(`${ok}/${rows.length} succeeded`);
  process.exit(ok === rows.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
