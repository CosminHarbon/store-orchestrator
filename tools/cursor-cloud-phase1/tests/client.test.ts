import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CursorCloudClient, isTerminal, parseSse } from '../src/cursorCloudClient.ts';
import { StorefrontRunLock } from '../src/concurrencyLock.ts';
import { CursorCloudApiError } from '../src/types.ts';

describe('isTerminal', () => {
  it('recognizes terminal statuses', () => {
    assert.equal(isTerminal('FINISHED'), true);
    assert.equal(isTerminal('CANCELLED'), true);
    assert.equal(isTerminal('RUNNING'), false);
    assert.equal(isTerminal('CREATING'), false);
  });
});

describe('StorefrontRunLock', () => {
  it('blocks a second concurrent acquire', () => {
    const lock = new StorefrontRunLock();
    const a = lock.acquire('merchant-1', 'idem-a');
    const b = lock.acquire('merchant-1', 'idem-b');
    assert.equal(a.ok, true);
    assert.equal(b.ok, false);
    if (!b.ok) assert.equal(b.reason, 'already_active');
  });

  it('treats same idempotency key as safe retry', () => {
    const lock = new StorefrontRunLock();
    const a = lock.acquire('merchant-1', 'idem-a');
    const b = lock.acquire('merchant-1', 'idem-a');
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (b.ok) assert.equal(b.reused, true);
  });

  it('allows a new run after release', () => {
    const lock = new StorefrontRunLock();
    const a = lock.acquire('merchant-1', 'idem-a');
    assert.equal(a.ok, true);
    if (a.ok) lock.release('merchant-1', a.lockId);
    const c = lock.acquire('merchant-1', 'idem-c');
    assert.equal(c.ok, true);
  });
});

describe('CursorCloudClient HTTP', () => {
  it('sends Basic auth and parses JSON', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          agent: { id: 'bc-test' },
          run: { id: 'run-test', agentId: 'bc-test', status: 'CREATING' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const client = new CursorCloudClient({ apiKey: 'test-key', fetchImpl });
    const res = await client.createAgent({ prompt: { text: 'hi' } });
    assert.equal(res.agent.id, 'bc-test');
    assert.equal(res.run.id, 'run-test');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/v1\/agents$/);
    const auth = (calls[0].init?.headers as Record<string, string>).Authorization;
    assert.ok(auth.startsWith('Basic '));
    // username=test-key password=empty
    assert.equal(Buffer.from(auth.slice(6), 'base64').toString(), 'test-key:');
  });

  it('throws CursorCloudApiError on 409', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'agent_busy' }), { status: 409 });
    const client = new CursorCloudClient({ apiKey: 'k', fetchImpl });
    await assert.rejects(
      () => client.createRun('bc-1', { prompt: { text: 'x' } }),
      (e: unknown) => {
        assert.ok(e instanceof CursorCloudApiError);
        assert.equal(e.status, 409);
        return true;
      },
    );
  });

  it('getUsage never invents cost fields', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          totalUsage: {
            inputTokens: 1,
            outputTokens: 2,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 3,
          },
          runs: [
            {
              id: 'run-1',
              usageUuid: 'uuid-1',
              usage: {
                inputTokens: 1,
                outputTokens: 2,
                cacheWriteTokens: 0,
                cacheReadTokens: 0,
                totalTokens: 3,
              },
            },
          ],
        }),
        { status: 200 },
      );
    const client = new CursorCloudClient({ apiKey: 'k', fetchImpl });
    const u = await client.getUsage('bc-1', { runId: 'run-1' });
    assert.equal(u.runs[0].usageUuid, 'uuid-1');
    assert.equal('chargedCents' in (u.runs[0] as object), false);
  });
});

describe('parseSse', () => {
  it('parses status and done events with ids', async () => {
    const text = [
      'event: status',
      'data: {"runId":"run-1","status":"RUNNING"}',
      '',
      'id: 1-0',
      'event: assistant',
      'data: {"text":"hi"}',
      '',
      'id: 2-0',
      'event: done',
      'data: {}',
      '',
      '',
    ].join('\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    const events = [];
    for await (const ev of parseSse(stream)) events.push(ev);
    assert.equal(events[0].event, 'status');
    assert.equal(events[1].event, 'assistant');
    assert.equal(events[1].id, '1-0');
    assert.equal(events[2].event, 'done');
  });
});
