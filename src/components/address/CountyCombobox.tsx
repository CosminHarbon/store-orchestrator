import { Check, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fetchEawbCounties } from '@/lib/localities/api';
import { ROMANIA_COUNTIES } from '@/lib/romaniaLocations';
import type { EawbCounty } from '@/lib/localities/types';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';

const RECENT_KEY = 'sv-recent-counties';

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

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function pushRecent(name: string) {
  try {
    const next = [name, ...loadRecent().filter((n) => n !== name)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export interface CountyComboboxProps {
  apiKey: string;
  value: string;
  onChange: (county: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  allowedCounties?: string[];
}

export function CountyCombobox({
  apiKey,
  value,
  onChange,
  disabled,
  className,
  placeholder,
  allowedCounties,
}: CountyComboboxProps) {
  const { t } = useTranslation('shipping');
  const resolvedPlaceholder = placeholder ?? t('locality.county');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [counties, setCounties] = useState<EawbCounty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEawbCounties(apiKey)
      .then((list) => {
        if (!cancelled) setCounties(list);
      })
      .catch((e) => {
        if (!cancelled) {
          // Offline fallback — still better than empty
          setCounties(ROMANIA_COUNTIES.map((name) => ({ id: name, code: '', name })));
          setError(e?.message || 'Using offline county list');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const allowed = (allowedCounties || []).map((n) => n.toLowerCase());
    const list = (counties.length
      ? counties
      : ROMANIA_COUNTIES.map((name) => ({ id: name, code: '', name }))
    ).filter((c) => allowed.length === 0 || allowed.includes(c.name.toLowerCase()));
    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [allowedCounties, counties, query]);

  const select = (name: string) => {
    onChange(name);
    pushRecent(name);
    setRecent(loadRecent());
    setOpen(false);
    setQuery('');
  };

  const trigger = (
    <Button
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      className={cn('w-full justify-between h-11 font-normal', className)}
    >
      <span className={cn('truncate', !value && 'text-muted-foreground')}>
        {value || resolvedPlaceholder}
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  const body = (
    <Command shouldFilter={false} className="rounded-xl">
      <CommandInput
        placeholder={t('locality.searchCounty')}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[280px]">
        {loading && (
          <div className="p-3 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
            <p className="text-xs text-muted-foreground text-center pt-1">{t('locality.loading')}</p>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <CommandEmpty>{t('locality.noCounties')}</CommandEmpty>
        )}
        {!loading && recent.length > 0 && !query && (
          <CommandGroup heading="Recent">
            {recent
              .filter((r) => filtered.some((c) => c.name === r))
              .map((r) => (
                <CommandItem key={`r-${r}`} value={r} onSelect={() => select(r)}>
                  <Check className={cn('mr-2 h-4 w-4', value === r ? 'opacity-100' : 'opacity-0')} />
                  {r}
                </CommandItem>
              ))}
          </CommandGroup>
        )}
        {!loading && (
          <CommandGroup heading="Counties">
            {filtered.map((c) => (
              <CommandItem
                key={`${c.code}-${c.name}`}
                value={c.name}
                onSelect={() => select(c.name)}
              >
                <Check
                  className={cn('mr-2 h-4 w-4', value === c.name ? 'opacity-100' : 'opacity-0')}
                />
                <span className="flex-1">{c.name}</span>
                {c.code ? (
                  <span className="text-xs text-muted-foreground tabular-nums">{c.code}</span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      {error && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground border-t">{error}</p>
      )}
    </Command>
  );

  if (isMobile) {
    return (
      <>
        <div onClick={() => !disabled && setOpen(true)}>{trigger}</div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="h-[75vh] p-0 rounded-t-2xl">
            <SheetHeader className="px-4 pt-4 pb-2 text-left border-b">
              <SheetTitle>{t('locality.county')}</SheetTitle>
            </SheetHeader>
            <div className="p-2">{body}</div>
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
