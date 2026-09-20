/**
 * Trusted-server merchant push. Calls send-push-notification with the
 * function service role — never from the browser, never with a Firebase key.
 *
 * Failures are logged and swallowed so checkout / IPN / reviews are not blocked.
 */

export type MerchantNotifyInput = {
  userId: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

function toStringData(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value != null && value !== '') out[key] = String(value);
  }
  return out;
}

export type MerchantNotifyResult = {
  ok: boolean;
  sent?: number;
  total?: number;
  reason?: string;
};

export async function notifyMerchant(input: MerchantNotifyInput): Promise<MerchantNotifyResult> {
  const userId = String(input.userId || '').trim();
  const title = String(input.title || '').trim();
  const body = String(input.body || '').trim();
  if (!userId || !title || !body) {
    console.error('[notifyMerchant] skipped — userId, title, and body are required');
    return { ok: false, reason: 'invalid_input' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) {
    console.error('[notifyMerchant] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        title,
        body,
        data: toStringData(input.data),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[notifyMerchant] send-push-notification failed', response.status, text);
      return { ok: false, reason: `http_${response.status}` };
    }

    const result = await response.json().catch(() => null);
    console.log('[notifyMerchant] result', {
      userId,
      sent: result?.sent,
      total: result?.total,
      success: result?.success,
    });
    const sent = typeof result?.sent === 'number' ? result.sent : 0;
    return {
      ok: sent > 0,
      sent,
      total: typeof result?.total === 'number' ? result.total : undefined,
      reason: sent > 0 ? undefined : 'no_active_device',
    };
  } catch (error) {
    console.error('[notifyMerchant] error', error);
    return { ok: false, reason: 'exception' };
  }
}

export function formatRonAmount(amount: number | string | null | undefined): string {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? ''));
  return `${(Number.isFinite(n) ? n : 0).toFixed(2)} RON`;
}

export function shortOrderRef(orderId: string): string {
  return String(orderId).slice(-8);
}
