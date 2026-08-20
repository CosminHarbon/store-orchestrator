import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Pencil,
  PlugZap,
  Settings2,
  Unplug,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { EawbSetupWizard } from '@/components/shipping/EawbSetupWizard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonation } from '@/hooks/useImpersonation';
import { withActingAsUserId } from '@/lib/actingAs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { goToShippingSettings } from '@/lib/openExternalUrl';

export type EawbShippingPanelProps = {
  profile: {
    store_api_key?: string | null;
    eawb_api_key?: string | null;
    eawb_shipping_address_id?: number | null;
    eawb_billing_address_id?: number | null;
    eawb_pickup_locker_id?: string | null;
    eawb_pickup_locker_name?: string | null;
    eawb_pickup_locker_address?: string | null;
    eawb_pickup_locker_carrier_id?: number | null;
    eawb_pickup_locker_carrier_code?: string | null;
    eawb_pickup_locker_county?: string | null;
    eawb_pickup_locker_city?: string | null;
  } | null;
  /** Sync local StoreSettings form state after disconnect / api key save */
  onLocalConfigCleared: () => void;
  onApiKeySynced: (apiKey: string) => void;
  children: ReactNode;
};

export function EawbShippingPanel({
  profile,
  onLocalConfigCleared,
  onApiKeySynced,
  children,
}: EawbShippingPanelProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const queryClient = useQueryClient();

  const isConnected = Boolean(profile?.eawb_api_key?.trim());

  const [wizardOpen, setWizardOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const testConnection = async () => {
    setTestLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-eawb-connection', {
        body: withActingAsUserId({}),
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(t('eawbSetup.toast.testOk'));
      } else {
        toast.error(data?.error || t('toast.connectionFailed'));
      }
    } catch (e: any) {
      toast.error(e?.message || t('toast.connectionFailed'));
    } finally {
      setTestLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user || !effectiveUserId) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          eawb_api_key: null,
          eawb_name: null,
          eawb_email: null,
          eawb_phone: null,
          eawb_address: null,
          eawb_billing_address_id: null,
          eawb_shipping_address_id: null,
          eawb_default_carrier_id: null,
          eawb_default_service_id: null,
          eawb_pickup_locker_id: null,
          eawb_pickup_locker_name: null,
          eawb_pickup_locker_address: null,
          eawb_pickup_locker_carrier_id: null,
          eawb_pickup_locker_carrier_code: null,
          eawb_pickup_locker_county: null,
          eawb_pickup_locker_city: null,
        })
        .eq('user_id', effectiveUserId);

      if (error) throw error;

      onLocalConfigCleared();
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setDisconnectOpen(false);
      toast.success(t('eawbSetup.toast.disconnected'));
      setWizardOpen(true);
    } catch (e: any) {
      toast.error(e?.message || t('toast.updateFailed'));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      {isConnected ? (
        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-background to-background overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" aria-hidden />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{t('eawbSetup.connected.title')}</CardTitle>
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0">
                    {t('eawbSetup.connected.badge')}
                  </Badge>
                </div>
                <CardDescription>{t('eawbSetup.connected.description')}</CardDescription>
                <p className="text-xs text-muted-foreground pt-0.5">
                  {t('eawbSetup.connected.credentialsSaved')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void testConnection()}
              disabled={testLoading || disconnecting}
            >
              {testLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlugZap className="h-4 w-4 mr-2" />}
              {t('eawbSetup.actions.testConnection')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWizardOpen(true)}
              disabled={disconnecting}
            >
              <Pencil className="h-4 w-4 mr-2" />
              {t('eawbSetup.actions.editDetails')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdvancedOpen(true)}
              disabled={disconnecting}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              {t('eawbSetup.actions.advancedSettings')}
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
              {t('eawbSetup.actions.disconnect')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-primary/25 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('eawbSetup.setupCard.title')}</CardTitle>
            <CardDescription>{t('eawbSetup.setupCard.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setWizardOpen(true)}>
              {t('eawbSetup.actions.completeSetup')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setAdvancedOpen(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              {t('eawbSetup.actions.advancedSettings')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between h-auto py-2 px-3 text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Settings2 className="h-4 w-4" />
              {t('eawbSetup.advanced.title')}
            </span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">{t('eawbSetup.advanced.description')}</p>
          {children}
        </CollapsibleContent>
      </Collapsible>

      <EawbSetupWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        profile={profile}
        onApiKeySaved={onApiKeySynced}
        onProfileFieldsUpdated={() => {
          void queryClient.invalidateQueries({ queryKey: ['profile'] });
        }}
        onGoToShipping={goToShippingSettings}
      />

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('eawbSetup.disconnect.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('eawbSetup.disconnect.description')}</AlertDialogDescription>
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
                  {t('eawbSetup.actions.disconnect')}
                </>
              ) : (
                t('eawbSetup.actions.disconnect')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
