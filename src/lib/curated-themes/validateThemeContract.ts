/**
 * Validate that a curated theme's manifest slot list, defaults, and editor schema agree.
 */
import type { ContentSlots } from './contentSlots';
import type { CuratedThemeEditorSchema } from './editorSchema';
import { getContentPath } from './contentPath';

export type ThemeContractCheck = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

function flattenDefaultKeys(content: ContentSlots, prefix = ''): string[] {
  const out: string[] = [];
  const obj = content as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (k === 'hero' && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const hk of Object.keys(v as object)) {
        out.push(`hero.${hk}`);
      }
      continue;
    }
    out.push(path);
  }
  return out;
}

export function validateCuratedThemeContract(opts: {
  themeId: string;
  availableContentSlots: readonly string[];
  defaults: ContentSlots;
  editorSchema: CuratedThemeEditorSchema;
  supportedHeroMediaModes?: readonly string[];
}): ThemeContractCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (opts.editorSchema.themeId !== opts.themeId) {
    errors.push(`editorSchema.themeId "${opts.editorSchema.themeId}" !== theme id "${opts.themeId}"`);
  }

  if (!opts.defaults.hero || typeof opts.defaults.hero !== 'object') {
    errors.push('defaults.hero is required');
  }

  const slotSet = new Set(opts.availableContentSlots);
  const fieldKeys = opts.editorSchema.fields.map((f) => f.key);

  for (const key of fieldKeys) {
    if (!slotSet.has(key)) {
      // section-controls maps to "sections"
      if (key === 'sections' && slotSet.has('sections')) continue;
      warnings.push(`editor field "${key}" is not listed in availableContentSlots`);
    }
    // Ensure defaults expose a value for top-level / hero paths (may be null).
    const val = getContentPath(opts.defaults, key);
    if (val === undefined && !key.includes('.')) {
      // optional complex fields may be undefined vs null
      warnings.push(`defaults missing key "${key}" (undefined)`);
    }
  }

  for (const slot of opts.availableContentSlots) {
    if (slot.startsWith('hero.') || slot.includes('.')) {
      // leaf paths expected in editor or intentionally content-only
      const covered = fieldKeys.includes(slot);
      if (!covered && !['sections.order', 'sections.hidden'].includes(slot)) {
        // many slots are covered by composite field types (whyCards, sections)
        const parent = slot.split('.')[0];
        const parentCovered = fieldKeys.some((k) => k === parent || k.startsWith(parent + '.'));
        if (!parentCovered) {
          warnings.push(`availableContentSlots entry "${slot}" has no editor field`);
        }
      }
    }
  }

  const modes = opts.supportedHeroMediaModes || [];
  if (modes.length && opts.defaults.hero?.mediaMode && !modes.includes(opts.defaults.hero.mediaMode)) {
    errors.push(`defaults.hero.mediaMode "${opts.defaults.hero.mediaMode}" not in supportedHeroMediaModes`);
  }

  // Duplicate editor keys
  const seen = new Set<string>();
  for (const k of fieldKeys) {
    if (seen.has(k)) errors.push(`duplicate editor field key "${k}"`);
    seen.add(k);
  }

  void flattenDefaultKeys;
  return { ok: errors.length === 0, errors, warnings };
}
