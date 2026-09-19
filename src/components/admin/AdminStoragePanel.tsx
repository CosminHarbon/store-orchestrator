import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { compressionPercent, groupProductStorage, type ProductStorageRow } from '@/lib/media/adminStorage';
import { formatBytes } from '@/lib/media/constants';

/**
 * PRIVATE platform analytics. Data comes from SECURITY DEFINER RPCs that raise 'not authorized'
 * unless the caller is a verified (aal2) superadmin; hiding this UI is not the access control.
 */

const fmt = (bytes: number) => formatBytes(bytes, 2);
const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);

function useStorageOverview(enabled = true) {
  return useQuery({
    queryKey: ['admin-media-storage-overview'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_media_storage_overview');
      if (error) throw error;
      return data || [];
    },
  });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div> : null}
    </div>
  );
}

export function AdminStoragePlatformCard({ onSelectStore }: { onSelectStore: (userId: string) => void }) {
  const { data, isLoading, error } = useStorageOverview();
  const totals = useMemo(() => {
    const rows = data || [];
    return rows.reduce(
      (t, r) => ({
        charged: t.charged + r.charged_bytes,
        stored: t.stored + r.stored_bytes,
        mc: t.mc + r.measured_charged_bytes,
        ms: t.ms + r.measured_stored_bytes,
      }),
      { charged: 0, stored: 0, mc: 0, ms: 0 },
    );
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Storage (platform, private)</CardTitle>
        <CardDescription>
          Charged = merchant quota usage from original file sizes. Physical = compressed bytes actually stored.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">Could not load storage analytics.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <Stat label="Charged to merchants" value={fmt(totals.charged)} />
              <Stat label="Physical storage" value={fmt(totals.stored)} />
              <Stat label="Saved by compression" value={fmt(Math.max(0, totals.charged - totals.stored))} />
              <Stat label="Compression (measured)" value={pct(compressionPercent(totals.mc, totals.ms))} />
            </div>
            <div className="rounded-md border divide-y max-h-80 overflow-y-auto">
              {(data || []).map((r) => (
                <button
                  key={r.store_user_id}
                  type="button"
                  onClick={() => onSelectStore(r.store_user_id)}
                  className="w-full text-left px-3 py-2 text-sm grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center hover:bg-muted/50"
                >
                  <span className="truncate font-medium">{r.store_name || r.email || r.store_user_id}</span>
                  <span className="tabular-nums" title="Charged">{fmt(r.charged_bytes)}</span>
                  <span className="tabular-nums text-muted-foreground" title="Physical">{fmt(r.stored_bytes)}</span>
                  <span className="tabular-nums text-emerald-600 dark:text-emerald-400" title="Saved">
                    −{fmt(r.saved_bytes)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminStoragePanel({ storeUserId }: { storeUserId: string }) {
  const overview = useStorageOverview();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const productRows = useQuery({
    queryKey: ['admin-media-product-storage', storeUserId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_media_product_storage', {
        p_store_user_id: storeUserId,
      });
      if (error) throw error;
      return (data || []) as ProductStorageRow[];
    },
  });

  const store = (overview.data || []).find((r) => r.store_user_id === storeUserId);
  const groups = useMemo(() => groupProductStorage(productRows.data || []), [productRows.data]);
  const productTotals = groups.reduce(
    (t, g) => ({ charged: t.charged + g.chargedBytes, stored: t.stored + g.storedBytes }),
    { charged: 0, stored: 0 },
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (overview.isLoading) return <p className="text-sm text-muted-foreground">Loading storage…</p>;
  if (overview.error) return <p className="text-sm text-destructive">Could not load storage analytics.</p>;
  if (!store) return <p className="text-sm text-muted-foreground">No storage data for this store.</p>;

  const measuredPct = compressionPercent(store.measured_charged_bytes, store.measured_stored_bytes);
  const drift = store.counter_bytes_used - store.charged_bytes;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Store storage (private)</CardTitle>
          <CardDescription>Not visible to the merchant. Quota limit {fmt(store.quota_bytes)}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Stat
              label="Charged to merchant (original sizes)"
              value={fmt(store.charged_bytes)}
              hint={`${((store.charged_bytes / Math.max(1, store.quota_bytes)) * 100).toFixed(1)}% of quota`}
            />
            <Stat label="Physical storage (compressed)" value={fmt(store.stored_bytes)} hint={`${store.asset_count} files`} />
            <Stat label="Saved by compression" value={fmt(store.saved_bytes)} />
            <Stat label="Compression (measured files)" value={pct(measuredPct)} />
          </div>
          {store.legacy_asset_count > 0 ? (
            <p className="text-xs text-muted-foreground">
              {store.legacy_asset_count} legacy file(s) ({fmt(store.legacy_stored_bytes)} stored) have no recorded original size.
              They are charged at their stored size and excluded from the compression percentage.
            </p>
          ) : null}
          {drift !== 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Usage counter differs from the sum of file charges by {fmt(Math.abs(drift))}. Run media_recompute_usage for this store.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Products</CardTitle>
          <CardDescription>Original = file picked by the merchant. Stored = compressed file in Storage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {productRows.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading products…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracked product images.</p>
          ) : (
            <div className="rounded-md border divide-y">
              <div className="hidden sm:grid grid-cols-[1.5rem_1fr_6rem_6rem_6rem_4rem] gap-2 px-3 py-2 text-xs text-muted-foreground">
                <span />
                <span>Product</span>
                <span className="text-right" title="Original file size (legacy files: stored size)">Original</span>
                <span className="text-right">Stored</span>
                <span className="text-right">Saved</span>
                <span className="text-right">%</span>
              </div>
              {groups.map((g) => {
                const key = g.productId ?? 'unattributed';
                const open = expanded.has(key);
                return (
                  <Fragment key={key}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggle(key)}
                      className="w-full px-3 py-2 grid grid-cols-[1.5rem_1fr_auto] sm:grid-cols-[1.5rem_1fr_6rem_6rem_6rem_4rem] gap-2 items-center text-sm hover:bg-muted/50"
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="truncate text-left font-medium">
                        {g.title || (g.productId ? 'Deleted product' : 'Unattributed')}
                        <span className="ml-2 text-xs text-muted-foreground">{g.images.length} img</span>
                      </span>
                      <span className="text-right tabular-nums">{fmt(g.chargedBytes)}</span>
                      <span className="hidden sm:block text-right tabular-nums">{fmt(g.storedBytes)}</span>
                      <span className="hidden sm:block text-right tabular-nums">{fmt(g.savedBytes)}</span>
                      <span className="hidden sm:block text-right tabular-nums">
                        {pct(compressionPercent(g.measuredChargedBytes, g.measuredStoredBytes))}
                      </span>
                    </button>
                    {open ? (
                      <div className="bg-muted/30 px-3 py-2 space-y-1.5">
                        {g.images.map((img, i) => (
                          <div key={img.asset_id} className="text-xs grid grid-cols-[2.5rem_1fr] gap-3 items-center">
                            {img.public_url ? (
                              <img src={img.public_url} alt="" className="h-10 w-10 rounded object-cover border" />
                            ) : (
                              <div className="h-10 w-10 rounded border" />
                            )}
                            <div className="space-y-0.5">
                              <div className="font-medium">
                                Image {i + 1}
                                {img.is_primary ? <Badge variant="secondary" className="ml-2">Primary</Badge> : null}
                                {img.status !== 'active' ? <Badge variant="outline" className="ml-2">{img.status}</Badge> : null}
                              </div>
                              <div className="text-muted-foreground tabular-nums">
                                Original: {img.original_size_bytes === null ? 'unknown (legacy)' : fmt(img.original_size_bytes)}
                                {' · '}Stored: {fmt(img.stored_size_bytes)}
                                {' · '}Saved: {fmt(img.saved_bytes)}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="text-xs font-medium tabular-nums pt-1 border-t">
                          Product total — Original: {fmt(g.chargedBytes)} · Stored: {fmt(g.storedBytes)} · Saved: {fmt(g.savedBytes)}
                        </div>
                      </div>
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          )}
          {groups.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Other media (collections, branding, builder): charged {fmt(Math.max(0, store.charged_bytes - productTotals.charged))}
              {' · '}stored {fmt(Math.max(0, store.stored_bytes - productTotals.stored))}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
