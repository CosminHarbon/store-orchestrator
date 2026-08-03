import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchEawbLocalitiesForCounty,
  searchEawbLocalities,
} from '@/lib/localities/api';
import {
  localityPrimaryLabel,
  localitySearchHaystack,
  localitySecondaryLines,
  type EawbLocality,
} from '@/lib/localities/types';
import { cn } from '@/lib/utils';

const RECENT_KEY = 'sv-recent-localities';

function useIsMobile(bp = 640) {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < bp : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`);
    const fn = () => setM(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [bp]);
  return m;
}

type RecentItem = { name: string; county: string; id?: string | number | null };

function loadRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as RecentItem[];
  } catch {
    return [];
  }
}

function pushRecent(item: RecentItem) {
  try {
    const next = [
      item,
      ...loadRecent().filter((r) => !(r.name === item.name && r.county === item.county)),
    ].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export interface LocalityComboboxProps {
  apiKey: string;
  /** When set, load all official localities for that county (cities + villages). */
  county?: string;
  value: string;
  onChange: (locality: EawbLocality) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function LocalityCombobox({
  apiKey,
  county,
  value,
  onChange,
  disabled,
  className,
  placeholder,
}: LocalityComboboxProps) {
  const { t } = useTranslation('shipping');
  const resolvedPlaceholder = placeholder ?? t('locality.searchLocality');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [countyLocalities, setCountyLocalities] = useState<EawbLocality[]>([]);
  const [searchResults, setSearchResults] = useState<EawbLocality[]>([]);
  const [loadingCounty, setLoadingCounty] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>(() => loadRecent());
  const isMobile = useIsMobile();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load full county locality list (includes villages) when county is chosen
  useEffect(() => {
    if (!county?.trim()) {
      setCountyLocalities([]);
      return;
    }
    let cancelled = false;
    setLoadingCounty(true);
    setError(null);
    fetchEawbLocalitiesForCounty(apiKey, county)
      .then((list) => {
        if (!cancelled) setCountyLocalities(list);
      })
      .catch((e) => {
        if (!cancelled) {
          setCountyLocalities([]);
          setError(e?.message || 'Failed to load localities');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCounty(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, county]);

  // Debounced national search (also used when no county / postal codes)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();

    // Prefer local filter of county list when county is set and we have data
    if (county && countyLocalities.length > 0) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    if (q.length < 2) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    setLoadingSearch(true);
    debounceRef.current = setTimeout(() => {
      searchEawbLocalities(apiKey, q)
        .then((list) => {
          const filtered = county
            ? list.filter((l) => l.county.toLowerCase() === county.toLowerCase())
            : list;
          setSearchResults(filtered);
          setError(null);
        })
        .catch((e) => {
          setSearchResults([]);
          setError(e?.message || 'Search failed');
        })
        .finally(() => setLoadingSearch(false));
    }, 280);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [apiKey, query, county, countyLocalities.length]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (county && countyLocalities.length > 0) {
      if (!q) return countyLocalities.slice(0, 80);
      return countyLocalities
        .filter((l) => localitySearchHaystack(l).includes(q))
        .slice(0, 100);
    }

    return searchResults;
  }, [county, countyLocalities, query, searchResults]);

  const loading = loadingCounty || loadingSearch;

  const select = (l: EawbLocality) => {
    onChange(l);
    pushRecent({ name: l.name, county: l.county, id: l.id });
    setRecent(loadRecent());
    setOpen(false);
    setQuery('');
  };

  const triggerLabel = value || resolvedPlaceholder;

  const trigger = (
    <Button
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      className={cn(
        'w-full justify-between h-11 font-normal',
        disabled && 'opacity-60',
        className
      )}
    >
      <span className={cn('truncate flex items-center gap-2', !value && 'text-muted-foreground')}>
        {value ? <MapPin className="h-3.5 w-3.5 shrink-0 opacity-60" /> : null}
        {triggerLabel}
      </span>
      {loading ? (
        <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
      ) : (
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      )}
    </Button>
  );

  const body = (
    <Command shouldFilter={false} className="rounded-xl">
      <CommandInput
        placeholder={t('locality.searchLocality')}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[320px]">
        {loading && options.length === 0 && (
          <div className="p-3 space-y-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-3/4 rounded-lg" />
            <p className="text-xs text-muted-foreground text-center pt-1">{t('locality.loading')}</p>
          </div>
        )}

        {!loading && !county && query.trim().length < 2 && (
          <div className="py-8 text-center text-sm text-muted-foreground px-4">
            Type at least 2 characters to search official eAWB localities.
          </div>
        )}

        {!loading && options.length === 0 && (query.trim().length >= 2 || (county && countyLocalities.length > 0)) && (
          <CommandEmpty>
            {t('locality.noLocalities')}
          </CommandEmpty>
        )}

        {!loading && county && countyLocalities.length === 0 && !error && !query.trim() && (
          <div className="py-8 text-center text-sm text-muted-foreground px-4">
            No localities loaded for {county}. Try searching by name.
          </div>
        )}

        {!query && recent.length > 0 && (
          <CommandGroup heading="Recent">
            {recent
              .filter((r) => !county || r.county.toLowerCase() === county.toLowerCase())
              .map((r) => (
                <CommandItem
                  key={`recent-${r.county}-${r.name}`}
                  value={`${r.name}-${r.county}`}
                  onSelect={() =>
                    select({
                      id: r.id ?? null,
                      name: r.name,
                      county: r.county,
                      name_and_county: `${r.name}, ${r.county}`,
                    })
                  }
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === r.name ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.county}</div>
                  </div>
                </CommandItem>
              ))}
          </CommandGroup>
        )}

        {options.length > 0 && (
          <CommandGroup heading={county ? `Localities in ${county}` : 'Results'}>
            {options.map((l) => {
              const secondary = localitySecondaryLines(l);
              return (
                <CommandItem
                  key={`${l.id}-${l.name}-${l.county}-${l.commune || ''}`}
                  value={`${l.name}-${l.county}-${l.id}`}
                  onSelect={() => select(l)}
                  className="items-start py-2.5"
                >
                  <Check
                    className={cn(
                      'mr-2 mt-0.5 h-4 w-4',
                      value === l.name ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-snug">
                      {localityPrimaryLabel(l)}
                    </div>
                    {secondary.map((line) => (
                      <div key={line} className="text-xs text-muted-foreground leading-snug">
                        {line}
                      </div>
                    ))}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
      {error && (
        <p className="px-3 py-2 text-[11px] text-destructive/80 border-t">{error}</p>
      )}
      <p className="px-3 py-2 text-[10px] text-muted-foreground border-t">
        Official eAWB localities — cities, towns, villages & communes
      </p>
    </Command>
  );

  if (isMobile) {
    return (
      <>
        <div
          onClick={() => {
            if (!disabled) setOpen(true);
          }}
        >
          {trigger}
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="h-[82vh] p-0 rounded-t-2xl">
            <SheetHeader className="px-4 pt-4 pb-2 text-left border-b">
              <SheetTitle>{t('locality.locality')}</SheetTitle>
            </SheetHeader>
            <div className="p-2 h-[calc(82vh-4rem)] overflow-hidden">{body}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        {body}
      </PopoverContent>
    </Popover>
  );
}
