const NICHE_IMAGES: Record<string, string[]> = {
  floral: [
    'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1487530811176-3780de880c2d?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1468327768560-75b630cdd0c9?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=1200&q=80',
  ],
  streetwear: [
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80',
  ],
  cosmetics: [
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1522335789203-aabd1fc37cd9?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=80',
  ],
  jewelry: [
    'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?auto=format&fit=crop&w=1200&q=80',
  ],
  kids: [
    'https://images.unsplash.com/photo-1515488044360-fb630819fd38?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=1200&q=80',
  ],
  home: [
    'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=1200&q=80',
  ],
  food: [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=1200&q=80',
  ],
  default: [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80',
  ],
};

const NICHE_ALIASES: Record<string, keyof typeof NICHE_IMAGES> = {
  flower: 'floral',
  flowers: 'floral',
  florist: 'floral',
  flori: 'floral',
  florarie: 'floral',
  fashion: 'streetwear',
  clothing: 'streetwear',
  haine: 'streetwear',
  beauty: 'cosmetics',
  skincare: 'cosmetics',
  cosmetice: 'cosmetics',
  bijuterii: 'jewelry',
  jewellery: 'jewelry',
  copii: 'kids',
  toys: 'kids',
  jucarii: 'kids',
  furniture: 'home',
  interior: 'home',
  casa: 'home',
  cafe: 'food',
  coffee: 'food',
  bakery: 'food',
  food: 'food',
};

export function nicheKey(niche: string): keyof typeof NICHE_IMAGES {
  const n = niche.toLowerCase().trim();
  if (n in NICHE_IMAGES) return n as keyof typeof NICHE_IMAGES;
  for (const [alias, key] of Object.entries(NICHE_ALIASES)) {
    if (n.includes(alias)) return key;
  }
  return 'default';
}

export function stockImagesFor(niche: string): string[] {
  return NICHE_IMAGES[nicheKey(niche)] || NICHE_IMAGES.default;
}

export function heroImageFor(niche: string): string {
  return stockImagesFor(niche)[0];
}

export function fillMissingImages<T extends { imageUrl?: string | null }>(
  niche: string,
  items: T[]
): T[] {
  const pool = stockImagesFor(niche);
  let i = 0;
  return items.map((item) => {
    if (item.imageUrl) return item;
    const next = { ...item, imageUrl: pool[i % pool.length] };
    i += 1;
    return next;
  });
}
