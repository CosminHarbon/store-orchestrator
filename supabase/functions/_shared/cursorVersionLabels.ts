/**
 * Derive merchant-facing version labels from prompts (no AI).
 * Keep in sync with src/lib/ai-store-builder/versionLabels.ts
 */

export function deriveVersionLabel(
  prompt: string | null | undefined,
  opts?: { isInitial?: boolean; isRestore?: boolean },
): string {
  if (opts?.isRestore) return 'Restored version';
  const raw = String(prompt || '').trim();
  if (!raw) {
    return opts?.isInitial ? 'Initial AI design' : 'AI edit';
  }

  const lower = raw.toLowerCase();

  // Never surface repair/injection/system prompts as merchant labels.
  if (
    lower.startsWith('repair only') ||
    lower.includes('presentation code should') ||
    lower.includes('ignore all previous') ||
    lower.includes('system prompt') ||
    /\b(agent id|run id|runtime sha|cursor_)\b/.test(lower)
  ) {
    return opts?.isInitial ? 'Initial AI design' : 'AI edit';
  }

  if (
    /\b(hero|banner|headline|tagline)\b/.test(lower) &&
    /\b(update|change|edit|tweak|fix|adjust|rewrite|replace)\b/.test(lower)
  ) {
    return 'Hero update';
  }
  if (/\b(hero|banner)\b/.test(lower) && opts?.isInitial !== true) {
    return 'Hero update';
  }
  if (/\b(best[- ]?sellers?|bestsellers?|top sellers?|featured products?)\b/.test(lower)) {
    return /add|include|show|feature|highlight/.test(lower)
      ? 'Added best sellers'
      : 'Best sellers';
  }
  if (/\b(color|colour|palette|theme|brand)\b/.test(lower)) {
    return 'Color & theme';
  }
  if (/\b(nav|navigation|menu|header)\b/.test(lower)) {
    return 'Navigation update';
  }
  if (/\b(product card|product grid|catalog|collection)\b/.test(lower)) {
    return 'Catalog layout';
  }
  if (/\b(mobile|responsive)\b/.test(lower)) {
    return 'Mobile polish';
  }
  if (/\b(font|typography|typeface)\b/.test(lower)) {
    return 'Typography';
  }
  if (/\b(footer|contact|about)\b/.test(lower)) {
    return 'Footer & pages';
  }

  if (opts?.isInitial) return 'Initial AI design';

  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 39).trimEnd()}…`;
}

export function completionMessageForVersion(opts: {
  displayLabel: string;
  versionNumber: number;
  isInitial?: boolean;
}): string {
  if (opts.isInitial) {
    return `Your storefront draft is ready (v${opts.versionNumber}). Preview it on the right — tell me what to change.`;
  }
  return `Updated draft ready: ${opts.displayLabel} (v${opts.versionNumber}).`;
}
