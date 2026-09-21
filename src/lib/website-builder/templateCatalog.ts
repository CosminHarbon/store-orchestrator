/**
 * Central template catalog metadata for Website Builder.
 * Template renderers remain the source of truth for behavior.
 */

export type TemplateCatalogId = 'elementar' | 'premium' | 'floral' | 'ai';

export type TemplateCategory =
  | 'all'
  | 'minimal'
  | 'bold'
  | 'fashion'
  | 'beauty'
  | 'home'
  | 'services'
  | 'editable'
  | 'predesigned'
  | 'ai';

export type TemplateCatalogEntry = {
  id: TemplateCatalogId;
  /** i18n key under templates namespace, e.g. editable.name */
  nameKey: string;
  descriptionKey: string;
  badgeKey: string;
  /** Filter chips that include this template */
  categories: TemplateCategory[];
  /** Primary style chip shown on card */
  styleLabel: string;
  /** CSS preview kit — mirrors real template palette (not stock photography) */
  preview: {
    kind: 'gradient';
    from: string;
    via: string;
    to: string;
    titleColor: string;
    eyebrowColor: string;
    accent?: string;
  };
  editable: boolean;
  /** Opens visual editor when used */
  opensEditor?: boolean;
};

export const TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
  {
    id: 'elementar',
    nameKey: 'editable.name',
    descriptionKey: 'editable.description',
    badgeKey: 'editable.badge',
    categories: ['all', 'minimal', 'editable', 'home', 'services'],
    styleLabel: 'Minimal',
    preview: {
      kind: 'gradient',
      from: '#e7e5e4',
      via: '#f5f5f4',
      to: '#ffffff',
      titleColor: '#292524',
      eyebrowColor: '#78716c',
      accent: '#6E3DFF',
    },
    editable: true,
    opensEditor: true,
  },
  {
    id: 'premium',
    nameKey: 'premium.name',
    descriptionKey: 'premium.description',
    badgeKey: 'premium.badge',
    categories: ['all', 'bold', 'fashion', 'beauty', 'predesigned'],
    styleLabel: 'Bold',
    preview: {
      kind: 'gradient',
      from: '#1c2b24',
      via: '#2a3d34',
      to: '#0f1612',
      titleColor: '#ffffff',
      eyebrowColor: 'rgba(255,255,255,0.7)',
      accent: '#c4b5a0',
    },
    editable: false,
  },
  {
    id: 'floral',
    nameKey: 'floral.name',
    descriptionKey: 'floral.description',
    badgeKey: 'floral.badge',
    categories: ['all', 'beauty', 'home', 'predesigned'],
    styleLabel: 'Editorial',
    preview: {
      kind: 'gradient',
      from: '#f3e4e0',
      via: '#fbf8f5',
      to: '#efe8e3',
      titleColor: '#1f1714',
      eyebrowColor: '#9e4f5a',
      accent: '#c97b84',
    },
    editable: false,
  },
  {
    id: 'ai',
    nameKey: 'studio.cardTitle',
    descriptionKey: 'studio.cardBody',
    badgeKey: 'studio.badge',
    categories: ['all', 'ai', 'bold'],
    styleLabel: 'AI Studio',
    preview: {
      kind: 'gradient',
      from: '#1A0F2E',
      via: '#3D1B6E',
      to: '#6E3DFF',
      titleColor: '#ffffff',
      eyebrowColor: 'rgba(255,255,255,0.7)',
      accent: '#C4B5FF',
    },
    editable: true,
  },
];

/** Categories that currently have at least one template — hide empty filters. */
export function availableTemplateCategories(): TemplateCategory[] {
  const present = new Set<TemplateCategory>();
  for (const t of TEMPLATE_CATALOG) {
    for (const c of t.categories) present.add(c);
  }
  const order: TemplateCategory[] = [
    'all',
    'minimal',
    'bold',
    'fashion',
    'beauty',
    'home',
    'services',
    'editable',
    'predesigned',
    'ai',
  ];
  return order.filter((c) => present.has(c));
}

export function getTemplateById(id: string): TemplateCatalogEntry | undefined {
  return TEMPLATE_CATALOG.find((t) => t.id === id);
}

export function filterTemplates(category: TemplateCategory): TemplateCatalogEntry[] {
  if (category === 'all') return TEMPLATE_CATALOG;
  return TEMPLATE_CATALOG.filter((t) => t.categories.includes(category));
}

export const DESIGN_STYLE_OPTIONS = [
  'minimal',
  'luxury',
  'modern',
  'bold',
  'editorial',
  'playful',
] as const;

export type DesignStyleOption = (typeof DESIGN_STYLE_OPTIONS)[number];
