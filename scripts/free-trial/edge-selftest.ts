// Edge-side free-trial self-test (no network, no Supabase). Run with:
//   deno run --allow-env --no-lock scripts/free-trial/edge-selftest.ts
import { requireSpeedVendorsEntitlement, userHasPaidEntitlement } from '../../supabase/functions/_shared/billingEntitlement.ts';
import { safeEqual, secondsSinceMfa } from '../../supabase/functions/_shared/adminAuth.ts';
import {
  deliverTrialReminder,
  trialReminderCopy,
} from '../../supabase/functions/_shared/trialReminders.ts';

let passed = 0;
function check(ok: boolean, msg: string) {
  if (!ok) throw new Error(`FAIL: ${msg}`);
  passed++;
  console.log(`ok   - ${msg}`);
}
async function rejects(fn: () => Promise<unknown>, expected: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof Error && e.message === expected;
  }
}

Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');

// ---------------------------------------------------------------- copy matches the spec verbatim
check(
  trialReminderCopy('3d', 'en').body ===
    'Your SpeedVendors free trial ends in 3 days. You still have full access to your store and all features.',
  '3-day copy matches spec',
);
check(
  trialReminderCopy('1d', 'en').body ===
    'Your SpeedVendors free trial ends tomorrow. Choose a plan to keep your store running with SpeedVendors.',
  '1-day copy matches spec',
);
check(
  trialReminderCopy('expired', 'en').body ===
    'Your free trial has ended. Choose a plan to continue using SpeedVendors. Your store and data are still safe.',
  'expired copy matches spec',
);
check(trialReminderCopy('final', 'ro').title.length > 0 && trialReminderCopy('3d', 'ro', 5).body.includes('5'), 'ro copy present, manual day count honoured');

// ---------------------------------------------------------------- recent-MFA parsing
function jwtWith(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'HS256' })}.${enc(payload)}.sig`;
}
const now = Math.floor(Date.now() / 1000);
const fresh = secondsSinceMfa(jwtWith({ amr: [{ method: 'password', timestamp: now - 9000 }, { method: 'totp', timestamp: now - 40 }] }));
check(fresh !== null && fresh >= 40 && fresh < 50, 'fresh TOTP verification is detected (~40s)');
const stale = secondsSinceMfa(jwtWith({ amr: [{ method: 'totp', timestamp: now - 4000 }] }));
check(stale !== null && stale > 300, 'stale TOTP verification exceeds the 5-minute window');
check(secondsSinceMfa(jwtWith({ amr: [{ method: 'password', timestamp: now }] })) === null, 'password-only session has no MFA proof');
check(secondsSinceMfa(jwtWith({})) === null && secondsSinceMfa('garbage') === null, 'missing/garbled amr is treated as no proof');
check(safeEqual('abc', 'abc') && !safeEqual('abc', 'abd') && !safeEqual('abc', 'abcd'), 'safeEqual');

// ---------------------------------------------------------------- server-side enforcement helper
// deno-lint-ignore no-explicit-any
function fakeAdmin(rpcResult: { data?: unknown; error?: unknown }, enforcement = false): any {
  return {
    rpc: (name: string) => Promise.resolve(name === 'user_has_speedvendors_access' ? rpcResult : { data: null, error: null }),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: table === 'billing_settings' ? { enforcement_enabled: enforcement, grace_period_days: 7 } : null,
              error: null,
            }),
        }),
      }),
    }),
  };
}
await requireSpeedVendorsEntitlement(fakeAdmin({ data: true }), 'u1');
check(true, 'trial/paid user passes the server-side gate');
check(await rejects(() => requireSpeedVendorsEntitlement(fakeAdmin({ data: false }), 'u1'), 'ENTITLEMENT_REQUIRED'),
  'expired trial user is refused by the Edge gate even with the global flag off');
await requireSpeedVendorsEntitlement(fakeAdmin({ data: null, error: { message: 'function does not exist' } }, false), 'legacy');
check(true, 'RPC unavailable + flag off => legacy behaviour preserved (no lock-out during deploy skew)');
Deno.env.set('BILLING_ENFORCEMENT_ENABLED', 'false');
await requireSpeedVendorsEntitlement(fakeAdmin({ data: false }), 'u1');
check(true, 'emergency kill switch BILLING_ENFORCEMENT_ENABLED=false still disables the gate');
Deno.env.delete('BILLING_ENFORCEMENT_ENABLED');

// ---------------------------------------------------------------- paid-only helper (drives has_entitlement)
// deno-lint-ignore no-explicit-any
function rpcAdmin(map: Record<string, { data?: unknown; error?: unknown }>): any {
  return { rpc: (name: string) => Promise.resolve(map[name] ?? { data: null, error: { message: 'missing' } }) };
}
check(await userHasPaidEntitlement(rpcAdmin({ user_has_paid_entitlement: { data: false }, user_has_active_entitlement: { data: true } }), 'u') === false,
  'trial user is NOT reported as a paid subscriber even though the app-access check is true');
check(await userHasPaidEntitlement(rpcAdmin({ user_has_paid_entitlement: { data: true } }), 'u') === true, 'paid subscriber is reported as paid');
check(await userHasPaidEntitlement(rpcAdmin({ user_has_paid_entitlement: { error: { message: 'no fn' } }, user_has_active_entitlement: { data: true } }), 'u') === true,
  'paid helper falls back to the app-access check when the new RPC is not deployed yet');

// ---------------------------------------------------------------- delivery channels
const realFetch = globalThis.fetch;
function stubFetch(pushSent: number) {
  const calls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.includes('send-push-notification')) {
      return Promise.resolve(new Response(JSON.stringify({ sent: pushSent, total: pushSent, success: pushSent > 0 }), { status: 200 }));
    }
    if (url.includes('api.resend.com')) return Promise.resolve(new Response('{}', { status: 200 }));
    return Promise.resolve(new Response('{}', { status: 404 }));
  }) as typeof fetch;
  return calls;
}
// deno-lint-ignore no-explicit-any
const deliveryAdmin: any = {
  auth: { admin: { getUserById: () => Promise.resolve({ data: { user: { id: 'u1', email: 'm@example.com' } }, error: null }) } },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { preferred_language: 'en' } }) }) }) }),
};

let calls = stubFetch(1);
let out = await deliverTrialReminder(deliveryAdmin, { userId: 'u1', milestone: '1d', source: 'cron' });
check(out.status === 'sent' && out.channels.push === 'sent' && out.channels.in_app === 'recorded', 'push delivered => sent');
check(out.channels.email === 'skipped:not_configured' && !calls.some((c) => c.includes('resend')), 'email is skipped (not silently faked) when no provider is configured');

calls = stubFetch(0);
out = await deliverTrialReminder(deliveryAdmin, { userId: 'u1', milestone: 'expired', source: 'cron' });
check(out.status === 'partial' && out.channels.push === 'failed:no_active_device', 'no device + no email provider => partial, reason recorded');

Deno.env.set('RESEND_API_KEY', 'test');
Deno.env.set('TRIAL_EMAIL_FROM', 'SpeedVendors <billing@example.com>');
calls = stubFetch(0);
out = await deliverTrialReminder(deliveryAdmin, { userId: 'u1', milestone: 'final', source: 'manual' });
check(out.status === 'sent' && out.channels.email === 'sent' && calls.some((c) => c.includes('api.resend.com')), 'email provider configured => email sent');
globalThis.fetch = realFetch;

console.log(`\nfree-trial Edge self-test: ${passed} checks passed`);
