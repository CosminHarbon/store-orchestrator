/**
 * Billing investigation: REST token usage vs SDK Agent.getUsage() billed cost.
 *
 * REST GET /v1/agents/{id}/usage → tokens + usageUuid (NO chargedCents).
 * SDK  Agent.getUsage(agentId, { runId }) → usage + cost.rawCostCents / chargedCents
 *      (cost may be absent until billing settles).
 * Team Admin API POST /teams/filtered-usage-events → chargedCents (Enterprise; may 403).
 *
 * Local/dev Node proof only — does NOT deploy a Node service.
 *
 * Usage:
 *   export CURSOR_API_KEY=...
 *   npm run billing -- --agent bc-... --run run-...
 */

import { Agent } from '@cursor/sdk';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCursorCloudClientFromEnv } from './cursorCloudClient.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../.proof-output');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    console.error('CURSOR_API_KEY required');
    process.exit(2);
  }

  await mkdir(OUT, { recursive: true });
  const client = createCursorCloudClientFromEnv();

  let agentId = arg('agent');
  let runId = arg('run');

  // Optional: create a tiny no-repo agent if none provided
  if (!agentId || !runId) {
    console.log('No --agent/--run provided; creating a minimal no-repo agent for billing probe…');
    const created = await client.createAgent({
      name: `sv-billing-probe-${Date.now()}`,
      prompt: { text: 'Reply with exactly: BILLING_PROBE_OK. Do not create files.' },
    });
    agentId = created.agent.id;
    runId = created.run.id;
    console.log({ agentId, runId });
    const finished = await client.observeRun(agentId, runId, {
      intervalMs: 2500,
      timeoutMs: 10 * 60_000,
    });
    console.log('run status', finished.status);
  }

  const findings: Record<string, unknown> = {
    at: new Date().toISOString(),
    agentId,
    runId,
    distinctions: {
      tokenUsage:
        'Runtime/API token counters (input/output/cache). Not a bill.',
      estimatedCost:
        'Any locally computed $ from token×price tables — approximate only.',
      actualRawCost: 'SDK UsageCost.rawCostCents — undiscounted model token cost when present.',
      actualChargedCost:
        'SDK UsageCost.chargedCents — amount charged incl. discounts + Cursor Token Fee.',
      reconciliationStatus:
        'pending until SDK cost (or Admin usage event) is available; then reconciled.',
    },
  };

  // 1) REST usage
  try {
    const rest = await client.getUsage(agentId!, { runId });
    findings.restUsage = {
      endpoint: 'GET /v1/agents/{id}/usage?runId=',
      fieldsPresent: {
        totalUsage: Object.keys(rest.totalUsage || {}),
        runKeys: rest.runs?.[0] ? Object.keys(rest.runs[0]) : [],
        usageKeys: rest.runs?.[0]?.usage ? Object.keys(rest.runs[0].usage) : [],
      },
      hasChargedCents: JSON.stringify(rest).includes('chargedCents'),
      hasRawCostCents: JSON.stringify(rest).includes('rawCostCents'),
      usageUuid: rest.runs?.[0]?.usageUuid ?? null,
      sample: rest,
      conclusion:
        'REST Cloud Agents usage returns tokens (+ optional usageUuid). It does NOT return billed cost.',
    };
  } catch (e) {
    findings.restUsage = { error: String(e) };
  }

  // 2) SDK Agent.getUsage — billed cost path
  const pollAttempts: unknown[] = [];
  let sdkCostFound: unknown = null;
  const delays = [0, 5_000, 15_000, 30_000, 60_000];
  for (const wait of delays) {
    if (wait) {
      console.log(`waiting ${wait / 1000}s for cost settlement…`);
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      const usage = await Agent.getUsage(agentId!, { runId, apiKey });
      const entry = {
        waitedMs: wait,
        hasCost: Boolean(usage.cost),
        cost: usage.cost ?? null,
        runs: usage.runs?.map((r) => ({
          runId: r.runId,
          tokens: r.usage?.totalTokens,
          cost: r.cost ?? null,
        })),
        topUsage: usage.usage,
      };
      pollAttempts.push(entry);
      console.log('SDK getUsage', JSON.stringify(entry));
      if (usage.cost || usage.runs?.some((r) => r.cost)) {
        sdkCostFound = entry;
        break;
      }
    } catch (e) {
      pollAttempts.push({ waitedMs: wait, error: e instanceof Error ? e.message : String(e) });
      console.error('SDK getUsage error', e);
    }
  }
  findings.sdkGetUsage = {
    method: 'Agent.getUsage(agentId, { runId, apiKey })',
    requiresNode: true,
    requiresEdge: false,
    note: 'Do NOT put @cursor/sdk into Supabase Edge Functions. Local/dev Node (or a future tiny worker) is enough for cost reconciliation.',
    pollAttempts,
    settled: sdkCostFound,
    conclusion: sdkCostFound
      ? 'SDK returned cost fields — use chargedCents as actual charged cost; rawCostCents as undiscounted.'
      : 'Cost still absent after polls — settlement delay or plan-included/BYOK (chargedCents may stay 0 / cost omitted).',
  };

  // 3) Team admin usage events (may require Enterprise admin key)
  try {
    const res = await fetch('https://api.cursor.com/teams/filtered-usage-events', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: Date.now() - 7 * 24 * 3600_000,
        endDate: Date.now(),
        page: 1,
        pageSize: 20,
      }),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    findings.teamAdminUsageEvents = {
      endpoint: 'POST /teams/filtered-usage-events',
      status: res.status,
      note: 'Enterprise Admin API. Returns chargedCents per event. Correlation via usageUuid / timestamps is experimental.',
      bodyPreview: typeof body === 'string' ? body.slice(0, 500) : body,
      availableUnderThisKey: res.ok,
    };
  } catch (e) {
    findings.teamAdminUsageEvents = { error: String(e) };
  }

  findings.nodeRequirement = {
    forCloudRestLifecycle: false,
    forTokenUsage: false,
    forSdkChargedCents: true,
    recommendation:
      'Keep Edge as authenticated gateway for create/run/cancel/poll/artifacts. Reconcile billed cost asynchronously via a local/dev script or a later tiny Node job calling Agent.getUsage — only if Edge cannot import the SDK (it must not).',
  };

  const outPath = path.join(OUT, 'billing-investigation.json');
  await writeFile(outPath, JSON.stringify(findings, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
