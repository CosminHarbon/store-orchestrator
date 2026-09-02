import { supabase } from '@/integrations/supabase/client';
import { withActingAsUserId } from '@/lib/actingAs';
import { payloadFromFunctionsInvoke } from '@/lib/edgeFunctionPayload';
import { MediaError } from './errors';

async function invokeMedia(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('media-authorize-upload', {
    body: withActingAsUserId(body),
  });
  return payloadFromFunctionsInvoke(data, error);
}

/**
 * Cleanup a managed SpeedVendors asset.
 * Looks up media_assets by id, storage_path, or exact public_url.
 * External URLs (placehold.co, Unsplash, old Supabase projects) are a no-op.
 * Never derives a Storage path from a URL.
 */
export async function deleteMediaAsset(options: {
  assetId?: string | null;
  publicUrl?: string | null;
  bucket?: string | null;
  storagePath?: string | null;
}): Promise<void> {
  if (!options.assetId && !options.publicUrl && !(options.bucket && options.storagePath)) {
    return;
  }
  const payload = await invokeMedia({
    action: 'delete',
    asset_id: options.assetId || null,
    public_url: options.publicUrl || null,
    bucket: options.bucket || null,
    storage_path: options.storagePath || null,
  });
  if (payload.error && payload.error !== 'not_found') {
    console.error('deleteMediaAsset', payload);
    /* Entity reference is already gone. Keep a recoverable pending_delete row. */
    if (payload.error === 'storage_delete_failed' || payload.pending) return;
    throw new MediaError('NETWORK', 'Could not delete this image. Please try again.');
  }
}

/**
 * Storage cleanup AFTER the product/collection row is already deleted.
 * The Edge Function refuses this while the entity still exists.
 */
export async function deleteEntityMedia(
  entityType: 'product' | 'collection' | 'logo' | 'hero',
  entityId: string,
): Promise<void> {
  const payload = await invokeMedia({
    action: 'delete_entity',
    entity_type: entityType,
    entity_id: entityId,
  });
  if (payload.error === 'entity_still_exists') {
    console.error('deleteEntityMedia called before the entity row was removed');
    throw new MediaError('NETWORK', 'Could not delete media for this item. Please try again.');
  }
  if (payload.error) {
    console.error('deleteEntityMedia', payload);
    /* Product/collection is already gone; leftover assets are marked pending_delete. */
    return;
  }
}

/** Upload new media first, persist the new URL, then cleanup the previous managed asset. */
export async function deletePreviousMedia(publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl) return;
  try {
    await deleteMediaAsset({ publicUrl });
  } catch (error) {
    console.error('deletePreviousMedia', error);
  }
}
