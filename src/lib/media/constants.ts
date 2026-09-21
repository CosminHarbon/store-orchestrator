/** Canonical SpeedVendors media quotas. Do not read billing_subscriptions.plan. */
import { MEDIA_QUOTA_BYTES as PLAN_MEDIA_QUOTA_BYTES, mediaQuotaBytesForTier as planMediaQuotaBytesForTier } from '@shared/speedvendorsPlans';

export const MEDIA_QUOTA_BYTES = PLAN_MEDIA_QUOTA_BYTES;

export type MediaTier = 'start' | 'growth' | 'scale' | 'custom';

export type MediaType = 'product' | 'collection' | 'logo' | 'hero' | 'builder';

export type MediaBucket = 'product-images' | 'template-images';

export const MEDIA_BUCKET: Record<MediaType, MediaBucket> = {
  product: 'product-images',
  collection: 'product-images',
  logo: 'template-images',
  hero: 'template-images',
  builder: 'template-images',
};

export const HARD_OBJECT_LIMIT_BYTES = 2 * 1024 * 1024;
/** Stay under the 2 MB bucket ceiling after compression. */
export const HARD_UPLOAD_CEILING_BYTES = Math.floor(1.85 * 1024 * 1024);

export const ALLOWED_OUTPUT_MIME = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type AllowedOutputMime = (typeof ALLOWED_OUTPUT_MIME)[number];

export type CompressPreset = {
  maxInputBytes: number;
  maxDimension: number;
  targetBytes: number;
  preserveAlpha: boolean;
  startQuality: number;
  minQuality: number;
};

export const COMPRESS_PRESETS: Record<MediaType, CompressPreset> = {
  product: {
    maxInputBytes: 10 * 1024 * 1024,
    maxDimension: 2000,
    targetBytes: 800 * 1024,
    preserveAlpha: false,
    startQuality: 0.82,
    minQuality: 0.58,
  },
  collection: {
    maxInputBytes: 10 * 1024 * 1024,
    maxDimension: 2000,
    targetBytes: 800 * 1024,
    preserveAlpha: false,
    startQuality: 0.82,
    minQuality: 0.58,
  },
  logo: {
    maxInputBytes: 5 * 1024 * 1024,
    maxDimension: 1200,
    targetBytes: 400 * 1024,
    preserveAlpha: true,
    startQuality: 0.86,
    minQuality: 0.7,
  },
  hero: {
    maxInputBytes: 10 * 1024 * 1024,
    maxDimension: 2400,
    targetBytes: 1024 * 1024,
    preserveAlpha: false,
    startQuality: 0.82,
    minQuality: 0.58,
  },
  builder: {
    maxInputBytes: 10 * 1024 * 1024,
    maxDimension: 2400,
    targetBytes: 1024 * 1024,
    preserveAlpha: false,
    startQuality: 0.82,
    minQuality: 0.58,
  },
};

export function mediaQuotaBytesForTier(tier: string | null | undefined): number {
  return planMediaQuotaBytesForTier(tier);
}

export function computeFitSize(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (longest <= maxDimension) return { width: w, height: h };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function extensionForMime(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

/** Bytes are always stored as integers; this is display-only (binary units, trailing zeros trimmed). */
export function formatBytes(bytes: number, maxDecimals?: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const digits = maxDecimals ?? (value >= 10 || i === 0 ? 0 : 1);
  return `${Number(value.toFixed(digits))} ${units[i]}`;
}

export type MediaUsageSnapshot = {
  user_id: string;
  bytes_used: number;
  bytes_reserved: number;
  quota_bytes: number;
  tier: string;
  percent: number;
  /** Actual compressed bytes on disk — only populated for superadmin / impersonation. */
  bytes_stored: number | null;
};
