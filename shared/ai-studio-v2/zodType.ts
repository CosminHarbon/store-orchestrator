/** Minimal Zod type alias so shared modules avoid importing npm zod in Deno. */
export type Zod = typeof import('zod').z;
