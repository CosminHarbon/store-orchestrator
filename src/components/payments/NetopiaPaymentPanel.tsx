import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  HelpCircle,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { NetopiaSetupWizard, type NetopiaWizardCredentials } from '@/components/payments/NetopiaSetupWizard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export type NetopiaConfigState = {
  api_key: string;
  signature: string;
  public_key: string;
  sandbox: boolean;
  name?: string;
  email?: string;
};

type Field =
  | 'api_key'
  | 'signature'
  | 'public_key'
  | 'sandbox'
  | 'name'
  | 'email';

function CredentialHelp({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation('settings');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label={t('netopiaSetup.help.title')}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {t('netopiaSetup.help.title')}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        <p className="font-medium mb-1">{title}</p>
        <div className="text-muted-foreground space-y-1">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export type NetopiaPaymentPanelProps = {
  /** Saved credentials from profile (source of truth for connected state) */
  savedApiKey?: string | null;
  savedSignature?: string | null;
  config: NetopiaConfigState;
  onConfigChange: (field: Field, value: string | boolean) => void;
  idPrefix?: string;
  onGoToPayments?: () => void;
};

export function NetopiaPaymentPanel({
  savedApiKey,
  savedSignature,
  config,
  onConfigChange,
  idPrefix = 'netopia',
  onGoToPayments,
}: NetopiaPaymentPanelProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isConnected = Boolean(savedApiKey?.trim() && savedSignature?.trim());

  const [wizardOpen, setWizardOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const credentials: NetopiaWizardCredentials = {
    api_key: config.api_key,
    signature: config.signature,
    public_key: config.public_key,
    sandbox: config.sandbox,
  };

  const testConnection = async () => {
    if (!config.api_key?.trim()) {
      toast.error(t('toast.missingApiKey'));
      return;
    }
    if (!config.signature?.trim()) {
      toast.error(t('toast.missingPosSignature'));
      return;
    }

    setTestLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('netopia-payment', {
        body: {
          action: 'test_connection',
          api_key: config.api_key,
          signature: config.signature,
          public_key: config.public_key || null,
          sandbox: config.sandbox,
        },
      });

      if (error) {
        toast.error(error.message || t('toast.connectionFailed'));
        return;
      }
      if (data?.success) {
        toast.success(data.message || t('toast.netopiaOk'));
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
    if (!user) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          netpopia_api_key: null,
          netpopia_signature: null,
          netpopia_public_key: null,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      onConfigChange('api_key', '');
      onConfigChange('signature', '');
      onConfigChange('public_key', '');
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setDisconnectOpen(false);
      toast.success(t('netopiaSetup.toast.disconnected'));
      setWizardOpen(true);
    } catch (e: any) {
      toast.error(e?.message || t('toast.updateFailed'));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleConnected = (result: { api_key: string; signature: string }) => {
    onConfigChange('api_key', result.api_key);
    onConfigChange('signature', result.signature);
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  return (
    <div className="space-y-4">
      {isConnected ? (
        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-background to-background overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" aria-hidden />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{t('netopiaSetup.connected.title')}</CardTitle>
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0">
                      {t('netopiaSetup.connected.badge')}
                    </Badge>
                  </div>
                  <CardDescription>{t('netopiaSetup.connected.description')}</CardDescription>
                  <p className="text-xs text-muted-foreground pt-0.5">
                    {t('netopiaSetup.connected.credentialsSaved')}
                  </p>
                </div>
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
              {t('netopiaSetup.actions.testConnection')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWizardOpen(true)}
              disabled={disconnecting}
            >
              <Pencil className="h-4 w-4 mr-2" />
              {t('netopiaSetup.actions.editCredentials')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdvancedOpen(true)}
              disabled={disconnecting}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              {t('netopiaSetup.actions.advancedSettings')}
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
              {t('netopiaSetup.actions.disconnect')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-primary/25 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('netopiaSetup.setupCard.title')}</CardTitle>
            <CardDescription>{t('netopiaSetup.setupCard.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setWizardOpen(true)}>
              {t('netopiaSetup.actions.completeSetup')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setAdvancedOpen(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              {t('netopiaSetup.actions.advancedSettings')}
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
              {t('netopiaSetup.advanced.title')}
            </span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">{t('netopiaSetup.advanced.description')}</p>
          <div className="grid gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`${idPrefix}-api-key`}>{t('label.apiKeyRequired')}</Label>
                <CredentialHelp title={t('netopiaSetup.fields.apiKey')}>
                  <p>{t('netopiaSetup.advanced.apiKeyHelp')}</p>
                </CredentialHelp>
              </div>
              <Input
                id={`${idPrefix}-api-key`}
                type="password"
                value={config.api_key}
                onChange={(e) => onConfigChange('api_key', e.target.value)}
                placeholder={t('netopiaSetup.fields.apiKeyPlaceholder')}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`${idPrefix}-signature`}>{t('label.posSignature')}</Label>
                <CredentialHelp title={t('netopiaSetup.fields.posSignature')}>
                  <p>{t('netopiaSetup.advanced.signatureHelp')}</p>
                </CredentialHelp>
              </div>
              <Input
                id={`${idPrefix}-signature`}
                type="password"
                value={config.signature}
                onChange={(e) => onConfigChange('signature', e.target.value)}
                placeholder={t('netopiaSetup.fields.posSignaturePlaceholder')}
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`${idPrefix}-public-key`}>{t('label.publicKey')}</Label>
                <CredentialHelp title={t('label.publicKey')}>
                  <p>{t('netopiaSetup.advanced.publicKeyHelp')}</p>
                </CredentialHelp>
              </div>
              <Textarea
                id={`${idPrefix}-public-key`}
                value={config.public_key || ''}
                onChange={(e) => onConfigChange('public_key', e.target.value)}
                placeholder={t('netopiaSetup.advanced.publicKeyPlaceholder')}
                className="min-h-[100px] font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-sandbox`}>{t('label.environment')}</Label>
              <Select
                value={config.sandbox ? 'sandbox' : 'live'}
                onValueChange={(value) => onConfigChange('sandbox', value === 'sandbox')}
              >
                <SelectTrigger id={`${idPrefix}-sandbox`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">{t('env.sandbox')}</SelectItem>
                  <SelectItem value="live">{t('env.live')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('netopiaSetup.advanced.envHelp')}</p>
            </div>
            <div className="pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => void testConnection()}
                disabled={testLoading}
              >
                {testLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('netopiaSetup.actions.testConnection')}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <NetopiaSetupWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        credentials={credentials}
        onConnected={handleConnected}
        onGoToPayments={onGoToPayments}
      />

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('netopiaSetup.disconnect.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('netopiaSetup.disconnect.description')}</AlertDialogDescription>
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
                  {t('netopiaSetup.actions.disconnect')}
                </>
              ) : (
                t('netopiaSetup.actions.disconnect')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
