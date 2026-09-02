/**
 * Resolve / ensure the SpeedVendors Stripe product + six lookup-key prices.
 * Never accept client-supplied price IDs or amounts.
 */

import {
  ALL_LOOKUP_KEYS,
  LEGACY_SANDBOX_PRICE_MAP,
  SPEEDVENDORS_CURRENCY,
  SPEEDVENDORS_PLANS,
  SPEEDVENDORS_PRICE_TAX_BEHAVIOR,
  SPEEDVENDORS_PRODUCT_NAME,
  SPEEDVENDORS_TAX_CODE,
  SPEEDVENDORS_TIERS,
  amountMinorFor,
  intervalFromStripe,
  lookupKeyFor,
  parseInterval,
  parseTier,
  planFromLookupKey,
  priceMetadata,
  stripeIntervalFor,
  type BillingInterval,
  type SpeedVendorsTier,
} from './speedvendorsPlans.ts';
import {
  getBillingAppOrigin,
  stripeBillingFormPost,
  stripeBillingGet,
  subscriptionIdFromInvoice,
} from './billingStripe.ts';

export type ResolvedSpeedVendorsPrice = {
  priceId: string;
  productId: string;
  lookupKey: string;
  tier: SpeedVendorsTier;
  interval: BillingInterval;
  unitAmount: number | null;
  currency: string | null;
  taxBehavior: string | null;
  active?: boolean;
  livemode?: boolean;
  mediaQuotaBytes?: string | null;
  metadataTier?: string | null;
  metadataInterval?: string | null;
  lookupMatchCount?: number;
};

const priceCache = new Map<string, ResolvedSpeedVendorsPrice>();
let productCache: { id: string; livemode: boolean } | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stringField(obj: Record<string, unknown> | null, key: string): string | null {
  const value = obj?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function identifyPrice(params: {
  priceId?: string | null;
  lookupKey?: string | null;
  metadata?: Record<string, unknown> | null;
  billingInterval?: 'month' | 'year' | null;
}): { tier: SpeedVendorsTier; interval: BillingInterval } | null {
  const fromLookup = planFromLookupKey(params.lookupKey);
  if (fromLookup) return fromLookup;

  if (params.priceId && LEGACY_SANDBOX_PRICE_MAP[params.priceId]) {
    return LEGACY_SANDBOX_PRICE_MAP[params.priceId];
  }

  const meta = params.metadata || {};
  const tier = parseTier(typeof meta.tier === 'string' ? meta.tier : null);
  const interval =
    parseInterval(typeof meta.billing_interval === 'string' ? meta.billing_interval : null) ||
    intervalFromStripe(params.billingInterval);
  if (tier && interval) return { tier, interval };
  if (interval) return { tier: 'start', interval };
  return null;
}

function resolvedFromPriceObject(price: Record<string, unknown>): ResolvedSpeedVendorsPrice | null {
  const priceId = stringField(price, 'id');
  if (!priceId?.startsWith('price_')) return null;
  const lookupKey = stringField(price, 'lookup_key');
  const metadata = asRecord(price.metadata);
  const recurring = asRecord(price.recurring);
  const billingInterval = recurring?.interval === 'year' || recurring?.interval === 'month'
    ? recurring.interval
    : null;
  const identified = identifyPrice({
    priceId,
    lookupKey,
    metadata,
    billingInterval,
  });
  if (!identified) return null;

  const productRaw = price.product;
  const productId =
    typeof productRaw === 'string'
      ? productRaw
      : stringField(asRecord(productRaw), 'id');

  return {
    priceId,
    productId: productId || '',
    lookupKey: lookupKey || lookupKeyFor(identified.tier, identified.interval),
    tier: identified.tier,
    interval: identified.interval,
    unitAmount: typeof price.unit_amount === 'number' ? price.unit_amount : null,
    currency: stringField(price, 'currency'),
    taxBehavior: stringField(price, 'tax_behavior'),
    active: price.active !== false,
    livemode: price.livemode === true,
    mediaQuotaBytes: metadata ? (typeof metadata.media_quota_bytes === 'string' || typeof metadata.media_quota_bytes === 'number' ? String(metadata.media_quota_bytes) : null) : null,
    metadataTier: metadata ? stringField(metadata, 'tier') : null,
    metadataInterval: metadata ? stringField(metadata, 'billing_interval') : null,
  };
}

async function listPriceByLookupKey(
  secretKey: string,
  lookupKey: string,
): Promise<ResolvedSpeedVendorsPrice | null> {
  const raw = await stripeBillingGet(
    secretKey,
    `/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=2`,
  );
  const data = Array.isArray(raw.data) ? raw.data : [];
  let resolved: ResolvedSpeedVendorsPrice | null = null;
  for (const item of data) {
    const rec = asRecord(item);
    if (!rec) continue;
    const next = resolvedFromPriceObject(rec);
    if (next) {
      resolved = next;
      break;
    }
  }
  if (resolved) resolved.lookupMatchCount = data.length;
  return resolved;
}

export async function resolveSpeedVendorsPrice(
  secretKey: string,
  tier: SpeedVendorsTier,
  interval: BillingInterval,
  options?: { allowCreate?: boolean },
): Promise<ResolvedSpeedVendorsPrice> {
  const lookupKey = lookupKeyFor(tier, interval);
  const cached = priceCache.get(lookupKey);
  if (cached) return cached;

  const listed = await listPriceByLookupKey(secretKey, lookupKey);
  if (listed) {
    priceCache.set(lookupKey, listed);
    return listed;
  }
  if (options?.allowCreate) {
    const catalogue = await ensureSpeedVendorsCatalogue(secretKey);
    const created = catalogue.prices.find((p) => p.lookupKey === lookupKey);
    if (created) return created;
  }
  throw new Error('STRIPE_PRICE_LOOKUP_FAILED');
}

export async function resolveSpeedVendorsPriceMap(
  secretKey: string,
): Promise<Record<string, ResolvedSpeedVendorsPrice>> {
  const out: Record<string, ResolvedSpeedVendorsPrice> = {};
  for (const key of ALL_LOOKUP_KEYS) {
    const listed = await listPriceByLookupKey(secretKey, key);
    if (listed) {
      priceCache.set(key, listed);
      out[key] = listed;
    }
  }
  return out;
}

async function listProductPricesPage(
  secretKey: string,
  productId: string,
  active: boolean,
): Promise<Record<string, unknown>[]> {
  const raw = await stripeBillingGet(
    secretKey,
    `/prices?product=${encodeURIComponent(productId)}&active=${active ? 'true' : 'false'}&limit=100`,
  );
  return Array.isArray(raw.data) ? raw.data.filter((item): item is Record<string, unknown> => Boolean(asRecord(item))) : [];
}

export async function inspectProductPriceInventory(
  secretKey: string,
  productId: string | null,
): Promise<{
  productId: string | null;
  prices: Array<{
    id: string | null;
    active: boolean;
    livemode: boolean;
    lookup_key: string | null;
    tax_behavior: string | null;
    unit_amount: number | null;
    currency: string | null;
  }>;
  lookup_key_any_status: Record<string, Array<{
    id: string | null;
    active: boolean;
    tax_behavior: string | null;
  }>>;
}> {
  const prices: Array<{
    id: string | null;
    active: boolean;
    livemode: boolean;
    lookup_key: string | null;
    tax_behavior: string | null;
    unit_amount: number | null;
    currency: string | null;
  }> = [];
  if (productId?.startsWith('prod_')) {
    const listed = [
      ...(await listProductPricesPage(secretKey, productId, true)),
      ...(await listProductPricesPage(secretKey, productId, false)),
    ];
    for (const rec of listed) {
      prices.push({
        id: stringField(rec, 'id'),
        active: rec.active !== false,
        livemode: rec.livemode === true,
        lookup_key: stringField(rec, 'lookup_key'),
        tax_behavior: stringField(rec, 'tax_behavior'),
        unit_amount: typeof rec.unit_amount === 'number' ? rec.unit_amount : null,
        currency: stringField(rec, 'currency'),
      });
    }
  }

  const lookup_key_any_status: Record<string, Array<{
    id: string | null;
    active: boolean;
    tax_behavior: string | null;
  }>> = {};
  for (const key of ALL_LOOKUP_KEYS) {
    const raw = await stripeBillingGet(
      secretKey,
      `/prices?lookup_keys[]=${encodeURIComponent(key)}&limit=10`,
    );
    const data = Array.isArray(raw.data) ? raw.data : [];
    lookup_key_any_status[key] = data.map((item) => {
      const rec = asRecord(item) || {};
      return {
        id: stringField(rec, 'id'),
        active: rec.active !== false,
        tax_behavior: stringField(rec, 'tax_behavior'),
      };
    });
  }

  return { productId, prices, lookup_key_any_status };
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function taxSummary(obj: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!obj) return null;
  const automaticTax = asRecord(obj.automatic_tax);
  const totalDetails = asRecord(obj.total_details);
  return {
    automatic_tax: automaticTax
      ? {
          enabled: automaticTax.enabled === true,
          status: stringField(automaticTax, 'status'),
        }
      : obj.automatic_tax ?? null,
    amount_subtotal: obj.amount_subtotal ?? obj.subtotal ?? null,
    amount_total: obj.amount_total ?? obj.total ?? obj.amount_paid ?? null,
    amount_tax: obj.tax ?? totalDetails?.amount_tax ?? null,
    currency: stringField(obj, 'currency'),
  };
}

export async function inspectLivePurchase(params: {
  secretKey: string;
  subscriptionId: string;
  eventIds: string[];
  createPortalSession: boolean;
}): Promise<Record<string, unknown>> {
  const { secretKey, subscriptionId, eventIds, createPortalSession } = params;
  const subRaw = await inspectGet(
    secretKey,
    `/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price`,
  );
  const sub = subRaw.data;
  const items = Array.isArray(asRecord(sub?.items)?.data) ? asRecord(sub?.items)!.data as unknown[] : [];
  const firstItem = asRecord(items[0]);
  const price = asRecord(firstItem?.price);
  const recurring = asRecord(price?.recurring);
  const periodStart = firstItem?.current_period_start ?? sub?.current_period_start;
  const periodEnd = firstItem?.current_period_end ?? sub?.current_period_end;
  const customerId = typeof sub?.customer === 'string'
    ? sub.customer
    : stringField(asRecord(sub?.customer), 'id');

  const customerRaw = customerId
    ? await inspectGet(secretKey, `/customers/${encodeURIComponent(customerId)}`)
    : { data: null, error: 'CUSTOMER_MISSING' };
  const customer = customerRaw.data;
  const customerMeta = asRecord(customer?.metadata);

  const sessionsRaw = await inspectGet(
    secretKey,
    `/checkout/sessions?subscription=${encodeURIComponent(subscriptionId)}&limit=5`,
  );
  const sessionList = Array.isArray(sessionsRaw.data?.data) ? sessionsRaw.data.data : [];
  const sessions = sessionList.map((item) => {
    const rec = asRecord(item) || {};
    const meta = asRecord(rec.metadata);
    return {
      id: stringField(rec, 'id'),
      livemode: rec.livemode === true,
      mode: stringField(rec, 'mode'),
      status: stringField(rec, 'status'),
      payment_status: stringField(rec, 'payment_status'),
      customer: typeof rec.customer === 'string' ? rec.customer : stringField(asRecord(rec.customer), 'id'),
      subscription: typeof rec.subscription === 'string'
        ? rec.subscription
        : stringField(asRecord(rec.subscription), 'id'),
      client_reference_id: stringField(rec, 'client_reference_id'),
      metadata: meta,
      amount: taxSummary(rec),
      success_url: stringField(rec, 'success_url'),
      cancel_url: stringField(rec, 'cancel_url'),
    };
  });

  const invoicesRaw = await inspectGet(
    secretKey,
    `/invoices?subscription=${encodeURIComponent(subscriptionId)}&limit=5`,
  );
  const invoiceList = Array.isArray(invoicesRaw.data?.data) ? invoicesRaw.data.data : [];
  const invoices = invoiceList.map((item) => {
    const rec = asRecord(item) || {};
    const lines = asRecord(rec.lines);
    const lineData = Array.isArray(lines?.data) ? lines.data : [];
    const firstLine = asRecord(lineData[0]);
    const linePrice = asRecord(firstLine?.price) || asRecord(asRecord(firstLine?.pricing)?.price_details);
    return {
      id: stringField(rec, 'id'),
      livemode: rec.livemode === true,
      status: stringField(rec, 'status'),
      billing_reason: stringField(rec, 'billing_reason'),
      customer: typeof rec.customer === 'string' ? rec.customer : stringField(asRecord(rec.customer), 'id'),
      subscription: subscriptionIdFromInvoice(rec),
      amount: taxSummary(rec),
      line_price_id: stringField(linePrice, 'price') || stringField(linePrice, 'id') || stringField(asRecord(firstLine?.price), 'id'),
    };
  });

  const customerSubsRaw = await inspectGet(
    secretKey,
    `/subscriptions?customer=${encodeURIComponent(customerId || '')}&status=all&limit=10`,
  );
  const customerSubs = Array.isArray(customerSubsRaw.data?.data)
    ? customerSubsRaw.data.data.map((item) => {
        const rec = asRecord(item) || {};
        return {
          id: stringField(rec, 'id'),
          livemode: rec.livemode === true,
          status: stringField(rec, 'status'),
        };
      })
    : [];

  const events: Array<Record<string, unknown>> = [];
  for (const eventId of eventIds) {
    const retrieved = await inspectGet(secretKey, `/events/${encodeURIComponent(eventId)}`);
    const rec = retrieved.data;
    const obj = asRecord(asRecord(rec?.data)?.object);
    events.push({
      id: stringField(rec, 'id'),
      type: stringField(rec, 'type'),
      livemode: rec?.livemode === true,
      error: retrieved.error,
      object_id: stringField(obj, 'id'),
      pending_webhooks: rec?.pending_webhooks ?? null,
    });
  }

  let portal: Record<string, unknown> | null = null;
  let portalError: string | null = null;
  if (createPortalSession && customerId?.startsWith('cus_')) {
    try {
      const form = new URLSearchParams();
      form.set('customer', customerId);
      form.set('return_url', `${getBillingAppOrigin()}/app?tab=settings`);
      const configurationId = (Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID') || '').trim();
      if (configurationId.startsWith('bpc_')) {
        form.set('configuration', configurationId);
      }
      const created = await stripeBillingFormPost(secretKey, '/billing_portal/sessions', form);
      const url = stringField(created, 'url');
      let urlHost: string | null = null;
      try {
        urlHost = url ? new URL(url).host : null;
      } catch {
        urlHost = null;
      }
      portal = {
        created: true,
        livemode: created.livemode === true,
        customer: typeof created.customer === 'string'
          ? created.customer
          : stringField(asRecord(created.customer), 'id'),
        configuration: typeof created.configuration === 'string'
          ? created.configuration
          : stringField(asRecord(created.configuration), 'id'),
        return_url: stringField(created, 'return_url'),
        url_host: urlHost,
        url_is_stripe_billing: Boolean(urlHost && urlHost.includes('billing.stripe.com')),
      };
    } catch (err) {
      portalError = err instanceof Error ? err.message : 'PORTAL_SESSION_FAILED';
    }
  }

  const productId = typeof price?.product === 'string'
    ? price.product
    : stringField(asRecord(price?.product), 'id');

  return {
    subscription: sub
      ? {
          id: stringField(sub, 'id'),
          livemode: sub.livemode === true,
          status: stringField(sub, 'status'),
          customer: customerId,
          cancel_at_period_end: sub.cancel_at_period_end === true,
          current_period_start: unixSecondsToIso(periodStart),
          current_period_end: unixSecondsToIso(periodEnd),
          metadata: asRecord(sub.metadata),
          items_count: items.length,
          price: price
            ? {
                id: stringField(price, 'id'),
                lookup_key: stringField(price, 'lookup_key'),
                product: productId,
                unit_amount: price.unit_amount ?? null,
                currency: stringField(price, 'currency'),
                tax_behavior: stringField(price, 'tax_behavior'),
                interval: stringField(recurring, 'interval'),
                metadata: asRecord(price.metadata),
              }
            : null,
        }
      : null,
    subscriptionError: subRaw.error,
    customer: customer
      ? {
          id: stringField(customer, 'id'),
          livemode: customer.livemode === true,
          metadata_user_id: stringField(customerMeta, 'speedvendors_user_id'),
          deleted: customer.deleted === true,
        }
      : null,
    customerError: customerRaw.error,
    checkout_sessions: sessions,
    checkoutSessionsError: sessionsRaw.error,
    invoices,
    invoicesError: invoicesRaw.error,
    customer_subscriptions: customerSubs,
    events,
    portal,
    portalError,
  };
}

async function findProductByName(
  secretKey: string,
  name: string,
): Promise<string | null> {
  const raw = await stripeBillingGet(
    secretKey,
    `/products?active=true&limit=100`,
  );
  const data = Array.isArray(raw.data) ? raw.data : [];
  for (const item of data) {
    const rec = asRecord(item);
    if (!rec) continue;
    if (stringField(rec, 'name') === name) {
      const id = stringField(rec, 'id');
      if (id?.startsWith('prod_')) return id;
    }
  }
  return null;
}

export async function ensureSpeedVendorsProduct(secretKey: string): Promise<string> {
  const livemode = secretKey.startsWith('sk_live_');
  if (productCache?.id && productCache.livemode === livemode) {
    await ensureProductTaxCode(secretKey, productCache.id);
    return productCache.id;
  }
  const existing = await findProductByName(secretKey, SPEEDVENDORS_PRODUCT_NAME);
  if (existing) {
    await ensureProductTaxCode(secretKey, existing);
    productCache = { id: existing, livemode };
    return existing;
  }
  const form = new URLSearchParams();
  form.set('name', SPEEDVENDORS_PRODUCT_NAME);
  form.set('description', 'SpeedVendors merchant subscription');
  form.set('tax_code', SPEEDVENDORS_TAX_CODE);
  form.set('metadata[platform]', 'speedvendors');
  form.set('metadata[catalogue]', 'start_growth_scale');
  const created = await stripeBillingFormPost(secretKey, '/products', form);
  const id = stringField(created, 'id');
  if (!id?.startsWith('prod_')) throw new Error('STRIPE_PRODUCT_CREATE_FAILED');
  productCache = { id, livemode: created.livemode === true };
  return id;
}

async function ensureProductTaxCode(secretKey: string, productId: string): Promise<void> {
  const current = await stripeBillingGet(secretKey, `/products/${encodeURIComponent(productId)}`);
  if (stringField(current, 'tax_code') === SPEEDVENDORS_TAX_CODE) return;
  const form = new URLSearchParams();
  form.set('tax_code', SPEEDVENDORS_TAX_CODE);
  await stripeBillingFormPost(secretKey, `/products/${encodeURIComponent(productId)}`, form);
}

function priceMatchesCatalogue(
  price: ResolvedSpeedVendorsPrice,
  tier: SpeedVendorsTier,
  interval: BillingInterval,
): boolean {
  return (
    price.taxBehavior === SPEEDVENDORS_PRICE_TAX_BEHAVIOR &&
    price.unitAmount === amountMinorFor(tier, interval) &&
    (price.currency || '').toLowerCase() === SPEEDVENDORS_CURRENCY &&
    price.tier === tier &&
    price.interval === interval &&
    price.active !== false
  );
}

async function archivePrice(secretKey: string, priceId: string): Promise<void> {
  await stripeBillingFormPost(
    secretKey,
    `/prices/${encodeURIComponent(priceId)}`,
    new URLSearchParams({ active: 'false' }),
  );
}

function priceCreateForm(
  productId: string,
  tier: SpeedVendorsTier,
  interval: BillingInterval,
): URLSearchParams {
  const lookupKey = lookupKeyFor(tier, interval);
  const meta = priceMetadata(tier, interval);
  const form = new URLSearchParams();
  form.set('product', productId);
  form.set('currency', SPEEDVENDORS_CURRENCY);
  form.set('unit_amount', String(amountMinorFor(tier, interval)));
  form.set('lookup_key', lookupKey);
  form.set('transfer_lookup_key', 'true');
  form.set('tax_behavior', SPEEDVENDORS_PRICE_TAX_BEHAVIOR);
  form.set('nickname', `${SPEEDVENDORS_PLANS[tier].name} ${interval}`);
  form.set('recurring[interval]', stripeIntervalFor(interval));
  form.set('recurring[interval_count]', '1');
  for (const [k, v] of Object.entries(meta)) {
    form.set(`metadata[${k}]`, v);
  }
  return form;
}

export async function ensureSpeedVendorsPrice(
  secretKey: string,
  productId: string,
  tier: SpeedVendorsTier,
  interval: BillingInterval,
): Promise<ResolvedSpeedVendorsPrice> {
  const lookupKey = lookupKeyFor(tier, interval);
  const existing = await listPriceByLookupKey(secretKey, lookupKey);
  if (existing && priceMatchesCatalogue(existing, tier, interval)) {
    priceCache.set(lookupKey, existing);
    return existing;
  }

  const created = await stripeBillingFormPost(
    secretKey,
    '/prices',
    priceCreateForm(productId, tier, interval),
  );
  const resolved = resolvedFromPriceObject(created);
  if (!resolved || resolved.taxBehavior !== SPEEDVENDORS_PRICE_TAX_BEHAVIOR) {
    throw new Error('STRIPE_PRICE_CREATE_FAILED');
  }

  if (existing && existing.priceId !== resolved.priceId) {
    try {
      await archivePrice(secretKey, existing.priceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      console.error('archive superseded stripe price failed', {
        lookup_key: lookupKey,
        message,
      });
    }
  }

  priceCache.set(lookupKey, resolved);
  return resolved;
}

async function archiveOrphanCataloguePrices(
  secretKey: string,
  productId: string,
  keepPriceIds: Set<string>,
): Promise<string[]> {
  const archived: string[] = [];
  const raw = await stripeBillingGet(
    secretKey,
    `/prices?product=${encodeURIComponent(productId)}&active=true&limit=100`,
  );
  const data = Array.isArray(raw.data) ? raw.data : [];
  for (const item of data) {
    const rec = asRecord(item);
    if (!rec) continue;
    const resolved = resolvedFromPriceObject(rec);
    if (!resolved) continue;
    if (keepPriceIds.has(resolved.priceId)) continue;
    try {
      await archivePrice(secretKey, resolved.priceId);
      archived.push(resolved.priceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      console.error('archive orphan catalogue price failed', { message });
    }
  }
  return archived;
}

export async function ensureSpeedVendorsCatalogue(secretKey: string): Promise<{
  productId: string;
  prices: ResolvedSpeedVendorsPrice[];
  archivedPriceIds: string[];
}> {
  priceCache.clear();
  productCache = null;
  const productId = await ensureSpeedVendorsProduct(secretKey);
  const prices: ResolvedSpeedVendorsPrice[] = [];
  for (const tier of SPEEDVENDORS_TIERS) {
    for (const interval of ['monthly', 'yearly'] as const) {
      prices.push(await ensureSpeedVendorsPrice(secretKey, productId, tier, interval));
    }
  }
  const archivedPriceIds = await archiveOrphanCataloguePrices(
    secretKey,
    productId,
    new Set(prices.map((p) => p.priceId)),
  );
  return { productId, prices, archivedPriceIds };
}

/**
 * Tax-ready Checkout fields. automatic_tax stays unset/off until VAT registrations exist.
 * VAT ID is optional so private individuals can subscribe.
 */
export function applySpeedVendorsCheckoutCustomerFields(params: URLSearchParams): void {
  params.set('billing_address_collection', 'required');
  params.set('tax_id_collection[enabled]', 'true');
  params.set('customer_update[address]', 'auto');
  params.set('customer_update[name]', 'auto');
}

async function inspectGet(
  secretKey: string,
  path: string,
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  try {
    const data = await stripeBillingGet(secretKey, path);
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'STRIPE_GET_FAILED',
    };
  }
}

function publicAccountAudit(account: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!account) return null;
  const profile = asRecord(account.business_profile);
  const company = asRecord(account.company);
  const individual = asRecord(account.individual);
  const settings = asRecord(account.settings);
  const dashboard = asRecord(settings?.dashboard);
  return {
    id: stringField(account, 'id'),
    livemode: account.livemode === true,
    country: stringField(account, 'country'),
    default_currency: stringField(account, 'default_currency'),
    business_type: stringField(account, 'business_type'),
    charges_enabled: account.charges_enabled === true,
    details_submitted: account.details_submitted === true,
    business_profile: profile
      ? {
          name: stringField(profile, 'name'),
          support_address: profile.support_address ?? null,
          support_url: stringField(profile, 'support_url'),
          url: stringField(profile, 'url'),
          mcc: stringField(profile, 'mcc'),
          product_description: stringField(profile, 'product_description'),
        }
      : null,
    company: company
      ? {
          name: stringField(company, 'name'),
          address: company.address ?? null,
          tax_id_provided: company.tax_id_provided === true,
          vat_id_provided: company.vat_id_provided === true,
        }
      : null,
    individual_present: Boolean(individual),
    dashboard_display_name: stringField(dashboard, 'display_name'),
  };
}

export async function inspectStripeTax(
  secretKey: string,
  productIdOverride?: string | null,
): Promise<{
  taxSettings: Record<string, unknown> | null;
  taxSettingsError: string | null;
  taxRegistrations: unknown[] | null;
  taxRegistrationsError: string | null;
  taxRates: unknown[] | null;
  taxRatesError: string | null;
  account: Record<string, unknown> | null;
  accountError: string | null;
  product: Record<string, unknown> | null;
  productError: string | null;
}> {
  const settings = await inspectGet(secretKey, '/tax/settings');
  const registrations = await inspectGet(secretKey, '/tax/registrations?limit=100');
  const rates = await inspectGet(secretKey, '/tax_rates?active=true&limit=100');
  const account = await inspectGet(secretKey, '/account');
  const namedProductId = await findProductByName(secretKey, SPEEDVENDORS_PRODUCT_NAME);
  const productId = (productIdOverride && productIdOverride.startsWith('prod_')
    ? productIdOverride
    : namedProductId);
  const product = productId
    ? await inspectGet(secretKey, `/products/${encodeURIComponent(productId)}`)
    : { data: null, error: 'PRODUCT_NOT_FOUND' };

  const registrationList = Array.isArray(registrations.data?.data) ? registrations.data.data : null;
  const rateList = Array.isArray(rates.data?.data) ? rates.data.data : null;
  const productRec = product.data;

  return {
    taxSettings: settings.data,
    taxSettingsError: settings.error,
    taxRegistrations: registrationList,
    taxRegistrationsError: registrations.error,
    taxRates: rateList
      ? rateList.map((item) => {
          const rec = asRecord(item);
          if (!rec) return item;
          return {
            id: stringField(rec, 'id'),
            display_name: stringField(rec, 'display_name'),
            percentage: rec.percentage,
            inclusive: rec.inclusive,
            country: stringField(rec, 'country'),
            jurisdiction: stringField(rec, 'jurisdiction'),
            active: rec.active === true,
            livemode: rec.livemode === true,
          };
        })
      : null,
    taxRatesError: rates.error,
    account: publicAccountAudit(account.data),
    accountError: account.error,
    product: productRec
      ? {
          id: stringField(productRec, 'id'),
          name: stringField(productRec, 'name'),
          tax_code: stringField(productRec, 'tax_code'),
          livemode: productRec.livemode === true,
        }
      : null,
    productError: product.error,
  };
}

const REQUIRED_BILLING_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
] as const;

export async function inspectLiveBillingOps(secretKey: string): Promise<{
  webhooks: unknown[];
  webhooksError: string | null;
  portal: Record<string, unknown> | null;
  portalError: string | null;
  portalConfigurationIdConfigured: boolean;
  webhookSecretConfigured: boolean;
  appOrigin: string | null;
  appOriginError: string | null;
}> {
  const webhooks = await inspectGet(secretKey, '/webhook_endpoints?limit=100');
  const configurationId = (Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID') || '').trim();
  const webhookSecret = (Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET') || '').trim();
  let appOrigin: string | null = null;
  let appOriginError: string | null = null;
  try {
    appOrigin = getBillingAppOrigin();
  } catch (err) {
    appOriginError = err instanceof Error ? err.message : 'APP_ORIGIN_INVALID';
  }

  let portal: Record<string, unknown> | null = null;
  let portalError: string | null = null;
  if (configurationId.startsWith('bpc_')) {
    const retrieved = await inspectGet(
      secretKey,
      `/billing_portal/configurations/${encodeURIComponent(configurationId)}`,
    );
    portal = retrieved.data
      ? publicPortalAudit(retrieved.data)
      : null;
    portalError = retrieved.error;
  } else {
    portalError = 'STRIPE_PORTAL_CONFIGURATION_ID_MISSING';
  }

  const hookList = Array.isArray(webhooks.data?.data) ? webhooks.data.data : [];
  const webhookAudit = hookList.map((item) => {
    const rec = asRecord(item);
    if (!rec) return item;
    const events = Array.isArray(rec.enabled_events) ? rec.enabled_events.map(String) : [];
    const missing = REQUIRED_BILLING_WEBHOOK_EVENTS.filter((e) => !events.includes(e) && !events.includes('*'));
    return {
      id: stringField(rec, 'id'),
      url: stringField(rec, 'url'),
      livemode: rec.livemode === true,
      status: stringField(rec, 'status'),
      api_version: stringField(rec, 'api_version'),
      enabled_events: events,
      missing_required_events: missing,
      matches_billing_function: (stringField(rec, 'url') || '').includes('/functions/v1/billing-stripe-webhook'),
    };
  });

  return {
    webhooks: webhookAudit,
    webhooksError: webhooks.error,
    portal,
    portalError,
    portalConfigurationIdConfigured: configurationId.startsWith('bpc_'),
    webhookSecretConfigured: webhookSecret.startsWith('whsec_'),
    appOrigin,
    appOriginError,
  };
}

function publicPortalAudit(config: Record<string, unknown>): Record<string, unknown> {
  const features = asRecord(config.features);
  const customerUpdate = asRecord(features?.customer_update);
  const invoiceHistory = asRecord(features?.invoice_history);
  const paymentMethodUpdate = asRecord(features?.payment_method_update);
  const subscriptionCancel = asRecord(features?.subscription_cancel);
  const subscriptionUpdate = asRecord(features?.subscription_update);
  const business = asRecord(config.business_profile);
  return {
    id: stringField(config, 'id'),
    livemode: config.livemode === true,
    active: config.active !== false,
    is_default: config.is_default === true,
    default_return_url: stringField(config, 'default_return_url') || stringField(business, 'default_return_url'),
    features: {
      customer_update_enabled: customerUpdate?.enabled === true,
      allowed_updates: customerUpdate?.allowed_updates ?? null,
      invoice_history_enabled: invoiceHistory?.enabled === true,
      payment_method_update_enabled: paymentMethodUpdate?.enabled === true,
      subscription_cancel_enabled: subscriptionCancel?.enabled === true,
      subscription_cancel_mode: stringField(subscriptionCancel, 'mode'),
      subscription_update_enabled: subscriptionUpdate?.enabled === true,
    },
  };
}

export type PortalConfigurationResult = {
  id: string;
  isDefault: boolean;
};

export async function ensureCustomerPortalConfiguration(
  secretKey: string,
  productId: string,
  prices: ResolvedSpeedVendorsPrice[],
  returnUrl: string,
): Promise<PortalConfigurationResult> {
  const priceIds = prices.map((p) => p.priceId);

  const form = new URLSearchParams();
  form.set('business_profile[headline]', 'SpeedVendors');
  form.set('features[customer_update][enabled]', 'true');
  form.set('features[customer_update][allowed_updates][0]', 'email');
  form.set('features[customer_update][allowed_updates][1]', 'address');
  form.set('features[customer_update][allowed_updates][2]', 'name');
  form.set('features[invoice_history][enabled]', 'true');
  form.set('features[payment_method_update][enabled]', 'true');
  form.set('features[subscription_cancel][enabled]', 'true');
  form.set('features[subscription_cancel][mode]', 'at_period_end');
  form.set('features[subscription_cancel][proration_behavior]', 'none');
  if (returnUrl) form.set('default_return_url', returnUrl);

  const withSwitching = new URLSearchParams(form);
  withSwitching.set('features[subscription_update][enabled]', 'true');
  withSwitching.set('features[subscription_update][default_allowed_updates][0]', 'price');
  withSwitching.set('features[subscription_update][proration_behavior]', 'always_invoice');
  withSwitching.set('features[subscription_update][products][0][product]', productId);
  priceIds.forEach((id, index) => {
    withSwitching.append(`features[subscription_update][products][0][prices][${index}]`, id);
  });

  try {
    const created = await stripeBillingFormPost(secretKey, '/billing_portal/configurations', withSwitching);
    const id = stringField(created, 'id');
    if (!id?.startsWith('bpc_')) throw new Error('STRIPE_PORTAL_CONFIG_FAILED');
    return { id, isDefault: created.is_default === true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('portal config with plan switching failed, creating cancel-only portal', { message });
    form.set('features[subscription_update][enabled]', 'false');
    const created = await stripeBillingFormPost(secretKey, '/billing_portal/configurations', form);
    const id = stringField(created, 'id');
    if (!id?.startsWith('bpc_')) throw new Error('STRIPE_PORTAL_CONFIG_FAILED');
    return { id, isDefault: created.is_default === true };
  }
}
