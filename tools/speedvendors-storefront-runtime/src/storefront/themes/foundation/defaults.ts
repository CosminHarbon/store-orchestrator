/**
 * Foundation merchant-facing marketing defaults (category-neutral).
 */
import type { FoundationContentSlots } from '../../contentSlots';

export const foundationContentDefaults: FoundationContentSlots = {
  logo: null,
  announcement: 'Secure checkout · Delivery to your door or locker',
  hero: {
    mediaMode: 'template-art',
    image: null,
    featuredProductId: null,
    backgroundImage: null,
    eyebrow: 'New season',
    headline: 'Thoughtfully chosen,',
    headlineAccent: 'made to be kept.',
    supportingCopy: null,
    primaryCtaLabel: 'Shop now',
    secondaryCtaLabel: 'Why shop with us',
  },
  heroStats: [
    { title: 'Secure', subtitle: 'hosted checkout' },
    { title: 'Delivered', subtitle: 'to your door or locker' },
    { title: 'Live', subtitle: 'stock and prices' },
  ],
  merchantTaglineFallback:
    'A considered selection of everyday favourites and special finds, chosen with care.',
  marqueeItems: [
    'Carefully selected',
    'Secure checkout',
    'Delivered your way',
    'Easy to gift',
  ],
  collectionsEyebrow: 'Browse',
  collectionsTitle: 'Shop by collection',
  featuredEyebrow: 'Featured',
  featuredFallbackTitle: 'Worth a closer look',
  featuredFallbackBody:
    'A highlight from the collection — open it to see every detail and choose your option.',
  shopEyebrow: 'The shop',
  shopTitle: 'Shop everything',
  editorialEyebrow: 'Our approach',
  editorialTitle: 'Fewer, better things.',
  editorialBody:
    'We keep our range small on purpose. Every piece is chosen for how it looks, how it feels and how long it lasts — so it is easy to find something you will keep.',
  editorialCtaLabel: 'Explore the shop',
  editorialMedia: null,
  editorialMediaMode: 'template-art' as const,
  whyEyebrow: 'Why shop with us',
  whyTitle: 'The details we care about.',
  whyCards: [
    {
      icon: 'star',
      title: 'Chosen with care',
      body: 'Every item is selected and checked before it reaches the shop.',
    },
    {
      icon: 'art',
      title: 'Distinctive finds',
      body: 'A focused range with pieces you will not see everywhere else.',
    },
    {
      icon: 'secure',
      title: 'Secure checkout',
      body: 'Pay through an encrypted hosted checkout, or choose cash on delivery when available.',
    },
    {
      icon: 'ship',
      title: 'Delivered your way',
      body: 'Choose home delivery or a nearby locker — packed carefully and sent quickly.',
    },
  ],
  ctaEyebrow: 'Just arrived',
  ctaTitle: 'Something new is waiting.',
  ctaBody: 'Take a look at the latest additions to the shop.',
  ctaLabel: 'Start shopping',
  ctaBackgroundImage: null,
  relatedTitle: 'You may also like',
  navLabels: {
    shop: 'Shop',
    featured: 'Featured',
    why: 'About',
    contact: 'Contact',
  },
  footerTagline: 'Considered products, chosen with care and delivered with attention.',
  footerExploreTitle: 'Explore',
  footerPaymentsTitle: 'Payments & delivery',
  footerPaymentsCopy:
    'Card and cash-on-delivery options are confirmed on the secure SpeedVendors checkout.',
  socialLinks: null,
  sections: {
    order: ['marquee', 'collections', 'featured', 'editorial', 'why', 'ctaBand'],
    hidden: [],
  },
};

export const foundationThemeOptions = {
  showCategoryFilters: true,
  featuredProductIds: [] as string[],
  maxFeatured: 3,
  maxCollections: 8,
  productImageFit: 'contain' as 'contain' | 'cover',
};
