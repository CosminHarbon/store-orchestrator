import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = 'https://mkkqbekhvcnwcheegjpy.supabase.co';

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Navigate a window (or fall back) to a URL. Prefer the sync-opened tab so
 * mobile Safari/Chrome don't treat this as a blocked popup.
 */
function navigateWindow(win: Window | null, url: string) {
  if (win && !win.closed) {
    try {
      win.location.href = url;
      win.focus?.();
      return true;
    } catch {
      /* fall through */
    }
  }

  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return false;
}

function showLoading(win: Window | null) {
  if (!win || win.closed) return;
  try {
    win.document.write(`<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#334155}
  </style>
</head><body><p>Loading invoice…</p></body></html>`);
    win.document.close();
  } catch {
    /* ignore */
  }
}

function showPdfInWindow(win: Window | null, blobUrl: string) {
  if (!win || win.closed) {
    navigateWindow(null, blobUrl);
    return;
  }

  // Mobile Safari often fails to render blob: PDFs via location.href.
  // Embedding in an iframe/object inside the already-opened tab is reliable.
  if (isMobileBrowser()) {
    try {
      win.document.open();
      win.document.write(`<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice</title>
  <style>
    html,body{margin:0;height:100%;background:#111}
    embed,iframe,object{border:0;width:100%;height:100%;display:block}
    .fallback{padding:24px;font-family:system-ui,-apple-system,sans-serif;color:#fff;text-align:center}
    .fallback a{color:#93c5fd}
  </style>
</head><body>
  <object data="${blobUrl}" type="application/pdf" width="100%" height="100%">
    <iframe src="${blobUrl}" title="Invoice"></iframe>
    <div class="fallback">
      <p>Can't preview this PDF here.</p>
      <p><a href="${blobUrl}" download="invoice.pdf">Download invoice</a></p>
    </div>
  </object>
</body></html>`);
      win.document.close();
      win.focus?.();
      return;
    } catch {
      /* fall through to location.href */
    }
  }

  navigateWindow(win, blobUrl);
}

function triggerDownload(blob: Blob, filename = 'invoice.pdf') {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

/**
 * Opens an Oblio invoice via our Edge Function proxy so browser ad blockers
 * (uBlock/AdGuard filter lists that block oblio.eu) can't break the flow.
 *
 * On mobile, window.open after await is blocked — we open a blank tab
 * synchronously on click, then fill it once the PDF is ready.
 */
export async function openInvoice(orderId: string, fallbackLink?: string) {
  // Open during the user gesture (before any await)
  const preview = window.open('about:blank', '_blank');
  showLoading(preview);

  const fail = () => {
    if (fallbackLink) {
      // Reuse the sync-opened tab so mobile doesn't block a second popup
      if (preview && !preview.closed) {
        navigateWindow(preview, fallbackLink);
        return;
      }
      navigateWindow(null, fallbackLink);
      return;
    }
    if (preview && !preview.closed) {
      try {
        preview.document.open();
        preview.document.write(`<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px">
          <p>Could not open the invoice. Please try again.</p>
        </body></html>`);
        preview.document.close();
      } catch {
        try {
          preview.close();
        } catch {
          /* ignore */
        }
      }
    }
  };

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      fail();
      return;
    }

    const url = `${SUPABASE_URL}/functions/v1/oblio-invoice?orderId=${encodeURIComponent(orderId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: token,
      },
    });

    if (!res.ok) {
      fail();
      return;
    }

    const raw = await res.blob();
    const blob =
      raw.type === 'application/pdf' || raw.type === 'application/octet-stream'
        ? new Blob([raw], { type: 'application/pdf' })
        : raw;
    const blobUrl = URL.createObjectURL(blob);

    if (preview && !preview.closed) {
      showPdfInWindow(preview, blobUrl);
    } else if (isMobileBrowser()) {
      // Popup blocked (common in in-app browsers) — download instead
      triggerDownload(blob);
    } else {
      navigateWindow(null, blobUrl);
    }

    setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
  } catch {
    fail();
  }
}
