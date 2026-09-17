import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { resolveActingOwnerId } from '../_shared/actingAs.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_MIME = new Set(['image/webp', 'image/jpeg', 'image/png']);
const HARD_OBJECT_LIMIT = 2 * 1024 * 1024;
/** Maximum original (pre-compression) file size accepted per media type. */
const MAX_ORIGINAL_BYTES: Record<string, number> = {
  product: 10 * 1024 * 1024,
  collection: 10 * 1024 * 1024,
  logo: 5 * 1024 * 1024,
  hero: 10 * 1024 * 1024,
  builder: 10 * 1024 * 1024,
};
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MediaType = 'product' | 'collection' | 'logo' | 'hero' | 'builder';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function extForMime(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

function bucketFor(mediaType: MediaType): 'product-images' | 'template-images' {
  return mediaType === 'product' || mediaType === 'collection'
    ? 'product-images'
    : 'template-images';
}

function canonicalPath(merchantId: string, mediaType: MediaType, mime: string, entityId?: string): string {
  const id = crypto.randomUUID();
  const ext = extForMime(mime);
  if (mediaType === 'product') return `${merchantId}/products/${entityId}/${id}.${ext}`;
  if (mediaType === 'collection') return `${merchantId}/collections/${entityId}/${id}.${ext}`;
  if (mediaType === 'logo') return `${merchantId}/branding/logo/${id}.${ext}`;
  if (mediaType === 'hero') return `${merchantId}/branding/hero/${id}.${ext}`;
  return `${merchantId}/builder/${id}.${ext}`;
}

type AssetRow = {
  id: string;
  user_id: string;
  bucket: string;
  storage_path: string;
  status?: string;
};

async function assertEntityOwnership(
  admin: ReturnType<typeof createClient>,
  merchantId: string,
  mediaType: MediaType,
  relatedEntityId?: string | null,
): Promise<string | null> {
  if (mediaType === 'product' || mediaType === 'collection') {
    if (!relatedEntityId || !UUID_RE.test(relatedEntityId)) {
      throw new Error('entity_required');
    }
    const table = mediaType === 'product' ? 'products' : 'collections';
    const { data, error } = await admin
      .from(table)
      .select('id, user_id')
      .eq('id', relatedEntityId)
      .maybeSingle();
    if (error || !data || data.user_id !== merchantId) {
      throw new Error('entity_forbidden');
    }
    return relatedEntityId;
  }
  return relatedEntityId && UUID_RE.test(relatedEntityId) ? relatedEntityId : null;
}

async function storageObjectExists(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  storagePath: string,
): Promise<boolean> {
  const folder = storagePath.split('/').slice(0, -1).join('/');
  const name = storagePath.split('/').pop();
  if (!name) return false;
  const { data } = await admin.storage.from(bucket).list(folder, { search: name, limit: 20 });
  return (data || []).some((f) => f.name === name);
}

/** Mark pending, remove Storage, then drop the row + usage only after Storage is gone. */
async function purgeAsset(
  admin: ReturnType<typeof createClient>,
  asset: AssetRow,
): Promise<{ id: string; deleted: boolean; pending: boolean }> {
  await admin
    .from('media_assets')
    .update({
      status: 'pending_delete',
      delete_attempted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', asset.id);

  const { error: rmErr } = await admin.storage.from(asset.bucket).remove([asset.storage_path]);
  const stillThere = await storageObjectExists(admin, asset.bucket, asset.storage_path);
  if (rmErr && stillThere) {
    await admin
      .from('media_assets')
      .update({
        status: 'delete_failed',
        delete_attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', asset.id);
    console.error('storage remove failed', rmErr.message, asset.storage_path);
    return { id: asset.id, deleted: false, pending: true };
  }

  const { error: recErr } = await admin.rpc('record_media_deletion', { p_asset_id: asset.id });
  if (recErr) {
    console.error('record_media_deletion', recErr.message);
    await admin
      .from('media_assets')
      .update({
        status: 'delete_failed',
        delete_attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', asset.id);
    return { id: asset.id, deleted: false, pending: true };
  }
  return { id: asset.id, deleted: true, pending: false };
}

async function purgePendingForMerchant(
  admin: ReturnType<typeof createClient>,
  merchantId: string,
): Promise<void> {
  const { data } = await admin
    .from('media_assets')
    .select('id, user_id, bucket, storage_path, status')
    .eq('user_id', merchantId)
    .in('status', ['pending_delete', 'delete_failed'])
    .limit(20);
  for (const row of data || []) {
    await purgeAsset(admin, row as AssetRow);
  }
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
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, service);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || 'authorize');
    const merchantId = await resolveActingOwnerId(
      admin,
      user,
      jwt,
      typeof body.acting_as_user_id === 'string' ? body.acting_as_user_id : null,
    );

    if (action === 'purge_pending' || action === 'delete' || action === 'delete_entity') {
      await purgePendingForMerchant(admin, merchantId);
    }
    if (action === 'purge_pending') {
      return json({ ok: true });
    }

    if (action === 'authorize') {
      const mediaType = String(body.media_type || '') as MediaType;
      if (!['product', 'collection', 'logo', 'hero', 'builder'].includes(mediaType)) {
        return json({ error: 'invalid_media_type' }, 400);
      }
      const mimeType = String(body.mime_type || '');
      if (!ALLOWED_MIME.has(mimeType)) return json({ error: 'invalid_mime' }, 400);
      const expected = Number(body.expected_size_bytes);
      if (!Number.isFinite(expected) || expected < 1 || expected > HARD_OBJECT_LIMIT) {
        return json({ error: 'invalid_size' }, 400);
      }

      // --- original_size_bytes hardening ---
      const rawOriginal = body.original_size_bytes;
      if (rawOriginal == null || rawOriginal === '') {
        return json({ error: 'original_size_required' }, 400);
      }
      const original = Number(rawOriginal);
      if (!Number.isFinite(original) || original < 1 || original !== Math.floor(original)) {
        return json({ error: 'invalid_original_size' }, 400);
      }
      // Original must be >= compressed (you can't compress into something larger)
      if (original < expected) {
        return json({ error: 'original_smaller_than_compressed' }, 400);
      }
      const maxOriginal = MAX_ORIGINAL_BYTES[mediaType] || 10 * 1024 * 1024;
      if (original > maxOriginal) {
        return json({ error: 'original_too_large', max_bytes: maxOriginal }, 400);
      }

      const relatedId = await assertEntityOwnership(
        admin,
        merchantId,
        mediaType,
        typeof body.related_entity_id === 'string' ? body.related_entity_id : null,
      );
      const bucket = bucketFor(mediaType);
      const storagePath = canonicalPath(merchantId, mediaType, mimeType, relatedId || undefined);

      // --- Replacement resolution: public_url → media_assets.id ---
      let replacingAssetId: string | null = null;
      if (typeof body.replacing_public_url === 'string' && body.replacing_public_url) {
        const { data: matches, error: lookupErr } = await admin
          .from('media_assets')
          .select('id, user_id, status, media_type, bucket, related_entity_type, related_entity_id')
          .eq('user_id', merchantId)
          .eq('public_url', body.replacing_public_url)
          .eq('status', 'active');
        if (lookupErr) {
          console.error('replacing asset lookup', lookupErr.message);
          return json({ error: 'replacement_lookup_failed' }, 500);
        }
        if (!matches || matches.length === 0) {
          return json({ error: 'replacing_asset_not_found' }, 404);
        }
        if (matches.length > 1) {
          console.error('ambiguous replacing_public_url', {
            url: body.replacing_public_url,
            merchant: merchantId,
            count: matches.length,
          });
          return json({ error: 'replacing_asset_ambiguous' }, 409);
        }
        const oldAsset = matches[0];
        const expectedBucket = bucketFor(mediaType);

        if (oldAsset.media_type !== mediaType || oldAsset.bucket !== expectedBucket) {
          return json({ error: 'replacing_asset_type_mismatch' }, 400);
        }

        if (mediaType === 'collection') {
          if (!relatedId || !oldAsset.related_entity_id || oldAsset.related_entity_id !== relatedId) {
            return json({ error: 'replacing_asset_entity_mismatch' }, 400);
          }
        }

        replacingAssetId = oldAsset.id;
      }

      const { data: reserved, error: reserveError } = await admin.rpc('reserve_media_upload', {
        p_user_id: merchantId,
        p_requested_bytes: expected,
        p_bucket: bucket,
        p_storage_path: storagePath,
        p_media_type: mediaType,
        p_mime_type: mimeType,
        p_original_size_bytes: original,
        p_width: body.width ?? null,
        p_height: body.height ?? null,
        p_related_entity_type: mediaType,
        p_related_entity_id: relatedId,
        p_uploaded_by: user.id,
        p_replacing_asset_id: replacingAssetId,
      });
      if (reserveError) {
        console.error('reserve_media_upload', reserveError.message);
        return json({ error: 'reserve_failed' }, 500);
      }
      const reserve = reserved as { ok?: boolean; error?: string; reservation_id?: string; quota_bytes?: number };
      if (!reserve?.ok) {
        return json(
          {
            error: reserve?.error || 'quota_exceeded',
            quota_bytes: reserve?.quota_bytes,
          },
          reserve?.error === 'quota_exceeded' ? 409 : 400,
        );
      }

      const { data: signed, error: signError } = await admin.storage
        .from(bucket)
        .createSignedUploadUrl(storagePath);
      if (signError || !signed?.token) {
        await admin.rpc('release_media_reservation', { p_reservation_id: reserve.reservation_id });
        console.error('createSignedUploadUrl', signError?.message);
        return json({ error: 'sign_failed' }, 500);
      }

      const { data: pub } = admin.storage.from(bucket).getPublicUrl(storagePath);
      return json({
        reservation_id: reserve.reservation_id,
        bucket,
        storage_path: storagePath,
        token: signed.token,
        signed_url: signed.signedUrl,
        public_url: pub.publicUrl,
        merchant_user_id: merchantId,
      });
    }

    if (action === 'finalize') {
      const reservationId = String(body.reservation_id || '');
      if (!UUID_RE.test(reservationId)) return json({ error: 'invalid_reservation' }, 400);

      const { data: reservation, error: resErr } = await admin
        .from('media_upload_reservations')
        .select('*')
        .eq('id', reservationId)
        .maybeSingle();
      if (resErr || !reservation || reservation.user_id !== merchantId) {
        return json({ error: 'reservation_not_found' }, 404);
      }

      const { data: sizeRow, error: sizeErr } = await admin.rpc('media_storage_object_size', {
        p_bucket: reservation.bucket,
        p_path: reservation.storage_path,
      });
      const actual = typeof sizeRow === 'number' ? sizeRow : Number(sizeRow);
      if (sizeErr || !Number.isFinite(actual) || actual < 1) {
        await admin.storage.from(reservation.bucket).remove([reservation.storage_path]);
        await admin.rpc('release_media_reservation', { p_reservation_id: reservationId });
        return json({ error: 'object_missing' }, 400);
      }
      const reserved = Number(reservation.expected_size_bytes);
      const sizeSlack = 8192;
      if (actual > reserved + sizeSlack) {
        await admin.storage.from(reservation.bucket).remove([reservation.storage_path]);
        await admin.rpc('release_media_reservation', { p_reservation_id: reservationId });
        return json({ error: 'size_exceeds_reservation' }, 400);
      }

      const { data: pub } = admin.storage.from(reservation.bucket).getPublicUrl(reservation.storage_path);
      const { data: finalized, error: finErr } = await admin.rpc('finalize_media_upload', {
        p_reservation_id: reservationId,
        p_actual_size_bytes: actual || Number(reservation.expected_size_bytes),
        p_mime_type: reservation.mime_type,
        p_public_url: pub.publicUrl,
        p_width: reservation.width,
        p_height: reservation.height,
      });
      if (finErr) {
        console.error('finalize_media_upload', finErr.message);
        await admin.storage.from(reservation.bucket).remove([reservation.storage_path]);
        await admin.rpc('release_media_reservation', { p_reservation_id: reservationId });
        return json({ error: 'finalize_failed' }, 500);
      }
      const result = finalized as {
        ok?: boolean;
        error?: string;
        asset_id?: string;
        replaced_asset_id?: string;
        replaced_bucket?: string;
        replaced_storage_path?: string;
      };

      if (!result?.ok && result?.error === 'already_finalized') {
        const { data: existing } = await admin
          .from('media_assets')
          .select('id, public_url, storage_path, bucket, mime_type, width, height, size_bytes, status')
          .eq('user_id', merchantId)
          .eq('bucket', reservation.bucket)
          .eq('storage_path', reservation.storage_path)
          .eq('status', 'active')
          .maybeSingle();
        if (existing?.id) {
          return json({
            ok: true,
            already_finalized: true,
            asset_id: existing.id,
            public_url: existing.public_url || pub.publicUrl,
            storage_path: existing.storage_path,
            bucket: existing.bucket,
            mime_type: existing.mime_type,
            width: existing.width,
            height: existing.height,
            size_bytes: existing.size_bytes,
          });
        }
        return json({ error: 'already_finalized' }, 409);
      }

      if (!result?.ok) {
        await admin.storage.from(reservation.bucket).remove([reservation.storage_path]);
        await admin.rpc('release_media_reservation', { p_reservation_id: reservationId });
        return json({ error: result?.error || 'finalize_failed' }, 400);
      }

      // Physical cleanup of the OLD object only. DB/quota transition already committed.
      // Never derive this path from replacing_public_url.
      if (result.replaced_asset_id && result.replaced_bucket && result.replaced_storage_path) {
        try {
          await purgeAsset(admin, {
            id: result.replaced_asset_id,
            user_id: merchantId,
            bucket: result.replaced_bucket,
            storage_path: result.replaced_storage_path,
            status: 'pending_delete',
          });
        } catch (cleanupErr) {
          console.error('replaced asset storage cleanup failed', {
            replaced_asset_id: result.replaced_asset_id,
            replaced_bucket: result.replaced_bucket,
            replaced_storage_path: result.replaced_storage_path,
            message: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }
      }

      return json({
        ...result,
        public_url: pub.publicUrl,
        storage_path: reservation.storage_path,
        bucket: reservation.bucket,
        mime_type: reservation.mime_type,
        width: reservation.width,
        height: reservation.height,
      });
    }

    if (action === 'release') {
      const reservationId = String(body.reservation_id || '');
      if (!UUID_RE.test(reservationId)) return json({ error: 'invalid_reservation' }, 400);
      const { data: reservation } = await admin
        .from('media_upload_reservations')
        .select('user_id, bucket, storage_path')
        .eq('id', reservationId)
        .maybeSingle();
      if (reservation && reservation.user_id === merchantId) {
        await admin.storage.from(reservation.bucket).remove([reservation.storage_path]);
      }
      await admin.rpc('release_media_reservation', { p_reservation_id: reservationId });
      return json({ ok: true });
    }

    if (action === 'delete') {
      let asset: AssetRow | null = null;
      if (typeof body.asset_id === 'string' && UUID_RE.test(body.asset_id)) {
        const { data } = await admin
          .from('media_assets')
          .select('id, user_id, bucket, storage_path, status')
          .eq('id', body.asset_id)
          .maybeSingle();
        asset = data;
      } else if (typeof body.storage_path === 'string' && typeof body.bucket === 'string') {
        const { data } = await admin
          .from('media_assets')
          .select('id, user_id, bucket, storage_path, status')
          .eq('user_id', merchantId)
          .eq('bucket', body.bucket)
          .eq('storage_path', body.storage_path)
          .maybeSingle();
        asset = data;
      } else if (typeof body.public_url === 'string') {
        /* Exact public_url match only. Never parse or split external URLs. */
        const { data } = await admin
          .from('media_assets')
          .select('id, user_id, bucket, storage_path, status')
          .eq('user_id', merchantId)
          .eq('public_url', body.public_url)
          .maybeSingle();
        asset = data;
      }
      if (!asset || asset.user_id !== merchantId) {
        return json({ ok: true, deleted: false, reason: 'not_found' });
      }
      const result = await purgeAsset(admin, asset);
      return json({ ok: true, ...result });
    }

    if (action === 'delete_entity') {
      const entityType = String(body.entity_type || '');
      const entityId = String(body.entity_id || '');
      if (!['product', 'collection', 'logo', 'hero'].includes(entityType) || !UUID_RE.test(entityId)) {
        return json({ error: 'invalid_entity' }, 400);
      }
      if (entityType === 'product' || entityType === 'collection') {
        const table = entityType === 'product' ? 'products' : 'collections';
        const { data: still } = await admin.from(table).select('id').eq('id', entityId).maybeSingle();
        if (still?.id) {
          return json({ error: 'entity_still_exists' }, 409);
        }
      }
      const { data: assets } = await admin
        .from('media_assets')
        .select('id, bucket, storage_path, user_id, status')
        .eq('user_id', merchantId)
        .eq('related_entity_type', entityType)
        .eq('related_entity_id', entityId);
      const removed: string[] = [];
      const pending: string[] = [];
      for (const row of assets || []) {
        const result = await purgeAsset(admin, row as AssetRow);
        if (result.deleted) removed.push(row.id);
        else pending.push(row.id);
      }
      return json({ ok: true, deleted_ids: removed, pending_ids: pending });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'not authorized to act as another user' || message === 'MFA required to act as another user') {
      return json({ error: 'forbidden' }, 403);
    }
    if (message === 'entity_required' || message === 'entity_forbidden') {
      return json({ error: message }, 403);
    }
    console.error('media-authorize-upload failed', { message });
    return json({ error: 'server_error' }, 500);
  }
});
