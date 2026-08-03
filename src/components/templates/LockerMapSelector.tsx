/**
 * @deprecated Prefer `LockerPicker` from `@/components/lockers/LockerPicker`.
 * Thin compatibility wrapper for older template imports.
 */
import type React from 'react';
import { LockerPicker } from '@/components/lockers/LockerPicker';
import { formatLockerAddress } from '@/lib/lockers/types';

interface LockerMapSelectorProps {
  carrierId: number;
  carrierName: string;
  carrierCode: string;
  apiKey: string;
  onLockerSelect: (locker: { id: string; name: string; address: string }) => void;
  mapboxToken: string;
  userId?: string;
}

const LockerMapSelector: React.FC<LockerMapSelectorProps> = ({
  carrierName,
  carrierCode,
  apiKey,
  onLockerSelect,
  mapboxToken,
}) => {
  return (
    <LockerPicker
      apiKey={apiKey}
      mapboxToken={mapboxToken}
      carrierCode={carrierCode}
      carrierName={carrierName}
      onSelect={(locker) => {
        onLockerSelect({
          id: locker.fixed_location_id,
          name: locker.locker_name,
          address: formatLockerAddress(locker),
        });
      }}
    />
  );
};

export default LockerMapSelector;
