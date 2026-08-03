import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, subDays, startOfYear } from 'date-fns';
import { enUS, ro } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isAppLanguage } from '@/i18n/types';

function useDateFnsLocale() {
  const { i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage || i18n.language || 'ro').split('-')[0];
  return isAppLanguage(lng) && lng === 'en' ? enUS : ro;
}
export type DateRange = {
  from: Date;
  to: Date;
};

export type PresetKey = 'today' | 'week' | '30days' | '90days' | 'year' | 'custom';

interface DateRangeFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  preset: PresetKey;
  onPresetChange: (preset: PresetKey) => void;
  className?: string;
}

const presets: { key: Exclude<PresetKey, 'custom'>; getRange: () => DateRange }[] = [
  {
    key: 'today',
    getRange: () => {
      const now = new Date();
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from, to: now };
    },
  },
  {
    key: 'week',
    getRange: () => ({ from: subDays(new Date(), 7), to: new Date() }),
  },
  {
    key: '30days',
    getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    key: '90days',
    getRange: () => ({ from: subDays(new Date(), 90), to: new Date() }),
  },
  {
    key: 'year',
    getRange: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
];

const presetLabelKeys: Record<Exclude<PresetKey, 'custom'>, string> = {
  today: 'dateRange.today',
  week: 'dateRange.last7days',
  '30days': 'dateRange.last30days',
  '90days': 'dateRange.last90days',
  year: 'dateRange.thisYear',
};

export function DateRangeFilter({
  dateRange,
  onDateRangeChange,
  preset,
  onPresetChange,
  className,
}: DateRangeFilterProps) {
  const { t } = useTranslation('common');
  const dateLocale = useDateFnsLocale();
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(dateRange.from);
  const [tempTo, setTempTo] = useState<Date | undefined>(dateRange.to);
  const [selectingDate, setSelectingDate] = useState<'from' | 'to'>('from');

  const handlePresetSelect = (presetKey: PresetKey) => {
    if (presetKey === 'custom') {
      setTempFrom(dateRange.from);
      setTempTo(dateRange.to);
      setSelectingDate('from');
      setIsCustomOpen(true);
      onPresetChange('custom');
    } else {
      const selectedPreset = presets.find((p) => p.key === presetKey);
      if (selectedPreset) {
        onPresetChange(presetKey);
        onDateRangeChange(selectedPreset.getRange());
      }
    }
  };

  const handleApplyCustomRange = () => {
    if (tempFrom && tempTo) {
      onDateRangeChange({ from: tempFrom, to: tempTo });
      setIsCustomOpen(false);
    }
  };

  const handleFromSelect = (date: Date | undefined) => {
    setTempFrom(date);
    if (date) {
      setSelectingDate('to');
    }
  };

  const handleToSelect = (date: Date | undefined) => {
    setTempTo(date);
  };

  const getPresetLabel = () => {
    if (preset === 'custom') {
      return `${format(dateRange.from, 'd MMM', { locale: dateLocale })} - ${format(dateRange.to, 'd MMM yyyy', { locale: dateLocale })}`;
    }
    const labelKey = presetLabelKeys[preset];
    return labelKey ? t(labelKey) : t('dateRange.selectPeriod');
  };

  const getMobilePresetLabel = () => {
    if (preset === 'custom') {
      return `${format(dateRange.from, 'd/M')} - ${format(dateRange.to, 'd/M')}`;
    }
    const labelKey = presetLabelKeys[preset];
    return labelKey ? t(labelKey) : t('dateRange.period');
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2 bg-background text-foreground border-border hover:bg-muted">
            <CalendarIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{getPresetLabel()}</span>
            <span className="sm:hidden">
              {getMobilePresetLabel()}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-popover border border-border z-50">
          {presets.map((p) => (
            <DropdownMenuItem
              key={p.key}
              onClick={() => handlePresetSelect(p.key)}
              className={cn(preset === p.key && 'bg-accent')}
            >
              {t(presetLabelKeys[p.key])}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handlePresetSelect('custom')}>
            {t('dateRange.custom')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Custom Date Range Dialog */}
      <Dialog open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <DialogContent className="sm:max-w-fit">
          <DialogHeader>
            <DialogTitle>{t('dateRange.selectTitle')}</DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col sm:flex-row gap-4 py-4">
            {/* From Date */}
            <div className="space-y-2">
              <Button
                variant={selectingDate === 'from' ? 'default' : 'outline'}
                size="sm"
                className="w-full justify-start"
                onClick={() => setSelectingDate('from')}
              >
                {t('dateRange.from', {
                  date: tempFrom ? format(tempFrom, 'PPP', { locale: dateLocale }) : t('dateRange.selectDate'),
                })}
              </Button>
              {selectingDate === 'from' && (
                <Calendar
                  mode="single"
                  selected={tempFrom}
                  onSelect={handleFromSelect}
                  disabled={(date) => date > new Date()}
                  className="rounded-md border pointer-events-auto"
                />
              )}
            </div>

            {/* To Date */}
            <div className="space-y-2">
              <Button
                variant={selectingDate === 'to' ? 'default' : 'outline'}
                size="sm"
                className="w-full justify-start"
                onClick={() => setSelectingDate('to')}
              >
                {t('dateRange.to', {
                  date: tempTo ? format(tempTo, 'PPP', { locale: dateLocale }) : t('dateRange.selectDate'),
                })}
              </Button>
              {selectingDate === 'to' && (
                <Calendar
                  mode="single"
                  selected={tempTo}
                  onSelect={handleToSelect}
                  disabled={(date) => date > new Date() || (tempFrom ? date < tempFrom : false)}
                  className="rounded-md border pointer-events-auto"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCustomOpen(false)}>
              {t('cancel')}
            </Button>
            <Button 
              onClick={handleApplyCustomRange}
              disabled={!tempFrom || !tempTo}
            >
              {t('dateRange.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Hook for managing date range state
export function useDateRangeFilter(initialPreset: PresetKey = '30days') {
  const getInitialRange = (): DateRange => {
    const preset = presets.find((p) => p.key === initialPreset);
    return preset ? preset.getRange() : { from: subDays(new Date(), 30), to: new Date() };
  };

  const [preset, setPreset] = useState<PresetKey>(initialPreset);
  const [dateRange, setDateRange] = useState<DateRange>(getInitialRange);

  return {
    dateRange,
    setDateRange,
    preset,
    setPreset,
  };
}
