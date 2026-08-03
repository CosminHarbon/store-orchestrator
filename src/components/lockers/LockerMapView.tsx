import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTheme } from 'next-themes';
import { Crosshair, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LockerLocation } from '@/lib/lockers/types';
import { cn } from '@/lib/utils';

interface LockerMapViewProps {
  lockers: LockerLocation[];
  selectedId?: string | null;
  mapboxToken: string;
  userCoords?: { latitude: number; longitude: number } | null;
  onSelect: (locker: LockerLocation) => void;
  onLocate?: () => void;
  onMapError?: () => void;
  className?: string;
}

const PIN_LAYERS = ['unclustered-hit', 'unclustered', 'selected-halo'] as const;

export function LockerMapView({
  lockers,
  selectedId,
  mapboxToken,
  userCoords,
  onSelect,
  onLocate,
  onMapError,
  className,
}: LockerMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lockersRef = useRef(lockers);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  lockersRef.current = lockers;
  onSelectRef.current = onSelect;

  const geojson = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: lockers
        .filter((l) => l.latitude && l.longitude)
        .map((l) => ({
          type: 'Feature' as const,
          properties: {
            id: String(l.id),
            name: l.name,
            address: l.address,
            selected: l.id === selectedId ? 1 : 0,
            available: l.available !== false ? 1 : 0,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [l.longitude, l.latitude] as [number, number],
          },
        })),
    };
  }, [lockers, selectedId]);

  useEffect(() => {
    if (!containerRef.current || !mapboxToken) return;

    let cancelled = false;
    mapboxgl.accessToken = mapboxToken;

    const style = isDark
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/streets-v12';

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style,
      center: userCoords
        ? [userCoords.longitude, userCoords.latitude]
        : [26.1025, 44.4268],
      zoom: userCoords ? 13 : 11,
      attributionControl: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-left');
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    mapRef.current = map;

    map.on('error', () => {
      if (!cancelled) onMapError?.();
    });

    const selectLockerById = (rawId: unknown) => {
      if (rawId == null || rawId === '') return false;
      const id = String(rawId);
      const locker = lockersRef.current.find((l) => String(l.id) === id);
      if (!locker || locker.available === false) return false;
      onSelectRef.current(locker);
      map.flyTo({
        center: [locker.longitude, locker.latitude],
        zoom: Math.max(map.getZoom(), 15),
        duration: 900,
        essential: true,
      });
      return true;
    };

    map.on('load', () => {
      if (cancelled) return;

      map.addSource('lockers', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 52,
      });

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'lockers',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': isDark ? '#e7e5e4' : '#1c1917',
          'circle-radius': ['step', ['get', 'point_count'], 18, 8, 22, 25, 28],
          'circle-opacity': 0.9,
          'circle-stroke-width': 2,
          'circle-stroke-color': isDark ? '#0c0a09' : '#ffffff',
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'lockers',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': isDark ? '#0c0a09' : '#ffffff' },
      });

      // Soft pulse ring under the pin so clicks still hit the pin layer
      map.addLayer({
        id: 'selected-halo',
        type: 'circle',
        source: 'lockers',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'selected'], 1]],
        paint: {
          'circle-radius': 18,
          'circle-color': '#2563eb',
          'circle-opacity': 0.25,
        },
      });

      // Invisible larger hit target for easy tap on mobile
      map.addLayer({
        id: 'unclustered-hit',
        type: 'circle',
        source: 'lockers',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 22,
          'circle-color': '#000000',
          'circle-opacity': 0,
        },
      });

      map.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: 'lockers',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'case',
            ['==', ['get', 'selected'], 1],
            '#2563eb',
            ['==', ['get', 'available'], 0],
            '#a8a29e',
            isDark ? '#fafaf9' : '#0f172a',
          ],
          'circle-radius': [
            'case',
            ['==', ['get', 'selected'], 1],
            11,
            8,
          ],
          'circle-stroke-width': [
            'case',
            ['==', ['get', 'selected'], 1],
            3,
            2,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      });

      map.on('click', (e) => {
        // Clusters first — expand instead of selecting
        const clusterHits = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        if (clusterHits.length) {
          const clusterId = clusterHits[0]?.properties?.cluster_id;
          const source = map.getSource('lockers') as mapboxgl.GeoJSONSource;
          if (clusterId == null) return;
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || zoom == null) return;
            const coords = (clusterHits[0].geometry as GeoJSON.Point).coordinates as [
              number,
              number,
            ];
            map.easeTo({ center: coords, zoom, duration: 700 });
          });
          return;
        }

        const pinHits = map.queryRenderedFeatures(e.point, {
          layers: [...PIN_LAYERS],
        });
        const id = pinHits[0]?.properties?.id;
        if (id != null) selectLockerById(id);
      });

      const setPointer = () => {
        map.getCanvas().style.cursor = 'pointer';
      };
      const clearPointer = () => {
        map.getCanvas().style.cursor = '';
      };
      map.on('mouseenter', 'clusters', setPointer);
      map.on('mouseleave', 'clusters', clearPointer);
      for (const layer of PIN_LAYERS) {
        map.on('mouseenter', layer, setPointer);
        map.on('mouseleave', layer, clearPointer);
      }

      setReady(true);
    });

    return () => {
      cancelled = true;
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Remount on theme / token change for correct style
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken, isDark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource('lockers') as mapboxgl.GeoJSONSource | undefined;
    if (source) source.setData(geojson);

    if (geojson.features.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    geojson.features.forEach((f) => bounds.extend(f.geometry.coordinates as [number, number]));
    if (userCoords) bounds.extend([userCoords.longitude, userCoords.latitude]);

    // With user location, always frame user + lockers; otherwise only auto-fit when nothing selected
    if (userCoords || !selectedId) {
      map.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 800 });
    }
  }, [geojson, ready, selectedId, userCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedId || userCoords) return;
    const locker = lockers.find((l) => l.id === selectedId);
    if (!locker) return;
    map.flyTo({
      center: [locker.longitude, locker.latitude],
      zoom: Math.max(map.getZoom(), 15),
      duration: 850,
      essential: true,
    });
  }, [selectedId, lockers, ready, userCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    userMarkerRef.current?.remove();
    userMarkerRef.current = null;

    if (!userCoords) return;

    const el = document.createElement('div');
    el.className = 'sv-user-location-marker';
    el.setAttribute('aria-label', 'You are here');
    el.innerHTML = `
      <div style="position:relative;width:18px;height:18px;">
        <span style="position:absolute;inset:0;border-radius:9999px;background:#3b82f6;opacity:0.35;animation:svPulse 1.8s ease-out infinite;"></span>
        <span style="position:absolute;inset:3px;border-radius:9999px;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);"></span>
      </div>
    `;

    userMarkerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([userCoords.longitude, userCoords.latitude])
      .setPopup(new mapboxgl.Popup({ offset: 12 }).setText('You are here'))
      .addTo(map);
  }, [userCoords, ready]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  return (
    <div
      className={cn(
        'relative w-full h-full min-h-[280px] rounded-xl overflow-hidden border border-border bg-muted/30',
        fullscreen && 'fixed inset-0 z-[80] rounded-none border-0 min-h-screen',
        className
      )}
    >
      <style>{`@keyframes svPulse{0%{transform:scale(.6);opacity:.5}70%{transform:scale(1.8);opacity:0}100%{opacity:0}}`}</style>
      <div ref={containerRef} className="absolute inset-0" role="application" aria-label="Locker map" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground backdrop-blur-sm z-10">
          Loading map…
        </div>
      )}

      <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-2">
        {onLocate && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-10 w-10 shadow-md"
            onClick={onLocate}
            aria-label="Locate me"
            title="Locate me"
          >
            <Crosshair className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-10 w-10 shadow-md"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
