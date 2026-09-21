/** Website Builder funnel analytics — local buffer, no new vendor. */

export type WebsiteBuilderAnalyticsEvent =
  | 'website_builder_opened'
  | 'specialist_design_started'
  | 'specialist_design_submitted'
  | 'template_catalog_opened'
  | 'template_previewed'
  | 'template_selected'
  | 'ai_builder_opened_from_more_tools';

type Payload = Record<string, string | number | boolean | null | undefined>;

const BUFFER_KEY = 'sv-website-builder-analytics';
const MAX = 100;

declare global {
  interface Window {
    __svWebsiteBuilderEvents?: Array<{
      event: WebsiteBuilderAnalyticsEvent;
      at: string;
      payload?: Payload;
    }>;
  }
}

export function trackWebsiteBuilderEvent(
  event: WebsiteBuilderAnalyticsEvent,
  payload?: Payload,
): void {
  try {
    const entry = { event, at: new Date().toISOString(), payload };
    if (typeof window !== 'undefined') {
      window.__svWebsiteBuilderEvents = window.__svWebsiteBuilderEvents || [];
      window.__svWebsiteBuilderEvents.push(entry);
      if (window.__svWebsiteBuilderEvents.length > MAX) {
        window.__svWebsiteBuilderEvents.splice(
          0,
          window.__svWebsiteBuilderEvents.length - MAX,
        );
      }
    }
    const prev = JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]') as typeof entry[];
    prev.push(entry);
    localStorage.setItem(BUFFER_KEY, JSON.stringify(prev.slice(-MAX)));
  } catch {
    /* never throw */
  }
}
