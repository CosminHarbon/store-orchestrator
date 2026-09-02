import { supabase } from '@/integrations/supabase/client';
import { withActingAsUserId } from '@/lib/actingAs';
import { payloadFromFunctionsInvoke } from '@/lib/edgeFunctionPayload';
import { compressImage } from './compressImage';
import { formatBytes, type MediaType } from './constants';
import { MediaError } from './errors';

export type UploadProgress = 'optimizing' | 'uploading' | 'finalizing';

export type UploadedMedia = {
  assetId: string;
  storagePath: string;
  publicUrl: string;
  bucket: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  originalSizeBytes: number;
};

async function invokeMedia(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('media-authorize-upload', {
    body: withActingAsUserId(body),
  });
  return payloadFromFunctionsInvoke(data, error);
}

function throwFromPayload(payload: Record<string, unknown>): never {
  const err = String(payload.error || 'GENERIC');
  if (err === 'quota_exceeded') {
    throw new MediaError(
      'QUOTA',
      `You've reached your ${formatBytes(Number(payload.quota_bytes) || 0)} media storage limit. Delete unused images or upgrade your plan.`,
      Number(payload.quota_bytes) || undefined,
    );
  }
  if (err === 'unauthorized' || err === 'forbidden') {
    throw new MediaError('UNAUTHORIZED', 'You are not allowed to upload media for this store.');
  }
  if (err === 'invalid_mime' || err === 'unsupported') {
    throw new MediaError('UNSUPPORTED', "This image format isn't supported. Please use JPEG, PNG or WebP.");
  }
  throw new MediaError('NETWORK', 'Upload failed. Please try again.');
}

export async function uploadMedia(options: {
  file: File;
  mediaType: MediaType;
  relatedEntityId?: string | null;
  onProgress?: (phase: UploadProgress) => void;
}): Promise<UploadedMedia> {
  const { file, mediaType, relatedEntityId, onProgress } = options;
  onProgress?.('optimizing');
  const compressed = await compressImage(file, mediaType);

  onProgress?.('uploading');
  const authorized = await invokeMedia({
    action: 'authorize',
    media_type: mediaType,
    mime_type: compressed.mimeType,
    expected_size_bytes: compressed.sizeBytes,
    original_size_bytes: compressed.originalSizeBytes,
    width: compressed.width,
    height: compressed.height,
    related_entity_id: relatedEntityId || null,
  });
  if (authorized.error) throwFromPayload(authorized);

  const reservationId = String(authorized.reservation_id || '');
  const bucket = String(authorized.bucket || '');
  const storagePath = String(authorized.storage_path || '');
  const token = String(authorized.token || '');
  if (!reservationId || !bucket || !storagePath || !token) {
    throw new MediaError('NETWORK', 'Upload failed. Please try again.');
  }

  try {
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .uploadToSignedUrl(storagePath, token, compressed.blob, {
        contentType: compressed.mimeType,
        upsert: false,
      });
    if (uploadError) {
      console.error('signed upload failed', uploadError);
      await invokeMedia({ action: 'release', reservation_id: reservationId });
      throw new MediaError('NETWORK', 'Upload failed. Please try again.');
    }

    onProgress?.('finalizing');
    const finalized = await invokeMedia({
      action: 'finalize',
      reservation_id: reservationId,
    });
    if (finalized.error || !finalized.asset_id) {
      await invokeMedia({ action: 'release', reservation_id: reservationId });
      throwFromPayload(finalized.error ? finalized : { error: 'NETWORK' });
    }

    return {
      assetId: String(finalized.asset_id),
      storagePath: String(finalized.storage_path || storagePath),
      publicUrl: String(finalized.public_url || authorized.public_url || ''),
      bucket: String(finalized.bucket || bucket),
      mimeType: String(finalized.mime_type || compressed.mimeType),
      width: compressed.width,
      height: compressed.height,
      sizeBytes: Number(finalized.size_bytes) || compressed.sizeBytes,
      originalSizeBytes: compressed.originalSizeBytes,
    };
  } catch (error) {
    if (error instanceof MediaError) throw error;
    console.error('uploadMedia', error);
    await invokeMedia({ action: 'release', reservation_id: reservationId }).catch(() => undefined);
    throw new MediaError('NETWORK', 'Upload failed. Please try again.');
  }
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
}
