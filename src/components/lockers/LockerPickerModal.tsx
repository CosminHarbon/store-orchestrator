import { useCallback, useEffect, useId, useState } from 'react';
import {
  AlertCircle,
  Filter,
  List,
  Loader2,
  Map as MapIcon,
  Package,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { CountyCombobox } from '@/components/address/CountyCombobox';
import { LocalityCombobox } from '@/components/address/LocalityCombobox';
import { LockerCard } from '@/components/lockers/LockerCard';
import { LockerMapView } from '@/components/lockers/LockerMapView';
import { useLockerSearch } from '@/hooks/useLockerSearch';
import { trackLockerEvent } from '@/lib/lockers/analytics';
import {
  clearFavoriteLocker,
  getFavoriteLocker,
  isFavoriteLocker,
  setFavoriteLocker,
} from '@/lib/lockers/favorites';
import { reverseGeocodeRo } from '@/lib/lockers/geocode';
import {
  getLockerFilterPrefs,
  getLockerViewPref,
  setLockerFilterPrefs,
  setLockerViewPref,
  type LockerFilterPrefs,
  type LockerViewMode,
} from '@/lib/lockers/lockerPrefs';
import {
  toSelectedLocker,
  type LockerLocation,
  type SelectedLocker,
} from '@/lib/lockers/types';
import { cn } from '@/lib/utils';

interface LockerPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  mapboxToken?: string;
  carrierCode: string;
  carrierName?: string;
  initialSelectedId?: string | null;
  onConfirm: (locker: SelectedLocker) => void;
}

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);
  return mobile;
}

function LockerListSkeleton() {
  return (
    <div className="space-y-3 p-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function PickerBody({
  apiKey,
  mapboxToken,
  carrierCode,
  carrierName,
  initialSelectedId,
  onConfirm,
  onClose,
  isMobile,
}: {
  apiKey: string;
  mapboxToken?: string;
  carrierCode: string;
  carrierName?: string;
  initialSelectedId?: string | null;
  onConfirm: (locker: SelectedLocker) => void;
  onClose: () => void;
  isMobile: boolean;
}) {
  const listId = useId();
  const [view, setView] = useState<LockerViewMode>(() =>
    mapboxToken ? getLockerViewPref('map') : 'list'
  );
  const [filters, setFilters] = useState<LockerFilterPrefs>(() => getLockerFilterPrefs());
  const [showFilters, setShowFilters] = useState(false);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [selected, setSelected] = useState<LockerLocation | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [favTick, setFavTick] = useState(0);

  const effectiveView: LockerViewMode =
    !mapboxToken || mapFailed ? 'list' : view;

  const search = useLockerSearch({
    apiKey,
    carrierCode,
    userCoords,
    filters,
  });

  const { searchAtLocation } = search;

  useEffect(() => {
    trackLockerEvent('locker_opened', { carrier: carrierCode });
  }, [carrierCode]);

  useEffect(() => {
    if (effectiveView === 'map') trackLockerEvent('map_opened');
    else trackLockerEvent('list_opened');
  }, [effectiveView]);

  useEffect(() => {
    if (!initialSelectedId || !search.lockers.length) return;
    const found = search.lockers.find((l) => l.id === initialSelectedId);
    if (found) setSelected(found);
  }, [initialSelectedId, search.lockers]);

  // After Locate Me + search, highlight nearest locker once results arrive
  const [pendingNearestSelect, setPendingNearestSelect] = useState(false);
  useEffect(() => {
    if (!pendingNearestSelect || search.loading || !search.lockers.length) return;
    const nearest = search.lockers.find((l) => l.available !== false) || search.lockers[0];
    if (nearest) {
      setSelected(nearest);
      setActiveIndex(0);
    }
    setPendingNearestSelect(false);
  }, [pendingNearestSelect, search.loading, search.lockers]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search.lockers]);

  const setViewSafe = (next: LockerViewMode) => {
    setView(next);
    setLockerViewPref(next);
  };

  const updateFilters = (patch: Partial<LockerFilterPrefs>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      setLockerFilterPrefs(next);
      trackLockerEvent('filter_changed', patch as Record<string, string | number | boolean>);
      return next;
    });
  };

  const confirm = (locker: LockerLocation) => {
    const selectedLocker = toSelectedLocker(locker);
    trackLockerEvent('locker_selected', {
      id: locker.id,
      name: locker.name,
      distance_m: locker.distance_m ?? null,
    });
    onConfirm(selectedLocker);
    onClose();
  };

  const locateMe = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocateError('Geolocation is not supported on this device.');
      return;
    }
    if (!mapboxToken) {
      setLocateError('Map is unavailable — please select county and locality manually.');
      return;
    }

    setLocating(true);
    setLocateError(null);
    trackLockerEvent('locate_me');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setUserCoords(coords);

        try {
          const place = await reverseGeocodeRo(coords.latitude, coords.longitude, mapboxToken, undefined, {
            apiKey,
          });
          if (!place) {
            setLocateError(
              'Could not detect your locality. Please select county and village/town manually.'
            );
            setLocating(false);
            return;
          }

          // Same pipeline as manual county/locality select — pass values directly (no state race)
          setPendingNearestSelect(true);
          await searchAtLocation(place.locality, place.county);
        } catch {
          setLocateError('Could not resolve your location. Please select county and locality.');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocateError('Location permission denied. Choose a locality instead.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, [apiKey, mapboxToken, searchAtLocation]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!search.lockers.length || effectiveView !== 'list') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, search.lockers.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const locker = search.lockers[activeIndex];
      if (locker && locker.available !== false) confirm(locker);
    }
  };

  const listPanel = (
    <div
      id={listId}
      role="listbox"
      aria-label="Available lockers"
      className="overflow-y-auto p-3 sm:p-4 space-y-2.5 h-full"
      onKeyDown={onKeyDown}
    >
      {!search.canSearch && !search.hasSearched && (
        <div className="flex flex-col items-center justify-center text-center py-14 px-6 text-muted-foreground">
          <Package className="h-10 w-10 mb-3 opacity-40" />
          <p className="font-medium text-foreground">Find a locker near you</p>
          <p className="text-sm mt-1 max-w-sm">
            Choose county and locality (city or village), or tap Locate me. We only load lockers for that area.
          </p>
          {mapboxToken && (
            <Button type="button" className="mt-4 rounded-xl" onClick={() => void locateMe()} disabled={locating}>
              {locating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Locate me
            </Button>
          )}
        </div>
      )}

      {search.loading && <LockerListSkeleton />}

      {!search.loading && search.error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Couldn’t load lockers</p>
              <p className="text-muted-foreground mt-1">{search.error.message}</p>
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={search.refresh}>
            Retry
          </Button>
        </div>
      )}

      {!search.loading && !search.error && search.hasSearched && search.lockers.length === 0 && (
        <div className="flex flex-col items-center justify-center text-center py-14 text-muted-foreground">
          <Search className="h-8 w-8 mb-3 opacity-40" />
          <p className="font-medium text-foreground">No lockers nearby</p>
          <p className="text-sm mt-1 max-w-xs">Try another locality, clear filters, or refresh.</p>
          <Button type="button" size="sm" variant="outline" className="mt-4 rounded-xl" onClick={search.refresh}>
            Refresh
          </Button>
        </div>
      )}

      {!search.loading &&
        search.lockers.map((locker, index) => (
          <div key={locker.id} className={cn(index === activeIndex && 'ring-2 ring-ring rounded-2xl')}>
            <LockerCard
              locker={locker}
              selected={selected?.id === locker.id}
              isFavorite={isFavoriteLocker(locker.id)}
              onSelect={(l) => {
                setSelected(l);
                setActiveIndex(index);
              }}
              onConfirm={confirm}
              onToggleFavorite={(l) => {
                if (isFavoriteLocker(l.id)) clearFavoriteLocker();
                else setFavoriteLocker(toSelectedLocker(l));
                setFavTick((t) => t + 1);
              }}
            />
          </div>
        ))}
      {/* favTick forces re-render after favourite toggle */}
      <span className="sr-only">{favTick}</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Toolbar */}
      <div className="shrink-0 space-y-3 border-b border-border px-3 py-3 sm:px-5 safe-area-pt">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/40">
            <Button
              type="button"
              size="sm"
              variant={effectiveView === 'map' ? 'default' : 'ghost'}
              className="rounded-lg h-9 px-3"
              disabled={!mapboxToken || mapFailed}
              onClick={() => setViewSafe('map')}
              aria-pressed={effectiveView === 'map'}
            >
              <MapIcon className="h-3.5 w-3.5 mr-1.5" />
              Map
            </Button>
            <Button
              type="button"
              size="sm"
              variant={effectiveView === 'list' ? 'default' : 'ghost'}
              className="rounded-lg h-9 px-3"
              onClick={() => setViewSafe('list')}
              aria-pressed={effectiveView === 'list'}
            >
              <List className="h-3.5 w-3.5 mr-1.5" />
              List
            </Button>
          </div>
          <div className="flex-1" />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 rounded-xl"
            onClick={() => setShowFilters((v) => !v)}
            aria-label="Filters"
            aria-expanded={showFilters}
          >
            <Filter className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 rounded-xl"
            onClick={search.refresh}
            disabled={search.loading || !search.canSearch}
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', search.loading && 'animate-spin')} />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <CountyCombobox
            apiKey={apiKey}
            value={search.countyName}
            className="h-11 rounded-xl"
            onChange={(county) => {
              search.setCountyName(county);
              search.setLocalityName('');
            }}
          />
          <LocalityCombobox
            apiKey={apiKey}
            county={search.countyName}
            value={search.localityName}
            disabled={!search.countyName}
            className="h-11 rounded-xl"
            placeholder={search.countyName ? 'Village / town / city' : 'County first'}
            onChange={(loc) => {
              void searchAtLocation(loc.name, loc.county || search.countyName);
            }}
          />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-11 rounded-xl"
            placeholder="Search name, street, city…"
            value={search.queryFilter}
            onChange={(e) => {
              search.setQueryFilter(e.target.value);
              if (e.target.value.trim()) trackLockerEvent('search_used');
            }}
            aria-controls={listId}
          />
        </div>

        {showFilters && (
          <div className="rounded-2xl border border-border bg-muted/20 p-3 space-y-3 animate-in fade-in-0 slide-in-from-top-1">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm">Nearest only</Label>
              <Switch
                checked={filters.nearestOnly}
                onCheckedChange={(v) => updateFilters({ nearestOnly: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm">Open now</Label>
              <Switch checked={filters.openNow} onCheckedChange={(v) => updateFilters({ openNow: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm">Drop-off supported</Label>
              <Switch
                checked={filters.dropOffOnly}
                onCheckedChange={(v) => updateFilters({ dropOffOnly: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Max distance</Label>
              <Select
                value={filters.maxDistanceM == null ? 'any' : String(filters.maxDistanceM)}
                onValueChange={(v) =>
                  updateFilters({ maxDistanceM: v === 'any' ? null : Number(v) })
                }
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any distance</SelectItem>
                  <SelectItem value="500">Within 500 m</SelectItem>
                  <SelectItem value="1000">Within 1 km</SelectItem>
                  <SelectItem value="3000">Within 3 km</SelectItem>
                  <SelectItem value="5000">Within 5 km</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Carrier: {carrierName || carrierCode.toUpperCase()} (from checkout)
            </p>
          </div>
        )}

        {(locateError || userCoords) && (
          <p className="text-xs text-muted-foreground">
            {locateError
              ? locateError
              : 'Showing distances from your location · You are here on the map'}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {carrierName || carrierCode.toUpperCase()}
          {search.fromCache ? ' · cached' : ''}
          {search.hasSearched && !search.loading
            ? ` · ${search.lockers.length} locker${search.lockers.length === 1 ? '' : 's'}`
            : ''}
          {mapFailed ? ' · map unavailable, list mode' : ''}
        </p>
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex-1 min-h-0',
          effectiveView === 'map' ? 'grid md:grid-cols-[1.15fr_0.85fr]' : 'grid grid-cols-1'
        )}
      >
        {effectiveView === 'map' && mapboxToken && (
          <div className={cn('min-h-[42vh] md:min-h-0 p-2 sm:p-3', isMobile && 'order-1')}>
            <LockerMapView
              lockers={search.lockers}
              selectedId={selected?.id}
              mapboxToken={mapboxToken}
              userCoords={userCoords}
              onSelect={setSelected}
              onLocate={() => void locateMe()}
              onMapError={() => {
                setMapFailed(true);
                setViewSafe('list');
              }}
              className="h-full min-h-[42vh] md:min-h-full"
            />
          </div>
        )}

        <div
          className={cn(
            'min-h-0 border-border',
            effectiveView === 'map' && 'md:border-l max-h-[38vh] md:max-h-none',
            isMobile && effectiveView === 'map' && 'order-2'
          )}
        >
          {listPanel}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 border-t border-border px-3 py-3 sm:px-5 flex items-center justify-between gap-3 bg-background/95 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0 text-sm">
          {selected ? (
            <>
              <p className="font-medium truncate">{selected.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {selected.city}, {selected.county}
                {selected.distance_m != null
                  ? ` · ${Math.round(selected.distance_m)} m`
                  : ''}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Select a locker to continue</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button type="button" variant="ghost" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-xl h-11 px-5"
            disabled={!selected || selected.available === false}
            onClick={() => selected && confirm(selected)}
          >
            {search.loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LockerPickerModal({
  open,
  onOpenChange,
  apiKey,
  mapboxToken,
  carrierCode,
  carrierName,
  initialSelectedId,
  onConfirm,
}: LockerPickerModalProps) {
  const isMobile = useIsMobile();

  const body = open ? (
    <PickerBody
      apiKey={apiKey}
      mapboxToken={mapboxToken}
      carrierCode={carrierCode}
      carrierName={carrierName}
      initialSelectedId={initialSelectedId}
      onConfirm={onConfirm}
      onClose={() => onOpenChange(false)}
      isMobile={isMobile}
    />
  ) : null;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[94vh] p-0 flex flex-col gap-0 rounded-t-3xl [&>button]:hidden"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <SheetHeader className="px-4 pt-3 pb-2 text-left border-b border-border shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle>Choose locker</SheetTitle>
                <SheetDescription>Map-first pickup points near you.</SheetDescription>
              </div>
              <Button type="button" size="icon" variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
          <div className="flex-1 min-h-0">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[min(96vw,1080px)] h-[min(92vh,880px)] p-0 gap-0 overflow-hidden flex flex-col [&>button]:hidden">
        <DialogHeader className="px-5 pt-4 pb-2 text-left border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Choose locker</DialogTitle>
              <DialogDescription>Map-first pickup points near you.</DialogDescription>
            </div>
            <Button type="button" size="icon" variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0">{body}</div>
      </DialogContent>
    </Dialog>
  );
}

/** Used by LockerPicker to offer favourite preselect without opening modal. */
export function peekFavoriteLocker(): SelectedLocker | null {
  return getFavoriteLocker();
}
