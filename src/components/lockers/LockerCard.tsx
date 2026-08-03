import { Check, Clock, CreditCard, Footprints, Heart, MapPin, Package, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTravelSummary } from '@/lib/lockers/distance';
import { formatSchedule, type LockerLocation } from '@/lib/lockers/types';
import { isLockerOpenNow } from '@/lib/lockers/geocode';

interface LockerCardProps {
  locker: LockerLocation;
  selected?: boolean;
  isFavorite?: boolean;
  onSelect: (locker: LockerLocation) => void;
  onConfirm?: (locker: LockerLocation) => void;
  onToggleFavorite?: (locker: LockerLocation) => void;
}

function CarrierBadge({ name, code }: { name: string; code: string }) {
  const label = (name || code || 'CR').replace(/\s+/g, '').slice(0, 3).toUpperCase();
  return (
    <div
      className="h-11 w-11 rounded-xl bg-gradient-to-br from-muted to-muted/40 border border-border/60 flex items-center justify-center text-[11px] font-bold tracking-tight text-foreground/80 shrink-0 shadow-sm"
      aria-hidden
      title={name || code}
    >
      {label}
    </div>
  );
}

export function LockerCard({
  locker,
  selected,
  isFavorite,
  onSelect,
  onConfirm,
  onToggleFavorite,
}: LockerCardProps) {
  const schedule = formatSchedule(locker.schedule);
  const inactive = locker.available === false;
  const openNow = isLockerOpenNow(locker.schedule);
  const travel =
    locker.distance_m != null && Number.isFinite(locker.distance_m)
      ? formatTravelSummary(locker.distance_m)
      : null;

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={() => !inactive && onSelect(locker)}
      onKeyDown={(e) => {
        if (inactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(locker);
        }
      }}
      className={cn(
        'w-full text-left rounded-2xl border p-4 transition-all duration-200 cursor-pointer',
        'hover:border-foreground/25 hover:shadow-lg hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'min-h-[88px]',
        inactive && 'opacity-55 cursor-not-allowed hover:translate-y-0 hover:shadow-none',
        selected
          ? 'border-blue-500/60 bg-blue-500/5 shadow-md ring-1 ring-blue-500/20 dark:bg-blue-500/10'
          : 'border-border/70 bg-card'
      )}
    >
      <div className="flex gap-3">
        <CarrierBadge name={locker.carrier_name} code={locker.carrier_code} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-sm leading-snug flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{locker.name}</span>
                {isFavorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="line-clamp-2">
                  {locker.address}
                  {locker.city ? `, ${locker.city}` : ''}
                  {locker.county ? `, ${locker.county}` : ''}
                </span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {selected && (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px]',
                  inactive
                    ? 'border-destructive/40 text-destructive'
                    : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                )}
              >
                {inactive ? 'Inactive' : 'Available'}
              </Badge>
            </div>
          </div>

          {travel && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-foreground/80">
              <span className="tabular-nums">{travel.distanceLabel}</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground font-normal">
                <Footprints className="h-3 w-3" />
                {travel.walkLabel}
              </span>
              <span className="text-muted-foreground font-normal">{travel.driveLabel}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>{locker.carrier_name || locker.carrier_code}</span>
            {openNow === true && (
              <span className="text-emerald-600 dark:text-emerald-400">Open now</span>
            )}
            {openNow === false && <span>Closed now</span>}
            {locker.payment_type && (
              <span className="inline-flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                {locker.payment_type}
              </span>
            )}
            {locker.allows_drop_off != null && (
              <span>{locker.allows_drop_off ? 'Drop-off' : 'Pickup only'}</span>
            )}
            {locker.fixed_location_type && (
              <span className="capitalize">{String(locker.fixed_location_type).replace(/_/g, ' ')}</span>
            )}
            {schedule && (
              <span className="inline-flex items-center gap-1 truncate max-w-full">
                <Clock className="h-3 w-3 shrink-0" />
                {schedule}
              </span>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="flex-1 h-10 rounded-xl"
              disabled={inactive}
              onClick={(e) => {
                e.stopPropagation();
                if (onConfirm) onConfirm(locker);
                else onSelect(locker);
              }}
            >
              {selected ? 'Selected' : 'Select'}
            </Button>
            {onToggleFavorite && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-10 w-10 rounded-xl shrink-0"
                aria-label={isFavorite ? 'Remove favourite' : 'Save as favourite'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(locker);
                }}
              >
                <Heart
                  className={cn('h-4 w-4', isFavorite && 'fill-rose-500 text-rose-500')}
                />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
