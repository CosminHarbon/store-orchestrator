import type { ShowcaseBrandId } from './showcaseData';

export type Phase3BriefId =
  | 'test1_luxury_fashion'
  | 'test2_skincare'
  | 'test3_streetwear'
  | 'test4_electronics'
  | 'test5_artisan_food';

export type Phase3Brief = {
  id: Phase3BriefId;
  label: string;
  prompt: string;
  /** Showcase catalog for dev preview immersion */
  previewCatalogId: ShowcaseBrandId;
};

export const PHASE3_BRIEFS: Phase3Brief[] = [
  {
    id: 'test1_luxury_fashion',
    label: 'TEST 1 — Luxury fashion',
    previewCatalogId: 'atelier_no8',
    prompt:
      'Atelier No. 8 is a premium Italian leather handbag brand for women who prefer understated luxury. The brand should feel sophisticated, editorial and timeless rather than flashy. Photography and craftsmanship should be central.',
  },
  {
    id: 'test2_skincare',
    label: 'TEST 2 — Skincare',
    previewCatalogId: 'aurelia',
    prompt:
      'Aurelia is a premium modern skincare brand aimed at professionals aged 25–45. The brand should feel calm, scientific, refined and contemporary. The experience should communicate trust without looking clinical.',
  },
  {
    id: 'test3_streetwear',
    label: 'TEST 3 — Streetwear',
    previewCatalogId: 'northline',
    prompt:
      'Northline is a premium contemporary streetwear brand selling oversized essentials to young urban customers. The website should feel bold, energetic, confident and editorial without becoming chaotic.',
  },
  {
    id: 'test4_electronics',
    label: 'TEST 4 — Electronics',
    previewCatalogId: 'forma_audio',
    prompt:
      'Forma Audio sells premium wireless headphones and accessories. The brand should feel technologically advanced, precise and premium. Product performance and product imagery should be central.',
  },
  {
    id: 'test5_artisan_food',
    label: 'TEST 5 — Artisan food',
    previewCatalogId: 'maison_alba',
    prompt:
      'Maison Alba is a premium artisan food brand selling carefully sourced Mediterranean pantry products. The website should feel warm, sophisticated, tactile and editorial, with strong emphasis on provenance and craftsmanship.',
  },
];

export function briefById(id: Phase3BriefId): Phase3Brief | undefined {
  return PHASE3_BRIEFS.find((b) => b.id === id);
}
