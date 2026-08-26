/**
 * DEV-ONLY visual fault fixtures for critic calibration.
 * Applied as a CSS class on the preview host — does NOT permanently alter compositions.
 *
 * Acceptance criteria are for the DEV harness ONLY — never sent to the critic model.
 */
export type CriticFaultId =
  | 'none'
  | 'invisible_hero_heading'
  | 'excessive_section_gap'
  | 'broken_product_crop'
  | 'oversized_mobile_type'
  | 'bad_typography_fallback';

export type CriticFaultAcceptance = {
  /** Preferred renderVerification mismatch types (any one may pass) */
  mismatchTypes: string[];
  /** Node type that should be attributed (e.g. hero, productGrid) */
  nodeTypes: string[];
  /** Optional id substring / regex hint (e.g. hero) */
  nodeIdHints: string[];
  /** Minimum severity among matching mismatches */
  minSeverity?: 'low' | 'medium' | 'high';
  /** If true, matching mismatch should prefer viewport mobile (or both) */
  preferMobileViewport?: boolean;
  /** Dimension keys that should show issues or lowered scores */
  dimensionHints: string[];
};

export type CriticFaultFixture = {
  id: CriticFaultId;
  label: string;
  expectedCriticSignals: string[];
  /** CSS class applied to `.v2gen-preview` */
  className: string;
  /** Harness-only acceptance — NOT sent to the model */
  acceptance?: CriticFaultAcceptance;
};

export const CRITIC_FAULT_FIXTURES: CriticFaultFixture[] = [
  {
    id: 'none',
    label: 'No fault (live render)',
    expectedCriticSignals: [],
    className: '',
  },
  {
    id: 'invisible_hero_heading',
    label: 'TEST A — Near-invisible hero heading',
    expectedCriticSignals: ['contrast', 'hierarchy', 'color', 'typography'],
    className: 'v2-fault-invisible-hero-heading',
    acceptance: {
      mismatchTypes: ['missing_or_unreadable_element', 'contrast_or_readability', 'other'],
      nodeTypes: ['hero'],
      nodeIdHints: ['hero'],
      minSeverity: 'medium',
      dimensionHints: ['visualHierarchy', 'typography', 'color', 'overall'],
    },
  },
  {
    id: 'excessive_section_gap',
    label: 'TEST B — Excessive vertical section gap',
    expectedCriticSignals: ['spacing', 'composition'],
    className: 'v2-fault-excessive-gap',
    acceptance: {
      mismatchTypes: ['abnormal_section_spacing', 'other'],
      nodeTypes: ['hero', 'brandStatement', 'editorialSplit', 'productSpotlight', 'productRail', 'productGrid'],
      nodeIdHints: ['hero', 'brand', 'editorial', 'product', 'section'],
      minSeverity: 'medium',
      dimensionHints: ['spacing', 'composition', 'sectionTransitions'],
    },
  },
  {
    id: 'broken_product_crop',
    label: 'TEST C — Broken product image crop',
    expectedCriticSignals: ['imagery', 'productPresentation'],
    className: 'v2-fault-broken-crop',
    acceptance: {
      mismatchTypes: ['broken_crop', 'other'],
      nodeTypes: ['productSpotlight', 'productRail', 'productGrid', 'hero', 'editorialSplit'],
      nodeIdHints: ['product', 'spotlight', 'rail', 'grid', 'hero', 'editorial'],
      minSeverity: 'medium',
      dimensionHints: ['imagery', 'productPresentation'],
    },
  },
  {
    id: 'oversized_mobile_type',
    label: 'TEST D — Oversized mobile typography',
    expectedCriticSignals: ['mobileQuality', 'typography'],
    className: 'v2-fault-oversized-mobile-type',
    acceptance: {
      mismatchTypes: ['mobile_typography', 'overflow_or_clipping', 'typography_mismatch', 'other'],
      nodeTypes: ['hero', 'brandStatement', 'nav'],
      nodeIdHints: ['hero', 'brand', 'nav'],
      minSeverity: 'medium',
      preferMobileViewport: true,
      dimensionHints: ['mobileQuality', 'typography', 'visualHierarchy'],
    },
  },
  {
    id: 'bad_typography_fallback',
    label: 'TEST E — Inappropriate system typography',
    expectedCriticSignals: ['typography', 'brandFit', 'premiumPerception'],
    className: 'v2-fault-bad-typography',
    acceptance: {
      mismatchTypes: ['typography_mismatch', 'other'],
      nodeTypes: ['hero', 'brandStatement', 'nav', 'editorialSplit'],
      nodeIdHints: ['hero', 'brand', 'nav', 'editorial'],
      minSeverity: 'medium',
      dimensionHints: ['typography', 'brandFit', 'premiumPerception'],
    },
  },
];

export function faultFixtureById(id: CriticFaultId): CriticFaultFixture {
  return CRITIC_FAULT_FIXTURES.find((f) => f.id === id) || CRITIC_FAULT_FIXTURES[0];
}
