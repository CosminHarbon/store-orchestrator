import { supabase } from '@/integrations/supabase/client';
import type { TemplateCatalogId } from '@/lib/website-builder/templateCatalog';

/** Apply a catalog template as the merchant's active storefront. Does not publish Cursor drafts. */
export async function applyStoreTemplate(opts: {
  userId: string;
  templateId: TemplateCatalogId;
  storeName: string;
}): Promise<void> {
  const { userId, templateId, storeName } = opts;

  if (templateId === 'elementar' || templateId === 'ai') {
    const { error: upsertErr } = await supabase.from('template_customization').upsert(
      {
        user_id: userId,
        template_id: templateId === 'ai' ? 'ai' : 'elementar',
        store_name: storeName,
      } as never,
      { onConflict: 'user_id,template_id' },
    );
    if (upsertErr) throw upsertErr;
  }

  const { error } = await supabase
    .from('profiles')
    .update({ active_template: templateId } as never)
    .eq('user_id', userId);
  if (error) throw error;
}
