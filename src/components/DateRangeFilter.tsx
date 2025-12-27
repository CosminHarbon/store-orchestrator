import { useState } from 'react';
import { format, subDays, startOfYear } from 'date-fns';
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
        <DropdownMenuContent align="end" className="w-48 bg-popover border border-border z-50">
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

      {/* Custom Date Range Dialog */}
      <Dialog open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <DialogContent className="sm:max-w-fit">
          <DialogHeader>
            <DialogTitle>Select Date Range</DialogTitle>
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
                From: {tempFrom ? format(tempFrom, 'MMM d, yyyy') : 'Select date'}
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
                To: {tempTo ? format(tempTo, 'MMM d, yyyy') : 'Select date'}
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
              Cancel
            </Button>
            <Button 
              onClick={handleApplyCustomRange}
              disabled={!tempFrom || !tempTo}
            >
              Apply Range
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
