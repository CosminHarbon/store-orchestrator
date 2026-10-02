import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Loader2, Mail, Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/i18n/LanguageProvider';
import {
  EMPTY_STORE_SETUP_REQUEST,
  submitStoreSetupRequest,
  validateStoreSetupRequest,
  type ContactPreference,
  type StoreSetupField,
  type StoreSetupFieldError,
  type StoreSetupRequestInput,
  type StoreSetupSubmitError,
} from '@/lib/storeSetupRequests';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Status = 'idle' | 'submitting' | 'success';

export function SetupRequestDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation('auth');
  const { language } = useLanguage();
  const formId = useId();
  const [values, setValues] = useState<StoreSetupRequestInput>(EMPTY_STORE_SETUP_REQUEST);
  const [errors, setErrors] = useState<Partial<Record<StoreSetupField, StoreSetupFieldError>>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [submitError, setSubmitError] = useState<StoreSetupSubmitError | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  // Start fresh the next time the dialog opens after a successful request.
  useEffect(() => {
    if (!open && status === 'success') {
      setValues(EMPTY_STORE_SETUP_REQUEST);
      setErrors({});
      setStatus('idle');
    }
  }, [open, status]);

  const set = <K extends StoreSetupField>(field: K, value: StoreSetupRequestInput[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'submitting') return;
    setSubmitError(null);

    const nextErrors = validateStoreSetupRequest(values);
    setErrors(nextErrors);
    const firstInvalid = (Object.keys(nextErrors) as StoreSetupField[]).find((key) => nextErrors[key]);
    if (firstInvalid) {
      document.getElementById(`${formId}-${firstInvalid}`)?.focus();
      return;
    }
    // Bots fill the hidden field; nothing is stored, so nothing is confirmed.
    if (honeypotRef.current?.value) {
      setSubmitError('generic');
      return;
    }

    setStatus('submitting');
    const result = await submitStoreSetupRequest(values, language);
    if ('error' in result) {
      setStatus('idle');
      setSubmitError(result.error);
    } else {
      setStatus('success');
    }
  };

  const fieldProps = (field: StoreSetupField) => ({
    id: `${formId}-${field}`,
    value: values[field],
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${formId}-${field}-error` : undefined,
    className: 'sv-input',
    disabled: status === 'submitting',
  });

  const errorFor = (field: StoreSetupField) =>
    errors[field] ? (
      <p id={`${formId}-${field}-error`} className="sv-field-error">
        {t(`landing.setupForm.errors.${errors[field]}`)}
      </p>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sv-marketing w-[calc(100%-1.5rem)] max-w-xl gap-0 rounded-3xl border-[hsl(var(--sv-line))] !bg-[hsl(var(--sv-paper))] p-0 sm:rounded-3xl"
        data-testid="setup-request-dialog"
      >
        {status === 'success' ? (
          <div className="flex flex-col items-center gap-5 px-6 py-12 text-center sm:px-10" role="status">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--sv-accent))]/10 text-[hsl(var(--sv-accent))]">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <DialogTitle className="font-display text-2xl font-bold tracking-tight">
              {t('landing.setupForm.successTitle')}
            </DialogTitle>
            <DialogDescription className="max-w-sm text-base leading-relaxed text-[hsl(var(--sv-ink))]/65">
              {t('landing.setupForm.success')}
            </DialogDescription>
            <button type="button" className="sv-btn sv-btn--ghost mt-2" onClick={() => onOpenChange(false)}>
              {t('landing.setupForm.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-5 px-5 py-7 sm:px-8 sm:py-9">
            <div className="space-y-2 pr-8">
              <p className="sv-eyebrow">{t('landing.setupForm.eyebrow')}</p>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {t('landing.setupForm.title')}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-[hsl(var(--sv-ink))]/60">
                {t('landing.setupForm.subtitle')}
              </DialogDescription>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('landing.setupForm.name')} htmlFor={`${formId}-contactName`} required>
                <input
                  {...fieldProps('contactName')}
                  autoComplete="name"
                  maxLength={120}
                  onChange={(e) => set('contactName', e.target.value)}
                />
                {errorFor('contactName')}
              </Field>
              <Field label={t('landing.setupForm.email')} htmlFor={`${formId}-email`} required>
                <input
                  {...fieldProps('email')}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={254}
                  onChange={(e) => set('email', e.target.value)}
                />
                {errorFor('email')}
              </Field>
            </div>

            <Field label={t('landing.setupForm.business')} htmlFor={`${formId}-businessName`} required>
              <input
                {...fieldProps('businessName')}
                autoComplete="organization"
                maxLength={160}
                onChange={(e) => set('businessName', e.target.value)}
              />
              {errorFor('businessName')}
            </Field>

            <Field label={t('landing.setupForm.products')} htmlFor={`${formId}-productsDescription`} required>
              <textarea
                {...fieldProps('productsDescription')}
                rows={2}
                maxLength={1000}
                placeholder={t('landing.setupForm.productsPlaceholder')}
                onChange={(e) => set('productsDescription', e.target.value)}
              />
              {errorFor('productsDescription')}
            </Field>

            <Field label={t('landing.setupForm.social')} htmlFor={`${formId}-socialUrl`} optional={t('landing.setupForm.optional')}>
              <input
                {...fieldProps('socialUrl')}
                inputMode="url"
                maxLength={300}
                placeholder={t('landing.setupForm.socialPlaceholder')}
                onChange={(e) => set('socialUrl', e.target.value)}
              />
              {errorFor('socialUrl')}
            </Field>

            <fieldset className="space-y-2" disabled={status === 'submitting'}>
              <legend className="sv-label">{t('landing.setupForm.contactPreference')}</legend>
              <div className="flex flex-col gap-2 sm:flex-row">
                {(['email', 'call'] as ContactPreference[]).map((pref) => (
                  <label key={pref} className="sv-choice">
                    <input
                      type="radio"
                      name={`${formId}-contactPreference`}
                      value={pref}
                      checked={values.contactPreference === pref}
                      onChange={() => {
                        set('contactPreference', pref);
                        if (pref === 'email') setErrors((prev) => ({ ...prev, phone: undefined }));
                      }}
                    />
                    {pref === 'email' ? (
                      <Mail className="h-4 w-4 text-[hsl(var(--sv-accent))]" />
                    ) : (
                      <Phone className="h-4 w-4 text-[hsl(var(--sv-accent))]" />
                    )}
                    {t(`landing.setupForm.prefer.${pref}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            {values.contactPreference === 'call' ? (
              <Field label={t('landing.setupForm.phone')} htmlFor={`${formId}-phone`} required>
                <input
                  {...fieldProps('phone')}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={32}
                  onChange={(e) => set('phone', e.target.value)}
                />
                {errorFor('phone')}
              </Field>
            ) : null}

            <Field label={t('landing.setupForm.message')} htmlFor={`${formId}-message`} optional={t('landing.setupForm.optional')}>
              <textarea
                {...fieldProps('message')}
                rows={3}
                maxLength={2000}
                onChange={(e) => set('message', e.target.value)}
              />
              {errorFor('message')}
            </Field>

            {/* Honeypot: hidden from people and assistive tech. */}
            <input
              ref={honeypotRef}
              type="text"
              name="company_website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            <p className="text-xs leading-relaxed text-[hsl(var(--sv-ink))]/50">{t('landing.setupForm.privacyNote')}</p>

            {submitError ? (
              <p role="alert" className="rounded-2xl border border-[hsl(0_75%_55%)]/30 bg-[hsl(0_75%_55%)]/[0.07] px-4 py-3 text-sm">
                {t(`landing.setupForm.submitErrors.${submitError}`)}
              </p>
            ) : null}

            <button
              type="submit"
              className="sv-btn sv-btn--primary sv-btn--lg w-full"
              disabled={status === 'submitting'}
              data-testid="setup-request-submit"
            >
              {status === 'submitting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('landing.setupForm.submitting')}
                </>
              ) : (
                <>
                  {t('landing.setupForm.submit')}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  required,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  optional?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="sv-label">
        {label}
        {required ? (
          <span className="ml-0.5 text-[hsl(var(--sv-accent))]" aria-hidden>
            *
          </span>
        ) : null}
        {optional ? <span className="ml-1.5 font-normal text-[hsl(var(--sv-ink))]/45">({optional})</span> : null}
      </label>
      {children}
    </div>
  );
}
