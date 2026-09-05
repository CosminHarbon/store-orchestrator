import type { IntelligenceAssetInput, IntelligenceInput, IntelligenceProductInput } from './types';

const u = (id: string, w = 1400) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

function product(p: IntelligenceProductInput): IntelligenceProductInput {
  return { active: true, variantCount: 0, ...p };
}

function asset(a: IntelligenceAssetInput): IntelligenceAssetInput {
  return a;
}

function filenameFrom(url: string, hint: string): string {
  return hint;
}

export const INTELLIGENCE_FIXTURE_IDS = [
  'luxury_handbags',
  'streetwear',
  'headphones_technology',
  'skincare_beauty',
  'artisan_food',
  'kids_playful',
  'sparse_single_product',
  'broad_mixed_catalog',
  'packshots_only',
  'insufficient_metadata',
] as const;
export type IntelligenceFixtureId = (typeof INTELLIGENCE_FIXTURE_IDS)[number];

export const INTELLIGENCE_FIXTURES: Record<IntelligenceFixtureId, IntelligenceInput> = {
  luxury_handbags: {
    id: 'luxury_handbags',
    merchant: {
      storeName: 'Atelier No. 8',
      tagline: 'Italian leather handbags.',
      description: 'A quiet leather house in Florence. Editorial collections, not seasonal logo drops.',
      featuredProductId: 'bag-milano',
    },
    collections: [
      { id: 'col-day', name: 'Day bags', description: 'Structured everyday leather', imageUrl: u('photo-1746880223690-359948154c53', 800) },
      { id: 'col-evening', name: 'Evening', description: 'Compact silhouettes' },
    ],
    products: [
      product({
        id: 'bag-milano',
        title: 'Milano Day Bag',
        description: 'Structured tote in full-grain calf with a single interior compartment.',
        price: 890,
        category: 'Day bags',
        collectionIds: ['col-day'],
        tags: ['leather', 'editorial', 'tote'],
        stock: 12,
        featured: true,
        position: 0,
        imageUrl: u('photo-1624687943971-e86af76d57de'),
      }),
      product({
        id: 'bag-verona',
        title: 'Verona Mini',
        description: 'Compact top-handle bag with a detachable strap.',
        price: 620,
        category: 'Evening',
        collectionIds: ['col-evening'],
        stock: 8,
        position: 1,
        imageUrl: u('photo-1594223274512-ad4803739b7c'),
      }),
      product({
        id: 'bag-florence',
        title: 'Florence Tote',
        description: 'Woven panels with a slim chain handle.',
        price: 740,
        category: 'Travel',
        collectionIds: ['col-day'],
        stock: 10,
        position: 2,
        imageUrl: u('photo-1598532163257-ae3c6b2524b6'),
      }),
    ],
    reviews: [{ id: 'r1', rating: 5, comment: 'The leather softens beautifully.', productId: 'bag-milano' }],
    assets: [
      asset({
        id: 'milano-hero',
        url: u('photo-1624687943971-e86af76d57de', 1800),
        productId: 'bag-milano',
        source: 'product_gallery',
        galleryIndex: 0,
        filename: filenameFrom('', 'milano-packshot-studio.jpg'),
        alt: 'Milano Day Bag packshot',
        width: 1800,
        height: 2250,
        merchantTags: ['packshot'],
      }),
      asset({
        id: 'milano-lifestyle',
        url: u('photo-1746880223690-359948154c53', 1920),
        productId: 'bag-milano',
        source: 'product_gallery',
        galleryIndex: 1,
        filename: 'milano-editorial-lifestyle-campaign.jpg',
        alt: 'Milano bag in an editorial lifestyle setting',
        width: 1920,
        height: 1080,
        merchantTags: ['lifestyle', 'editorial'],
      }),
      asset({
        id: 'milano-detail',
        url: u('photo-1702326626601-74d2e86922b4', 1400),
        productId: 'bag-milano',
        source: 'product_gallery',
        galleryIndex: 2,
        filename: 'milano-hardware-closeup-detail.jpg',
        alt: 'Close-up of Milano hardware and stitch',
        width: 1400,
        height: 1400,
      }),
      asset({
        id: 'verona-pack',
        url: u('photo-1594223274512-ad4803739b7c', 1400),
        productId: 'bag-verona',
        source: 'product_gallery',
        galleryIndex: 0,
        filename: 'verona-packshot.jpg',
        width: 1400,
        height: 1750,
      }),
      asset({
        id: 'florence-pack',
        url: u('photo-1598532163257-ae3c6b2524b6', 1400),
        productId: 'bag-florence',
        source: 'product_gallery',
        galleryIndex: 0,
        filename: 'florence-packshot.jpg',
        width: 1400,
        height: 1600,
      }),
    ],
  },

  streetwear: {
    id: 'streetwear',
    merchant: {
      storeName: 'Northline',
      tagline: 'Contemporary urban essentials.',
      description: 'City layers. Oversized cuts. Campaign drops, not quiet luxury.',
    },
    collections: [{ id: 'col-tops', name: 'Tops', description: 'Oversized cuts' }],
    products: [
      product({ id: 'nl-tee', title: 'Box Tee', description: 'Heavyweight cotton, dropped shoulder.', price: 68, category: 'Tops', collectionIds: ['col-tops'], tags: ['streetwear', 'tee'], stock: 40, position: 0, imageUrl: u('photo-1521572163474-6864f9cf17ab') }),
      product({ id: 'nl-cargo', title: 'Cargo Pant', description: 'Relaxed cargo with matte hardware.', price: 128, category: 'Bottoms', collectionIds: ['col-tops'], tags: ['streetwear'], stock: 24, position: 1, imageUrl: u('photo-1542272604-787c3835535d') }),
      product({ id: 'nl-jkt', title: 'Night Shell', description: 'Water-resistant shell for city rain.', price: 198, category: 'Outerwear', collectionIds: ['col-tops'], tags: ['streetwear', 'campaign'], stock: 16, position: 2, imageUrl: u('photo-1551028719-00167b16eac5') }),
      product({ id: 'nl-cap', title: 'Utility Cap', description: 'Structured cotton cap.', price: 42, category: 'Accessories', collectionIds: ['col-tops'], stock: 50, position: 3, imageUrl: u('photo-1529374255404-311a2a4f1fd9') }),
    ],
    assets: [
      asset({ id: 'tee-pack', url: u('photo-1521572163474-6864f9cf17ab', 1600), productId: 'nl-tee', source: 'product_gallery', galleryIndex: 0, filename: 'box-tee-packshot.jpg', width: 1600, height: 2000 }),
      asset({ id: 'tee-street', url: u('photo-1552374196-1ab2a1c593e8', 1920), productId: 'nl-tee', source: 'product_gallery', galleryIndex: 1, filename: 'box-tee-street-lifestyle-campaign.jpg', alt: 'Tee worn on the street', width: 1920, height: 2400, merchantTags: ['lifestyle', 'campaign'] }),
      asset({ id: 'cargo-pack', url: u('photo-1542272604-787c3835535d', 1400), productId: 'nl-cargo', source: 'product_gallery', galleryIndex: 0, filename: 'cargo-packshot.jpg', width: 1400, height: 1800 }),
      asset({ id: 'jkt-pack', url: u('photo-1551028719-00167b16eac5', 1600), productId: 'nl-jkt', source: 'product_gallery', galleryIndex: 0, filename: 'night-shell-packshot.jpg', width: 1600, height: 2000 }),
      asset({ id: 'cap-pack', url: u('photo-1529374255404-311a2a4f1fd9', 1200), productId: 'nl-cap', source: 'product_gallery', galleryIndex: 0, filename: 'cap-packshot.jpg', width: 1200, height: 1200 }),
    ],
  },

  headphones_technology: {
    id: 'headphones_technology',
    merchant: {
      storeName: 'Forma Audio',
      tagline: 'High-end wireless headphones.',
      description: 'Precision wireless audio. Adaptive ANC. Engineered, not handmade.',
      featuredProductId: 'fa-one',
    },
    collections: [
      { id: 'col-headphones', name: 'Headphones', description: 'Over-ear flagships' },
      { id: 'col-earbuds', name: 'Earbuds', description: 'Daily drivers' },
      { id: 'col-eyewear', name: 'Eyewear', description: 'Unrelated optical line' },
    ],
    products: [
      product({
        id: 'fa-one',
        title: 'Forma One Wireless',
        description: 'Adaptive ANC with 36-hour battery and spatial audio.',
        price: 349,
        category: 'Headphones',
        collectionIds: ['col-headphones'],
        tags: ['headphones', 'wireless', 'anc'],
        stock: 25,
        featured: true,
        position: 0,
        imageUrl: u('photo-1505740420928-5e560c06d30e'),
      }),
      product({
        id: 'fa-buds',
        title: 'Forma Buds Pro',
        description: 'Spatial audio earbuds with dual drivers.',
        price: 229,
        category: 'Earbuds',
        collectionIds: ['col-earbuds'],
        tags: ['earbuds'],
        stock: 40,
        position: 1,
        imageUrl: u('photo-1590658268037-6bf12165a8df'),
      }),
      product({
        id: 'fa-lite',
        title: 'Forma Lite',
        description: 'Lightweight open-back wireless headphones.',
        price: 199,
        category: 'Headphones',
        collectionIds: ['col-headphones'],
        tags: ['headphones'],
        stock: 18,
        position: 2,
        imageUrl: u('photo-1487215078519-e21cc028cb29'),
      }),
      product({
        id: 'fa-sun',
        title: 'Daylight Sunglasses',
        description: 'Acetate sunglasses. Not audio hardware.',
        price: 160,
        category: 'Eyewear',
        collectionIds: ['col-eyewear'],
        tags: ['sunglasses'],
        stock: 20,
        position: 3,
        imageUrl: u('photo-1572635196237-14b3f281503f'),
      }),
    ],
    reviews: [{ id: 'er1', rating: 5, comment: 'ANC is surgical on flights.', productId: 'fa-one' }],
    assets: [
      asset({
        id: 'one-pack',
        url: u('photo-1505740420928-5e560c06d30e', 1600),
        productId: 'fa-one',
        source: 'product_gallery',
        galleryIndex: 0,
        filename: 'forma-one-packshot-studio.jpg',
        alt: 'Forma One Wireless headphones packshot',
        width: 1600,
        height: 1600,
        merchantTags: ['packshot'],
      }),
      asset({
        id: 'one-pack-2',
        url: u('photo-1484704849700-f032a568e944', 1400),
        productId: 'fa-one',
        source: 'product_gallery',
        galleryIndex: 1,
        filename: 'forma-one-angle-packshot.jpg',
        alt: 'Forma One second packshot',
        width: 1400,
        height: 1400,
        merchantTags: ['packshot'],
      }),
      asset({
        id: 'buds-pack',
        url: u('photo-1590658268037-6bf12165a8df', 1400),
        productId: 'fa-buds',
        source: 'product_gallery',
        galleryIndex: 0,
        filename: 'forma-buds-packshot.jpg',
        alt: 'Forma Buds Pro',
        width: 1400,
        height: 1400,
      }),
      asset({
        id: 'lite-pack',
        url: u('photo-1487215078519-e21cc028cb29', 1400),
        productId: 'fa-lite',
        source: 'product_gallery',
        galleryIndex: 0,
        filename: 'forma-lite-packshot.jpg',
        width: 1400,
        height: 1400,
      }),
      asset({
        id: 'sun-pack',
        url: u('photo-1572635196237-14b3f281503f', 1400),
        productId: 'fa-sun',
        source: 'product_gallery',
        galleryIndex: 0,
        filename: 'daylight-sunglasses-packshot.jpg',
        alt: 'Daylight Sunglasses',
        width: 1400,
        height: 1400,
      }),
    ],
  },

  skincare_beauty: {
    id: 'skincare_beauty',
    merchant: {
      storeName: 'Aurelia',
      tagline: 'Modern botanical skincare.',
      description: 'A morning ritual of gel cleanser, serum, and barrier cream. Fragrance-free.',
    },
    collections: [{ id: 'col-treat', name: 'Treat', description: 'Serums & concentrates' }],
    products: [
      product({ id: 's1', title: 'Clarity Serum 15%', description: 'Niacinamide concentrate for refined texture.', price: 68, category: 'Treat', collectionIds: ['col-treat'], tags: ['serum', 'skincare'], stock: 40, position: 0, imageUrl: u('photo-1512496015851-a90fb38ba796') }),
      product({ id: 's2', title: 'Botanical Gel Cleanser', description: 'Fragrance-free gel for morning reset.', price: 34, category: 'Cleanse', collectionIds: ['col-treat'], tags: ['cleanser'], stock: 55, position: 1, imageUrl: u('photo-1556228720-195a672e8a03') }),
      product({ id: 's3', title: 'Barrier Cream', description: 'Ceramide-rich recovery moisturizer.', price: 52, category: 'Barrier', collectionIds: ['col-treat'], tags: ['moisturizer'], stock: 32, position: 2, imageUrl: u('photo-1611930022073-b7a4ba5fcccd') }),
    ],
    assets: [
      asset({ id: 's1-pack', url: u('photo-1512496015851-a90fb38ba796', 1400), productId: 's1', source: 'product_gallery', galleryIndex: 0, filename: 'clarity-serum-packshot.jpg', width: 1400, height: 1750 }),
      asset({ id: 's1-ritual', url: u('photo-1570172619644-dfd03ed5d881', 1920), productId: 's1', source: 'product_gallery', galleryIndex: 1, filename: 'serum-ritual-lifestyle-campaign.jpg', alt: 'Serum in a morning ritual lifestyle', width: 1920, height: 1080, merchantTags: ['lifestyle'] }),
      asset({ id: 's1-atmosphere', url: u('photo-1556228578-0d85b1a4d571', 1920), productId: 's1', source: 'product_gallery', galleryIndex: 2, filename: 'serum-atmosphere-lifestyle-editorial.jpg', alt: 'Atmosphere lifestyle still of the serum', width: 1920, height: 1280, merchantTags: ['lifestyle', 'campaign'] }),
      asset({ id: 's2-pack', url: u('photo-1556228720-195a672e8a03', 1200), productId: 's2', source: 'product_gallery', galleryIndex: 0, filename: 'cleanser-packshot.jpg', width: 1200, height: 1500 }),
      asset({ id: 's3-pack', url: u('photo-1611930022073-b7a4ba5fcccd', 1200), productId: 's3', source: 'product_gallery', galleryIndex: 0, filename: 'barrier-packshot.jpg', width: 1200, height: 1500 }),
    ],
  },

  artisan_food: {
    id: 'artisan_food',
    merchant: {
      storeName: 'Maison Alba',
      tagline: 'Small-batch Mediterranean pantry.',
      description: 'Early harvest from the Alba estate. Artisan, small-batch jars from named groves.',
      policies: { origin: 'Made in the Alba estate, early harvest.' },
      explicitClaims: ['small-batch', 'from the Alba estate'],
    },
    collections: [{ id: 'col-oils', name: 'Oils', description: 'Named groves' }],
    products: [
      product({ id: 'f1', title: 'Grove No. 3 Olive Oil', description: 'Early harvest olive oil from the Alba estate.', price: 42, category: 'Oils', collectionIds: ['col-oils'], tags: ['olive', 'artisan', 'harvest'], stock: 40, position: 0, imageUrl: u('photo-1474979266404-7eaacbcd87c5') }),
      product({ id: 'f2', title: 'Wildflower Honey', description: 'Single-season jar from coastal hives.', price: 24, category: 'Pantry', collectionIds: ['col-oils'], tags: ['honey', 'artisan'], stock: 30, position: 1, imageUrl: u('photo-1587049352846-4a222e784d38') }),
      product({ id: 'f3', title: 'Citrus Preserve', description: 'Bitter orange marmalade, small batch.', price: 19, category: 'Pantry', collectionIds: ['col-oils'], tags: ['preserve'], stock: 35, position: 2, imageUrl: u('photo-1481391319762-47dff72954d9') }),
    ],
    assets: [
      asset({ id: 'oil-pack', url: u('photo-1474979266404-7eaacbcd87c5', 1400), productId: 'f1', source: 'product_gallery', galleryIndex: 0, filename: 'grove-oil-packshot.jpg', width: 1400, height: 1750 }),
      asset({ id: 'oil-process', url: u('photo-1505576391880-b3f9d713dc4f', 1600), productId: 'f1', source: 'product_gallery', galleryIndex: 1, filename: 'grove-harvest-process-workshop.jpg', alt: 'Harvest process at the estate', width: 1600, height: 1066, merchantTags: ['process', 'harvest'] }),
      asset({ id: 'honey-pack', url: u('photo-1587049352846-4a222e784d38', 1200), productId: 'f2', source: 'product_gallery', galleryIndex: 0, filename: 'honey-packshot.jpg', width: 1200, height: 1500 }),
      asset({ id: 'cit-pack', url: u('photo-1481391319762-47dff72954d9', 1200), productId: 'f3', source: 'product_gallery', galleryIndex: 0, filename: 'citrus-packshot.jpg', width: 1200, height: 1500 }),
    ],
  },

  kids_playful: {
    id: 'kids_playful',
    merchant: {
      storeName: 'Little North',
      tagline: 'Wooden toys for slow play.',
      description: 'Playful wooden toys for toddlers. Soft colors, no screens.',
    },
    collections: [{ id: 'col-play', name: 'Play', description: 'Toys' }],
    products: [
      product({ id: 'k1', title: 'Birch Stacker', description: 'Wooden stacking toy for toddlers.', price: 36, category: 'Toys', collectionIds: ['col-play'], tags: ['kids', 'toy', 'wooden toy', 'playful'], stock: 40, position: 0, imageUrl: u('photo-1515488042361-ee00e0ddd4e4') }),
      product({ id: 'k2', title: 'Cloud Plush', description: 'Soft plush for nap time.', price: 28, category: 'Toys', collectionIds: ['col-play'], tags: ['kids', 'plush'], stock: 50, position: 1, imageUrl: u('photo-1566576912321-d58ddd7a6088') }),
      product({ id: 'k3', title: 'Rainbow Pull Toy', description: 'A playful pull-along for indoor play.', price: 32, category: 'Toys', collectionIds: ['col-play'], tags: ['kids', 'play'], stock: 22, position: 2, imageUrl: u('photo-1516627145497-ae6968895b74') }),
    ],
    assets: [
      asset({ id: 'k1-pack', url: u('photo-1515488042361-ee00e0ddd4e4', 1200), productId: 'k1', source: 'product_gallery', galleryIndex: 0, filename: 'stacker-packshot.jpg', width: 1200, height: 1500 }),
      asset({ id: 'k2-pack', url: u('photo-1566576912321-d58ddd7a6088', 1200), productId: 'k2', source: 'product_gallery', galleryIndex: 0, filename: 'plush-packshot.jpg', width: 1200, height: 1500 }),
      asset({ id: 'k3-pack', url: u('photo-1516627145497-ae6968895b74', 1200), productId: 'k3', source: 'product_gallery', galleryIndex: 0, filename: 'pull-toy-packshot.jpg', width: 1200, height: 1500 }),
    ],
  },

  sparse_single_product: {
    id: 'sparse_single_product',
    merchant: {
      storeName: 'One Object',
      tagline: 'A single lamp.',
      description: 'One ceramic lamp. Nothing else.',
      featuredProductId: 'lamp-1',
    },
    collections: [],
    products: [
      product({
        id: 'lamp-1',
        title: 'Arc Lamp',
        description: 'A ceramic table lamp with a linen shade for the home interior.',
        price: 220,
        category: 'Lighting',
        collectionIds: [],
        tags: ['lamp', 'ceramic', 'home', 'interior'],
        stock: 6,
        featured: true,
        position: 0,
        imageUrl: u('photo-1507473883500-ef29c0c3f1c2'),
      }),
    ],
    assets: [
      asset({
        id: 'lamp-pack',
        url: u('photo-1507473883500-ef29c0c3f1c2', 1600),
        productId: 'lamp-1',
        source: 'product_gallery',
        galleryIndex: 0,
        filename: 'arc-lamp-packshot-studio.jpg',
        width: 1600,
        height: 2000,
        merchantTags: ['packshot'],
      }),
    ],
  },

  broad_mixed_catalog: {
    id: 'broad_mixed_catalog',
    merchant: { storeName: 'Market Hall', tagline: 'A bit of everything.', description: 'Bags, cables, honey, tees, and toys.' },
    collections: [
      { id: 'c1', name: 'Fashion' },
      { id: 'c2', name: 'Tech' },
      { id: 'c3', name: 'Food' },
      { id: 'c4', name: 'Kids' },
      { id: 'c5', name: 'Home' },
    ],
    products: [
      product({ id: 'm1', title: 'Tote', description: 'A tote bag.', price: 40, category: 'Bags', collectionIds: ['c1'], stock: 10, position: 0, imageUrl: u('photo-1598532163257-ae3c6b2524b6') }),
      product({ id: 'm2', title: 'Cable', description: 'USB-C cable.', price: 12, category: 'Electronics', collectionIds: ['c2'], tags: ['usb-c'], stock: 40, position: 1, imageUrl: u('photo-1625948515291-69613efd103f') }),
      product({ id: 'm3', title: 'Honey', description: 'A jar of honey.', price: 9, category: 'Pantry', collectionIds: ['c3'], tags: ['honey'], stock: 20, position: 2, imageUrl: u('photo-1587049352846-4a222e784d38') }),
      product({ id: 'm4', title: 'Tee', description: 'A cotton tee.', price: 22, category: 'Apparel', collectionIds: ['c1'], stock: 15, position: 3, imageUrl: u('photo-1521572163474-6864f9cf17ab') }),
      product({ id: 'm5', title: 'Toy', description: 'A wooden toy.', price: 18, category: 'Toys', collectionIds: ['c4'], tags: ['kids', 'toy'], stock: 12, position: 4, imageUrl: u('photo-1515488042361-ee00e0ddd4e4') }),
      product({ id: 'm6', title: 'Vase', description: 'A home vase.', price: 35, category: 'Home', collectionIds: ['c5'], tags: ['vase', 'home'], stock: 8, position: 5, imageUrl: u('photo-1578500494198-2425c2c04661') }),
      product({ id: 'm7', title: 'Cap', description: 'A cap.', price: 16, category: 'Accessories', collectionIds: ['c1'], stock: 20, position: 6, imageUrl: u('photo-1529374255404-311a2a4f1fd9') }),
      product({ id: 'm8', title: 'Mug', description: 'A ceramic mug.', price: 14, category: 'Kitchen', collectionIds: ['c5'], tags: ['ceramic'], stock: 30, position: 7, imageUrl: u('photo-1514228742587-6b1558fcca3d') }),
    ],
    assets: [
      asset({ id: 'm1a', url: u('photo-1598532163257-ae3c6b2524b6', 1000), productId: 'm1', source: 'product_gallery', galleryIndex: 0, filename: 'tote.jpg', width: 1000, height: 1200 }),
      asset({ id: 'm2a', url: u('photo-1625948515291-69613efd103f', 1000), productId: 'm2', source: 'product_gallery', galleryIndex: 0, filename: 'cable.jpg', width: 1000, height: 1000 }),
      asset({ id: 'm3a', url: u('photo-1587049352846-4a222e784d38', 1000), productId: 'm3', source: 'product_gallery', galleryIndex: 0, filename: 'honey.jpg', width: 1000, height: 1200 }),
      asset({ id: 'm4a', url: u('photo-1521572163474-6864f9cf17ab', 1000), productId: 'm4', source: 'product_gallery', galleryIndex: 0, filename: 'tee.jpg', width: 1000, height: 1200 }),
      asset({ id: 'm5a', url: u('photo-1515488042361-ee00e0ddd4e4', 1000), productId: 'm5', source: 'product_gallery', galleryIndex: 0, filename: 'toy.jpg', width: 1000, height: 1200 }),
      asset({ id: 'm6a', url: u('photo-1578500494198-2425c2c04661', 1000), productId: 'm6', source: 'product_gallery', galleryIndex: 0, filename: 'vase.jpg', width: 1000, height: 1200 }),
      asset({ id: 'm7a', url: u('photo-1529374255404-311a2a4f1fd9', 1000), productId: 'm7', source: 'product_gallery', galleryIndex: 0, filename: 'cap.jpg', width: 1000, height: 1000 }),
      asset({ id: 'm8a', url: u('photo-1514228742587-6b1558fcca3d', 1000), productId: 'm8', source: 'product_gallery', galleryIndex: 0, filename: 'mug.jpg', width: 1000, height: 1200 }),
    ],
  },

  packshots_only: {
    id: 'packshots_only',
    merchant: {
      storeName: 'Studio White',
      tagline: 'Objects on paper.',
      description: 'A focused collection of ceramic vessels photographed only as packshots.',
    },
    collections: [{ id: 'col-v', name: 'Vessels' }],
    products: [
      product({ id: 'p1', title: 'Vessel A', description: 'A ceramic vessel for the home interior.', price: 80, category: 'Home', collectionIds: ['col-v'], tags: ['ceramic', 'vase', 'home'], stock: 10, position: 0, imageUrl: u('photo-1578500494198-2425c2c04661') }),
      product({ id: 'p2', title: 'Vessel B', description: 'A second ceramic vessel.', price: 90, category: 'Home', collectionIds: ['col-v'], tags: ['ceramic'], stock: 8, position: 1, imageUrl: u('photo-1610701596007-11502861dcfa') }),
      product({ id: 'p3', title: 'Vessel C', description: 'A third ceramic vessel.', price: 70, category: 'Home', collectionIds: ['col-v'], tags: ['ceramic'], stock: 9, position: 2, imageUrl: u('photo-1565193566173-7a0ee3dbe50e') }),
    ],
    assets: [
      asset({ id: 'p1a', url: u('photo-1578500494198-2425c2c04661', 1400), productId: 'p1', source: 'product_gallery', galleryIndex: 0, filename: 'vessel-a-packshot-studio-white.jpg', width: 1400, height: 1400, merchantTags: ['packshot'] }),
      asset({ id: 'p2a', url: u('photo-1610701596007-11502861dcfa', 1400), productId: 'p2', source: 'product_gallery', galleryIndex: 0, filename: 'vessel-b-packshot-studio.jpg', width: 1400, height: 1400, merchantTags: ['packshot'] }),
      asset({ id: 'p3a', url: u('photo-1565193566173-7a0ee3dbe50e', 1400), productId: 'p3', source: 'product_gallery', galleryIndex: 0, filename: 'vessel-c-packshot-studio.jpg', width: 1400, height: 1400, merchantTags: ['packshot'] }),
      asset({
        id: 'lowres-hero',
        url: u('photo-1578500494198-2425c2c04661', 400),
        productId: 'p1',
        source: 'hero',
        galleryIndex: 9,
        filename: 'tiny-thumb.jpg',
        width: 400,
        height: 300,
      }),
    ],
  },

  insufficient_metadata: {
    id: 'insufficient_metadata',
    merchant: { storeName: 'Store', tagline: '' },
    collections: [],
    products: [
      product({ id: 'i1', title: 'Item 1', description: '', price: 10, category: '', collectionIds: [], stock: 1, position: 0 }),
      product({ id: 'i2', title: 'Item 2', description: '', price: 12, category: '', collectionIds: [], stock: 1, position: 1 }),
    ],
    assets: [
      asset({ id: 'i1a', url: u('photo-1525103504173-8dc1582c7430', 800), productId: 'i1', source: 'unknown', galleryIndex: 0, filename: 'img.jpg', width: 800, height: 800 }),
    ],
  },
};

export function fixtureById(id: IntelligenceFixtureId): IntelligenceInput {
  return INTELLIGENCE_FIXTURES[id];
}
