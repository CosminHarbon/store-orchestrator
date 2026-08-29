import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import type { EntitlementStatus } from '@/hooks/useEntitlementGate';
import { Capacitor } from '@capacitor/core';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Settings → Billing. Uses Stripe Customer Portal for payment method / cancel.
 * Native apps show read-only status (portal/purchase on web).
 */
export function BillingSettingsCard() {
  const [portalBusy, setPortalBusy] = useState(false);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['entitlement-status'],
    queryFn: async () => {
      const { data: rpc, error } = await supabase.rpc('get_my_entitlement_status');
      if (error) throw error;
      return rpc as EntitlementStatus;
    },
  });

  const openPortal = async () => {
    if (Capacitor.isNativePlatform()) {
      toast.message('Manage billing on the web', {
        description: 'Open speedvendors.com → Settings → Billing.',
      });
      return;
    }
    setPortalBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        'billing-create-portal-session',
        { body: {} },
      );
      if (error) throw error;
      if (res?.error === 'billing_not_configured') {
        toast.error('Billing is not configured yet.');
        return;
      }
      if (!res?.url) {
        toast.error('Could not open billing portal.');
        return;
      }
      window.location.assign(res.url as string);
    } catch (e) {
      console.error(e);
      toast.error('Could not open billing portal.');
    } finally {
      setPortalBusy(false);
    }
  };

  const sub = data?.subscription;
  const warning = data?.billing_warning;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>Your SpeedVendors subscription</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {warning === 'duplicate_open_subscription' ? (
          <Alert variant="destructive">
            <AlertDescription>
              A second Stripe subscription was detected for this account. Manage subscriptions in
              the Customer Portal so only one SpeedVendors plan remains active.
            </AlertDescription>
          </Alert>
        ) : warning ? (
          <Alert variant="destructive">
            <AlertDescription>
              We couldn&apos;t process your subscription payment. Please update your payment method
              to avoid losing access to SpeedVendors.
              {data?.grace_until ? ` Access continues until ${formatDate(data.grace_until)}.` : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-medium capitalize">{sub?.plan || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Billing frequency</dt>
              <dd className="font-medium capitalize">{sub?.billing_interval || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium capitalize">{sub?.status || 'none'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Renewal</dt>
              <dd className="font-medium">{formatDate(sub?.current_period_end)}</dd>
            </div>
            {sub?.cancel_at_period_end ? (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Cancellation</dt>
                <dd className="font-medium">Cancels at period end</dd>
              </div>
            ) : null}
          </dl>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void openPortal()} disabled={portalBusy}>
            {portalBusy ? 'Opening…' : 'Manage subscription'}
          </Button>
          <Button variant="outline" onClick={() => void refetch()}>
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
