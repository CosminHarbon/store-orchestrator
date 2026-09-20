/**
 * Post-deletion cleanup for merchant tables that reference the user by `user_id` but have NO
 * foreign key to auth.users, so deleting the auth user does not cascade to them (verified against
 * production: collections, discounts, template_blocks, reviews, push_tokens).
 *
 * Only tables that hold merchant configuration / device tokens are listed. Financial records are
 * never touched here: orders, order_items, payment_transactions and order_returns are handled by the
 * archive step + their own FKs. Anything else that still references the user is reported (not
 * deleted) so an operator can decide.
 */

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export const NON_CASCADING_USER_TABLES = [
  'collections',
  'discounts',
  'template_blocks',
  'reviews',
  'push_tokens',
] as const;

export type CleanupResult = {
  deleted: Record<string, number>;
  errors: string[];
};

export async function cleanupNonCascadingTables(
  admin: AdminClient,
  userId: string,
): Promise<CleanupResult> {
  const deleted: Record<string, number> = {};
  const errors: string[] = [];
  for (const table of NON_CASCADING_USER_TABLES) {
    const { data, error } = await admin.from(table).delete().eq('user_id', userId).select('user_id');
    if (error) {
      errors.push(`${table}: ${error.message}`);
      continue;
    }
    const n = Array.isArray(data) ? data.length : 0;
    if (n > 0) deleted[table] = n;
  }
  return { deleted, errors };
}
