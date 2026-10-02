import { supabase } from '@/integrations/supabase/client';
import type { AppLanguage } from '@/i18n/types';

export type ContactPreference = 'email' | 'call';

export type StoreSetupRequestInput = {
  contactName: string;
  email: string;
  businessName: string;
  productsDescription: string;
  socialUrl: string;
  contactPreference: ContactPreference;
  phone: string;
  message: string;
};

export type StoreSetupField = keyof StoreSetupRequestInput;

/** i18n keys under landing.setupForm.errors */
export type StoreSetupFieldError = 'required' | 'email' | 'phone' | 'tooLong' | 'tooShort';

export type StoreSetupSubmitError = 'rateLimited' | 'invalid' | 'generic';

export const STORE_SETUP_STATUSES = ['new', 'contacted', 'in_progress', 'launched', 'declined'] as const;
export type StoreSetupStatus = (typeof STORE_SETUP_STATUSES)[number];

export type StoreSetupRequestRow = {
  id: string;
  contact_name: string;
  email: string;
  business_name: string;
  products_description: string;
  social_url: string | null;
  contact_preference: ContactPreference;
  phone: string | null;
  message: string | null;
  language: AppLanguage;
  source: string;
  user_id: string | null;
  status: StoreSetupStatus;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export const EMPTY_STORE_SETUP_REQUEST: StoreSetupRequestInput = {
  contactName: '',
  email: '',
  businessName: '',
  productsDescription: '',
  socialUrl: '',
  contactPreference: 'email',
  phone: '',
  message: '',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ().-]+$/;

/** Mirrors the checks in submit_store_setup_request so most mistakes are caught before the request. */
export function validateStoreSetupRequest(
  input: StoreSetupRequestInput,
): Partial<Record<StoreSetupField, StoreSetupFieldError>> {
  const errors: Partial<Record<StoreSetupField, StoreSetupFieldError>> = {};
  const length = (field: StoreSetupField, min: number, max: number, required = true) => {
    const value = input[field].trim();
    if (!value) {
      if (required) errors[field] = 'required';
      return;
    }
    if (value.length < min) errors[field] = 'tooShort';
    else if (value.length > max) errors[field] = 'tooLong';
  };

  length('contactName', 2, 120);
  length('businessName', 2, 160);
  length('productsDescription', 3, 1000);
  length('socialUrl', 0, 300, false);
  length('message', 0, 2000, false);

  const email = input.email.trim();
  if (!email) errors.email = 'required';
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'email';

  const phone = input.phone.trim();
  if (input.contactPreference === 'call' && !phone) errors.phone = 'required';
  else if (phone && (phone.length < 6 || phone.length > 32 || !PHONE_RE.test(phone))) errors.phone = 'phone';

  return errors;
}

/**
 * Stores the request through the public RPC. Resolves only when the database returned the new
 * row id, so the caller never shows a confirmation for a request that was not saved.
 */
export async function submitStoreSetupRequest(
  input: StoreSetupRequestInput,
  language: AppLanguage,
): Promise<{ ok: true; id: string } | { ok: false; error: StoreSetupSubmitError }> {
  try {
    const { data, error } = await supabase.rpc('submit_store_setup_request' as never, {
      p_contact_name: input.contactName.trim(),
      p_email: input.email.trim(),
      p_business_name: input.businessName.trim(),
      p_products_description: input.productsDescription.trim(),
      p_contact_preference: input.contactPreference,
      p_social_url: input.socialUrl.trim() || null,
      // Phone is only kept when the visitor asked for a call.
      p_phone: input.contactPreference === 'call' ? input.phone.trim() : null,
      p_message: input.message.trim() || null,
      p_language: language,
    } as never);
    if (error) {
      if (error.message?.includes('rate_limited')) return { ok: false, error: 'rateLimited' };
      if (error.code === '22023' || error.code === '23514') return { ok: false, error: 'invalid' };
      return { ok: false, error: 'generic' };
    }
    if (typeof data !== 'string' || !data) return { ok: false, error: 'generic' };
    return { ok: true, id: data };
  } catch {
    return { ok: false, error: 'generic' };
  }
}
