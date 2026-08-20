import { applyLayoutChrome, inferLayoutId, withLayout } from './layouts';
import type { StoreBrief, StorefrontSpec } from './spec';
import { STOREFRONT_SPEC_VERSION } from './spec';
import { heroImageFor } from './stockImages';

const RO_HINTS = /\b(și|sau|pentru|magazin|floare|flori|haine|bijuterii|vreau|eleganta|elegantă|roz|negru)\b/i;

const NICHE_FROM_WORDS: Array<{ test: RegExp; niche: string; mood: string }> = [
  { test: /flower|flowers|florist|floral|bouquet|peony|lalea|flori|floare|florar/i, niche: 'floral', mood: 'airy elegant' },
  { test: /\b(streetwear|haine|sneaker|fashion|hoodie)\b/i, niche: 'streetwear', mood: 'bold urban' },
  { test: /\b(cosmetic|skincare|beauty|makeup|cosmetice)\b/i, niche: 'cosmetics', mood: 'soft clean' },
  { test: /\b(jewel|bijuter|gold|goldsmith)\b/i, niche: 'jewelry', mood: 'luxury refined' },
  { test: /\b(kid|copii|toy|jucarii|jucării)\b/i, niche: 'kids', mood: 'playful bright' },
  { test: /\b(coffee|cafe|bakery|food|cafea)\b/i, niche: 'food', mood: 'warm artisan' },
  { test: /\b(home|casa|casă|interior|furniture)\b/i, niche: 'home', mood: 'calm natural' },
];

const PALETTES: Record<string, StorefrontSpec['tokens']> = {
  floral: {
    primary: '#9E4F5A',
    background: '#FBF8F5',
    text: '#1F1714',
    accent: '#8A7D76',
    secondary: '#F3E4E0',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Nunito Sans',
    radius: 'rounded-xl',
    buttonStyle: 'pill',
    shadow: 'soft',
    navbarStyle: 'glass',
    heroLayout: 'left',
    productCardStyle: 'minimal',
  },
  streetwear: {
    primary: '#111111',
    background: '#F4F4F5',
    text: '#111111',
    accent: '#52525B',
    secondary: '#E4E4E7',
    headingFont: 'Space Grotesk',
    bodyFont: 'DM Sans',
    radius: 'rounded-none',
    buttonStyle: 'solid',
    shadow: 'lift',
    navbarStyle: 'solid',
    heroLayout: 'center',
    productCardStyle: 'bordered',
  },
  cosmetics: {
    primary: '#C4A484',
    background: '#FFFBF7',
    text: '#2A2118',
    accent: '#8B7355',
    secondary: '#F3EDE4',
    headingFont: 'Fraunces',
    bodyFont: 'Manrope',
    radius: 'rounded-xl',
    buttonStyle: 'pill',
    shadow: 'soft',
    navbarStyle: 'transparent',
    heroLayout: 'split',
    productCardStyle: 'minimal',
  },
  jewelry: {
    primary: '#1C1917',
    background: '#FAF7F2',
    text: '#1C1917',
    accent: '#78716C',
    secondary: '#E7E5E4',
    headingFont: 'Playfair Display',
    bodyFont: 'Inter',
    radius: 'rounded-lg',
    buttonStyle: 'outline',
    shadow: 'soft',
    navbarStyle: 'glass',
    heroLayout: 'center',
    productCardStyle: 'minimal',
  },
  kids: {
    primary: '#F97316',
    background: '#FFF7ED',
    text: '#1C1917',
    accent: '#9A3412',
    secondary: '#FFEDD5',
    headingFont: 'Outfit',
    bodyFont: 'Nunito Sans',
    radius: 'rounded-xl',
    buttonStyle: 'pill',
    shadow: 'lift',
    navbarStyle: 'solid',
    heroLayout: 'center',
    productCardStyle: 'shadow',
  },
  default: {
    primary: '#1A0F2E',
    background: '#FFFFFF',
    text: '#171717',
    accent: '#525252',
    secondary: '#F5F5F5',
    headingFont: 'Fraunces',
    bodyFont: 'Inter',
    radius: 'rounded-lg',
    buttonStyle: 'solid',
    shadow: 'soft',
    navbarStyle: 'glass',
    heroLayout: 'center',
    productCardStyle: 'minimal',
  },
};

export function inferBriefFromPrompt(prompt: string, fallbackName = 'My Store'): StoreBrief {
  const language = RO_HINTS.test(prompt) || /[ăâîșț]/i.test(prompt) ? 'ro' : 'en';
  const hit = NICHE_FROM_WORDS.find((n) => n.test.test(prompt));
  const niche = hit?.niche || 'boutique';
  const mood =
    /\b(dark|negru|luxury|lux|premium)\b/i.test(prompt)
      ? 'dark luxury'
      : /\b(playful|vesel|colorat)\b/i.test(prompt)
        ? 'playful'
        : hit?.mood || 'modern clean';

  const hex = prompt.match(/#([0-9a-fA-F]{6})/);
  const blush = /\b(pink|roz|blush)\b/i.test(prompt);
  const layoutId = inferLayoutId(niche, mood, prompt);

  return {
    layoutId,
    niche,
    mood,
    language,
    storeName: fallbackName,
    colors: hex
      ? { primary: `#${hex[1].toUpperCase()}` }
      : blush
        ? { primary: '#C97B84', background: '#FBF8F5' }
        : undefined,
    friendReply:
      language === 'ro'
        ? `Am înțeles — ${niche}, ${mood}. Construiesc magazinul.`
        : `Got it — ${niche}, ${mood}. Building your store.`,
  };
}

export function buildSpecFromBrief(brief: StoreBrief): StorefrontSpec {
  const nicheKey = brief.niche.toLowerCase();
  const paletteName = Object.keys(PALETTES).find((k) => nicheKey.includes(k)) || 'default';
  const layoutId = brief.layoutId || inferLayoutId(brief.niche, brief.mood);
  const tokens = applyLayoutChrome({ ...PALETTES[paletteName] }, layoutId);
  if (brief.colors?.primary) tokens.primary = brief.colors.primary;
  if (brief.colors?.background) tokens.background = brief.colors.background;
  if (brief.colors?.text) tokens.text = brief.colors.text;
  if (brief.mood.toLowerCase().includes('dark') || layoutId === 'luxeDark') {
    tokens.background = '#0F0F12';
    tokens.text = '#F5F5F5';
    tokens.secondary = '#1C1C22';
    tokens.accent = '#C9A227';
    tokens.primary = brief.colors?.primary || '#C9A227';
  }

  const ro = brief.language === 'ro';
  const name = brief.storeName || (ro ? 'Magazinul meu' : 'My Store');

  const copy = ro
    ? {
        storeName: name,
        heroTitle: `Bun venit la ${name}`,
        heroSubtitle: 'Produse alese cu grijă, livrate cu atenție.',
        heroButtonText: 'Cumpără acum',
        heroImageUrl: heroImageFor(brief.niche),
        logoUrl: null,
        footer: `© ${name}. Toate drepturile rezervate.`,
        about: `${name} este un magazin ${brief.niche} cu un aer ${brief.mood}.`,
        announcement: 'Livrare în toată România · Retur 14 zile',
        faq: [
          { q: 'Cât durează livrarea?', a: 'Comenzile pleacă în 24–48h. Livrare acasă sau locker.' },
          { q: 'Pot plăti ramburs?', a: 'Da, card online sau ramburs la livrare.' },
        ],
      }
    : {
        storeName: name,
        heroTitle: `Welcome to ${name}`,
        heroSubtitle: 'Thoughtful pieces, carefully packed, delivered across Romania.',
        heroButtonText: 'Shop now',
        heroImageUrl: heroImageFor(brief.niche),
        logoUrl: null,
        footer: `© ${name}. All rights reserved.`,
        about: `${name} is a ${brief.mood} ${brief.niche} shop built for everyday discovery.`,
        announcement: 'Nationwide delivery · 14-day returns',
        faq: [
          { q: 'How fast is shipping?', a: 'Orders leave within 24–48h. Home delivery or locker pickup.' },
          { q: 'Do you accept cash on delivery?', a: 'Yes — card online or cash on delivery.' },
        ],
      };

  const sections = withLayout(
    {
      version: STOREFRONT_SPEC_VERSION,
      layoutId,
      density: 'airy',
      nav: { style: 'glass', layout: 'logoCenter', showCollections: true, sticky: true },
      productCard: { style: 'minimal', imageRatio: '4/5', showQuickAdd: true, showRating: true },
      hero: { layout: 'split', overlay: 'soft', ctaStyle: 'solid' },
      niche: brief.niche,
      mood: brief.mood,
      language: brief.language,
      tokens,
      copy,
      pages: {
        home: { sections: [] },
        catalog: { layout: 'grid', filters: true, cardStyle: tokens.productCardStyle },
        product: { gallery: 'stack', tabs: true, related: true },
      },
      customCss: '',
    } as StorefrontSpec,
    layoutId,
    brief.sectionOrder
  );

  return {
    ...sections,
    density: brief.density || sections.density,
    nav: { ...sections.nav, ...(brief.nav || {}) },
    productCard: { ...sections.productCard, ...(brief.productCard || {}) },
    hero: { ...sections.hero, ...(brief.hero || {}) },
    tokens,
    copy,
  };
}
