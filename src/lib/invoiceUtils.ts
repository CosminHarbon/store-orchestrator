import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = 'https://mkkqbekhvcnwcheegjpy.supabase.co';

/**
 * Opens an Oblio invoice via our Edge Function proxy so browser ad blockers
 * (uBlock/AdGuard filter lists that block oblio.eu) can't break the flow.
 */
export async function openInvoice(orderId: string, fallbackLink?: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      if (fallbackLink) window.open(fallbackLink, '_blank');
      return;
    }
    const url = `${SUPABASE_URL}/functions/v1/oblio-invoice?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;
    window.open(url, '_blank');
  } catch {
    if (fallbackLink) window.open(fallbackLink, '_blank');
  }
}
