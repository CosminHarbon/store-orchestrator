import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, MapPin, Package, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { LockerPickerModal } from '@/components/lockers/LockerPickerModal';
import { STORE_API_BASE, storeApiHeaders } from '@/lib/storefront/api';
import type { SelectedLocker } from '@/lib/lockers/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CARRIER_OPTIONS = [
  { code: 'sameday', name: 'Sameday / Easybox' },
  { code: 'fan', name: 'FAN Courier / FanBox' },
  { code: 'cargus', name: 'Cargus / Ship & Go' },
  { code: 'dpd', name: 'DPD' },
  { code: 'gls', name: 'GLS' },
] as const;

export type DefaultPickupLockerProfile = {
  store_api_key?: string | null;
  eawb_api_key?: string | null;
  eawb_pickup_locker_id?: string | null;
  eawb_pickup_locker_name?: string | null;
  eawb_pickup_locker_address?: string | null;
  eawb_pickup_locker_carrier_id?: number | null;
  eawb_pickup_locker_carrier_code?: string | null;
  eawb_pickup_locker_county?: string | null;
  eawb_pickup_locker_city?: string | null;
};

export type DefaultPickupLockerFields = {
  eawb_pickup_locker_id: string | null;
  eawb_pickup_locker_name: string | null;
  eawb_pickup_locker_address: string | null;
  eawb_pickup_locker_carrier_id: number | null;
  eawb_pickup_locker_carrier_code: string | null;
  eawb_pickup_locker_county: string | null;
  eawb_pickup_locker_city: string | null;
};

interface DefaultPickupLockerSectionProps {
  profile: DefaultPickupLockerProfile | null | undefined;
  onSave: (fields: DefaultPickupLockerFields) => Promise<void> | void;
  saving?: boolean;
  className?: string;
}

function emptyLockerFields(): DefaultPickupLockerFields {
  return {
    eawb_pickup_locker_id: null,
    eawb_pickup_locker_name: null,
    eawb_pickup_locker_address: null,
    eawb_pickup_locker_carrier_id: null,
    eawb_pickup_locker_carrier_code: null,
    eawb_pickup_locker_county: null,
    eawb_pickup_locker_city: null,
  };
}

function carrierLabel(code?: string | null) {
  if (!code) return 'Carrier';
  const found = CARRIER_OPTIONS.find((c) => c.code === code.toLowerCase());
  return found?.name || code.toUpperCase();
}

export function DefaultPickupLockerSection({
  profile,
  onSave,
  saving,
  className,
}: DefaultPickupLockerSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [carrierCode, setCarrierCode] = useState(
    () => profile?.eawb_pickup_locker_carrier_code || 'sameday'
  );
  const [mapboxToken, setMapboxToken] = useState('');
  const [validating, setValidating] = useState(false);
  const [staleWarning, setStaleWarning] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  const hasLocker = !!(profile?.eawb_pickup_locker_id && profile?.eawb_pickup_locker_name);

  useEffect(() => {
    if (profile?.eawb_pickup_locker_carrier_code) {
      setCarrierCode(profile.eawb_pickup_locker_carrier_code);
    }
  }, [profile?.eawb_pickup_locker_carrier_code]);

  // Load Mapbox token via store-api (same source as storefront)
  useEffect(() => {
    const key = profile?.store_api_key;
    if (!key) return;
    let cancelled = false;
    setLoadingConfig(true);
    fetch(`${STORE_API_BASE}/config`, { headers: storeApiHeaders(key) })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.mapbox_token) setMapboxToken(data.mapbox_token);
      })
      .catch(() => {
        /* map optional */
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.store_api_key]);

  const validateSavedLocker = useCallback(
    async (opts?: { quiet?: boolean }) => {
      const id = profile?.eawb_pickup_locker_id;
      if (!id || !profile?.eawb_api_key) {
        setStaleWarning(null);
        return;
      }
      setValidating(true);
      setStaleWarning(null);
      try {
        const { data, error } = await supabase.functions.invoke('eawb-delivery', {
          body: { action: 'validate_pickup_locker', locker_id: id },
        });
        if (error) throw error;
        if (data?.success === false || data?.exists === false) {
          setStaleWarning(
            data?.message ||
              'Saved pickup locker could not be verified. Please select another locker.'
          );
        } else if (data?.locker) {
          if (!opts?.quiet) toast.success('Pickup locker verified');
        }
      } catch (e: any) {
        setStaleWarning(e?.message || 'Could not verify pickup locker.');
      } finally {
        setValidating(false);
      }
    },
    [profile, onSave, carrierCode]
  );

  // Quiet validate when a saved locker is present
  useEffect(() => {
    if (!hasLocker) {
      setStaleWarning(null);
      return;
    }
    void validateSavedLocker({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.eawb_pickup_locker_id]);

  const handleSelect = async (locker: SelectedLocker) => {
    await onSave({
      eawb_pickup_locker_id: String(locker.fixed_location_id),
      eawb_pickup_locker_name: locker.locker_name,
      eawb_pickup_locker_address: locker.address,
      eawb_pickup_locker_carrier_id: locker.carrier_id ?? null,
      eawb_pickup_locker_carrier_code: locker.carrier_code || carrierCode,
      eawb_pickup_locker_county: locker.county || null,
      eawb_pickup_locker_city: locker.locality || null,
    });
    setStaleWarning(null);
  };

  const handleRemove = async () => {
    await onSave(emptyLockerFields());
    setStaleWarning(null);
  };

  const openPicker = () => {
    if (!profile?.store_api_key) {
      toast.error('Store API key is missing — cannot load lockers.');
      return;
    }
    if (!profile?.eawb_api_key) {
      toast.error('Please enter and save your eAWB API key first');
      return;
    }
    setPickerOpen(true);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Label>Default Pickup Locker</Label>
      <p className="text-xs text-muted-foreground">
        Used automatically for AWB when the selected service supports locker pickup (locker → home /
        locker → locker). Otherwise your Pickup Address is used.
      </p>

      {loadingConfig && !hasLocker && (
        <div className="space-y-2 rounded-xl border border-border p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {hasLocker ? (
        <div
          className={cn(
            'rounded-xl border p-4 space-y-3 animate-in fade-in-0',
            staleWarning
              ? 'border-amber-500/40 bg-amber-500/5'
              : 'border-border bg-card'
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-3.5 w-3.5" />
            </span>
            Default Pickup Locker
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium text-foreground truncate">
                {profile?.eawb_pickup_locker_name}
              </p>
              <p className="text-muted-foreground text-xs">
                {carrierLabel(profile?.eawb_pickup_locker_carrier_code)}
                {profile?.eawb_pickup_locker_carrier_id
                  ? ` · ID ${profile.eawb_pickup_locker_carrier_id}`
                  : ''}
              </p>
              <p className="text-muted-foreground flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  {[profile?.eawb_pickup_locker_address, profile?.eawb_pickup_locker_city, profile?.eawb_pickup_locker_county]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </p>
            </div>
          </div>

          {staleWarning && (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{staleWarning}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openPicker}
              disabled={saving}
            >
              Change
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void validateSavedLocker()}
              disabled={validating || saving}
            >
              {validating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Refresh
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => void handleRemove()}
              disabled={saving}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Not set — AWB generation will continue using your Pickup Address. Select a locker if you
            ship via locker drop-off services.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">Carrier</Label>
              <Select value={carrierCode} onValueChange={setCarrierCode}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  {CARRIER_OPTIONS.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10"
              onClick={openPicker}
              disabled={saving || !profile?.eawb_api_key}
            >
              Retrieve Pickup Lockers
            </Button>
          </div>
        </div>
      )}

      {hasLocker && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end pt-1">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">Change carrier filter</Label>
            <Select value={carrierCode} onValueChange={setCarrierCode}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARRIER_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {profile?.store_api_key && (
        <LockerPickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          apiKey={profile.store_api_key}
          mapboxToken={mapboxToken || undefined}
          carrierCode={carrierCode}
          carrierName={carrierLabel(carrierCode)}
          initialSelectedId={profile?.eawb_pickup_locker_id || null}
          onConfirm={(locker) => {
            void handleSelect(locker);
          }}
        />
      )}
    </div>
  );
}
