import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Unplug,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonation } from '@/hooks/useImpersonation';
import { withActingAsUserId } from '@/lib/actingAs';
import { openExternalUrl, stripeDashboardUrl } from '@/lib/openExternalUrl';
import { toast } from 'sonner';
import type { Database } from '@/types/database';

type StripeIntegration = Database['public']['Tables']['payment_integrations']['Row'];

function isConnected(row: StripeIntegration | null): boolean {
  return Boolean(
    row &&
      row.provider_account_id &&
      row.status !== 'disconnected',
  );
}

function isDisconnectIncomplete(row: StripeIntegration | null): boolean {
  if (!isConnected(row) || !row) return false;
  if (row.enabled === false) return true;
  const meta = row.metadata;
  return Boolean(meta && typeof meta === 'object' && !Array.isArray(meta) && meta.deauthorize_failed === true);
}

export function StripeConnectPanel() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const queryClient = useQueryClient();

  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const queryKey = ['payment-integrations', effectiveUserId, 'stripe'] as const;

  const { data: integration, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_integrations')
        .select(
          'id, user_id, provider, enabled, status, provider_account_id, livemode, charges_enabled, payouts_enabled, details_submitted, disabled_reason, metadata, connected_at, disconnected_at, created_at, updated_at',
        )
        .eq('user_id', effectiveUserId!)
        .eq('provider', 'stripe')
        .maybeSingle();
      if (error) throw error;
      return data as StripeIntegration | null;
    },
    enabled: !!user && !!effectiveUserId,
  });

  useEffect(() => {
    const onReturn = () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-integrations'] });
    };
    window.addEventListener('sv:stripe-connect-return', onReturn);
    return () => window.removeEventListener('sv:stripe-connect-return', onReturn);
  }, [queryClient]);

  const connected = isConnected(integration ?? null);
  const disconnectIncomplete = isDisconnectIncomplete(integration ?? null);

  const startConnect = async () => {
    setConnecting(true);
    try {
      const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
      const { data, error } = await supabase.functions.invoke('stripe-connect', {
        body: withActingAsUserId({
          action: 'start_oauth',
          client_platform: platform === 'ios' || platform === 'android' ? platform : 'web',
        }),
      });
      if (error) {
        toast.error(error.message || t('stripeConnect.toast.connectFailed'));
        return;
      }
      if (data?.error) {
        toast.error(t(`stripeConnect.errors.${data.error}`, { defaultValue: t('stripeConnect.toast.connectFailed') }));
        return;
      }
      const authorizeUrl = data?.authorize_url;
      if (typeof authorizeUrl !== 'string' || !authorizeUrl.startsWith('https://connect.stripe.com/')) {
        toast.error(t('stripeConnect.toast.connectFailed'));
        return;
      }
      await openExternalUrl(authorizeUrl);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || t('stripeConnect.toast.connectFailed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect', {
        body: withActingAsUserId({ action: 'disconnect' }),
      });
      if (error) {
        await queryClient.invalidateQueries({ queryKey: ['payment-integrations'] });
        toast.error(error.message || t('stripeConnect.toast.disconnectFailed'));
        return;
      }
      if (data?.error) {
        await queryClient.invalidateQueries({ queryKey: ['payment-integrations'] });
        toast.error(
          data.error === 'DEAUTHORIZE_FAILED'
            ? t('stripeConnect.toast.deauthorizeFailed')
            : t('stripeConnect.toast.disconnectFailed'),
        );
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['payment-integrations'] });
      setDisconnectOpen(false);
      toast.success(t('stripeConnect.toast.disconnected'));
    } catch (e: unknown) {
      await queryClient.invalidateQueries({ queryKey: ['payment-integrations'] });
      toast.error((e as Error)?.message || t('stripeConnect.toast.disconnectFailed'));
    } finally {
      setDisconnecting(false);
    }
  };

  const accountId = integration?.provider_account_id;
  const paymentsOk = integration?.charges_enabled === true;
  const payoutsOk = integration?.payouts_enabled === true;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading')}
          </CardContent>
        </Card>
      ) : connected ? (
        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-background to-background overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" aria-hidden />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{t('stripeConnect.connected.title')}</CardTitle>
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0">
                      {t('stripeConnect.connected.badge')}
                    </Badge>
                    {disconnectIncomplete && (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                        {t('stripeConnect.connected.disconnectIncompleteBadge')}
                      </Badge>
                    )}
                    {!paymentsOk && (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                        {t('stripeConnect.connected.actionRequired')}
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{t('stripeConnect.connected.description')}</CardDescription>
                  {accountId && (
                    <p className="text-xs font-mono text-muted-foreground pt-0.5">
                      {t('stripeConnect.connected.account')}: {accountId}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                    <span>
                      {paymentsOk ? '🟢' : '⚪'} {t('stripeConnect.connected.payments')}
                      {': '}
                      {paymentsOk ? t('stripeConnect.connected.enabled') : t('stripeConnect.connected.disabled')}
                    </span>
                    <span>
                      {payoutsOk ? '🟢' : '⚪'} {t('stripeConnect.connected.payouts')}
                      {': '}
                      {payoutsOk ? t('stripeConnect.connected.enabled') : t('stripeConnect.connected.disabled')}
                    </span>
                  </div>
                  {disconnectIncomplete && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 pt-1">
                      {t('stripeConnect.connected.disconnectIncomplete')}
                    </p>
                  )}
                  {integration?.disabled_reason && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 pt-1">
                      {t('stripeConnect.connected.requirements', { reason: integration.disabled_reason })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openExternalUrl(stripeDashboardUrl(integration?.livemode === true))}
              disabled={disconnecting}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {t('stripeConnect.actions.manage')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void startConnect()}
              disabled={connecting || disconnecting}
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {t('stripeConnect.actions.reconnect')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDisconnectOpen(true)}
              disabled={disconnecting}
            >
              <Unplug className="h-4 w-4 mr-2" />
              {t('stripeConnect.actions.disconnect')}
            </Button>
            {disconnectIncomplete && (
              <p className="w-full text-xs text-amber-700 dark:text-amber-400">
                {t('stripeConnect.connected.disconnectRetry')}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-primary/25 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('stripeConnect.setupCard.title')}</CardTitle>
            <CardDescription>{t('stripeConnect.setupCard.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void startConnect()} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t('stripeConnect.actions.connect')}
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('stripeConnect.disconnect.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('stripeConnect.disconnect.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={disconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleDisconnect();
              }}
            >
              {disconnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('stripeConnect.actions.disconnect')}
                </>
              ) : (
                t('stripeConnect.actions.disconnect')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
