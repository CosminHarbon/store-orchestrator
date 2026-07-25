import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = 'https://mkkqbekhvcnwcheegjpy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ra3FiZWtodmNud2NoZWVnanB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY0MzUxNTAsImV4cCI6MjA1MjAxMTE1MH0.PLACEHOLDER';

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
    // Fetch the PDF as a blob via our proxy, then open as a blob URL so no oblio.eu URL is ever loaded by the browser
    const url = `${SUPABASE_URL}/functions/v1/oblio-invoice?orderId=${encodeURIComponent(orderId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: token,
      },
    });
    if (!res.ok) {
      if (fallbackLink) window.open(fallbackLink, '_blank');
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    if (fallbackLink) window.open(fallbackLink, '_blank');
  }
}
