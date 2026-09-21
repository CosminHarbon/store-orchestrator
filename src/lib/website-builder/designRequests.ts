import { supabase } from '@/integrations/supabase/client';

export type DesignRequestStatus =
  | 'submitted'
  | 'in_review'
  | 'in_progress'
  | 'ready_for_review'
  | 'completed'
  | 'cancelled';

export type MerchantDesignRequest = {
  id: string;
  user_id: string;
  store_name: string | null;
  selected_styles: string[];
  inspiration_text: string | null;
  inspiration_urls: string[];
  notes: string | null;
  inspiration_media_urls: string[];
  status: DesignRequestStatus;
  created_at: string;
  updated_at: string;
};

export const MERCHANT_STATUS_LABEL: Record<DesignRequestStatus, string> = {
  submitted: 'Submitted',
  in_review: 'Being reviewed',
  in_progress: 'Design in progress',
  ready_for_review: 'Ready to review',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const MERCHANT_COLUMNS =
  'id, user_id, store_name, selected_styles, inspiration_text, inspiration_urls, notes, inspiration_media_urls, status, created_at, updated_at';

export async function fetchLatestDesignRequest(
  userId: string,
): Promise<MerchantDesignRequest | null> {
  const { data, error } = await supabase
    .from('storefront_design_requests_merchant' as never)
    .select(MERCHANT_COLUMNS)
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as MerchantDesignRequest | null) ?? null;
}

export async function submitDesignRequest(input: {
  userId: string;
  storeName: string | null;
  selectedStyles: string[];
  inspirationText: string;
  inspirationUrls: string[];
  notes: string;
  inspirationMediaUrls: string[];
}): Promise<MerchantDesignRequest> {
  const { data, error } = await supabase
    .from('storefront_design_requests' as never)
    .insert({
      user_id: input.userId,
      store_name: input.storeName,
      selected_styles: input.selectedStyles,
      inspiration_text: input.inspirationText.trim() || null,
      inspiration_urls: input.inspirationUrls,
      notes: input.notes.trim() || null,
      inspiration_media_urls: input.inspirationMediaUrls,
      status: 'submitted',
    } as never)
    .select(MERCHANT_COLUMNS)
    .single();
  if (error) throw error;
  return data as MerchantDesignRequest;
}

export async function updateSubmittedDesignRequest(
  id: string,
  userId: string,
  patch: {
    selectedStyles: string[];
    inspirationText: string;
    inspirationUrls: string[];
    notes: string;
    inspirationMediaUrls: string[];
  },
): Promise<MerchantDesignRequest> {
  const { data, error } = await supabase
    .from('storefront_design_requests' as never)
    .update({
      selected_styles: patch.selectedStyles,
      inspiration_text: patch.inspirationText.trim() || null,
      inspiration_urls: patch.inspirationUrls,
      notes: patch.notes.trim() || null,
      inspiration_media_urls: patch.inspirationMediaUrls,
    } as never)
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'submitted')
    .select(MERCHANT_COLUMNS)
    .single();
  if (error) throw error;
  return data as MerchantDesignRequest;
}

export function parseInspirationUrls(raw: string): string[] {
  return raw
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
    .slice(0, 8);
}
