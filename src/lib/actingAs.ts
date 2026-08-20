/** Attach acting_as_user_id when a platform operator is impersonating a merchant. */
export function withActingAsUserId<T extends Record<string, unknown>>(body: T): T & {
  acting_as_user_id?: string;
} {
  if (typeof window === 'undefined') return body;
  const actingAs = sessionStorage.getItem('sv_impersonate_user_id');
  if (!actingAs) return body;
  return { ...body, acting_as_user_id: actingAs };
}
