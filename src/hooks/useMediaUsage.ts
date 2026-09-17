import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useImpersonation } from '@/hooks/useImpersonation';
import type { MediaUsageSnapshot } from '@/lib/media/constants';

export function useMediaUsage() {
  const { effectiveUserId, isImpersonating, impersonatedUserId } = useImpersonation();

  return useQuery({
    queryKey: ['media-usage', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async (): Promise<MediaUsageSnapshot> => {
      const { data, error } = await supabase.rpc('get_media_usage', {
        p_acting_as: isImpersonating ? impersonatedUserId : null,
      });
      if (error) throw error;
      const row = (data || {}) as Record<string, unknown>;
      return {
        user_id: String(row.user_id || effectiveUserId),
        bytes_used: Number(row.bytes_used) || 0,
        bytes_reserved: Number(row.bytes_reserved) || 0,
        quota_bytes: Number(row.quota_bytes) || 0,
        tier: String(row.tier || 'start'),
        percent: Number(row.percent) || 0,
        bytes_stored: row.bytes_stored != null ? Number(row.bytes_stored) : null,
      };
    },
  });
}
