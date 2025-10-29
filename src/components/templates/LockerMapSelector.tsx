import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, MapPin, Loader2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Locker {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  latitude: number;
  longitude: number;
  carrier_id: number;
  available?: boolean;
}

interface LockerMapSelectorProps {
  carrierId: number;
  carrierName: string;
  apiKey: string;
  onLockerSelect: (locker: { id: string; name: string; address: string }) => void;
  mapboxToken: string;
  userId?: string;
}

const LockerMapSelector: React.FC<LockerMapSelectorProps> = ({
  carrierId,
  carrierName,
  apiKey,
  onLockerSelect,
  mapboxToken,
  userId
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [selectedLocker, setSelectedLocker] = useState<Locker | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchCity, setSearchCity] = useState('');
  const [searchCounty, setSearchCounty] = useState('');
  const [apiKeyMissing, setApiKeyMissing] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [26.1025, 44.4268], // Romania center
      zoom: 11
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      markers.current.forEach(marker => marker.remove());
      map.current?.remove();
    };
  }, [mapboxToken]);

  const fetchLockers = async () => {
    if (!searchCity && !searchCounty) {
      toast({
        title: "Search required",
        description: "Please enter a city or county to search for lockers",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setApiKeyMissing(false);
    
    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Please log in to search for lockers');
      }

      // Call the edge function with proper authentication
      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: {
          action: 'fetch_lockers',
          carrier_id: carrierId,
          city: searchCity || undefined,
          county: searchCounty || undefined
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to fetch lockers');
      }

      if (!data.success) {
        if (data.error === 'MISSING_API_KEY') {
          setApiKeyMissing(true);
          toast({
            title: "Configuration Required",
            description: "Please configure your eAWB API key in Store Settings",
            variant: "destructive"
          });
          return;
        }
        throw new Error(data.message || 'Failed to fetch lockers');
      }

      console.log('Lockers received:', data.lockers);
      setLockers(data.lockers || []);
      
      if (data.lockers?.length > 0) {
        displayLockersOnMap(data.lockers);
        toast({
          title: "Lockers loaded",
          description: `Found ${data.lockers.length} locker(s)`
        });
      } else {
        toast({
          title: "No lockers found",
          description: "Try searching in a different area",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error fetching lockers:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to load lockers',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const displayLockersOnMap = (lockersData: Locker[]) => {
    if (!map.current) return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    // Add new markers
    lockersData.forEach((locker) => {
      if (!locker.latitude || !locker.longitude) return;

      const el = document.createElement('div');
      el.className = 'locker-marker';
      el.style.cssText = `
        width: 30px;
        height: 30px;
        background-color: #0080ff;
        border-radius: 50%;
        border: 3px solid white;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      `;

      const marker = new mapboxgl.Marker(el)
        .setLngLat([locker.longitude, locker.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 8px;">
                <h3 style="margin: 0 0 4px; font-weight: bold;">${locker.name}</h3>
                <p style="margin: 0; font-size: 12px;">${locker.address}</p>
                <p style="margin: 4px 0 0; font-size: 11px; color: #666;">${locker.city}, ${locker.county}</p>
              </div>
            `)
        )
        .addTo(map.current);

      el.addEventListener('click', () => {
        setSelectedLocker(locker);
      });

      markers.current.push(marker);
    });

    // Fit map to show all markers
    if (lockersData.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      lockersData.forEach(locker => {
        if (locker.latitude && locker.longitude) {
          bounds.extend([locker.longitude, locker.latitude]);
        }
      });
      map.current.fitBounds(bounds, { padding: 50 });
    }
  };

  const handleSelectLocker = () => {
    if (selectedLocker) {
      onLockerSelect({
        id: selectedLocker.id,
        name: selectedLocker.name,
        address: `${selectedLocker.address}, ${selectedLocker.city}, ${selectedLocker.county}`
      });
      toast({
        title: "Locker selected",
        description: selectedLocker.name
      });
    }
  };

  return (
    <div className="space-y-4">
      {apiKeyMissing && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-semibold text-destructive">eAWB API Key Required</h4>
            <p className="text-sm text-muted-foreground mt-1">
              To use the locker selector, you need to configure your eAWB API key in Store Settings. 
              This key allows us to fetch available locker locations from your shipping provider.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="City (e.g., București, Iași)"
          value={searchCity}
          onChange={(e) => setSearchCity(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchLockers()}
        />
        <Input
          placeholder="County (optional)"
          value={searchCounty}
          onChange={(e) => setSearchCounty(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchLockers()}
        />
        <Button onClick={fetchLockers} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      <div ref={mapContainer} className="w-full h-96 rounded-lg border" />

      {selectedLocker && (
        <div className="p-4 bg-primary/10 rounded-lg space-y-2">
          <div className="flex items-start gap-2">
            <MapPin className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold">{selectedLocker.name}</h4>
              <p className="text-sm text-muted-foreground">{selectedLocker.address}</p>
              <p className="text-sm text-muted-foreground">{selectedLocker.city}, {selectedLocker.county}</p>
            </div>
          </div>
          <Button onClick={handleSelectLocker} className="w-full">
            Select This Locker
          </Button>
        </div>
      )}

      {lockers.length > 0 && !selectedLocker && (
        <p className="text-sm text-muted-foreground text-center">
          Click on a marker to select a locker
        </p>
      )}
    </div>
  );
};

export default LockerMapSelector;
