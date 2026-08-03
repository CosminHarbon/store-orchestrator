/** Fire-and-forget locker picker analytics — never blocks checkout. */

export type LockerAnalyticsEvent =
  | 'locker_opened'
  | 'map_opened'
  | 'list_opened'
  | 'locker_selected'
  | 'search_used'
  | 'favourite_locker_selected'
  | 'locate_me'
  | 'filter_changed';

type Payload = Record<string, string | number | boolean | null | undefined>;

const BUFFER_KEY = 'sv-locker-analytics';
const MAX = 100;

declare global {
  interface Window {
    __svLockerEvents?: Array<{ event: LockerAnalyticsEvent; at: string; payload?: Payload }>;
  }
}

export function trackLockerEvent(event: LockerAnalyticsEvent, payload?: Payload): void {
  try {
    const entry = { event, at: new Date().toISOString(), payload };
    if (typeof window !== 'undefined') {
      window.__svLockerEvents = window.__svLockerEvents || [];
      window.__svLockerEvents.push(entry);
      if (window.__svLockerEvents.length > MAX) {
        window.__svLockerEvents.splice(0, window.__svLockerEvents.length - MAX);
      }
    }
    const prev = JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]') as typeof entry[];
    prev.push(entry);
    localStorage.setItem(BUFFER_KEY, JSON.stringify(prev.slice(-MAX)));
  } catch {
    /* never throw */
  }
}
