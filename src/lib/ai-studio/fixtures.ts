import type { StorefrontSpec } from './spec';
import { buildSpecFromBrief } from './heuristic';

export const FLORIST_FIXTURE: StorefrontSpec = buildSpecFromBrief({
  layoutId: 'atelier',
  niche: 'floral',
  mood: 'airy elegant',
  language: 'ro',
  storeName: 'Atelier Floral',
  colors: { primary: '#9E4F5A', background: '#FBF8F5', text: '#1F1714' },
  friendReply: 'Atelier de flori, blush, aerisit. Construiesc magazinul.',
});
