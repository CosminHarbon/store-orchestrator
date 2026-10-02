import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  STORE_SETUP_STATUSES,
  type StoreSetupRequestRow,
  type StoreSetupStatus,
} from '@/lib/storeSetupRequests';

const STATUS_LABEL: Record<StoreSetupStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  in_progress: 'In progress',
  launched: 'Launched',
  declined: 'Declined',
};

const ADMIN_SETUP_REQUESTS_QUERY_KEY = ['admin-setup-requests'] as const;

/** Assisted setup requests sent from the public landing page. */
export function AdminSetupRequests() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [internalNotes, setInternalNotes] = useState('');

  const listQuery = useQuery({
    queryKey: ADMIN_SETUP_REQUESTS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_store_setup_requests' as never);
      if (error) throw error;
      return (data || []) as StoreSetupRequestRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = listQuery.data || [];
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.business_name.toLowerCase().includes(q) ||
        r.contact_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.status.includes(q),
    );
  }, [listQuery.data, search]);

  const selected = filtered.find((r) => r.id === selectedId) || null;

  const updateMutation = useMutation({
    mutationFn: async (opts: { id: string; status: StoreSetupStatus; internal_notes?: string }) => {
      const { error } = await supabase.rpc('admin_update_store_setup_request' as never, {
        p_id: opts.id,
        p_status: opts.status,
        p_internal_notes: opts.internal_notes ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Request updated');
      void qc.invalidateQueries({ queryKey: ADMIN_SETUP_REQUESTS_QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 p-4 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit lg:sticky lg:top-16">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Setup requests</CardTitle>
          <CardDescription>Assisted store setup from the landing page ({filtered.length})</CardDescription>
          <Input
            className="mt-2"
            placeholder="Search business, name, email, status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardHeader>
        <CardContent className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
          {listQuery.isLoading ? (
            <p className="p-2 text-sm text-muted-foreground">Loading…</p>
          ) : listQuery.isError ? (
            <p className="p-2 text-sm text-destructive">{(listQuery.error as Error).message}</p>
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
                  <span className="truncate text-sm font-medium">{r.business_name}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()} · {r.contact_name} ·{' '}
                  {r.contact_preference === 'call' ? 'call' : 'email'}
                </p>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        {!selected ? (
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Select a request to see the details and update its status.
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-lg">{selected.business_name}</CardTitle>
              <CardDescription>
                {selected.contact_name} · {selected.language.toUpperCase()} ·{' '}
                {new Date(selected.created_at).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Select
                value={selected.status}
                onValueChange={(v) =>
                  updateMutation.mutate({
                    id: selected.id,
                    status: v as StoreSetupStatus,
                    internal_notes: internalNotes,
                  })
                }
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORE_SETUP_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" value={selected.email} />
                <Field
                  label="Contact preference"
                  value={selected.contact_preference === 'call' ? `Call · ${selected.phone ?? '—'}` : 'Email'}
                />
                <Field label="Instagram / website" value={selected.social_url} />
                <Field label="Signed-in user" value={selected.user_id} />
              </div>
              <Field label="What they sell" value={selected.products_description} />
              <Field label="Message" value={selected.message} />

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Internal notes (staff only)</p>
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={4}
                  placeholder="Staff notes — never shown to the requester"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
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
      <p className="mt-1 whitespace-pre-wrap break-words text-sm">{value?.trim() || '—'}</p>
    </div>
  );
}
