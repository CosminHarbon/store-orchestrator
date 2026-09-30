/**
 * Draft persistence for curated themes via existing template_customization.
 * No new migration — reuses builder_config jsonb + (user_id, template_id) uniqueness.
 * Does NOT set profiles.active_template (that would publish / overwrite the live store).
 */
import { supabase } from '@/integrations/supabase/client';
import type { CuratedThemeId } from './themeIds';
import {
  createDraftConfig,
  parseStorefrontContentConfig,
  validateStorefrontContentConfig,
  type StorefrontContentConfig,
} from './storefrontContentConfig';

export async function loadCuratedThemeDraft(
  userId: string,
  themeId: CuratedThemeId,
): Promise<StorefrontContentConfig | null> {
  const { data, error } = await supabase
    .from('template_customization')
    .select('builder_config, store_name, updated_at')
    .eq('user_id', userId)
    .eq('template_id', themeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return parseStorefrontContentConfig(data.builder_config, themeId);
}

/** Create draft row if missing; return current validated config. Never touches active_template. */
export async function ensureCuratedThemeDraft(opts: {
  userId: string;
  themeId: CuratedThemeId;
  storeName: string;
}): Promise<StorefrontContentConfig> {
  const existing = await loadCuratedThemeDraft(opts.userId, opts.themeId);
  if (existing) return existing;

  const draft = createDraftConfig(opts.themeId);
  const { error } = await supabase.from('template_customization').upsert(
    {
      user_id: opts.userId,
      template_id: opts.themeId,
      store_name: opts.storeName,
      builder_config: draft as never,
    } as never,
    { onConflict: 'user_id,template_id' },
  );
  if (error) throw error;
  return draft;
}

export async function saveCuratedThemeDraft(opts: {
  userId: string;
  themeId: CuratedThemeId;
  storeName: string;
  config: StorefrontContentConfig;
}): Promise<StorefrontContentConfig> {
  const validated = validateStorefrontContentConfig({
    ...opts.config,
    themeId: opts.themeId,
    status: 'draft',
  });
  const { error } = await supabase.from('template_customization').upsert(
    {
      user_id: opts.userId,
      template_id: opts.themeId,
      store_name: opts.storeName,
      builder_config: validated as never,
    } as never,
    { onConflict: 'user_id,template_id' },
  );
  if (error) throw error;
  return validated;
}
