import assert from 'node:assert/strict';
import {
  preferPlansEmphasis,
  preferTrialEmphasis,
  readSignupIntent,
  resolveTrialCtaVisibility,
} from './trialCtaVisibility';

assert.equal(readSignupIntent('trial'), 'trial');
assert.equal(readSignupIntent('subscribe'), 'subscribe');
assert.equal(readSignupIntent(null), null);
assert.equal(preferTrialEmphasis('trial'), true);
assert.equal(preferTrialEmphasis(null), false);
assert.equal(preferPlansEmphasis('subscribe'), true);
assert.equal(preferPlansEmphasis('trial'), false);

// Eligible no-entitlement → Start trial
assert.equal(
  resolveTrialCtaVisibility({
    hasPaidEntitlement: false,
    trialLoading: false,
    trialEligible: true,
    trialActive: false,
    trialExpired: false,
  }),
  'start',
);

// Generic / no-intent / still loading → still Start trial (must not hide)
assert.equal(
  resolveTrialCtaVisibility({
    hasPaidEntitlement: false,
    trialLoading: true,
    trialEligible: undefined,
    trialActive: false,
    trialExpired: false,
  }),
  'start',
);

// Unknown status (RPC not yet) → Start trial
assert.equal(
  resolveTrialCtaVisibility({
    hasPaidEntitlement: false,
    trialLoading: false,
    trialEligible: undefined,
    trialActive: false,
    trialExpired: false,
  }),
  'start',
);

// intent=subscribe must NOT remove trial visibility
assert.equal(
  resolveTrialCtaVisibility({
    hasPaidEntitlement: false,
    trialLoading: false,
    trialEligible: true,
    trialActive: false,
    trialExpired: false,
  }),
  'start',
);

// Paid → hidden
assert.equal(
  resolveTrialCtaVisibility({
    hasPaidEntitlement: true,
    trialLoading: false,
    trialEligible: true,
    trialActive: false,
    trialExpired: false,
  }),
  'hidden',
);

// Active trial → continue
assert.equal(
  resolveTrialCtaVisibility({
    hasPaidEntitlement: false,
    trialLoading: false,
    trialEligible: false,
    trialActive: true,
    trialExpired: false,
  }),
  'continue',
);

// Expired → ended (cannot restart)
assert.equal(
  resolveTrialCtaVisibility({
    hasPaidEntitlement: false,
    trialLoading: false,
    trialEligible: false,
    trialActive: false,
    trialExpired: true,
  }),
  'ended',
);

// Legacy ineligible → hidden
assert.equal(
  resolveTrialCtaVisibility({
    hasPaidEntitlement: false,
    trialLoading: false,
    trialEligible: false,
    trialActive: false,
    trialExpired: false,
    planState: 'legacy',
  }),
  'hidden',
);

console.log('trial CTA visibility tests passed');
