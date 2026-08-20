import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { NETOPIA_ACCOUNT_URL, openExternalUrl } from '@/lib/openExternalUrl';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonation } from '@/hooks/useImpersonation';
import { withActingAsUserId } from '@/lib/actingAs';
import { toast } from 'sonner';
import { SetupWizardShell } from '@/components/onboarding/SetupWizardShell';
import {
  SetupHelpAccordion,
  SetupPathTrail,
  SetupStepHeader,
} from '@/components/onboarding/SetupHelp';
import { SetupMaskedValue } from '@/components/onboarding/SetupMaskedValue';

export type NetopiaWizardCredentials = {
  api_key: string;
  signature: string;
  public_key: string;
  sandbox: boolean;
};

type WizardStep = 1 | 2 | 3 | 4 | 5;
type Phase = 'steps' | 'success';

const TOTAL_STEPS = 5;

const stepIcons = {
  1: Store,
  2: CreditCard,
  3: KeyRound,
  4: ShieldCheck,
  5: CheckCircle2,
} as const;

export type NetopiaSetupWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentials: NetopiaWizardCredentials;
  onConnected: (result: { api_key: string; signature: string }) => void;
  onFinish?: () => void;
  onGoToPayments?: () => void;
};

export function NetopiaSetupWizard({
  open,
  onOpenChange,
  credentials,
  onConnected,
  onFinish,
  onGoToPayments,
}: NetopiaSetupWizardProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const { effectiveUserId } = useImpersonation();

  const [step, setStep] = useState<WizardStep>(1);
  const [phase, setPhase] = useState<Phase>('steps');
  const [direction, setDirection] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [signature, setSignature] = useState('');
  const [apiKeyError, setApiKeyError] = useState('');
  const [signatureError, setSignatureError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSignature, setShowSignature] = useState(false);

  const reset = useCallback(() => {
    setStep(1);
    setPhase('steps');
    setDirection(1);
    setApiKey(credentials.api_key || '');
    setSignature(credentials.signature || '');
    setApiKeyError('');
    setSignatureError('');
    setConnecting(false);
    setShowApiKey(false);
    setShowSignature(false);
  }, [credentials.api_key, credentials.signature]);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const goTo = (next: WizardStep) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const validateApiKey = () => {
    if (!apiKey.trim()) {
      setApiKeyError(t('netopiaSetup.errors.apiKeyRequired'));
      return false;
    }
    setApiKeyError('');
    return true;
  };

  const validateSignature = () => {
    if (!signature.trim()) {
      setSignatureError(t('netopiaSetup.errors.signatureRequired'));
      return false;
    }
    setSignatureError('');
    return true;
  };

  const handleContinue = () => {
    if (step === 3 && !validateApiKey()) return;
    if (step === 4 && !validateSignature()) return;
    if (step < 5) goTo((step + 1) as WizardStep);
  };

  const handleBack = () => {
    if (step > 1) goTo((step - 1) as WizardStep);
  };

  const handleConnect = async () => {
    if (!validateApiKey() || !validateSignature()) {
      if (!apiKey.trim()) goTo(3);
      else if (!signature.trim()) goTo(4);
      return;
    }
    if (!user || !effectiveUserId) return;

    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('netopia-payment', {
        body: withActingAsUserId({
          action: 'test_connection',
          api_key: apiKey.trim(),
          signature: signature.trim(),
          public_key: credentials.public_key || null,
          sandbox: credentials.sandbox,
        }),
      });

      if (error) {
        toast.error(error.message || t('toast.connectionFailed'));
        return;
      }
      if (!data?.success) {
        toast.error(data?.error || t('toast.connectionFailed'));
        return;
      }

      const { error: saveError } = await supabase
        .from('profiles')
        .update({
          netpopia_api_key: apiKey.trim(),
          netpopia_signature: signature.trim(),
          payment_provider: 'netpopia',
        })
        .eq('user_id', effectiveUserId);

      if (saveError) {
        toast.error(saveError.message || t('toast.updateFailed'));
        return;
      }

      onConnected({ api_key: apiKey.trim(), signature: signature.trim() });
      setPhase('success');
      toast.success(data.message || t('toast.netopiaOk'));
    } catch (e: any) {
      toast.error(e?.message || t('toast.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleOpenNetopia = async () => {
    try {
      await openExternalUrl(NETOPIA_ACCOUNT_URL);
    } catch {
      toast.error(t('netopiaSetup.errors.openBrowserFailed'));
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA') return;
    if (phase === 'success') return;
    if (connecting) return;
    e.preventDefault();
    if (step === 5) void handleConnect();
    else if (step === 1) handleContinue();
    else handleContinue();
  };

  const StepIcon = stepIcons[step];
  const helpCommon = {
    title: t('netopiaSetup.help.title'),
    pathLabel: t('netopiaSetup.help.path'),
    troubleshootingLabel: t('netopiaSetup.help.troubleshooting'),
    screenshotPlaceholder: t('netopiaSetup.help.screenshotPlaceholder'),
  };

  return (
    <SetupWizardShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('netopiaSetup.title')}
      description={t('netopiaSetup.subtitle')}
      descriptionId="netopia-setup-desc"
      estimatedTime={t('netopiaSetup.estimatedTime')}
      stepOf={t('netopiaSetup.stepOf', { current: step, total: TOTAL_STEPS })}
      completeLabel={t('netopiaSetup.complete')}
      stepperAria={t('netopiaSetup.stepperAria')}
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      phase={phase}
      direction={direction}
      onKeyDown={handleKeyDown}
      successTitle={t('netopiaSetup.success.title')}
      successDescription={t('netopiaSetup.success.description')}
      successPrimaryLabel={t('netopiaSetup.success.finish')}
      successSecondaryLabel={t('netopiaSetup.success.goToPayments')}
      onSuccessPrimary={() => {
        onOpenChange(false);
        onFinish?.();
      }}
      onSuccessSecondary={() => {
        onOpenChange(false);
        onGoToPayments?.();
      }}
      footer={
        step !== 1 ? (
          <div className="sticky bottom-0 flex gap-2 border-t bg-background/95 backdrop-blur px-6 py-4">
            <Button type="button" variant="outline" onClick={handleBack} disabled={connecting} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              {tCommon('back')}
            </Button>
            {step < 5 ? (
              <motion.div className="flex-1" whileTap={{ scale: 0.98 }}>
                <Button type="button" className="w-full" onClick={handleContinue}>
                  {tCommon('continue')}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </motion.div>
            ) : (
              <motion.div className="flex-1" whileTap={{ scale: connecting ? 1 : 0.98 }}>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => void handleConnect()}
                  disabled={connecting}
                >
                  {connecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('netopiaSetup.connecting')}
                    </>
                  ) : (
                    t('netopiaSetup.connect')
                  )}
                </Button>
              </motion.div>
            )}
          </div>
        ) : undefined
      }
    >
      <SetupStepHeader
        icon={<StepIcon className="h-6 w-6" aria-hidden />}
        title={t(`netopiaSetup.steps.${step}.title`)}
        description={t(`netopiaSetup.steps.${step}.description`)}
      />

      {step === 1 && (
        <div className="space-y-4">
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[t('netopiaSetup.paths.netopiaHome'), t('netopiaSetup.paths.createAccount')]}
            explanation={t('netopiaSetup.steps.1.helpExplanation')}
            tips={[
              t('netopiaSetup.steps.1.tip1'),
              t('netopiaSetup.steps.1.tip2'),
              t('netopiaSetup.steps.1.tip3'),
            ]}
          />
          <div className="flex flex-col gap-2">
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button type="button" className="w-full" onClick={() => void handleOpenNetopia()}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('netopiaSetup.steps.1.openNetopia')}
              </Button>
            </motion.div>
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button type="button" variant="outline" className="w-full" onClick={handleContinue}>
                {t('netopiaSetup.steps.1.alreadyHaveAccount')}
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
              t('netopiaSetup.paths.dashboard'),
              t('netopiaSetup.paths.pointOfSale'),
              t('netopiaSetup.paths.createPos'),
              t('netopiaSetup.paths.technicalSettings'),
            ]}
          />
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[
              t('netopiaSetup.paths.dashboard'),
              t('netopiaSetup.paths.pointOfSale'),
              t('netopiaSetup.paths.createPos'),
            ]}
            explanation={t('netopiaSetup.steps.2.helpExplanation')}
            tips={[
              t('netopiaSetup.steps.2.tip1'),
              t('netopiaSetup.steps.2.tip2'),
              t('netopiaSetup.steps.2.tip3'),
            ]}
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <SetupPathTrail
            items={[
              t('netopiaSetup.paths.security'),
              t('netopiaSetup.paths.api'),
              t('netopiaSetup.paths.copyApiKey'),
            ]}
          />
          <div className="space-y-2">
            <Label htmlFor="netopia-wizard-api-key">{t('netopiaSetup.fields.apiKey')}</Label>
            <Input
              id="netopia-wizard-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (apiKeyError) setApiKeyError('');
              }}
              aria-invalid={!!apiKeyError}
              aria-describedby={apiKeyError ? 'netopia-wizard-api-key-error' : undefined}
              placeholder={t('netopiaSetup.fields.apiKeyPlaceholder')}
              className={cn(apiKeyError && 'border-destructive focus-visible:ring-destructive')}
            />
            {apiKeyError && (
              <p id="netopia-wizard-api-key-error" className="text-sm text-destructive" role="alert">
                {apiKeyError}
              </p>
            )}
          </div>
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[
              t('netopiaSetup.paths.security'),
              t('netopiaSetup.paths.api'),
              t('netopiaSetup.paths.copyApiKey'),
            ]}
            explanation={t('netopiaSetup.steps.3.helpExplanation')}
            tips={[
              t('netopiaSetup.steps.3.tip1'),
              t('netopiaSetup.steps.3.tip2'),
              t('netopiaSetup.steps.3.tip3'),
            ]}
          />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <SetupPathTrail
            items={[
              t('netopiaSetup.paths.pointOfSale'),
              t('netopiaSetup.paths.technicalSettings'),
              t('netopiaSetup.paths.posSignature'),
            ]}
          />
          <div className="space-y-2">
            <Label htmlFor="netopia-wizard-signature">{t('netopiaSetup.fields.posSignature')}</Label>
            <Input
              id="netopia-wizard-signature"
              type="password"
              autoComplete="off"
              value={signature}
              onChange={(e) => {
                setSignature(e.target.value);
                if (signatureError) setSignatureError('');
              }}
              aria-invalid={!!signatureError}
              aria-describedby={signatureError ? 'netopia-wizard-signature-error' : undefined}
              placeholder={t('netopiaSetup.fields.posSignaturePlaceholder')}
              className={cn(signatureError && 'border-destructive focus-visible:ring-destructive')}
            />
            {signatureError && (
              <p id="netopia-wizard-signature-error" className="text-sm text-destructive" role="alert">
                {signatureError}
              </p>
            )}
          </div>
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[
              t('netopiaSetup.paths.pointOfSale'),
              t('netopiaSetup.paths.technicalSettings'),
              t('netopiaSetup.paths.posSignature'),
            ]}
            explanation={t('netopiaSetup.steps.4.helpExplanation')}
            tips={[
              t('netopiaSetup.steps.4.tip1'),
              t('netopiaSetup.steps.4.tip2'),
              t('netopiaSetup.steps.4.tip3'),
            ]}
          />
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <SetupMaskedValue
            label={t('netopiaSetup.fields.apiKey')}
            value={apiKey}
            revealed={showApiKey}
            onToggle={() => setShowApiKey((v) => !v)}
            showLabel={t('netopiaSetup.show')}
            hideLabel={t('netopiaSetup.hide')}
          />
          <SetupMaskedValue
            label={t('netopiaSetup.fields.posSignature')}
            value={signature}
            revealed={showSignature}
            onToggle={() => setShowSignature((v) => !v)}
            showLabel={t('netopiaSetup.show')}
            hideLabel={t('netopiaSetup.hide')}
          />
          <SetupHelpAccordion
            {...helpCommon}
            pathItems={[t('netopiaSetup.paths.verify')]}
            explanation={t('netopiaSetup.steps.5.helpExplanation')}
            tips={[
              t('netopiaSetup.steps.5.tip1'),
              t('netopiaSetup.steps.5.tip2'),
              t('netopiaSetup.steps.5.tip3'),
            ]}
          />
        </div>
      )}
    </SetupWizardShell>
  );
}
