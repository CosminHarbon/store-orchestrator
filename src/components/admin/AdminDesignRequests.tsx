import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MERCHANT_STATUS_LABEL, type DesignRequestStatus } from '@/lib/website-builder/designRequests';
import { useImpersonation } from '@/hooks/useImpersonation';

type AdminRequestRow = {
  id: string;
  user_id: string;
  store_name: string | null;
  selected_styles: string[];
  inspiration_text: string | null;
  inspiration_urls: string[];
  notes: string | null;
  inspiration_media_urls: string[];
  status: DesignRequestStatus;
  assigned_to: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  onOpenMerchant?: (userId: string) => void;
};

const STATUSES: DesignRequestStatus[] = [
  'submitted',
  'in_review',
  'in_progress',
  'ready_for_review',
  'completed',
  'cancelled',
];

export function AdminDesignRequests({ onOpenMerchant }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { startImpersonation } = useImpersonation();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [internalNotes, setInternalNotes] = useState('');

  const listQuery = useQuery({
    queryKey: ['admin-design-requests'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'admin_list_storefront_design_requests' as never,
      );
      if (error) throw error;
      return (data || []) as AdminRequestRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = listQuery.data || [];
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.store_name?.toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        r.status.includes(q) ||
        (r.selected_styles || []).some((s) => s.includes(q)),
    );
  }, [listQuery.data, search]);

  const selected = filtered.find((r) => r.id === selectedId) || null;

  const statusMutation = useMutation({
    mutationFn: async (opts: { id: string; status: DesignRequestStatus; internal_notes?: string }) => {
      const { error } = await supabase.rpc('admin_update_storefront_design_request' as never, {
        p_id: opts.id,
        p_status: opts.status,
        p_internal_notes: opts.internal_notes ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Request updated');
      void qc.invalidateQueries({ queryKey: ['admin-design-requests'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 p-4 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit lg:sticky lg:top-16">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Design requests</CardTitle>
          <CardDescription>Specialist storefront requests ({filtered.length})</CardDescription>
          <Input
            className="mt-2"
            placeholder="Search store, status, style…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardHeader>
        <CardContent className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
          {listQuery.isLoading ? (
            <p className="p-2 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setSelectedId(r.id);
                  setInternalNotes(r.internal_notes || '');
                }}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                  selectedId === r.id ? 'border-[#6E3DFF] bg-[#F4F0FF]/60' : 'hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {r.store_name || 'Untitled store'}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {MERCHANT_STATUS_LABEL[r.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()} ·{' '}
                  {(r.selected_styles || []).join(', ') || '—'}
                </p>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        {!selected ? (
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Select a request to inspect merchant instructions and update status.
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-lg">{selected.store_name || 'Untitled store'}</CardTitle>
              <CardDescription className="font-mono text-xs">{selected.user_id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Select
                  value={selected.status}
                  onValueChange={(v) =>
                    statusMutation.mutate({
                      id: selected.id,
                      status: v as DesignRequestStatus,
                      internal_notes: internalNotes,
                    })
                  }
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {MERCHANT_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => onOpenMerchant?.(selected.user_id)}>
                  View merchant in admin
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    startImpersonation(selected.user_id, selected.store_name || undefined);
                    navigate('/app?tab=templates');
                  }}
                >
                  Open store builder
                </Button>
              </div>

              <Field label="Styles" value={(selected.selected_styles || []).join(', ')} />
              <Field label="Inspiration" value={selected.inspiration_text} />
              <Field label="URLs" value={(selected.inspiration_urls || []).join('\n') || null} />
              <Field label="Notes" value={selected.notes} />

              {(selected.inspiration_media_urls || []).length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Inspiration media</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.inspiration_media_urls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="" className="h-20 w-20 rounded-lg border object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Internal notes (staff only)
                </p>
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={4}
                  placeholder="Staff notes — never shown to merchant"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({
                      id: selected.id,
                      status: selected.status,
                      internal_notes: internalNotes,
                    })
                  }
                >
                  Save internal notes
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value?.trim() || '—'}</p>
    </div>
  );
}
