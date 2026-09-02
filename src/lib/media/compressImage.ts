import {
  COMPRESS_PRESETS,
  HARD_UPLOAD_CEILING_BYTES,
  computeFitSize,
  type AllowedOutputMime,
  type MediaType,
} from './constants';
import { MediaError } from './errors';

export type CompressedImage = {
  blob: Blob;
  mimeType: AllowedOutputMime;
  width: number;
  height: number;
  originalSizeBytes: number;
  sizeBytes: number;
};

function isHeic(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

function canUseWebp(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

async function decodeBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, {
        imageOrientation: 'from-image',
      } as ImageBitmapOptions);
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* fall through to HTMLImageElement — WKWebView / older Android */
      }
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode_failed'));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sourceSize(src: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return { width: src.width, height: src.height };
}

function hasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const sampleW = Math.min(width, 64);
    const sampleH = Math.min(height, 64);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return true;
    }
  } catch {
    return true;
  }
  return false;
}

function drawScaled(
  source: ImageBitmap | HTMLImageElement,
  destW: number,
  destH: number,
): HTMLCanvasElement {
  let srcW = source.width;
  let srcH = source.height;
  let current: CanvasImageSource = source;

  while (srcW > destW * 2 && srcH > destH * 2) {
    const midW = Math.max(destW, Math.round(srcW / 2));
    const midH = Math.max(destH, Math.round(srcH / 2));
    const tmp = document.createElement('canvas');
    tmp.width = midW;
    tmp.height = midH;
    const ctx = tmp.getContext('2d');
    if (!ctx) throw new MediaError('GENERIC', 'Canvas is not available.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, midW, midH);
    current = tmp;
    srcW = midW;
    srcH = midH;
  }

  const canvas = document.createElement('canvas');
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new MediaError('GENERIC', 'Canvas is not available.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(current, 0, 0, destW, destH);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: AllowedOutputMime,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('toBlob_failed'));
          else resolve(blob);
        },
        mime,
        quality,
      );
      return;
    }
    try {
      const dataUrl = canvas.toDataURL(mime, quality);
      const comma = dataUrl.indexOf(',');
      const binary = atob(dataUrl.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type: mime }));
    } catch {
      reject(new Error('toBlob_failed'));
    }
  });
}

async function encodeLoop(
  canvas: HTMLCanvasElement,
  mime: AllowedOutputMime,
  startQuality: number,
  minQuality: number,
  targetBytes: number,
): Promise<Blob> {
  let quality = startQuality;
  let best: Blob | null = null;
  while (quality >= minQuality - 0.001) {
    const blob = await canvasToBlob(canvas, mime, quality);
    best = blob;
    if (blob.size <= targetBytes) return blob;
    quality -= 0.06;
  }
  return best!;
}

/**
 * Resize and compress a merchant image in the browser / Capacitor WebView.
 * Never upscales. Prefers WebP. Preserves alpha for logos.
 */
export async function compressImage(file: File, mediaType: MediaType): Promise<CompressedImage> {
  const preset = COMPRESS_PRESETS[mediaType];
  const originalSizeBytes = file.size;

  if (originalSizeBytes > preset.maxInputBytes) {
    throw new MediaError(
      'SOURCE_TOO_LARGE',
      mediaType === 'logo'
        ? 'Images must be 5 MB or smaller.'
        : 'Images must be 10 MB or smaller.',
    );
  }

  if (isHeic(file)) {
    /* Try decode anyway — some WebViews can handle HEIC. */
  }

  let decoded: ImageBitmap | HTMLImageElement;
  try {
    decoded = await decodeBitmap(file);
  } catch {
    throw new MediaError(
      'UNSUPPORTED',
      "This image format isn't supported on this device. Please choose a JPEG, PNG or WebP image.",
    );
  }

  try {
    const src = sourceSize(decoded);
    if (!src.width || !src.height) {
      throw new MediaError('UNSUPPORTED', "This image format isn't supported.");
    }

    let { width, height } = computeFitSize(src.width, src.height, preset.maxDimension);
    let canvas = drawScaled(decoded, width, height);
    const ctx = canvas.getContext('2d');
    const alpha = preset.preserveAlpha && ctx ? hasAlpha(ctx, width, height) : false;
    const webpOk = canUseWebp();

    let mime: AllowedOutputMime;
    if (alpha) {
      mime = webpOk ? 'image/webp' : 'image/png';
    } else if (webpOk) {
      mime = 'image/webp';
    } else {
      mime = 'image/jpeg';
    }

    let blob = await encodeLoop(
      canvas,
      mime,
      preset.startQuality,
      preset.minQuality,
      preset.targetBytes,
    );

    let guard = 0;
    while (
      blob.size > Math.min(preset.targetBytes * 1.15, HARD_UPLOAD_CEILING_BYTES) &&
      guard < 6 &&
      Math.max(width, height) > 2
    ) {
      const nextW = Math.max(1, Math.round(width * 0.85));
      const nextH = Math.max(1, Math.round(height * 0.85));
      if (nextW >= width && nextH >= height) break;
      width = nextW;
      height = nextH;
      canvas = drawScaled(decoded, width, height);
      blob = await encodeLoop(
        canvas,
        mime,
        preset.startQuality,
        preset.minQuality,
        preset.targetBytes,
      );
      guard += 1;
    }

    while (blob.size > HARD_UPLOAD_CEILING_BYTES && Math.max(width, height) > 2) {
      const nextW = Math.max(1, Math.round(width * 0.8));
      const nextH = Math.max(1, Math.round(height * 0.8));
      if (nextW >= width && nextH >= height) break;
      width = nextW;
      height = nextH;
      canvas = drawScaled(decoded, width, height);
      blob = await encodeLoop(canvas, mime, preset.minQuality, preset.minQuality, HARD_UPLOAD_CEILING_BYTES);
    }

    if (blob.size > HARD_UPLOAD_CEILING_BYTES) {
      throw new MediaError(
        'GENERIC',
        'This image could not be optimized enough to upload. Try a simpler image.',
      );
    }

    return {
      blob,
      mimeType: mime,
      width,
      height,
      originalSizeBytes,
      sizeBytes: blob.size,
    };
  } finally {
    if ('close' in decoded && typeof decoded.close === 'function') {
      decoded.close();
    }
  }
}
