/**
 * eAWB setup readiness helpers.
 * An API key alone is NOT a successful connection — pickup + billing addresses
 * are required before we treat shipping as connected.
 */

export type EawbSetupProfile = {
  eawb_api_key?: string | null;
  eawb_shipping_address_id?: number | null;
  eawb_billing_address_id?: number | null;
  shipping_provider?: string | null;
};

export function hasEawbApiKey(profile: EawbSetupProfile | null | undefined): boolean {
  return Boolean(profile?.eawb_api_key?.trim());
}

export function isEawbSetupComplete(profile: EawbSetupProfile | null | undefined): boolean {
  if (!hasEawbApiKey(profile)) return false;
  const shippingId = profile?.eawb_shipping_address_id;
  const billingId = profile?.eawb_billing_address_id;
  return (
    typeof shippingId === 'number' &&
    Number.isFinite(shippingId) &&
    shippingId > 0 &&
    typeof billingId === 'number' &&
    Number.isFinite(billingId) &&
    billingId > 0
  );
}

/** Key saved but required wizard steps (addresses) not finished. */
export function isEawbSetupIncomplete(profile: EawbSetupProfile | null | undefined): boolean {
  return hasEawbApiKey(profile) && !isEawbSetupComplete(profile);
}

/** Onboarding / dashboard: shipping step done. */
export function isShippingIntegrationReady(profile: EawbSetupProfile | null | undefined): boolean {
  if (profile?.shipping_provider === 'manual') return true;
  return isEawbSetupComplete(profile);
}
