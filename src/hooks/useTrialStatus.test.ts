import assert from 'node:assert/strict';
import { levelForSeconds } from './useTrialStatus';

const HOUR = 3600;
const DAY = 24 * HOUR;

assert.equal(levelForSeconds(0), 'expired');
assert.equal(levelForSeconds(-10), 'expired');
assert.equal(levelForSeconds(HOUR), 'urgent');
assert.equal(levelForSeconds(DAY), 'urgent');
assert.equal(levelForSeconds(DAY + 1), 'warning');
assert.equal(levelForSeconds(2 * DAY + 1), 'notice');
assert.equal(levelForSeconds(3 * DAY + 1), 'calm');
assert.equal(levelForSeconds(7 * DAY), 'calm');

/** Mirrors start_free_trial(): client cannot supply trial window. */
function trialDurationDaysFromServer(settingsDays: number | null | undefined): number {
  return typeof settingsDays === 'number' && settingsDays > 0 ? settingsDays : 7;
}

assert.equal(trialDurationDaysFromServer(7), 7);
assert.equal(trialDurationDaysFromServer(null), 7);

/** Paid Stripe portal vs trial plan-selection CTA. */
function billingPrimaryAction(opts: {
  hasPaidSubscription: boolean;
  trialActive: boolean;
}): 'portal' | 'subscribe' {
  if (opts.hasPaidSubscription) return 'portal';
  return 'subscribe';
}

assert.equal(billingPrimaryAction({ hasPaidSubscription: false, trialActive: true }), 'subscribe');
assert.equal(billingPrimaryAction({ hasPaidSubscription: true, trialActive: false }), 'portal');
assert.equal(billingPrimaryAction({ hasPaidSubscription: false, trialActive: false }), 'subscribe');

/** Access gate: paid or active trial. */
function merchantMayUseApp(opts: {
  isSuperadmin?: boolean;
  hasAccess: boolean;
}): boolean {
  if (opts.isSuperadmin) return true;
  return opts.hasAccess === true;
}

assert.equal(merchantMayUseApp({ hasAccess: true }), true);
assert.equal(merchantMayUseApp({ hasAccess: false }), false);
assert.equal(merchantMayUseApp({ isSuperadmin: true, hasAccess: false }), true);

/** Stale Edge must not wipe RPC trial access. */
function mergeAccess(rpcHasAccess: boolean, edgeHasAccess: boolean): boolean {
  const merged = edgeHasAccess;
  return rpcHasAccess === true ? true : merged;
}

assert.equal(mergeAccess(true, false), true);
assert.equal(mergeAccess(false, false), false);
assert.equal(mergeAccess(false, true), true);

console.log('trial status + entitlement helper tests passed');
