import type { CheckoutFormState } from '@/lib/storefront/types';

export function usesDeliveryAsBilling(
  form: Pick<CheckoutFormState, 'delivery_type' | 'billing_same_as_delivery'>
) {
  return form.delivery_type === 'home' && form.billing_same_as_delivery !== false;
}

export function composeStreetAddress(input: {
  street?: string | null;
  street_number?: string | null;
  block?: string | null;
  apartment?: string | null;
  city?: string | null;
  county?: string | null;
}) {
  const line = [input.street, input.street_number].filter(Boolean);
  if (input.block) line.push(`bl. ${input.block}`);
  if (input.apartment) line.push(`ap. ${input.apartment}`);
  const locality = [input.city, input.county].filter(Boolean).join(', ');
  return [line.join(' '), locality].filter(Boolean).join(', ');
}

export function isBillingComplete(form: CheckoutFormState) {
  if (usesDeliveryAsBilling(form)) {
    return !!(form.county && form.city && form.street && form.street_number);
  }
  return !!(
    form.billing_county &&
    form.billing_city &&
    form.billing_street &&
    form.billing_street_number
  );
}

export function resolvedBilling(form: CheckoutFormState) {
  if (usesDeliveryAsBilling(form)) {
    return {
      billing_same_as_delivery: true,
      billing_city: form.city,
      billing_county: form.county,
      billing_street: form.street,
      billing_street_number: form.street_number,
      billing_block: form.block || null,
      billing_apartment: form.apartment || null,
      billing_address: composeStreetAddress({
        street: form.street,
        street_number: form.street_number,
        block: form.block,
        apartment: form.apartment,
        city: form.city,
        county: form.county,
      }),
    };
  }
  return {
    billing_same_as_delivery: false,
    billing_city: form.billing_city,
    billing_county: form.billing_county,
    billing_street: form.billing_street,
    billing_street_number: form.billing_street_number,
    billing_block: form.billing_block || null,
    billing_apartment: form.billing_apartment || null,
    billing_address: composeStreetAddress({
      street: form.billing_street,
      street_number: form.billing_street_number,
      block: form.billing_block,
      apartment: form.billing_apartment,
      city: form.billing_city,
      county: form.billing_county,
    }),
  };
}
