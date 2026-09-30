/**
 * Declarative editable-field schema for curated themes.
 * Future themes register fields here — the form renderer stays generic.
 */

export type EditorFieldType =
  | 'text'
  | 'textarea'
  | 'image'
  | 'choice'
  | 'boolean'
  | 'string-list'
  | 'why-cards'
  | 'hero-stats'
  | 'social-links'
  | 'product'
  | 'nav-labels'
  | 'section-controls'
  | 'commerce-note';

export type EditorFieldGroup =
  | 'Brand'
  | 'Hero'
  | 'Sections'
  | 'Shop'
  | 'Featured'
  | 'Why us'
  | 'Navigation'
  | 'Footer'
  | 'Social'
  | 'Collections'
  | 'Editorial'
  | 'Call to action'
  | 'Product page';

export type EditorChoiceOption = {
  value: string;
  label: string;
};

export type EditorFieldSchema = {
  /** Dot path into ContentSlots, e.g. "hero.headline" or "whyCards". */
  key: string;
  label: string;
  group: EditorFieldGroup;
  type: EditorFieldType;
  helpText?: string;
  maxLength?: number;
  maxCount?: number;
  /** For choice fields. */
  options?: EditorChoiceOption[];
  /** Show when another field matches (simple equality). */
  visibleWhen?: { key: string; equals: string | boolean | null };
  /** Placeholder for text inputs. */
  placeholder?: string;
  /** For section-controls: theme-specific marketing section ids + labels. */
  sectionOptions?: { id: string; label: string }[];
  /** For commerce-note: deep-link into merchant console tabs. */
  manageHref?: string;
  manageLabel?: string;
};

export type CuratedThemeEditorSchema = {
  themeId: string;
  fields: EditorFieldSchema[];
};
