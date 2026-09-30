/**
 * Notify SpeedVendors staff when a merchant submits a storefront design request.
 * Auth: merchant JWT. Verifies the request belongs to the caller, then emails staff.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function notifyRecipients(): string[] {
  const raw =
    (Deno.env.get('DESIGN_REQUEST_NOTIFY_EMAIL') || '').trim() ||
    (Deno.env.get('ADMIN_NOTIFY_EMAIL') || '').trim() ||
    'cosminharbon@icloud.com';
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function appUrl(): string {
  return (Deno.env.get('APP_URL') || 'https://www.speedvendors.com').replace(/\/+$/, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as { request_id?: string };
    const requestId = String(body.request_id || '').trim();
    if (!requestId) return json({ error: 'request_id_required' }, 400);

    const admin = createClient(supabaseUrl, service);
    const { data: row, error } = await admin
      .from('storefront_design_requests')
      .select(
        'id, user_id, store_name, selected_styles, inspiration_text, inspiration_urls, notes, status, created_at',
      )
      .eq('id', requestId)
      .maybeSingle();

    if (error || !row) return json({ error: 'not_found' }, 404);
    if (row.user_id !== user.id) return json({ error: 'forbidden' }, 403);

    const recipients = notifyRecipients();
    if (recipients.length === 0) {
      return json({ ok: false, skipped: 'no_recipients' });
    }

    const apiKey = (Deno.env.get('RESEND_API_KEY') || '').trim();
    const from =
      (Deno.env.get('DESIGN_REQUEST_EMAIL_FROM') || '').trim() ||
      (Deno.env.get('TRIAL_EMAIL_FROM') || '').trim();
    if (!apiKey || !from) {
      console.warn('[design-request-notify] Resend not configured');
      return json({ ok: false, skipped: 'email_not_configured' });
    }

    const adminLink = `${appUrl()}/admin`;
    const styles = Array.isArray(row.selected_styles) ? row.selected_styles.join(', ') : '—';
    const store = row.store_name || 'Untitled store';
    const subject = `New storefront design request — ${store}`;
    const text = [
      `A merchant submitted a specialist design request.`,
      ``,
      `Store: ${store}`,
      `User: ${row.user_id}`,
      `Email: ${user.email || '—'}`,
      `Styles: ${styles}`,
      `Inspiration: ${row.inspiration_text || '—'}`,
      `Notes: ${row.notes || '—'}`,
      `URLs: ${(row.inspiration_urls || []).join(', ') || '—'}`,
      ``,
      `Open admin → Designs: ${adminLink}`,
    ].join('\n');

    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:18px;font-weight:600;padding-bottom:8px;color:#1A0F2E">${escapeHtml(subject)}</td></tr>
<tr><td style="font-size:14px;line-height:1.55;padding-bottom:16px;color:#4b5563">Open <strong>Admin → Designs</strong> to review and update status.</td></tr>
<tr><td style="font-size:14px;line-height:1.6;padding-bottom:20px">
<strong>Store:</strong> ${escapeHtml(store)}<br/>
<strong>Merchant email:</strong> ${escapeHtml(user.email || '—')}<br/>
<strong>Styles:</strong> ${escapeHtml(styles)}<br/>
<strong>Inspiration:</strong> ${escapeHtml(row.inspiration_text || '—')}<br/>
<strong>Notes:</strong> ${escapeHtml(row.notes || '—')}
</td></tr>
<tr><td><a href="${escapeHtml(adminLink)}" style="display:inline-block;background:#6E3DFF;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600">Open admin Designs</a></td></tr>
</table></td></tr></table></body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[design-request-notify] resend failed', res.status, detail.slice(0, 300));
      return json({ ok: false, error: 'email_failed', status: res.status }, 502);
    }

    return json({ ok: true, emailed: recipients.length });
  } catch (e) {
    console.error('[design-request-notify]', e);
    return json({ error: 'internal' }, 500);
  }
});
