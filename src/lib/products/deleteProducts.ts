import { supabase } from '@/integrations/supabase/client';
import { deleteEntityMedia } from '@/lib/media/deleteMedia';

export type ProductDeleteFailureCode = 'permission_denied' | 'db_error' | 'partial';

export class ProductDeleteError extends Error {
  readonly code: ProductDeleteFailureCode;
  readonly deletedIds: string[];

  constructor(code: ProductDeleteFailureCode, message: string, deletedIds: string[] = []) {
    super(message);
    this.name = 'ProductDeleteError';
    this.code = code;
    this.deletedIds = deletedIds;
  }
}

/**
 * Delete products and clean managed media afterward.
 *
 * PostgREST/RLS can return success with 0 rows when entitlement or ownership
 * blocks the delete. We always `.select('id')` and require at least one row
 * back before treating the delete as successful.
 */
export async function deleteProductsByIds(ids: string[]): Promise<{ deletedIds: string[] }> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return { deletedIds: [] };

  // Junction cleanup (no ON DELETE CASCADE on these tables today).
  await supabase.from('product_collections').delete().in('product_id', uniqueIds);
  await supabase.from('product_discounts').delete().in('product_id', uniqueIds);

  const { data, error } = await supabase.from('products').delete().in('id', uniqueIds).select('id');
  if (error) {
    throw new ProductDeleteError('db_error', error.message);
  }

  const deletedIds = (data || []).map((row) => row.id);
  if (deletedIds.length === 0) {
    throw new ProductDeleteError(
      'permission_denied',
      'No product was deleted (permission or entitlement blocked the request).',
    );
  }

  for (const id of deletedIds) {
    await deleteEntityMedia('product', id);
  }

  if (deletedIds.length < uniqueIds.length) {
    throw new ProductDeleteError(
      'partial',
      `Only ${deletedIds.length} of ${uniqueIds.length} products were deleted.`,
      deletedIds,
    );
  }

  return { deletedIds };
}
