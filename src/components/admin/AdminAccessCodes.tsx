import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { payloadFromFunctionsInvoke } from '@/lib/edgeFunctionPayload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type AccessCodeRow = {
  id: string;
  code_prefix: string;
  label: string;
  active: boolean;
  expires_at: string | null;
  access_duration_days: number | null;
  max_redemptions: number | null;
  redemption_count: number;
  created_at: string;
  created_by: string | null;
};

type RedemptionRow = {
  id: string;
  user_id: string;
  email: string | null;
  redeemed_at: string;
  revoked_at: string | null;
  entitlement_id: string | null;
  entitlement_status: string | null;
  valid_until: string | null;
};

async function invokeAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('billing-admin-access-codes', { body });
  const payload = await payloadFromFunctionsInvoke(data, error);
  if (typeof payload.error === 'string') {
    throw new Error(payload.error);
  }
  if (error && !payload.codes && !payload.code && !payload.ok && !payload.redemptions) {
    throw error;
  }
  return payload;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function AdminAccessCodes() {
  const [label, setLabel] = useState('');
  const [durationPreset, setDurationPreset] = useState('30');
  const [customDays, setCustomDays] = useState('90');
  const [permanent, setPermanent] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('1');
  const [unlimited, setUnlimited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['admin-access-codes'],
    queryFn: async () => {
      const payload = await invokeAdmin({ action: 'list' });
      return (payload.codes || []) as AccessCodeRow[];
    },
  });

  const redemptionsQuery = useQuery({
    queryKey: ['admin-access-code-redemptions', expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const payload = await invokeAdmin({ action: 'redemptions', code_id: expandedId });
      return (payload.redemptions || []) as RedemptionRow[];
    },
  });

  const durationDays = useMemo(() => {
    if (permanent) return null;
    if (durationPreset === 'custom') {
      const n = Number(customDays);
      return Number.isInteger(n) ? n : NaN;
    }
    return Number(durationPreset);
  }, [permanent, durationPreset, customDays]);

  const createCode = async () => {
    if (!label.trim()) {
      toast.error('Give the code a label.');
      return;
    }
    if (!permanent && (!Number.isInteger(durationDays) || (durationDays as number) < 1)) {
      toast.error('Choose a valid access duration.');
      return;
    }
    setCreating(true);
    try {
      const payload = await invokeAdmin({
        action: 'create',
        label: label.trim(),
        permanent,
        access_duration_days: permanent ? undefined : durationDays,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        max_redemptions: unlimited ? null : Number(maxRedemptions),
      });
      const shown = typeof payload.plaintext === 'string' ? payload.plaintext : null;
      setPlaintext(shown);
      setLabel('');
      toast.success('Access code created. Copy it now — it will not be shown again.');
      await listQuery.refetch();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Could not create access code.');
    } finally {
      setCreating(false);
    }
  };

  const setActive = async (codeId: string, active: boolean) => {
    try {
      await invokeAdmin({ action: 'set_active', code_id: codeId, active });
      toast.success(active ? 'Code enabled' : 'Code disabled');
      await listQuery.refetch();
    } catch (e) {
      console.error(e);
      toast.error('Could not update code.');
    }
  };

  const revoke = async (redemptionId: string) => {
    if (!window.confirm('Revoke this access-code entitlement? The user will lose access from this code.')) {
      return;
    }
    try {
      await invokeAdmin({ action: 'revoke_redemption', redemption_id: redemptionId });
      toast.success('Entitlement revoked');
      await redemptionsQuery.refetch();
      await listQuery.refetch();
    } catch (e) {
      console.error(e);
      toast.error('Could not revoke entitlement.');
    }
  };

  const copyPlaintext = async () => {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      toast.success('Code copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Access Codes</CardTitle>
          <CardDescription>
            Generate one-time plaintext codes. SpeedVendors stores only a hash — the full code is
            shown once at creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ac-label">Label</Label>
            <Input
              id="ac-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Partner — Q3 2026"
              maxLength={80}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
            <div>
              <div className="text-sm font-medium">Permanent access</div>
              <p className="text-xs text-muted-foreground">No expiry after redemption</p>
            </div>
            <Switch checked={permanent} onCheckedChange={setPermanent} />
          </div>
          {!permanent ? (
            <div className="space-y-2">
              <Label>Access duration after redeem</Label>
              <Select value={durationPreset} onValueChange={setDurationPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="custom">Custom days</SelectItem>
                </SelectContent>
              </Select>
              {durationPreset === 'custom' ? (
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                />
              ) : null}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="ac-expires">Code expiry (optional)</Label>
            <Input
              id="ac-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">After this date the code can no longer be redeemed.</p>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Unlimited redemptions</div>
              <p className="text-xs text-muted-foreground">Otherwise set a maximum</p>
            </div>
            <Switch checked={unlimited} onCheckedChange={setUnlimited} />
          </div>
          {!unlimited ? (
            <div className="space-y-2">
              <Label htmlFor="ac-max">Maximum redemptions</Label>
              <Input
                id="ac-max"
                type="number"
                min={1}
                max={10000}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
              />
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Button onClick={() => void createCode()} disabled={creating}>
              {creating ? 'Generating…' : 'Generate access code'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Issued codes</CardTitle>
          <CardDescription>Hashes are never shown. Prefix is for identification only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : listQuery.error ? (
            <p className="text-sm text-destructive">Could not load access codes.</p>
          ) : (listQuery.data || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No codes yet.</p>
          ) : (
            (listQuery.data || []).map((row) => (
              <div key={row.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{row.label}</div>
                    <div className="text-xs font-mono text-muted-foreground">{row.code_prefix}…</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={row.active ? 'secondary' : 'destructive'}>
                      {row.active ? 'active' : 'disabled'}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => void setActive(row.id, !row.active)}>
                      {row.active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    >
                      {expandedId === row.id ? 'Hide redemptions' : 'Who redeemed'}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-4">
                  <div>
                    Duration:{' '}
                    {row.access_duration_days == null ? 'permanent' : `${row.access_duration_days} days`}
                  </div>
                  <div>Code expires: {formatDate(row.expires_at)}</div>
                  <div>
                    Redemptions: {row.redemption_count}
                    {row.max_redemptions != null ? ` / ${row.max_redemptions}` : ' / unlimited'}
                  </div>
                  <div>Created: {formatDate(row.created_at)}</div>
                </div>
                {expandedId === row.id ? (
                  <div className="border-t pt-2 space-y-2">
                    {redemptionsQuery.isLoading ? (
                      <p className="text-xs text-muted-foreground">Loading redemptions…</p>
                    ) : (redemptionsQuery.data || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">No redemptions yet.</p>
                    ) : (
                      (redemptionsQuery.data || []).map((r) => (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <div>
                            <div>{r.email || r.user_id}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(r.redeemed_at)} · {r.entitlement_status || 'unknown'}
                              {r.revoked_at ? ' · revoked' : ''}
                            </div>
                          </div>
                          {!r.revoked_at && r.entitlement_status === 'active' ? (
                            <Button variant="destructive" size="sm" onClick={() => void revoke(r.id)}>
                              Revoke entitlement
                            </Button>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!plaintext} onOpenChange={(open) => !open && setPlaintext(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy this code now</DialogTitle>
            <DialogDescription>
              This is the only time the full access code is shown. SpeedVendors stores a hash, not
              the plaintext.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm break-all">
            {plaintext}
          </div>
          <Button onClick={() => void copyPlaintext()}>Copy code</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
