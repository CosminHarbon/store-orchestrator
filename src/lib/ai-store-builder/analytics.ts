/** Lightweight AI Store Builder funnel events — no PII / prompt text. */

export type AiBuilderAnalyticsEvent =
  | 'ai_builder_opened'
  | 'ai_generation_started'
  | 'ai_generation_completed'
  | 'ai_generation_failed'
  | 'ai_edit_started'
  | 'ai_edit_completed'
  | 'ai_version_restored';

type Payload = Record<string, string | number | boolean | null | undefined>;

const BUFFER_KEY = 'sv-ai-builder-analytics';
const MAX = 100;

declare global {
  interface Window {
    __svAiBuilderEvents?: Array<{ event: AiBuilderAnalyticsEvent; at: string; payload?: Payload }>;
  }
}

export function trackAiBuilderEvent(event: AiBuilderAnalyticsEvent, payload?: Payload): void {
  try {
    const entry = { event, at: new Date().toISOString(), payload };
    if (typeof window !== 'undefined') {
      window.__svAiBuilderEvents = window.__svAiBuilderEvents || [];
      window.__svAiBuilderEvents.push(entry);
      if (window.__svAiBuilderEvents.length > MAX) {
        window.__svAiBuilderEvents.splice(0, window.__svAiBuilderEvents.length - MAX);
      }
    }
    const prev = JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]') as typeof entry[];
    prev.push(entry);
    localStorage.setItem(BUFFER_KEY, JSON.stringify(prev.slice(-MAX)));
  } catch {
    /* never throw */
  }
}
