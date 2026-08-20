import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Package,
  Palette,
  Sparkles,
  Store,
  Truck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useStoreOnboarding } from '@/hooks/useStoreOnboarding';
import { FirstProductStep } from '@/components/onboarding/FirstProductStep';
import {
  NetopiaSetupWizard,
  type NetopiaWizardCredentials,
} from '@/components/payments/NetopiaSetupWizard';
import { EawbSetupWizard } from '@/components/shipping/EawbSetupWizard';
import { DeliveryPricingSettings } from '@/components/settings/DeliveryPricingSettings';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  ONBOARDING_STEPS,
  OnboardingStepId,
  PROGRESS_STEPS,
  isDefaultStoreName,
} from '@/components/onboarding/onboardingTypes';
import { BrandLogo } from '@/components/brand/BrandLogo';
import '@/styles/store-setup.css';

const SetupWizard = () => {
  const { t } = useTranslation('onboarding');
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const onboarding = useStoreOnboarding();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<OnboardingStepId>('welcome');
  const [direction, setDirection] = useState(1);
  const [storeName, setStoreName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<'elementar' | 'premium' | 'floral' | 'ai' | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [shippingOpen, setShippingOpen] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (onboarding.isLoading || hydrated) return;
    setStep(onboarding.resumeStep);
    setStoreName(
      isDefaultStoreName(onboarding.profile?.store_name)
        ? ''
        : onboarding.profile?.store_name || ''
    );
    setSelectedTemplate(onboarding.state.selected_template || null);
    setHydrated(true);
  }, [hydrated, onboarding.isLoading, onboarding.profile?.store_name, onboarding.resumeStep, onboarding.state.selected_template]);

  const stepIndex = Math.max(0, ONBOARDING_STEPS.indexOf(step));
  const progressIndex = Math.max(
    1,
    PROGRESS_STEPS.includes(step as (typeof PROGRESS_STEPS)[number])
      ? PROGRESS_STEPS.indexOf(step as (typeof PROGRESS_STEPS)[number]) + 1
      : step === 'welcome'
        ? 0
        : PROGRESS_STEPS.length
  );

  const go = async (next: OnboardingStepId, dir = 1) => {
    setDirection(dir);
    setStep(next);
    await onboarding.goToStep(next);
  };

  const handleExit = async () => {
    await onboarding.exitSetup();
    navigate('/app');
  };

  const netopiaCredentials: NetopiaWizardCredentials = useMemo(
    () => ({
      api_key: onboarding.profile?.netpopia_api_key || '',
      signature: onboarding.profile?.netpopia_signature || '',
      public_key: '',
      sandbox: true,
    }),
    [onboarding.profile?.netpopia_api_key, onboarding.profile?.netpopia_signature]
  );

  const storeUrl = useMemo(() => {
    const apiKey = onboarding.profile?.store_api_key;
    if (!apiKey) return null;
    const template = onboarding.state.selected_template || 'elementar';
    return `${window.location.origin}/templates/${template}?api_key=${apiKey}`;
  }, [onboarding.profile?.store_api_key, onboarding.state.selected_template]);

  const paymentsConnected = onboarding.derived.payments;
  const cashOnlyPayments = onboarding.profile?.payment_provider === 'none';
  const shippingConnected = onboarding.derived.shipping;
  const partialReady = !paymentsConnected || !shippingConnected;

  if (authLoading || onboarding.isLoading || !hydrated) {
    return (
      <div className="sv-setup flex min-h-screen items-center justify-center bg-[#0D0717]">
        <Loader2 className="h-7 w-7 animate-spin text-white/70" />
      </div>
    );
  }

  return (
    <div className="sv-setup min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(110,61,255,0.18),transparent_34%),#0D0717] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6 md:px-6 md:py-10">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <BrandLogo
              variant="horizontal"
              surface="dark"
              imgClassName="h-8 w-auto max-w-[170px]"
            />
            {step !== 'welcome' && step !== 'ready' && (
              <p className="mt-2 text-sm text-white/65">
                {t('progress', {
                  current: Math.min(progressIndex, PROGRESS_STEPS.length),
                  total: PROGRESS_STEPS.length,
                })}
              </p>
            )}
          </div>
          {step !== 'ready' && (
            <Button
              variant="ghost"
              className="text-white/70 hover:bg-white/10 hover:text-white"
              onClick={handleExit}
            >
              <X className="mr-2 h-4 w-4" />
              {t('exit')}
            </Button>
          )}
        </header>

        {step !== 'welcome' && step !== 'ready' && (
          <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-[#6E3DFF]"
              animate={{
                width: `${(Math.min(progressIndex, PROGRESS_STEPS.length) / PROGRESS_STEPS.length) * 100}%`,
              }}
              transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            />
          </div>
        )}

        <div className="flex flex-1 items-stretch">
          <div className="sv-setup-card w-full rounded-[28px] border border-white/10 bg-white text-[#1A0F2E] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.65)] dark:border-white/10 dark:bg-[hsl(210_28%_10%)] dark:text-white">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                initial={{ opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -24 }}
                transition={{ duration: 0.22 }}
                className="flex h-full flex-col p-6 md:p-8"
              >
                {step === 'welcome' && (
                  <WelcomeStep
                    onStart={async () => {
                      await onboarding.completeStep('welcome');
                      await go('store');
                    }}
                    onSkip={handleExit}
                  />
                )}

                {step === 'store' && (
                  <StepFrame
                    eyebrow={t('store.eyebrow')}
                    title={t('store.title')}
                    body={t('store.body')}
                    icon={Store}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="store-name">{t('store.label')}</Label>
                      <Input
                        id="store-name"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder={t('store.placeholder')}
                        className="h-12"
                      />
                      <p className="text-xs text-muted-foreground">{t('store.hint')}</p>
                    </div>
                    <StepActions
                      onBack={() => go('welcome', -1)}
                      onSkip={async () => {
                        await onboarding.skipStep('store');
                        await go('storefront');
                      }}
                      onContinue={async () => {
                        if (!storeName.trim() || isDefaultStoreName(storeName)) {
                          toast.error(t('store.required'));
                          return;
                        }
                        await onboarding.saveStoreName(storeName);
                        await go('storefront');
                      }}
                      loading={onboarding.saving}
                    />
                  </StepFrame>
                )}

                {step === 'storefront' && (
                  <StepFrame
                    eyebrow={t('storefront.eyebrow')}
                    title={t('storefront.title')}
                    body={t('storefront.body')}
                    icon={Palette}
                  >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {(
                        [
                          ['ai', 'from-[#1A0F2E] via-[#3D1B6E] to-[#6E3DFF]'],
                          ['elementar', 'from-stone-200 via-stone-100 to-white'],
                          ['premium', 'from-[#1c2b24] via-[#2a3d34] to-[#0f1612]'],
                          ['floral', 'from-[#f3e4e0] via-[#fbf8f5] to-[#efe8e3]'],
                        ] as const
                      ).map(([id, gradient]) => {
                        const active = selectedTemplate === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setSelectedTemplate(id)}
                            className={cn(
                              'overflow-hidden rounded-2xl border text-left transition',
                              active
                                ? 'border-[#6E3DFF] ring-2 ring-[#6E3DFF]/20'
                                : 'border-border hover:border-[#6E3DFF]/35'
                            )}
                          >
                            <div className={cn('relative h-28 bg-gradient-to-br', gradient)}>
                              {active && (
                                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#6E3DFF] px-2 py-0.5 text-[11px] font-medium text-white">
                                  <Check className="h-3 w-3" />
                                  {t('storefront.selected')}
                                </span>
                              )}
                            </div>
                            <div className="space-y-1 p-4">
                              <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                {t(`storefront.${id}.badge`)}
                              </div>
                              <div className="font-semibold">{t(`storefront.${id}.name`)}</div>
                              <p className="text-xs text-muted-foreground">
                                {t(`storefront.${id}.description`)}
                              </p>
                              {onboarding.profile?.store_api_key && (
                                <div className="mt-2 flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-[#6E3DFF]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(
                                        `${window.location.origin}/templates/${id}?api_key=${onboarding.profile!.store_api_key}&demo=1`,
                                        '_blank'
                                      );
                                    }}
                                  >
                                    {t('storefront.previewDemo')} <ExternalLink className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-[#6E3DFF]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(
                                        `${window.location.origin}/templates/${id}?api_key=${onboarding.profile!.store_api_key}`,
                                        '_blank'
                                      );
                                    }}
                                  >
                                    {t('storefront.previewLive')} <ExternalLink className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <StepActions
                      onBack={() => go('store', -1)}
                      onSkip={async () => {
                        await onboarding.skipStep('storefront');
                        await go('product');
                      }}
                      onContinue={async () => {
                        if (!selectedTemplate) {
                          toast.error(t('storefront.needSelect'));
                          return;
                        }
                        await onboarding.selectTemplate(selectedTemplate);
                        await go('product');
                      }}
                      loading={onboarding.saving}
                    />
                  </StepFrame>
                )}

                {step === 'product' && (
                  <StepFrame
                    eyebrow={t('product.eyebrow')}
                    title={t('product.title')}
                    body={t('product.body')}
                    icon={Package}
                  >
                    {onboarding.productCount > 0 ? (
                      <div className="flex flex-col gap-4">
                        <SuccessInline
                          title={t('product.successTitle')}
                          body={t('product.successBody')}
                        />
                        <StepActions
                          onBack={() => go('storefront', -1)}
                          hideSkip
                          onContinue={async () => {
                            await onboarding.completeStep('product');
                            await go('payments');
                          }}
                          loading={onboarding.saving}
                        />
                      </div>
                    ) : (
                      <>
                        <FirstProductStep
                          onCreated={() => onboarding.refreshProducts()}
                          onContinue={async () => {
                            await onboarding.completeStep('product');
                            await go('payments');
                          }}
                          onSkip={async () => {
                            await onboarding.skipStep('product');
                            await go('payments');
                          }}
                        />
                        <div className="pt-2">
                          <Button variant="ghost" onClick={() => go('storefront', -1)}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            {t('actions.back')}
                          </Button>
                        </div>
                      </>
                    )}
                  </StepFrame>
                )}

                {step === 'payments' && (
                  <StepFrame
                    eyebrow={t('payments.eyebrow')}
                    title={t('payments.title')}
                    body={t('payments.body')}
                    icon={CreditCard}
                  >
                    <p className="text-sm font-medium">{t('payments.choose')}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        className="rounded-xl border p-4 text-left hover:border-[#6E3DFF]/50"
                        onClick={() => setPaymentOpen(true)}
                      >
                        <div className="font-medium">{t('payments.netopiaTitle')}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{t('payments.netopiaBody')}</p>
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border p-4 text-left hover:border-[#6E3DFF]/50"
                        onClick={async () => {
                          if (!user) return;
                          const { error } = await supabase
                            .from('profiles')
                            .update({
                              payment_provider: 'none',
                              cash_payment_enabled: true,
                            })
                            .eq('user_id', user.id);
                          if (error) {
                            toast.error(t('payments.failed'));
                            return;
                          }
                          await queryClient.invalidateQueries({ queryKey: ['store-onboarding-profile', user.id] });
                          await onboarding.completeStep('payments');
                          toast.success(t('payments.noneReady'));
                        }}
                      >
                        <div className="font-medium">{t('payments.noneTitle')}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{t('payments.noneBody')}</p>
                      </button>
                    </div>
                    {paymentsConnected && (
                      <SuccessInline
                        title={cashOnlyPayments ? t('payments.connectedNone') : t('payments.connected')}
                        body={cashOnlyPayments ? t('payments.connectedNoneBody') : t('payments.connectedBody')}
                      />
                    )}
                    <StepActions
                      onBack={() => go('product', -1)}
                      onSkip={async () => {
                        await onboarding.skipStep('payments');
                        await go('shipping');
                      }}
                      onContinue={async () => {
                        if (paymentsConnected) {
                          await onboarding.completeStep('payments');
                          await go('shipping');
                          return;
                        }
                        setPaymentOpen(true);
                      }}
                      continueLabel={
                        paymentsConnected ? t('actions.continue') : t('actions.completeSetup')
                      }
                    />
                  </StepFrame>
                )}

                {step === 'shipping' && (
                  <StepFrame
                    eyebrow={t('shipping.eyebrow')}
                    title={t('shipping.title')}
                    body={t('shipping.body')}
                    icon={Truck}
                  >
                    <p className="text-sm font-medium">{t('shipping.choose')}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        className="rounded-xl border p-4 text-left hover:border-[#6E3DFF]/50"
                        onClick={() => setShippingOpen(true)}
                      >
                        <div className="font-medium">{t('shipping.eawbTitle')}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{t('shipping.eawbBody')}</p>
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border p-4 text-left hover:border-[#6E3DFF]/50"
                        onClick={async () => {
                          if (!user) return;
                          const { error } = await supabase
                            .from('profiles')
                            .update({ shipping_provider: 'manual' })
                            .eq('user_id', user.id);
                          if (error) {
                            toast.error(t('shipping.failed'));
                            return;
                          }
                          await supabase.from('delivery_pricing_settings').upsert({
                            user_id: user.id,
                            enabled: true,
                            pricing_mode: 'distance',
                            distance_charge: 'flat',
                            coverage_mode: 'romania',
                          }, { onConflict: 'user_id' });
                          await queryClient.invalidateQueries({ queryKey: ['store-onboarding-profile', user.id] });
                          await onboarding.completeStep('shipping');
                          toast.success(t('shipping.manualReady'));
                        }}
                      >
                        <div className="font-medium">{t('shipping.manualTitle')}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{t('shipping.manualBody')}</p>
                      </button>
                    </div>
                    {onboarding.profile?.shipping_provider === 'manual' && user && (
                      <DeliveryPricingSettings
                        userId={user.id}
                        apiKey={onboarding.profile.store_api_key}
                        ownDelivery
                        originLabel=""
                      />
                    )}
                    {shippingConnected && onboarding.profile?.shipping_provider !== 'manual' && (
                      <SuccessInline
                        title={t('shipping.connected')}
                        body={t('shipping.connectedBody')}
                      />
                    )}
                    {onboarding.profile?.shipping_provider !== 'manual' && !shippingConnected && (
                      <Button
                        className="w-full bg-[#6E3DFF] hover:bg-[#4B21B6] sm:w-auto"
                        onClick={() => setShippingOpen(true)}
                      >
                        {t('shipping.openWizard')}
                      </Button>
                    )}
                    <StepActions
                      onBack={() => go('payments', -1)}
                      onSkip={async () => {
                        await onboarding.skipStep('shipping');
                        await go('settings');
                      }}
                      onContinue={async () => {
                        if (shippingConnected) {
                          await onboarding.completeStep('shipping');
                          await go('settings');
                          return;
                        }
                        setShippingOpen(true);
                      }}
                      continueLabel={
                        shippingConnected ? t('actions.continue') : t('actions.completeSetup')
                      }
                    />
                  </StepFrame>
                )}

                {step === 'settings' && (
                  <StepFrame
                    eyebrow={t('settings.eyebrow')}
                    title={t('settings.title')}
                    body={t('settings.body')}
                    icon={Sparkles}
                  >
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t('settings.storeName')}</Label>
                        <Input
                          value={
                            isDefaultStoreName(onboarding.profile?.store_name)
                              ? storeName
                              : onboarding.profile?.store_name || storeName
                          }
                          onChange={(e) => setStoreName(e.target.value)}
                          onBlur={async () => {
                            if (storeName.trim() && !isDefaultStoreName(storeName)) {
                              await onboarding.saveStoreName(storeName);
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('settings.logo')}</Label>
                        <p className="text-xs text-muted-foreground">{t('settings.logoHint')}</p>
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-dashed px-4 py-3 text-sm font-medium">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !user) return;
                              setUploadingLogo(true);
                              try {
                                const ext = file.name.split('.').pop();
                                const path = `${user.id}/logo-${Date.now()}.${ext}`;
                                const { error } = await supabase.storage
                                  .from('template-images')
                                  .upload(path, file);
                                if (error) throw error;
                                const { data: pub } = supabase.storage
                                  .from('template-images')
                                  .getPublicUrl(path);
                                await supabase.from('template_customization').upsert(
                                  {
                                    user_id: user.id,
                                    template_id: 'elementar',
                                    logo_url: pub.publicUrl,
                                    store_name:
                                      onboarding.profile?.store_name || storeName || 'My Store',
                                  } as never,
                                  { onConflict: 'user_id,template_id' }
                                );
                                toast.success(t('settings.logoUploaded'));
                                onboarding.refreshCustomization();
                              } catch {
                                toast.error(t('settings.uploadFailed'));
                              } finally {
                                setUploadingLogo(false);
                              }
                            }}
                          />
                          {uploadingLogo ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {onboarding.customization?.logo_url
                            ? t('settings.logoUploaded')
                            : t('settings.uploadLogo')}
                        </label>
                        {onboarding.customization?.logo_url && (
                          <img
                            src={onboarding.customization.logo_url}
                            alt=""
                            className="mt-2 h-12 w-12 rounded-lg object-contain"
                          />
                        )}
                      </div>
                    </div>
                    <StepActions
                      onBack={() => go('shipping', -1)}
                      onSkip={async () => {
                        await onboarding.skipStep('settings');
                        await go('review');
                      }}
                      onContinue={async () => {
                        await onboarding.completeStep('settings');
                        await go('review');
                      }}
                    />
                  </StepFrame>
                )}

                {step === 'review' && (
                  <StepFrame
                    eyebrow={t('review.eyebrow')}
                    title={t('review.title')}
                    body={t('review.body')}
                    icon={CheckCircle2}
                  >
                    <div className="space-y-2">
                      {PROGRESS_STEPS.filter((s) => s !== 'review').map((id) => {
                        const status = onboarding.effectiveStatus(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => go(id)}
                            className="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition hover:border-[#6E3DFF]/35"
                          >
                            <div>
                              <div className="text-sm font-medium">
                                {t(`review.steps.${id}`)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {status === 'completed'
                                  ? t('status.completed')
                                  : status === 'skipped'
                                    ? t('status.skipped')
                                    : t('status.notConfigured')}
                              </div>
                            </div>
                            {status === 'completed' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <span className="text-xs font-medium text-[#6E3DFF]">
                                {t('actions.setUpLater')}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <StepActions
                      onBack={() => go('settings', -1)}
                      hideSkip
                      onContinue={async () => {
                        await onboarding.finishSetup();
                        await go('ready');
                      }}
                      continueLabel={t('actions.finish')}
                      loading={onboarding.saving}
                    />
                  </StepFrame>
                )}

                {step === 'ready' && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#6E3DFF]/10">
                      <Sparkles className="h-7 w-7 text-[#6E3DFF]" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                        {partialReady ? t('ready.titlePartial') : t('ready.title')}
                      </h2>
                      <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        {partialReady ? t('ready.bodyPartial') : t('ready.body')}
                      </p>
                    </div>
                    <div className="grid w-full gap-2 rounded-2xl border bg-muted/30 p-4 text-left text-sm sm:grid-cols-2">
                      <ReadyRow
                        label={t('ready.store')}
                        value={onboarding.profile?.store_name || '—'}
                      />
                      <ReadyRow
                        label={t('ready.template')}
                        value={onboarding.state.selected_template || t('ready.none')}
                      />
                      <ReadyRow
                        label={t('ready.products')}
                        value={
                          onboarding.productCount > 0
                            ? String(onboarding.productCount)
                            : t('ready.none')
                        }
                      />
                      <ReadyRow
                        label={t('ready.payments')}
                        value={
                          paymentsConnected ? t('ready.connected') : t('ready.notConnected')
                        }
                      />
                      <ReadyRow
                        label={t('ready.shipping')}
                        value={
                          shippingConnected ? t('ready.connected') : t('ready.notConnected')
                        }
                      />
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                      <Button
                        className="bg-[#6E3DFF] hover:bg-[#4B21B6]"
                        onClick={() => navigate('/app')}
                      >
                        {t('actions.goDashboard')}
                      </Button>
                      {storeUrl && (
                        <Button variant="outline" onClick={() => window.open(storeUrl, '_blank')}>
                          {t('actions.viewStore')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <NetopiaSetupWizard
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        credentials={netopiaCredentials}
        onConnected={async () => {
          await onboarding.refreshProfile();
          await onboarding.completeStep('payments');
        }}
        onFinish={() => setPaymentOpen(false)}
      />
      <EawbSetupWizard
        open={shippingOpen}
        onOpenChange={setShippingOpen}
        profile={onboarding.profile ?? null}
        onApiKeySaved={async () => {
          await onboarding.refreshProfile();
          await onboarding.completeStep('shipping');
        }}
        onProfileFieldsUpdated={() => {
          void onboarding.refreshProfile();
        }}
        onFinish={() => setShippingOpen(false)}
      />
    </div>
  );
};

function WelcomeStep({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const { t } = useTranslation('onboarding');
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 py-4">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6E3DFF]">
          {t('welcome.eyebrow')}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t('welcome.title')}</h1>
        <p className="max-w-lg text-sm text-muted-foreground md:text-base">{t('welcome.body')}</p>
        <p className="text-xs text-muted-foreground">{t('welcome.saved')}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="h-11 bg-[#6E3DFF] hover:bg-[#4B21B6]" onClick={onStart}>
          {t('actions.getStarted')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="ghost" className="h-11" onClick={onSkip}>
          {t('welcome.skipSetup')}
        </Button>
      </div>
    </div>
  );
}

function StepFrame({
  eyebrow,
  title,
  body,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof Store;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="space-y-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#6E3DFF]/10 text-[#6E3DFF]">
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6E3DFF]">
          {eyebrow}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex-1 space-y-5">{children}</div>
    </div>
  );
}

function StepActions({
  onBack,
  onSkip,
  onContinue,
  hideSkip,
  continueLabel,
  loading,
}: {
  onBack?: () => void;
  onSkip?: () => void;
  onContinue: () => void;
  hideSkip?: boolean;
  continueLabel?: string;
  loading?: boolean;
}) {
  const { t } = useTranslation('onboarding');
  return (
    <div className="mt-auto flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2">
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('actions.back')}
          </Button>
        )}
        {!hideSkip && onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            {t('actions.skip')}
          </Button>
        )}
      </div>
      <Button
        className="bg-[#6E3DFF] hover:bg-[#4B21B6]"
        onClick={onContinue}
        disabled={loading}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {continueLabel || t('actions.continue')}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

function SuccessInline({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
        <div>
          <div className="font-medium">{title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}

function ReadyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium capitalize">{value}</div>
    </div>
  );
}

export default SetupWizard;
