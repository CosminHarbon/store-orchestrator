import type { SelectedLocker } from './types';

const FAVORITE_KEY = 'sv-favorite-locker';

export function getFavoriteLocker(): SelectedLocker | null {
  try {
    const raw = localStorage.getItem(FAVORITE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SelectedLocker;
    if (!parsed?.fixed_location_id || !parsed?.locker_name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setFavoriteLocker(locker: SelectedLocker): void {
  try {
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(locker));
  } catch {
    /* ignore quota */
  }
}

export function clearFavoriteLocker(): void {
  try {
    localStorage.removeItem(FAVORITE_KEY);
  } catch {
    /* ignore */
  }
}

export function isFavoriteLocker(id: string): boolean {
  const fav = getFavoriteLocker();
  return !!fav && fav.fixed_location_id === String(id);
}
