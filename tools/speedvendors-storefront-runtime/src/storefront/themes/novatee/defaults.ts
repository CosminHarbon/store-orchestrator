/**
 * Approved Novatee content-slot defaults — preserve appearance.
 */
import type { ContentSlots } from '../../contentSlots';

export const novateeContentDefaults: ContentSlots = {
  logo: null,
  announcement: 'Secure payments · Fast delivery',
  hero: {
    mediaMode: 'template-art',
    image: null,
    featuredProductId: null,
    backgroundImage: null,
    eyebrow: 'Live storefront',
    headline: 'Wear the',
    headlineAccent: 'future.',
    supportingCopy: null,
    primaryCtaLabel: 'Shop the collection',
    secondaryCtaLabel: 'Why us',
  },
  marqueeItems: [
    'Limited runs',
    'Heavyweight cotton',
    'Original artwork',
    'Made to last',
  ],
  shopEyebrow: 'The collection',
  shopTitle: 'Shop all',
  featuredEyebrow: 'Featured',
  featuredFallbackTitle: 'Featured pick',
  featuredFallbackBody:
    'A highlight from the live catalog — open it to choose variants and add to cart.',
  whyEyebrow: 'Why us',
  whyTitle: 'Made different. Worn different.',
  whyCards: [
    {
      icon: 'star',
      title: 'Premium fabric',
      body: 'Dense, heavyweight cotton with a structured drape that holds its shape wash after wash.',
    },
    {
      icon: 'art',
      title: 'Original artwork',
      body: 'Every graphic is drawn in-house and released in limited runs, so you won’t see it on everyone.',
    },
    {
      icon: 'secure',
      title: 'Secure checkout',
      body: 'Pay by card through an encrypted payment page, or choose cash on delivery when available.',
    },
    {
      icon: 'ship',
      title: 'Fast delivery',
      body: 'Orders are packed quickly and shipped to your door or locker, typically within a few working days.',
    },
  ],
  footerTagline: 'Graphic pieces for people who like their wardrobe loud.',
  footerPaymentsCopy:
    'Card and cash-on-delivery options are confirmed on the hosted SpeedVendors checkout.',
  navLabels: {
    shop: 'Shop',
    featured: 'Featured',
    why: 'Why us',
    contact: 'Contact',
  },
  heroStats: [
    { title: 'Live catalog', subtitle: 'real products & prices' },
    { title: 'Hosted', subtitle: 'secure checkout' },
    { title: 'Home/locker', subtitle: 'delivery options' },
  ],
  footerExploreTitle: 'Explore',
  footerPaymentsTitle: 'Payments',
  socialLinks: null,
  merchantTaglineFallback:
    'Graphic pieces designed in small batches — bold looks, a relaxed fit, and quality that lasts.',
  sections: {
    order: ['marquee', 'featured', 'why'],
    hidden: [],
  },
};

/** Theme-level presentation options (not merchant content). */
export const novateeThemeOptions = {
  showCategoryFilters: true,
  featuredProductIds: [] as string[],
};
