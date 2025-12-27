import { useState } from 'react';
import { format, subDays, subMonths, startOfYear } from 'date-fns';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type DateRange = {
  from: Date;
  to: Date;
};

export type PresetKey = 'week' | '30days' | '90days' | 'year' | 'custom';

interface DateRangeFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  preset: PresetKey;
  onPresetChange: (preset: PresetKey) => void;
  className?: string;
}

const presets: { key: PresetKey; label: string; getRange: () => DateRange }[] = [
  {
    key: 'week',
    label: 'Last 7 days',
    getRange: () => ({ from: subDays(new Date(), 7), to: new Date() }),
  },
  {
    key: '30days',
    label: 'Last 30 days',
    getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    key: '90days',
    label: 'Last 90 days',
    getRange: () => ({ from: subDays(new Date(), 90), to: new Date() }),
  },
  {
    key: 'year',
    label: 'This year',
    getRange: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
];

export function DateRangeFilter({
  dateRange,
  onDateRangeChange,
  preset,
  onPresetChange,
  className,
}: DateRangeFilterProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(dateRange.from);
  const [tempTo, setTempTo] = useState<Date | undefined>(dateRange.to);

  const handlePresetSelect = (presetKey: PresetKey) => {
    if (presetKey === 'custom') {
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

  const getPresetLabel = () => {
    if (preset === 'custom') {
      return `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`;
    }
    return presets.find((p) => p.key === preset)?.label || 'Select period';
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <CalendarIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{getPresetLabel()}</span>
            <span className="sm:hidden">
              {preset === 'custom' 
                ? `${format(dateRange.from, 'M/d')} - ${format(dateRange.to, 'M/d')}`
                : presets.find((p) => p.key === preset)?.label.replace('Last ', '') || 'Period'
              }
            </span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {presets.map((p) => (
            <DropdownMenuItem
              key={p.key}
              onClick={() => handlePresetSelect(p.key)}
              className={cn(preset === p.key && 'bg-accent')}
            >
              {p.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handlePresetSelect('custom')}>
            Custom range...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Custom Date Range Popover */}
      <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <PopoverTrigger asChild>
          <span className="hidden" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">From</p>
              <Calendar
                mode="single"
                selected={tempFrom}
                onSelect={setTempFrom}
                disabled={(date) => date > new Date()}
                initialFocus
                className="pointer-events-auto"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">To</p>
              <Calendar
                mode="single"
                selected={tempTo}
                onSelect={setTempTo}
                disabled={(date) => date > new Date() || (tempFrom && date < tempFrom)}
                className="pointer-events-auto"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsCustomOpen(false)}>
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={handleApplyCustomRange}
                disabled={!tempFrom || !tempTo}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
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
