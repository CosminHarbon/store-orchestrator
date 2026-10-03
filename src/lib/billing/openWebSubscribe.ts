import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { openExternalUrl } from '@/lib/openExternalUrl';

/** Canonical web origin for SaaS billing (never in-app Stripe Checkout on native). */
export const SPEEDVENDORS_WEB_ORIGIN = 'https://www.speedvendors.com';

/**
 * Open plan selection on the website in the system/in-app browser.
 * When a Supabase session exists, hand it off via /auth/web-session so the
 * merchant lands already signed in and can purchase a plan.
 */
export async function openWebSubscribeInBrowser(nextPath = '/subscribe'): Promise<void> {
  const next =
    typeof nextPath === 'string' && nextPath.startsWith('/') && !nextPath.startsWith('//')
      ? nextPath
      : '/subscribe';

  const base = `${SPEEDVENDORS_WEB_ORIGIN}/auth/web-session?next=${encodeURIComponent(next)}`;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  let url = base;
  if (session?.access_token && session?.refresh_token) {
    const hash = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: String(session.expires_in ?? 3600),
      token_type: 'bearer',
      type: 'magiclink',
    });
    url = `${base}#${hash.toString()}`;
  }

  await openExternalUrl(url);
}

/** Native: open website billing. Web: caller should navigate in-app instead. */
export function shouldOpenSubscribeExternally(): boolean {
  return Capacitor.isNativePlatform();
}
