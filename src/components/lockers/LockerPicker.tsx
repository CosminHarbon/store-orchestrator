import { useEffect, useState } from 'react';
import { Check, Footprints, Heart, MapPin, Package, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LockerPickerModal, peekFavoriteLocker } from '@/components/lockers/LockerPickerModal';
import { trackLockerEvent } from '@/lib/lockers/analytics';
import { formatTravelSummary } from '@/lib/lockers/distance';
import { formatLockerAddress, type SelectedLocker } from '@/lib/lockers/types';
import { cn } from '@/lib/utils';

export interface LockerPickerProps {
  apiKey: string;
  mapboxToken?: string;
  carrierCode: string;
  carrierName?: string;
  /** Current selection (from checkout form). */
  value?: {
    locker_id?: string;
    locker_name?: string;
    locker_address?: string;
    city?: string;
    county?: string;
  } | null;
  onSelect: (locker: SelectedLocker) => void;
  className?: string;
  /** Optional visual variant for premium storefront tokens */
  variant?: 'default' | 'premium';
}

export function LockerPicker({
  apiKey,
  mapboxToken,
  carrierCode,
  carrierName = 'Sameday',
  value,
  onSelect,
  className,
  variant = 'default',
}: LockerPickerProps) {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<{ distance_m?: number | null }>({});
  const hasSelection = !!(value?.locker_id && value?.locker_name);
  const premium = variant === 'premium';

  // Auto-preselect favourite on first mount if checkout has no locker yet
  useEffect(() => {
    if (hasSelection) return;
    const fav = peekFavoriteLocker();
    if (!fav) return;
    if (fav.carrier_code && fav.carrier_code !== carrierCode) return;
    trackLockerEvent('favourite_locker_selected', { id: fav.fixed_location_id });
    setMeta({ distance_m: fav.distance_m });
    onSelect(fav);
    // intentionally once when empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierCode]);

  const travel =
    meta.distance_m != null && Number.isFinite(meta.distance_m)
      ? formatTravelSummary(meta.distance_m)
      : null;

  return (
    <div className={cn('space-y-3', className)}>
      {hasSelection ? (
        <div
          className={cn(
            'rounded-2xl border p-4 space-y-3 shadow-sm',
            premium
              ? 'border-[var(--prem-line)] bg-[var(--prem-bg)]'
              : 'border-border bg-card'
          )}
        >
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-3.5 w-3.5" />
            </span>
            Locker selected
          </div>

          <div className="flex items-start gap-3">
            <div
              className={cn(
                'h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border border-border/60',
                premium ? 'bg-[var(--prem-accent-soft)]' : 'bg-muted'
              )}
            >
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {carrierName && (
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {carrierName}
                </p>
              )}
              <p className="font-semibold text-sm leading-snug">{value!.locker_name}</p>
              {(value!.city || value!.county) && (
                <p className="text-sm text-muted-foreground">
                  {[value!.city, value!.county].filter(Boolean).join(', ')}
                </p>
              )}
              {value!.locker_address && (
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{value!.locker_address}</span>
                </p>
              )}
              {travel && (
                <p className="text-xs font-medium text-foreground/80 flex flex-wrap gap-x-3 gap-y-1 pt-1">
                  <span>{travel.distanceLabel}</span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground font-normal">
                    <Footprints className="h-3 w-3" />
                    {travel.walkLabel}
                  </span>
                  <span className="text-muted-foreground font-normal">{travel.driveLabel}</span>
                </p>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className={cn('w-full h-11 rounded-xl', premium && 'border-[var(--prem-line)]')}
            onClick={() => setOpen(true)}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Change locker
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            type="button"
            className={cn(
              'w-full h-12 text-sm font-medium rounded-xl',
              premium && 'prem-btn prem-btn-primary !rounded-[var(--prem-radius-sm)]'
            )}
            onClick={() => setOpen(true)}
          >
            <MapPin className="h-4 w-4 mr-2" />
            Choose locker
          </Button>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-center">
            <Heart className="h-3 w-3" />
            Favourites are remembered on this device
          </p>
        </div>
      )}

      <LockerPickerModal
        open={open}
        onOpenChange={setOpen}
        apiKey={apiKey}
        mapboxToken={mapboxToken}
        carrierCode={carrierCode}
        carrierName={carrierName}
        initialSelectedId={value?.locker_id || null}
        onConfirm={(locker) => {
          setMeta({ distance_m: locker.distance_m });
          onSelect(locker);
        }}
      />
    </div>
  );
}

export { formatLockerAddress };
