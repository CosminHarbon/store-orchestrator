/** Canonical font allowlist — shared by client, edge, and AI prompts. */
export const ALLOWED_FONTS = [
  'Inter',
  'DM Sans',
  'Manrope',
  'Outfit',
  'Nunito Sans',
  'Space Grotesk',
  'Playfair Display',
  'Cormorant Garamond',
  'Libre Baskerville',
  'Lora',
  'Fraunces',
  'Source Serif 4',
] as const;

export type AllowedFont = (typeof ALLOWED_FONTS)[number];
