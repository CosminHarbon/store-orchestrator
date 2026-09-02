import assert from 'node:assert/strict';
import {
  amountRonFor,
  classifyPlanChange,
  lookupKeyFor,
  mediaQuotaBytesForTier,
  MEDIA_QUOTA_BYTES,
  planFromLookupKey,
  SPEEDVENDORS_PLANS,
  SPEEDVENDORS_PRICE_TAX_BEHAVIOR,
  SPEEDVENDORS_TAX_CODE,
  yearlyMonthlyEquivalentRon,
} from './catalogue';

assert.equal(SPEEDVENDORS_PLANS.start.monthlyAmountRon, 99);
assert.equal(SPEEDVENDORS_PLANS.start.yearlyAmountRon, 990);
assert.equal(SPEEDVENDORS_PLANS.growth.monthlyAmountRon, 229);
assert.equal(SPEEDVENDORS_PLANS.growth.yearlyAmountRon, 2290);
assert.equal(SPEEDVENDORS_PLANS.scale.monthlyAmountRon, 449);
assert.equal(SPEEDVENDORS_PLANS.scale.yearlyAmountRon, 4490);

assert.equal(MEDIA_QUOTA_BYTES.start, 2147483648);
assert.equal(MEDIA_QUOTA_BYTES.growth, 16106127360);
assert.equal(MEDIA_QUOTA_BYTES.scale, 53687091200);
assert.equal(mediaQuotaBytesForTier('growth'), MEDIA_QUOTA_BYTES.growth);

assert.equal(lookupKeyFor('start', 'monthly'), 'speedvendors_start_monthly');
assert.deepEqual(planFromLookupKey('speedvendors_scale_yearly'), {
  tier: 'scale',
  interval: 'yearly',
});

assert.equal(classifyPlanChange(
  { tier: 'start', interval: 'monthly' },
  { tier: 'growth', interval: 'monthly' },
), 'upgrade');
assert.equal(classifyPlanChange(
  { tier: 'scale', interval: 'yearly' },
  { tier: 'start', interval: 'yearly' },
), 'downgrade');
assert.equal(classifyPlanChange(
  { tier: 'growth', interval: 'monthly' },
  { tier: 'growth', interval: 'yearly' },
), 'upgrade');
assert.equal(classifyPlanChange(
  { tier: 'growth', interval: 'yearly' },
  { tier: 'growth', interval: 'monthly' },
), 'downgrade');
assert.equal(amountRonFor('start', 'yearly'), 990);
assert.equal(yearlyMonthlyEquivalentRon('start'), 82.5);
assert.equal(yearlyMonthlyEquivalentRon('growth'), 190.83);
assert.equal(yearlyMonthlyEquivalentRon('scale'), 374.17);
assert.equal(SPEEDVENDORS_TAX_CODE, 'txcd_10103001');
assert.equal(SPEEDVENDORS_PRICE_TAX_BEHAVIOR, 'inclusive');

console.log('plan catalogue tests passed');
