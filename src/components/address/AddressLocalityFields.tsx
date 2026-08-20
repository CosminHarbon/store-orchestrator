import { useTranslation } from 'react-i18next';
import { CountyCombobox } from '@/components/address/CountyCombobox';
import { LocalityCombobox } from '@/components/address/LocalityCombobox';
import type { EawbLocality } from '@/lib/localities/types';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface AddressLocalityFieldsProps {
  apiKey: string;
  county: string;
  city: string;
  onCountyChange: (county: string) => void;
  onLocalityChange: (locality: EawbLocality) => void;
  disabled?: boolean;
  className?: string;
  /** Optional labels for branded storefronts */
  countyLabel?: string;
  localityLabel?: string;
  labelClassName?: string;
  allowedCounties?: string[];
  allowedLocalities?: { county: string; locality: string }[];
}

/**
 * Universal county + locality selector (cities, towns, villages, communes)
 * backed by official eAWB location endpoints.
 */
export function AddressLocalityFields({
  apiKey,
  county,
  city,
  onCountyChange,
  onLocalityChange,
  disabled,
  className,
  countyLabel,
  localityLabel,
  labelClassName,
  allowedCounties,
  allowedLocalities,
}: AddressLocalityFieldsProps) {
  const { t } = useTranslation('shipping');

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-1.5">
        <Label className={cn('text-sm', labelClassName)}>
          {countyLabel ?? `${t('locality.county')} *`}
        </Label>
        <CountyCombobox
          apiKey={apiKey}
          value={county}
          disabled={disabled}
          allowedCounties={allowedCounties}
          onChange={(c) => onCountyChange(c)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className={cn('text-sm', labelClassName)}>
          {localityLabel ?? `${t('locality.locality')} *`}
        </Label>
        <LocalityCombobox
          apiKey={apiKey}
          county={county}
          value={city}
          disabled={disabled || !county}
          placeholder={county ? t('locality.searchLocality') : t('locality.selectCountyFirst')}
          allowedLocalities={allowedLocalities}
          onChange={onLocalityChange}
        />
      </div>
    </div>
  );
}
