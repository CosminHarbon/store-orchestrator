/**
 * Free-trial reminder copy + multi-channel delivery.
 *
 * Channels:
 *  - in_app: the persisted public.trial_reminders row + the server-driven trial banner/card.
 *  - push:   existing notifyMerchant → send-push-notification (FCM).
 *  - email:  optional. SpeedVendors has no transactional-email provider today (Supabase Auth
 *            mails only), so email is sent through Resend when RESEND_API_KEY and
 *            TRIAL_EMAIL_FROM are set, and recorded as "skipped:not_configured" otherwise.
 *
 * Duplicate prevention is NOT done here — it is done by the database claim
 * (claim_due_trial_reminders / trial_reminders_once_uidx) before this module is called.
 */

import { notifyMerchant } from './notifyMerchant.ts';

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type TrialMilestone = '3d' | '1d' | 'final' | 'expired';
export type Lang = 'ro' | 'en';

export type ReminderCopy = { title: string; body: string; cta: string };

export function trialReminderCopy(
  milestone: TrialMilestone,
  lang: Lang,
  daysRemaining?: number,
): ReminderCopy {
  const days = Math.max(1, Math.round(daysRemaining ?? 3));
  if (lang === 'en') {
    switch (milestone) {
      case '3d':
        return {
          title: `Your free trial ends in ${days} days`,
          body: `Your SpeedVendors free trial ends in ${days} days. You still have full access to your store and all features.`,
          cta: 'Choose a plan',
        };
      case '1d':
        return {
          title: 'Your free trial ends tomorrow',
          body: 'Your SpeedVendors free trial ends tomorrow. Choose a plan to keep your store running with SpeedVendors.',
          cta: 'Choose a plan',
        };
      case 'final':
        return {
          title: 'Last day of your free trial',
          body: 'Today is the last day of your SpeedVendors free trial. Choose a plan to keep your store running with SpeedVendors.',
          cta: 'Choose a plan',
        };
      case 'expired':
        return {
          title: 'Your free trial has ended',
          body: 'Your free trial has ended. Choose a plan to continue using SpeedVendors. Your store and data are still safe.',
          cta: 'Choose a plan',
        };
    }
  }
  switch (milestone) {
    case '3d':
      return {
        title: `Perioada de probă se încheie în ${days} zile`,
        body: `Perioada ta de probă gratuită SpeedVendors se încheie în ${days} zile. Ai în continuare acces complet la magazin și la toate funcțiile.`,
        cta: 'Alege un plan',
      };
    case '1d':
      return {
        title: 'Perioada de probă se încheie mâine',
        body: 'Perioada ta de probă gratuită SpeedVendors se încheie mâine. Alege un plan pentru ca magazinul tău să continue să funcționeze cu SpeedVendors.',
        cta: 'Alege un plan',
      };
    case 'final':
      return {
        title: 'Ultima zi de probă gratuită',
        body: 'Astăzi este ultima zi a perioadei tale de probă gratuite SpeedVendors. Alege un plan pentru ca magazinul tău să continue să funcționeze.',
        cta: 'Alege un plan',
      };
    case 'expired':
      return {
        title: 'Perioada de probă s-a încheiat',
        body: 'Perioada ta de probă gratuită s-a încheiat. Alege un plan pentru a continua să folosești SpeedVendors. Magazinul și datele tale sunt în siguranță.',
        cta: 'Alege un plan',
      };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appUrl(): string {
  return (Deno.env.get('APP_URL') || 'https://www.speedvendors.com').replace(/\/+$/, '');
}

export type ChannelResult = { ok: boolean; detail: string };

async function sendEmail(
  to: string,
  copy: ReminderCopy,
): Promise<ChannelResult> {
  const apiKey = (Deno.env.get('RESEND_API_KEY') || '').trim();
  const from = (Deno.env.get('TRIAL_EMAIL_FROM') || '').trim();
  if (!apiKey || !from) return { ok: false, detail: 'skipped:not_configured' };

  const link = `${appUrl()}/subscribe`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:18px;font-weight:600;padding-bottom:12px">${escapeHtml(copy.title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.55;padding-bottom:24px">${escapeHtml(copy.body)}</td></tr>
<tr><td><a href="${escapeHtml(link)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600">${escapeHtml(copy.cta)}</a></td></tr>
</table></td></tr></table></body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: copy.title,
        html,
        text: `${copy.body}\n\n${copy.cta}: ${link}`,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[trialReminders] email failed', res.status, text.slice(0, 200));
      return { ok: false, detail: `http_${res.status}` };
    }
    return { ok: true, detail: 'sent' };
  } catch (err) {
    console.error('[trialReminders] email exception', err);
    return { ok: false, detail: 'exception' };
  }
}

export type DeliveryOutcome = {
  status: 'sent' | 'partial' | 'failed';
  channels: Record<string, string>;
};

/**
 * Deliver one reminder across channels. Never throws: every channel failure is captured in
 * the returned per-channel detail so the reminder row records exactly what happened.
 */
export async function deliverTrialReminder(
  admin: AdminClient,
  params: {
    userId: string;
    milestone: TrialMilestone;
    daysRemaining?: number;
    source: 'cron' | 'manual';
  },
): Promise<DeliveryOutcome> {
  const channels: Record<string, string> = { in_app: 'recorded' };

  try {
    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(params.userId);
    if (userErr || !userRes?.user) {
      channels.push = 'skipped:user_not_found';
      channels.email = 'skipped:user_not_found';
      return { status: 'failed', channels };
    }
    const email = userRes.user.email ?? null;

    const { data: profile } = await admin
      .from('profiles')
      .select('preferred_language')
      .eq('user_id', params.userId)
      .maybeSingle();
    const lang: Lang = profile?.preferred_language === 'en' ? 'en' : 'ro';
    const copy = trialReminderCopy(params.milestone, lang, params.daysRemaining);

    const push = await notifyMerchant({
      userId: params.userId,
      title: copy.title,
      body: copy.body,
      data: {
        type: 'billing',
        event: `trial_reminder_${params.milestone}`,
        route: '/subscribe',
      },
    });
    channels.push = push.ok ? 'sent' : `failed:${push.reason ?? 'unknown'}`;

    if (email) {
      const mail = await sendEmail(email, copy);
      channels.email = mail.ok ? 'sent' : mail.detail.startsWith('skipped') ? mail.detail : `failed:${mail.detail}`;
    } else {
      channels.email = 'skipped:no_email';
    }

    const external = channels.push === 'sent' || channels.email === 'sent';
    return { status: external ? 'sent' : 'partial', channels };
  } catch (err) {
    console.error('[trialReminders] deliver exception', err);
    channels.error = err instanceof Error ? err.message.slice(0, 120) : 'unknown';
    return { status: 'failed', channels };
  }
}
