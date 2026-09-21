import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  STATUS_BADGE,
  STATUS_LABEL,
  fmtDate,
  fmtDateTime,
  type AdminTrialRow,
  type AdminTrialSummary,
} from './adminTrialTypes';

type Filter = 'active' | 'ending_soon' | 'expired' | 'converted' | 'all';
type Sort = 'newest' | 'ending_soon' | 'oldest';

const PAGE_SIZE = 25;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

/**
 * Superadmin → Trials. All data comes from SECURITY DEFINER RPCs that re-check role + AAL2
 * server-side; this component only renders what those return.
 */
export default function AdminTrials({ onOpenUser }: { onOpenUser: (userId: string) => void }) {
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<Sort>('newest');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounced(search.trim(), 300);

  useEffect(() => {
    setPage(0);
  }, [filter, sort, debouncedSearch]);

  const summary = useQuery({
    queryKey: ['admin-trial-summary'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_trial_summary');
      if (error) throw error;
      return data as AdminTrialSummary;
    },
  });

  const list = useQuery({
    queryKey: ['admin-trials', filter, sort, debouncedSearch, page],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_trials', {
        p_filter: filter,
        p_search: debouncedSearch || null,
        p_sort: sort,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data || []) as AdminTrialRow[];
    },
  });

  const rows = list.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));
  const s = summary.data;

  return (
    <div className="max-w-[1400px] mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Trials</h1>
        <p className="text-sm text-muted-foreground">
          Free-trial accounts created since the trial program started. Status is computed server-side.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <SummaryTile label="Active trials" value={s ? String(s.active_trials) : '—'} />
        <SummaryTile label="Expiring within 24h" value={s ? String(s.expiring_24h) : '—'} />
        <SummaryTile label="Expired trials" value={s ? String(s.expired_trials) : '—'} />
        <SummaryTile label="Converted to paid" value={s ? String(s.converted_to_paid) : '—'} />
        <SummaryTile
          label="Trial → paid conversion"
          value={s && s.conversion_rate !== null ? `${s.conversion_rate}%` : '—'}
          hint={s ? `${s.converted_to_paid} of ${s.concluded_trials} concluded` : undefined}
        />
      </div>
      {summary.isError ? (
        <p className="text-sm text-destructive">Could not load summary: {(summary.error as Error).message}</p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="active">Active Trials</TabsTrigger>
            <TabsTrigger value="ending_soon">Ending soon</TabsTrigger>
            <TabsTrigger value="expired">Expired Trials</TabsTrigger>
            <TabsTrigger value="converted">Converted / Active Subscribers</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Input
            placeholder="Search email, name, store…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full lg:w-72"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest users</SelectItem>
              <SelectItem value="ending_soon">Trial ending soon</SelectItem>
              <SelectItem value="oldest">Oldest users</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Store / merchant</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead>Trial start → end</TableHead>
                <TableHead className="text-right">Days left</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isError ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-destructive">
                    {(list.error as Error).message}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {list.isLoading ? 'Loading…' : 'No matching accounts.'}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="min-w-[220px]">
                      <div className="font-medium">{r.user_name || r.email}</div>
                      {r.user_name ? <div className="text-xs text-muted-foreground">{r.email}</div> : null}
                      <div className="font-mono text-[10px] text-muted-foreground">{r.user_id}</div>
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <div>{r.store_name || '—'}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{r.merchant_id || '—'}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.signed_up_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {fmtDate(r.trial_started_at)} → {fmtDateTime(r.trial_ends_at)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.subscription_status === 'trialing' ? r.days_remaining : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[r.subscription_status]}>
                        {STATUS_LABEL[r.subscription_status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.current_plan || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(r.last_sign_in_at)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => onOpenUser(r.user_id)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {Number(total)} account{Number(total) === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </Button>
          <span>
            Page {page + 1} / {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
