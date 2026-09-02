import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import {
  refreshSubscriptionFromStripe,
  resolveUserIdForStripeCustomer,
  syncSubscriptionFromStripe,
} from '../_shared/billingEntitlement.ts';
import {
  constructStripeBillingEvent,
  getStripeBillingSecrets,
  normalizeStripeSubscription,
  sanitizeBillingWebhookError,
  sha256Hex,
  stripeEnvironmentLabel,
  subscriptionIdFromInvoice,
} from '../_shared/billingStripe.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const STALE_AFTER_SECONDS = 90;

type ClaimResult = {
  acquired?: boolean;
  reason?: string;
  lease_id?: string | null;
  status?: string;
  attempt_count?: number;
};

async function syncBySubscriptionId(subscriptionId: string): Promise<void> {
  await refreshSubscriptionFromStripe(admin, subscriptionId);
}

async function handleEvent(type: string, obj: Record<string, unknown>): Promise<void> {
  switch (type) {
    case 'checkout.session.completed': {
      // Do NOT grant access from Checkout alone. Sync subscription if present.
      if (obj.mode !== 'subscription') return;
      const subId =
        typeof obj.subscription === 'string'
          ? obj.subscription
          : (obj.subscription as { id?: string } | null)?.id;
      if (typeof subId === 'string' && subId.startsWith('sub_')) {
        await syncBySubscriptionId(subId);
      }
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subId = typeof obj.id === 'string' ? obj.id : '';
      if (!subId.startsWith('sub_')) throw new Error('INVALID_SUBSCRIPTION');

      try {
        await syncBySubscriptionId(subId);
        return;
      } catch (err) {
        if (!(err instanceof Error) || err.message !== 'UNKNOWN_CUSTOMER') throw err;
      }

      const normalized = normalizeStripeSubscription(obj);
      const meta = obj.metadata as { speedvendors_user_id?: string } | undefined;
      const userId = meta?.speedvendors_user_id;
      if (!userId) throw new Error('UNKNOWN_CUSTOMER');
      const { data: customer } = await admin
        .from('billing_customers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (!customer) throw new Error('UNKNOWN_CUSTOMER');
      await syncSubscriptionFromStripe({
        admin,
        userId,
        billingCustomerId: customer.id,
        normalized,
      });
      return;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required': {
      const subId = subscriptionIdFromInvoice(obj);
      if (subId) {
        await syncBySubscriptionId(subId);
      }
      return;
    }
    default:
      return;
  }
}

async function completeClaim(
  eventId: string,
  leaseId: string | null | undefined,
  ok: boolean,
  errorCode: string | null,
): Promise<void> {
  const { error } = await admin.rpc('complete_stripe_billing_webhook_event', {
    p_event_id: eventId,
    p_ok: ok,
    p_error: errorCode,
    p_lease_id: leaseId || null,
  });
  if (error) {
    console.error('billing webhook complete failed', { message: error.message });
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event: {
    id: string;
    type: string;
    livemode: boolean;
    data: { object: Record<string, unknown> };
  };
  try {
    const secrets = getStripeBillingSecrets();
    event = await constructStripeBillingEvent(rawBody, signature, secrets.webhookSecret);
    if (event.livemode !== secrets.livemode) {
      console.error('billing webhook livemode mismatch', {
        event_id: event.id,
        event_type: event.type,
        event_livemode: event.livemode,
        stripe_environment: stripeEnvironmentLabel(secrets.livemode),
      });
      return new Response(
        JSON.stringify({ received: true, skipped: 'livemode_mismatch' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing webhook signature failed', { message });
    return new Response('invalid_signature', { status: 400 });
  }

  const digest = await sha256Hex(rawBody);

  const { data: claimRaw, error: claimError } = await admin.rpc(
    'claim_stripe_billing_webhook_event',
    {
      p_event_id: event.id,
      p_event_type: event.type,
      p_payload_digest: digest,
      p_stale_after_seconds: STALE_AFTER_SECONDS,
    },
  );

  if (claimError) {
    console.error('billing webhook claim failed', { message: claimError.message });
    return new Response('claim_failed', { status: 500 });
  }

  const claim = (claimRaw || {}) as ClaimResult;

  if (claim.reason === 'already_processed' || claim.status === 'processed') {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!claim.acquired) {
    return new Response('already_processing', { status: 409 });
  }

  let ok = false;
  let errorCode: string | null = null;
  try {
    await handleEvent(event.type, event.data.object);
    await admin.rpc('expire_lapsed_stripe_grace');
    ok = true;
    console.log('billing webhook processed', {
      type: event.type,
      id: event.id,
      stripe_environment: stripeEnvironmentLabel(event.livemode),
    });
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    errorCode = sanitizeBillingWebhookError(message);
    console.error('billing webhook handler failed', {
      type: event.type,
      id: event.id,
      code: errorCode,
    });
    return new Response('handler_failed', { status: 500 });
  } finally {
    try {
      await completeClaim(event.id, claim.lease_id, ok, errorCode);
    } catch (completeErr) {
      const message = completeErr instanceof Error ? completeErr.message : 'unknown';
      console.error('billing webhook finally complete threw', { message });
    }
  }
});
