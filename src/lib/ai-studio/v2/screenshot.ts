import { domToJpeg } from 'modern-screenshot';

export type CaptureViewport = 'desktop' | 'mobile' | 'tablet';

export const CAPTURE_VIEWPORTS: Record<CaptureViewport, { width: number; label: string }> = {
  desktop: { width: 1280, label: 'Desktop 1280' },
  mobile: { width: 390, label: 'Mobile 390' },
  tablet: { width: 834, label: 'Tablet 834' },
};

export type ScreenshotMeta = {
  viewport: CaptureViewport;
  mimeType: 'image/jpeg';
  widthPx: number;
  heightPx: number;
  /** length of base64 payload (chars) — not logged as content */
  base64Chars: number;
  /** approximate decoded byte size */
  approxBytes: number;
  blankSuspect: boolean;
  captureWidthCss: number;
};

export type CapturedScreenshot = {
  viewport: CaptureViewport;
  width: number;
  mimeType: 'image/jpeg';
  /** data URL — ephemeral; do not persist long-term */
  dataUrl: string;
  byteLength: number;
  meta: ScreenshotMeta;
};

async function readImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to decode screenshot for dimension check'));
    img.src = dataUrl;
  });
}

/** Sample corners/center luminance — blank/near-white or near-black pages are suspicious */
async function isBlankSuspect(dataUrl: string): Promise<boolean> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('decode failed'));
      i.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    const w = Math.min(64, img.naturalWidth);
    const h = Math.min(64, img.naturalHeight);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0;
    let varianceAcc = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += lum;
    }
    const mean = sum / n;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      varianceAcc += (lum - mean) ** 2;
    }
    const variance = varianceAcc / n;
    // Nearly uniform image (blank white/black) → very low variance
    return variance < 40;
  } catch {
    return false;
  }
}

/**
 * Capture a rendered storefront root as JPEG.
 * Caller should temporarily set the preview container width to the target viewport.
 */
export async function captureStorefrontScreenshot(
  element: HTMLElement,
  viewport: CaptureViewport
): Promise<CapturedScreenshot> {
  const { width } = CAPTURE_VIEWPORTS[viewport];
  const dataUrl = await domToJpeg(element, {
    quality: 0.72,
    scale: viewport === 'mobile' ? 1.25 : 1,
    backgroundColor: getComputedStyle(element).backgroundColor || '#ffffff',
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      return !node.classList?.contains('v2gen-chrome-skip');
    },
  });

  const { base64, mimeType } = dataUrlToBase64(dataUrl);
  const dims = await readImageDimensions(dataUrl);
  const blankSuspect = await isBlankSuspect(dataUrl);
  const approxBytes = Math.floor((base64.length * 3) / 4);

  const meta: ScreenshotMeta = {
    viewport,
    mimeType: 'image/jpeg',
    widthPx: dims.width,
    heightPx: dims.height,
    base64Chars: base64.length,
    approxBytes,
    blankSuspect,
    captureWidthCss: width,
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info('[ai-studio-v2][screenshot]', {
      viewport: meta.viewport,
      dimensions: `${meta.widthPx}×${meta.heightPx}`,
      approxBytes: meta.approxBytes,
      base64Chars: meta.base64Chars,
      mimeType: meta.mimeType,
      blankSuspect: meta.blankSuspect,
      // never log base64
    });
  }

  if (dims.width < 100 || dims.height < 100) {
    throw new Error(`Screenshot too small (${dims.width}×${dims.height}) — capture likely failed`);
  }
  if (approxBytes < 2_000) {
    throw new Error(`Screenshot payload too small (~${approxBytes}B) — likely empty capture`);
  }
  if (blankSuspect) {
    throw new Error('Screenshot appears blank/uniform — refusing to send to critic');
  }

  return {
    viewport,
    width,
    mimeType: 'image/jpeg',
    dataUrl,
    byteLength: dataUrl.length,
    meta,
  };
}

export async function captureDesktopAndMobile(element: HTMLElement): Promise<{
  desktop: CapturedScreenshot;
  mobile: CapturedScreenshot;
}> {
  const previousWidth = element.style.width;
  const previousMaxWidth = element.style.maxWidth;

  const previousCaptureViewport = element.getAttribute('data-capture-viewport');
  try {
    element.style.width = `${CAPTURE_VIEWPORTS.desktop.width}px`;
    element.style.maxWidth = `${CAPTURE_VIEWPORTS.desktop.width}px`;
    element.setAttribute('data-capture-viewport', 'desktop');
    await waitForPaint();
    const desktop = await captureStorefrontScreenshot(element, 'desktop');

    element.style.width = `${CAPTURE_VIEWPORTS.mobile.width}px`;
    element.style.maxWidth = `${CAPTURE_VIEWPORTS.mobile.width}px`;
    element.setAttribute('data-capture-viewport', 'mobile');
    await waitForPaint();
    const mobile = await captureStorefrontScreenshot(element, 'mobile');

    return { desktop, mobile };
  } finally {
    element.style.width = previousWidth;
    element.style.maxWidth = previousMaxWidth;
    if (previousCaptureViewport == null) {
      element.removeAttribute('data-capture-viewport');
    } else {
      element.setAttribute('data-capture-viewport', previousCaptureViewport);
    }
  }
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, 120));
    });
  });
}

/** Strip data URL prefix for API payloads that want raw base64 */
export function dataUrlToBase64(dataUrl: string): { base64: string; mimeType: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid data URL');
  return { mimeType: m[1], base64: m[2] };
}
