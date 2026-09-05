import type { IntelligenceInput, NaiveAssignment } from './types';

/**
 * Current 5B.2 renderer behaviour: monument Form/Make/Use uses
 * products[1], products[2], products[3] regardless of ownership.
 */
export function naiveAssignment(input: IntelligenceInput): NaiveAssignment {
  const products = [...input.products].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const primary = products[0] || null;
  const formP = products[1] || null;
  const makeP = products[2] || null;
  const useP = products[3] || null;
  const assetFor = (productId: string | null) =>
    input.assets.find((a) => a.productId === productId && (a.galleryIndex ?? 0) === 0)?.id
    || input.assets.find((a) => a.productId === productId)?.id
    || null;

  const notes: string[] = [];
  if (formP && primary && formP.id !== primary.id) {
    notes.push(`Naive Form uses ${formP.title} imagery for ${primary.title}.`);
  }
  if (makeP && primary && makeP.id !== primary.id) {
    notes.push(`Naive Make uses ${makeP.title} imagery for ${primary.title}.`);
  }
  if (useP && primary && useP.id !== primary.id) {
    notes.push(`Naive Use uses ${useP.title} imagery for ${primary.title}.`);
  }

  return {
    primaryProductId: primary?.id || null,
    formAssetProductId: formP?.id || null,
    makeAssetProductId: makeP?.id || null,
    useAssetProductId: useP?.id || null,
    formAssetId: assetFor(formP?.id || null),
    makeAssetId: assetFor(makeP?.id || null),
    useAssetId: assetFor(useP?.id || null),
    notes,
  };
}
