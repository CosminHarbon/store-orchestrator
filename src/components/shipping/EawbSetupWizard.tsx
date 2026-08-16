import { useEffect, useState, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Loader2,
  MapPin,
  Package,
  PlugZap,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { EAWB_ACCOUNT_URL, openExternalUrl } from '@/lib/openExternalUrl';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { SetupWizardShell } from '@/components/onboarding/SetupWizardShell';
import {
  SetupHelpAccordion,
  SetupPathTrail,
  SetupStepHeader,
} from '@/components/onboarding/SetupHelp';
import { SetupMaskedValue } from '@/components/onboarding/SetupMaskedValue';
import { DefaultPickupLockerSection } from '@/components/settings/DefaultPickupLockerSection';
import type { DefaultPickupLockerFields } from '@/components/settings/DefaultPickupLockerSection';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
type Phase = 'steps' | 'success';

const TOTAL_STEPS = 6;

const stepIcons = {
  1: Store,
  2: KeyRound,
  3: MapPin,
  4: Building2,
  5: Package,
  6: PlugZap,
} as const;

function formatAddressLabel(addr: any) {
  const who = addr.company || addr.contact || `Address ${addr.id}`;
  const place = [addr.locality_name, addr.street_name, addr.street_no].filter(Boolean).join(', ');
  const suffix = addr.is_default ? ' (default)' : '';
  return place ? `${who} — ${place}${suffix}` : `${who}${suffix}`;
}

export type EawbSetupWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current profile snapshot for locker section + prefill */
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
  onApiKeySaved: (apiKey: string) => void;
  onProfileFieldsUpdated: () => void;
  onFinish?: () => void;
  onGoToShipping?: () => void;
};

export function EawbSetupWizard({
  open,
  onOpenChange,
  profile,
  onApiKeySaved,
  onProfileFieldsUpdated,
  onFinish,
  onGoToShipping,
}: EawbSetupWizardProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>(1);
  const [phase, setPhase] = useState<Phase>('steps');
  const [direction, setDirection] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyError, setApiKeyError] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [busy, setBusy] = useState(false);

  const [pickupAddresses, setPickupAddresses] = useState<any[]>([]);
  const [billingAddresses, setBillingAddresses] = useState<any[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState('');
  const [selectedBillingId, setSelectedBillingId] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [lockerSaving, setLockerSaving] = useState(false);
  const [lockerProfile, setLockerProfile] = useState(profile);

  // Only reset when the dialog opens — not when profile refreshes mid-wizard
  // (saving the API key invalidates ['profile'] and would otherwise snap back to step 1).
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPhase('steps');
    setDirection(1);
    setApiKey(profile?.eawb_api_key || '');
    setApiKeyError('');
    setSavingKey(false);
    setBusy(false);
    setPickupAddresses([]);
    setBillingAddresses([]);
    setSelectedPickupId(
      profile?.eawb_shipping_address_id ? String(profile.eawb_shipping_address_id) : ''
    );
    setSelectedBillingId(
      profile?.eawb_billing_address_id ? String(profile.eawb_billing_address_id) : ''
    );
    setShowApiKey(false);
    setTestPassed(false);
    setLockerProfile(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialize from profile snapshot at open only
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLockerProfile(profile);
  }, [profile, open]);

  const goTo = (next: WizardStep) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const helpCommon = {
    title: t('eawbSetup.help.title'),
    pathLabel: t('eawbSetup.help.path'),
    troubleshootingLabel: t('eawbSetup.help.troubleshooting'),
    screenshotPlaceholder: t('eawbSetup.help.screenshotPlaceholder'),
  };

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      setApiKeyError(t('eawbSetup.errors.apiKeyRequired'));
      return false;
    }
    if (!user) {
      toast.error(t('toast.updateFailed'));
      return false;
    }
    setSavingKey(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          eawb_api_key: apiKey.trim(),
          shipping_provider: 'eawb',
        })
        .eq('user_id', user.id)
        .select('id');

      if (error) throw error;
      if (!data?.length) {
        throw new Error(t('toast.updateFailed'));
      }

      onApiKeySaved(apiKey.trim());
      // Do not await invalidate here — profile refresh must not block advancing,
      // and we no longer reset the wizard when profile updates.
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      setApiKeyError('');
      return true;
    } catch (e: any) {
      toast.error(e?.message || t('toast.updateFailed'));
      return false;
    } finally {
      setSavingKey(false);
    }
  };

  const fetchPickupAddresses = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: { action: 'fetch_shipping_addresses' },
      });
      const payload: any = data ?? (error as any)?.context ?? null;

      if (payload?.error === 'NO_SHIPPING_ADDRESS' || payload?.error === 'NO_PICKUP_ADDRESS') {
        toast.error(t('toast.noPickupAddress'));
        return;
      }
      if (error) throw error;

      if (payload?.success) {
        const list = payload.shipping_addresses || [];
        setPickupAddresses(list);
        if (payload.selected_shipping_address_id) {
          setSelectedPickupId(String(payload.selected_shipping_address_id));
          onProfileFieldsUpdated();
          toast.success(t('eawbSetup.toast.pickupLinked'));
        } else {
          toast.success(t('toast.pickupAddressesFound', { count: list.length }));
        }
      } else {
        throw new Error(payload?.message || payload?.error || t('toast.fetchPickupFailed', { message: '' }));
      }
    } catch (e: any) {
      toast.error(t('toast.fetchPickupFailed', { message: e?.message || '' }));
    } finally {
      setBusy(false);
    }
  };

  const savePickupSelection = async (id: string) => {
    if (!user || !id) return false;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ eawb_shipping_address_id: parseInt(id, 10) })
        .eq('user_id', user.id);
      if (error) throw error;
      setSelectedPickupId(id);
      onProfileFieldsUpdated();
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      return true;
    } catch (e: any) {
      toast.error(e?.message || t('toast.updateFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const fetchBillingAddresses = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: { action: 'fetch_billing_addresses' },
      });
      const payload: any = data ?? (error as any)?.context ?? null;

      if (payload?.error === 'NO_BILLING_ADDRESS') {
        toast.error(t('toast.noBillingAddress'));
        return;
      }
      if (error) throw error;

      if (payload?.success) {
        const list = payload.billing_addresses || [];
        setBillingAddresses(list);
        if (payload.selected_billing_address_id) {
          setSelectedBillingId(String(payload.selected_billing_address_id));
          onProfileFieldsUpdated();
          toast.success(t('toast.billingLinked'));
        } else {
          toast.success(t('toast.billingAddressesFound', { count: list.length }));
        }
      } else {
        throw new Error(payload?.message || payload?.error || t('toast.fetchBillingFailed', { message: '' }));
      }
    } catch (e: any) {
      toast.error(t('toast.fetchBillingFailed', { message: e?.message || '' }));
    } finally {
      setBusy(false);
    }
  };

  const saveBillingSelection = async (id: string) => {
    if (!user || !id) return false;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ eawb_billing_address_id: parseInt(id, 10) })
        .eq('user_id', user.id);
      if (error) throw error;
      setSelectedBillingId(id);
      onProfileFieldsUpdated();
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      return true;
    } catch (e: any) {
      toast.error(e?.message || t('toast.updateFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveLocker = async (fields: DefaultPickupLockerFields) => {
    if (!user) return;
    setLockerSaving(true);
    try {
      const { error } = await supabase.from('profiles').update(fields).eq('user_id', user.id);
      if (error) throw error;
      setLockerProfile((prev) => ({ ...(prev || {}), ...fields }));
      onProfileFieldsUpdated();
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success(t('eawbSetup.toast.lockerSaved'));
    } catch (e: any) {
      toast.error(e?.message || t('toast.updateFailed'));
    } finally {
      setLockerSaving(false);
    }
  };

  const runConnectionTest = async () => {
    setBusy(true);
    setTestPassed(false);
    try {
      const { data, error } = await supabase.functions.invoke('test-eawb-connection', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });
      if (error) throw error;
      if (data?.success) {
        setTestPassed(true);
        toast.success(t('eawbSetup.toast.testOk'));
        setPhase('success');
      } else {
        toast.error(data?.error || t('toast.connectionFailed'));
      }
    } catch (e: any) {
      toast.error(e?.message || t('toast.connectionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleContinue = async () => {
    if (step === 2) {
      const ok = await saveApiKey();
      if (!ok) return;
      goTo(3);
      return;
    }
    if (step === 3) {
      if (!selectedPickupId) {
        toast.error(t('eawbSetup.errors.pickupRequired'));
        return;
      }
      if (!(await savePickupSelection(selectedPickupId))) return;
      goTo(4);
      return;
    }
    if (step === 4) {
      if (!selectedBillingId) {
        toast.error(t('eawbSetup.errors.billingRequired'));
        return;
      }
      if (!(await saveBillingSelection(selectedBillingId))) return;
      goTo(5);
      return;
    }
    if (step === 5) {
      goTo(6);
      return;
    }
    if (step === 6) {
      await runConnectionTest();
    }
  };

  const handleBack = () => {
    if (step > 1) goTo((step - 1) as WizardStep);
  };

  const handleOpenEawb = async () => {
    try {
      await openExternalUrl(EAWB_ACCOUNT_URL);
    } catch {
      toast.error(t('eawbSetup.errors.openBrowserFailed'));
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      if (step !== 2) return;
    }
    if (phase === 'success' || busy || savingKey) return;
    e.preventDefault();
    if (step === 1) goTo(2);
    else void handleContinue();
  };

  const StepIcon = stepIcons[step];
  const footerBusy = busy || savingKey;

  const selectedPickupLabel = (() => {
    const found = pickupAddresses.find((a) => String(a.id) === selectedPickupId);
    return found ? formatAddressLabel(found) : selectedPickupId ? `#${selectedPickupId}` : '—';
  })();

  const lockerLabel = lockerProfile?.eawb_pickup_locker_name || t('eawbSetup.none');

  return (
    <SetupWizardShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('eawbSetup.title')}
      description={t('eawbSetup.subtitle')}
      descriptionId="eawb-setup-desc"
      estimatedTime={t('eawbSetup.estimatedTime')}
      stepOf={t('eawbSetup.stepOf', { current: step, total: TOTAL_STEPS })}
      completeLabel={t('eawbSetup.complete')}
      stepperAria={t('eawbSetup.stepperAria')}
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      phase={phase}
      direction={direction}
      onKeyDown={handleKeyDown}
      successTitle={t('eawbSetup.success.title')}
      successDescription={t('eawbSetup.success.description')}
      successPrimaryLabel={t('eawbSetup.success.finish')}
      successSecondaryLabel={t('eawbSetup.success.goToShipping')}
      onSuccessPrimary={() => {
        onOpenChange(false);
        onFinish?.();
      }}
      onSuccessSecondary={() => {
        onOpenChange(false);
        onGoToShipping?.();
      }}
      footer={
        step !== 1 ? (
          <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background/95 backdrop-blur px-6 py-4">
            <Button type="button" variant="outline" onClick={handleBack} disabled={footerBusy} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              {tCommon('back')}
            </Button>
            {step === 5 && (
              <Button type="button" variant="ghost" disabled={footerBusy} onClick={() => goTo(6)}>
                {t('eawbSetup.skipLocker')}
              </Button>
            )}
            <motion.div className="flex-1 min-w-[8rem]" whileTap={{ scale: footerBusy ? 1 : 0.98 }}>
              <Button
                type="button"
                className="w-full"
                disabled={footerBusy}
                onClick={() => void handleContinue()}
              >
                {footerBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {step === 6 ? t('eawbSetup.testing') : tCommon('loading')}
                  </>
                ) : step === 6 ? (
                  t('eawbSetup.testConnection')
                ) : (
                  <>
                    {tCommon('continue')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </motion.div>
          </div>
        ) : undefined
      }
    >
      <SetupStepHeader
        icon={<StepIcon className="h-6 w-6" aria-hidden />}
        title={t(`eawbSetup.steps.${step}.title`)}
        description={t(`eawbSetup.steps.${step}.description`)}
      />

      {step === 1 && (
        <div className="space-y-4">
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[t('eawbSetup.paths.eawbHome'), t('eawbSetup.paths.loginRegister')]}
            explanation={t('eawbSetup.steps.1.helpExplanation')}
            tips={[t('eawbSetup.steps.1.tip1'), t('eawbSetup.steps.1.tip2'), t('eawbSetup.steps.1.tip3')]}
          />
          <div className="flex flex-col gap-2">
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button type="button" className="w-full" onClick={() => void handleOpenEawb()}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('eawbSetup.steps.1.openEawb')}
              </Button>
            </motion.div>
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button type="button" variant="outline" className="w-full" onClick={() => goTo(2)}>
                {t('eawbSetup.steps.1.alreadyHaveAccount')}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <SetupPathTrail
            items={[
              t('eawbSetup.paths.settings'),
              t('eawbSetup.paths.api'),
              t('eawbSetup.paths.generateKey'),
            ]}
          />
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
            <li>{t('eawbSetup.steps.2.instruction1')}</li>
            <li>{t('eawbSetup.steps.2.instruction2')}</li>
            <li>{t('eawbSetup.steps.2.instruction3')}</li>
          </ol>
          <div className="space-y-2">
            <Label htmlFor="eawb-wizard-api-key">{t('eawbSetup.fields.apiKey')}</Label>
            <Input
              id="eawb-wizard-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (apiKeyError) setApiKeyError('');
              }}
              aria-invalid={!!apiKeyError}
              placeholder={t('eawbSetup.fields.apiKeyPlaceholder')}
              className={cn(apiKeyError && 'border-destructive focus-visible:ring-destructive')}
            />
            {apiKeyError && (
              <p className="text-sm text-destructive" role="alert">
                {apiKeyError}
              </p>
            )}
          </div>
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[
              t('eawbSetup.paths.settings'),
              t('eawbSetup.paths.api'),
              t('eawbSetup.paths.generateKey'),
            ]}
            explanation={t('eawbSetup.steps.2.helpExplanation')}
            tips={[t('eawbSetup.steps.2.tip1'), t('eawbSetup.steps.2.tip2'), t('eawbSetup.steps.2.tip3')]}
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void fetchPickupAddresses()}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {t('eawbSetup.retrievePickup')}
          </Button>
          {pickupAddresses.length > 0 ? (
            <RadioGroup
              value={selectedPickupId}
              onValueChange={setSelectedPickupId}
              className="space-y-2 max-h-48 overflow-y-auto"
            >
              {pickupAddresses.map((addr) => (
                <label
                  key={addr.id}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 cursor-pointer',
                    selectedPickupId === String(addr.id) && 'border-primary bg-primary/5'
                  )}
                >
                  <RadioGroupItem value={String(addr.id)} className="mt-0.5" />
                  <span className="text-sm">{formatAddressLabel(addr)}</span>
                </label>
              ))}
            </RadioGroup>
          ) : selectedPickupId ? (
            <p className="text-sm text-muted-foreground">
              {t('eawbSetup.selectedId', { id: selectedPickupId })}
            </p>
          ) : null}
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[t('eawbSetup.paths.retrievePickup')]}
            explanation={t('eawbSetup.steps.3.helpExplanation')}
            tips={[t('eawbSetup.steps.3.tip1'), t('eawbSetup.steps.3.tip2'), t('eawbSetup.steps.3.tip3')]}
          />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void fetchBillingAddresses()}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {t('eawbSetup.retrieveBilling')}
          </Button>
          {billingAddresses.length > 0 ? (
            <RadioGroup
              value={selectedBillingId}
              onValueChange={setSelectedBillingId}
              className="space-y-2 max-h-48 overflow-y-auto"
            >
              {billingAddresses.map((addr) => (
                <label
                  key={addr.id}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 cursor-pointer',
                    selectedBillingId === String(addr.id) && 'border-primary bg-primary/5'
                  )}
                >
                  <RadioGroupItem value={String(addr.id)} className="mt-0.5" />
                  <span className="text-sm">{formatAddressLabel(addr)}</span>
                </label>
              ))}
            </RadioGroup>
          ) : selectedBillingId ? (
            <p className="text-sm text-muted-foreground">
              {t('eawbSetup.selectedId', { id: selectedBillingId })}
            </p>
          ) : null}
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[t('eawbSetup.paths.retrieveBilling')]}
            explanation={t('eawbSetup.steps.4.helpExplanation')}
            tips={[t('eawbSetup.steps.4.tip1'), t('eawbSetup.steps.4.tip2'), t('eawbSetup.steps.4.tip3')]}
          />
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <DefaultPickupLockerSection
            profile={{
              store_api_key: lockerProfile?.store_api_key,
              eawb_api_key: apiKey || lockerProfile?.eawb_api_key,
              eawb_pickup_locker_id: lockerProfile?.eawb_pickup_locker_id,
              eawb_pickup_locker_name: lockerProfile?.eawb_pickup_locker_name,
              eawb_pickup_locker_address: lockerProfile?.eawb_pickup_locker_address,
              eawb_pickup_locker_carrier_id: lockerProfile?.eawb_pickup_locker_carrier_id,
              eawb_pickup_locker_carrier_code: lockerProfile?.eawb_pickup_locker_carrier_code,
              eawb_pickup_locker_county: lockerProfile?.eawb_pickup_locker_county,
              eawb_pickup_locker_city: lockerProfile?.eawb_pickup_locker_city,
            }}
            onSave={saveLocker}
            saving={lockerSaving}
          />
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[t('eawbSetup.paths.locker')]}
            explanation={t('eawbSetup.steps.5.helpExplanation')}
            tips={[t('eawbSetup.steps.5.tip1'), t('eawbSetup.steps.5.tip2'), t('eawbSetup.steps.5.tip3')]}
          />
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <SetupMaskedValue
            label={t('eawbSetup.fields.apiKey')}
            value={apiKey}
            revealed={showApiKey}
            onToggle={() => setShowApiKey((v) => !v)}
            showLabel={t('eawbSetup.show')}
            hideLabel={t('eawbSetup.hide')}
          />
          <div className="rounded-xl border bg-card px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground">{t('eawbSetup.fields.pickupAddress')}</p>
            <p className="text-sm">{selectedPickupLabel}</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground">{t('eawbSetup.fields.locker')}</p>
            <p className="text-sm">{lockerLabel}</p>
          </div>
          {testPassed && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              {t('eawbSetup.testSuccess')}
            </div>
          )}
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[t('eawbSetup.paths.verify')]}
            explanation={t('eawbSetup.steps.6.helpExplanation')}
            tips={[t('eawbSetup.steps.6.tip1'), t('eawbSetup.steps.6.tip2'), t('eawbSetup.steps.6.tip3')]}
          />
        </div>
      )}
    </SetupWizardShell>
  );
}
