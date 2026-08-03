export type LockerViewMode = 'map' | 'list';

export type LockerFilterPrefs = {
  maxDistanceM: number | null; // null = any
  nearestOnly: boolean;
  openNow: boolean;
  dropOffOnly: boolean;
};

const VIEW_KEY = 'sv-locker-view';
const FILTER_KEY = 'sv-locker-filters';

export function getLockerViewPref(fallback: LockerViewMode = 'map'): LockerViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'map' || v === 'list') return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function setLockerViewPref(view: LockerViewMode): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}

export function getLockerFilterPrefs(): LockerFilterPrefs {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<LockerFilterPrefs>;
      return {
        maxDistanceM: typeof p.maxDistanceM === 'number' ? p.maxDistanceM : null,
        nearestOnly: !!p.nearestOnly,
        openNow: !!p.openNow,
        dropOffOnly: !!p.dropOffOnly,
      };
    }
  } catch {
    /* ignore */
  }
  return { maxDistanceM: null, nearestOnly: false, openNow: false, dropOffOnly: false };
}

export function setLockerFilterPrefs(prefs: LockerFilterPrefs): void {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
