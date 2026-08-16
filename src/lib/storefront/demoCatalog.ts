import type {
  StorefrontCollection,
  StorefrontCustomization,
  StorefrontFeeSettings,
  StorefrontProduct,
  StorefrontReview,
} from '@/lib/storefront/types';
import type { AppLanguage } from '@/i18n/types';

export type DemoTheme = 'floral' | 'premium' | 'elementar';

const img = {
  floral1: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=80',
  floral2: 'https://images.unsplash.com/photo-1487530811176-3780de880c2d?auto=format&fit=crop&w=1200&q=80',
  floral3: 'https://images.unsplash.com/photo-1468327768560-75b630cdd0c9?auto=format&fit=crop&w=1200&q=80',
  floral4: 'https://images.unsplash.com/photo-1455659817273-f968fd83dc78?auto=format&fit=crop&w=1200&q=80',
  floral5: 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=1200&q=80',
  floral6: 'https://images.unsplash.com/photo-1487530811176-3780de880c2d?auto=format&fit=crop&w=1200&q=80',
  floral7: 'https://images.unsplash.com/photo-1508610048659-a06b669e3321?auto=format&fit=crop&w=1200&q=80',
  floral8: 'https://images.unsplash.com/photo-1470506028280-a011fb34b6f7?auto=format&fit=crop&w=1200&q=80',
  lifestyle1: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
  lifestyle2: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80',
  lifestyle3: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80',
  lifestyle4: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=1200&q=80',
  lifestyle5: 'https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&w=1200&q=80',
  lifestyle6: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80',
  home1: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80',
  home2: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
  home3: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80',
  home4: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=1200&q=80',
};

function product(
  partial: Omit<StorefrontProduct, 'images' | 'collection_ids' | 'has_discount' | 'discount_percentage' | 'original_price'> & {
    original_price?: number;
    collection_ids?: string[];
  }
): StorefrontProduct {
  const original = partial.original_price ?? partial.price;
  const hasDiscount = original > partial.price;
  return {
    ...partial,
    original_price: original,
    has_discount: hasDiscount,
    discount_percentage: hasDiscount ? Math.round(((original - partial.price) / original) * 100) : 0,
    images: partial.image ? [{ image_url: partial.image, is_primary: true }] : [],
    collection_ids: partial.collection_ids || [],
  };
}

const copy = {
  en: {
    floral: {
      store: 'Maison Bloom',
      hero: 'Fresh blooms, thoughtfully arranged',
      sub: 'A floral atelier for everyday rituals and unforgettable occasions.',
      cta: 'Shop collection',
      footer: 'Demo boutique · All rights reserved.',
      collections: [
        { id: 'c-bouquets', name: 'Bouquets', desc: 'Hand-tied seasonal arrangements' },
        { id: 'c-seasonal', name: 'Seasonal', desc: 'What is blooming this week' },
        { id: 'c-gifts', name: 'Gifts', desc: 'Thoughtful floral presents' },
      ],
      products: [
        { title: 'Sunset Tulip Bundle', desc: 'Vibrant tulips in warm sunset tones.', price: 189, sku: 249, img: img.floral1, col: 'c-bouquets', cat: 'Bouquets' },
        { title: 'Blush Orchid Stem', desc: 'Elegant orchid for modern interiors.', price: 229, img: img.floral2, col: 'c-seasonal', cat: 'Orchids' },
        { title: 'Wild Meadow Mix', desc: 'Airy wildflowers with soft greens.', price: 159, img: img.floral3, col: 'c-bouquets', cat: 'Bouquets' },
        { title: 'Classic Rose Affair', desc: 'Timeless roses wrapped in tissue.', price: 279, orig: 320, img: img.floral4, col: 'c-gifts', cat: 'Roses' },
        { title: 'Peony Cloud', desc: 'Soft peonies for celebrations.', price: 349, img: img.floral5, col: 'c-bouquets', cat: 'Peonies' },
        { title: 'Garden Path Posy', desc: 'Compact posy for desks & tables.', price: 119, img: img.floral7, col: 'c-seasonal', cat: 'Posies' },
        { title: 'Ivory Luxe Wrap', desc: 'Neutral luxury bouquet with dried accents.', price: 259, img: img.floral8, col: 'c-gifts', cat: 'Bouquets' },
        { title: 'Coral Daydream', desc: 'Bright coral blooms for cheerful gifting.', price: 199, img: img.floral1, col: 'c-seasonal', cat: 'Bouquets' },
      ],
      reviews: [
        { name: 'Elena M.', text: 'The bouquet looked even more beautiful in person.', rating: 5 },
        { name: 'Andrei P.', text: 'Fast delivery and stunning wrapping.', rating: 5 },
        { name: 'Ioana D.', text: 'Perfect anniversary surprise.', rating: 4 },
      ],
    },
    premium: {
      store: 'Nord Atelier',
      hero: 'Designed for modern living',
      sub: 'Curated essentials with quiet luxury and everyday utility.',
      cta: 'Shop now',
      footer: 'Demo store · All rights reserved.',
      collections: [
        { id: 'c-new', name: 'New arrivals', desc: 'Just landed' },
        { id: 'c-essentials', name: 'Essentials', desc: 'Everyday favorites' },
        { id: 'c-sale', name: 'Sale', desc: 'Limited offers' },
      ],
      products: [
        { title: 'Ceramic Pour-Over Set', desc: 'Matte ceramic brewing ritual.', price: 249, img: img.lifestyle2, col: 'c-essentials', cat: 'Home' },
        { title: 'Soft Studio Lamp', desc: 'Warm ambient lighting.', price: 389, orig: 449, img: img.home1, col: 'c-new', cat: 'Lighting' },
        { title: 'Linen Throw', desc: 'Washed linen in stone beige.', price: 219, img: img.home4, col: 'c-essentials', cat: 'Textiles' },
        { title: 'Minimal Desk Tray', desc: 'Organized calm for your workspace.', price: 129, img: img.home2, col: 'c-new', cat: 'Desk' },
        { title: 'Everyday Cap', desc: 'Structured cotton cap.', price: 99, img: img.lifestyle5, col: 'c-sale', cat: 'Accessories' },
        { title: 'Trail Runner', desc: 'Lightweight everyday sneaker.', price: 459, orig: 529, img: img.lifestyle6, col: 'c-sale', cat: 'Footwear' },
        { title: 'Wireless Aura Buds', desc: 'Clear sound, soft fit.', price: 299, img: img.lifestyle3, col: 'c-new', cat: 'Tech' },
        { title: 'Shade Classic', desc: 'Timeless acetate frames.', price: 179, img: img.lifestyle4, col: 'c-essentials', cat: 'Accessories' },
      ],
      reviews: [
        { name: 'Maria S.', text: 'Beautiful packaging and fast checkout.', rating: 5 },
        { name: 'Radu V.', text: 'Exactly as shown — premium feel.', rating: 5 },
        { name: 'Carla N.', text: 'Love the product pages.', rating: 4 },
      ],
    },
    elementar: {
      store: 'Studio Market',
      hero: 'Your store, beautifully simple',
      sub: 'A clean modern storefront ready for real products and checkout.',
      cta: 'Browse products',
      footer: 'Demo template · All rights reserved.',
      collections: [
        { id: 'c-featured', name: 'Featured', desc: 'Editor picks' },
        { id: 'c-home', name: 'Home', desc: 'Living space' },
        { id: 'c-tech', name: 'Tech', desc: 'Everyday gadgets' },
      ],
      products: [
        { title: 'Modular Sofa Seat', desc: 'Comfort-first modular seating.', price: 1890, img: img.home3, col: 'c-home', cat: 'Furniture' },
        { title: 'Oak Side Table', desc: 'Solid oak with soft edges.', price: 640, img: img.home2, col: 'c-home', cat: 'Furniture' },
        { title: 'Canvas Weekender', desc: 'Travel bag with clean lines.', price: 320, img: img.lifestyle1, col: 'c-featured', cat: 'Bags' },
        { title: 'Studio Headphones', desc: 'Balanced listening for workdays.', price: 410, orig: 480, img: img.lifestyle3, col: 'c-tech', cat: 'Audio' },
        { title: 'Daily Chronograph', desc: 'Understated wristwatch.', price: 780, img: img.lifestyle2, col: 'c-featured', cat: 'Watches' },
        { title: 'Soft Area Rug', desc: 'Low-pile rug in warm neutrals.', price: 520, img: img.home4, col: 'c-home', cat: 'Textiles' },
      ],
      reviews: [
        { name: 'Alex T.', text: 'Clean template — easy to imagine my brand here.', rating: 5 },
        { name: 'Diana R.', text: 'Checkout flow feels trustworthy.', rating: 5 },
      ],
    },
  },
  ro: {
    floral: {
      store: 'Maison Bloom',
      hero: 'Flori proaspete, aranjate cu grijă',
      sub: 'Un atelier floral pentru momente de zi cu zi și ocazii de neuitat.',
      cta: 'Vezi colecția',
      footer: 'Demo boutique · Toate drepturile rezervate.',
      collections: [
        { id: 'c-bouquets', name: 'Buchete', desc: 'Aranjamente de sezon, legate manual' },
        { id: 'c-seasonal', name: 'De sezon', desc: 'Ce înflorește săptămâna aceasta' },
        { id: 'c-gifts', name: 'Cadouri', desc: 'Surprize florale atente' },
      ],
      products: [
        { title: 'Buchet Lalele Sunset', desc: 'Lalele vibrante în nuanțe calde.', price: 189, orig: 249, img: img.floral1, col: 'c-bouquets', cat: 'Buchete' },
        { title: 'Orhidee Blush', desc: 'Orhidee elegantă pentru interioare moderne.', price: 229, img: img.floral2, col: 'c-seasonal', cat: 'Orhidee' },
        { title: 'Mix Meadow Sălbatic', desc: 'Flori de câmp aerisite, cu verdeață fină.', price: 159, img: img.floral3, col: 'c-bouquets', cat: 'Buchete' },
        { title: 'Trandafiri Clasici', desc: 'Trandafiri atemporali, ambalați fin.', price: 279, orig: 320, img: img.floral4, col: 'c-gifts', cat: 'Trandafiri' },
        { title: 'Nori de Bujori', desc: 'Bujori moi pentru celebrări.', price: 349, img: img.floral5, col: 'c-bouquets', cat: 'Bujori' },
        { title: 'Posy Garden Path', desc: 'Posy compact pentru birou și masă.', price: 119, img: img.floral7, col: 'c-seasonal', cat: 'Posy' },
        { title: 'Wrap Ivory Luxe', desc: 'Buchet neutru, premium, cu accente uscate.', price: 259, img: img.floral8, col: 'c-gifts', cat: 'Buchete' },
        { title: 'Vis Coral', desc: 'Flori coral aprinse pentru cadouri vesele.', price: 199, img: img.floral1, col: 'c-seasonal', cat: 'Buchete' },
      ],
      reviews: [
        { name: 'Elena M.', text: 'Buchetul arăta și mai frumos în realitate.', rating: 5 },
        { name: 'Andrei P.', text: 'Livrare rapidă și ambalaj superb.', rating: 5 },
        { name: 'Ioana D.', text: 'Surpriza perfectă de aniversare.', rating: 4 },
      ],
    },
    premium: {
      store: 'Nord Atelier',
      hero: 'Creat pentru viața modernă',
      sub: 'Esențiale curate, cu lux discret și utilitate zilnică.',
      cta: 'Cumpără acum',
      footer: 'Magazin demo · Toate drepturile rezervate.',
      collections: [
        { id: 'c-new', name: 'Noutăți', desc: 'Abia ajunse' },
        { id: 'c-essentials', name: 'Esențiale', desc: 'Favorite de zi cu zi' },
        { id: 'c-sale', name: 'Reduceri', desc: 'Oferte limitate' },
      ],
      products: [
        { title: 'Set Ceramic Pour-Over', desc: 'Ritual de cafea din ceramică mată.', price: 249, img: img.lifestyle2, col: 'c-essentials', cat: 'Casă' },
        { title: 'Lampă Soft Studio', desc: 'Lumină ambientală caldă.', price: 389, orig: 449, img: img.home1, col: 'c-new', cat: 'Iluminat' },
        { title: 'Pled din In', desc: 'In spălat, beige piatră.', price: 219, img: img.home4, col: 'c-essentials', cat: 'Textile' },
        { title: 'Tavă Minimal Desk', desc: 'Ordine calmă pe birou.', price: 129, img: img.home2, col: 'c-new', cat: 'Birou' },
        { title: 'Șapcă Everyday', desc: 'Șapcă din bumbac structurată.', price: 99, img: img.lifestyle5, col: 'c-sale', cat: 'Accesorii' },
        { title: 'Trail Runner', desc: 'Sneaker ușor pentru fiecare zi.', price: 459, orig: 529, img: img.lifestyle6, col: 'c-sale', cat: 'Încălțăminte' },
        { title: 'Casti Wireless Aura', desc: 'Sunet clar, potrivire blândă.', price: 299, img: img.lifestyle3, col: 'c-new', cat: 'Tech' },
        { title: 'Shade Classic', desc: 'Rame din acetat atemporale.', price: 179, img: img.lifestyle4, col: 'c-essentials', cat: 'Accesorii' },
      ],
      reviews: [
        { name: 'Maria S.', text: 'Ambalaj frumos și checkout rapid.', rating: 5 },
        { name: 'Radu V.', text: 'Exact ca în poze — senzație premium.', rating: 5 },
        { name: 'Carla N.', text: 'Îmi plac paginile de produs.', rating: 4 },
      ],
    },
    elementar: {
      store: 'Studio Market',
      hero: 'Magazinul tău, frumos de simplu',
      sub: 'Un storefront modern, pregătit pentru produse reale și checkout.',
      cta: 'Vezi produsele',
      footer: 'Șablon demo · Toate drepturile rezervate.',
      collections: [
        { id: 'c-featured', name: 'Recomandate', desc: 'Selecția editorilor' },
        { id: 'c-home', name: 'Casă', desc: 'Spațiu de locuit' },
        { id: 'c-tech', name: 'Tech', desc: 'Gadgeturi de zi cu zi' },
      ],
      products: [
        { title: 'Modul Canapea', desc: 'Ședere modulară, confort întâi.', price: 1890, img: img.home3, col: 'c-home', cat: 'Mobilier' },
        { title: 'Măsuță din Stejar', desc: 'Stejar masiv, muchii moi.', price: 640, img: img.home2, col: 'c-home', cat: 'Mobilier' },
        { title: 'Geantă Canvas Weekender', desc: 'Geantă de voiaj cu linii curate.', price: 320, img: img.lifestyle1, col: 'c-featured', cat: 'Genți' },
        { title: 'Căști Studio', desc: 'Ascultare echilibrată pentru muncă.', price: 410, orig: 480, img: img.lifestyle3, col: 'c-tech', cat: 'Audio' },
        { title: 'Cronograf Daily', desc: 'Ceas discret de zi cu zi.', price: 780, img: img.lifestyle2, col: 'c-featured', cat: 'Ceasuri' },
        { title: 'Covor Soft Area', desc: 'Covor cu fir scurt, neutru cald.', price: 520, img: img.home4, col: 'c-home', cat: 'Textile' },
      ],
      reviews: [
        { name: 'Alex T.', text: 'Șablon curat — îmi imaginez ușor brandul aici.', rating: 5 },
        { name: 'Diana R.', text: 'Fluxul de checkout inspiră încredere.', rating: 5 },
      ],
    },
  },
} as const;

export type DemoCatalog = {
  products: StorefrontProduct[];
  collections: StorefrontCollection[];
  reviews: StorefrontReview[];
  customization: StorefrontCustomization;
  fees: StorefrontFeeSettings;
  mapboxToken: string;
};

export function getDemoCatalog(theme: DemoTheme, lang: AppLanguage): DemoCatalog {
  const pack = copy[lang][theme];
  const collections: StorefrontCollection[] = pack.collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.desc,
    image_url:
      theme === 'floral'
        ? c.id.includes('bouquet') || c.id.includes('buchete')
          ? img.floral1
          : c.id.includes('season') || c.id.includes('sezon')
            ? img.floral2
            : img.floral4
        : theme === 'premium'
          ? img.lifestyle1
          : img.home1,
    product_count: pack.products.filter((p) => p.col === c.id).length,
  }));

  const products = pack.products.map((p, i) =>
    product({
      id: `demo-${theme}-${i + 1}`,
      title: p.title,
      description: p.desc,
      price: p.price,
      original_price: 'orig' in p ? (p as { orig?: number }).orig : p.price,
      image: p.img,
      stock: 25,
      sku: `DEMO-${theme.toUpperCase()}-${i + 1}`,
      category: p.cat,
      collection_ids: [p.col],
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
    })
  );

  const reviews: StorefrontReview[] = pack.reviews.map((r, i) => ({
    id: `demo-review-${theme}-${i}`,
    product_id: products[i % products.length]?.id || products[0].id,
    customer_name: r.name,
    rating: r.rating,
    comment: r.text,
    created_at: new Date().toISOString(),
  }));

  return {
    products,
    collections,
    reviews,
    customization: {
      store_name: pack.store,
      logo_url: null,
      hero_image_url: theme === 'floral' ? img.floral3 : theme === 'premium' ? img.lifestyle1 : img.home1,
      hero_title: pack.hero,
      hero_subtitle: pack.sub,
      hero_button_text: pack.cta,
      show_reviews: true,
      footer_text: pack.footer,
    },
    fees: {
      cash_payment_enabled: true,
      cash_payment_fee: 0,
      home_delivery_fee: theme === 'floral' ? 19 : 15,
      locker_delivery_fee: 10,
      card_enabled: true,
    },
    mapboxToken: '',
  };
}

export function isDemoModeFromSearch(search: string | URLSearchParams): boolean {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return params.get('demo') === '1' || params.get('demo') === 'true';
}
