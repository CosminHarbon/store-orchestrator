import { useTranslation } from 'react-i18next';
import { CountyCombobox } from '@/components/address/CountyCombobox';
import { LocalityCombobox } from '@/components/address/LocalityCombobox';
import type { EawbLocality } from '@/lib/localities/types';
import { Input } from '@/components/ui/input';
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
  /**
   * Manual / own-delivery stores (no eAWB): county from static RO list,
   * city/town/village as free text — no eAWB locality API.
   */
  manualEntry?: boolean;
}

/**
 * County + locality selector.
 * - Default: official eAWB localities (cities, towns, villages, communes).
 * - manualEntry: free-text city for merchants without eAWB.
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
  manualEntry = false,
}: AddressLocalityFieldsProps) {
  const { t } = useTranslation('shipping');

  const emitFreeTextCity = (name: string) => {
    onLocalityChange({
      id: null,
      name: name.trim(),
      county: county || '',
      name_and_county: county ? `${name.trim()}, ${county}` : name.trim(),
    });
  };

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
          offlineOnly={manualEntry}
          onChange={(c) => onCountyChange(c)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className={cn('text-sm', labelClassName)}>
          {localityLabel ?? `${t('locality.locality')} *`}
        </Label>
        {manualEntry ? (
          <Input
            value={city}
            disabled={disabled || !county}
            placeholder={
              county ? t('locality.typeLocality') : t('locality.selectCountyFirst')
            }
            className="h-11"
            onChange={(e) => emitFreeTextCity(e.target.value)}
          />
        ) : (
          <LocalityCombobox
            apiKey={apiKey}
            county={county}
            value={city}
            disabled={disabled || !county}
            placeholder={county ? t('locality.searchLocality') : t('locality.selectCountyFirst')}
            allowedLocalities={allowedLocalities}
            allowFreeTextFallback
            onChange={onLocalityChange}
          />
        )}
      </div>
    </div>
  );
}
