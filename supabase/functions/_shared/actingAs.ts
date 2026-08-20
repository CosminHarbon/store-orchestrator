import type { User } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

type AdminClient = {
  from: (table: string) => any;
};

function jwtAal(jwt: string): string {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]!));
    return String(payload?.aal || 'aal1');
  } catch {
    return 'aal1';
  }
}

/**
 * When a verified MFA superadmin sends acting_as_user_id, operate on that merchant.
 * Uses service-role client to read user_roles (not JWT-bound RPC).
 */
export async function resolveActingOwnerId(
  supabase: AdminClient,
  user: User,
  jwt: string,
  actingAsUserId?: string | null
): Promise<string> {
  if (!actingAsUserId || actingAsUserId === user.id) {
    return user.id;
  }

  if (jwtAal(jwt) !== 'aal2') {
    throw new Error('MFA required to act as another user');
  }

  const { data: role, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'superadmin')
    .maybeSingle();

  if (error || !role) {
    throw new Error('not authorized to act as another user');
  }

  return actingAsUserId;
}
