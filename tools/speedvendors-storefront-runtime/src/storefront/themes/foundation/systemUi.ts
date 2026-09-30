/**
 * Foundation system / accessibility chrome labels.
 * NOT merchant marketing slots: never exposed in the Website Builder form.
 * Strings rendered by protected components (Cart, Add to cart, Checkout, Your cart,
 * Subtotal, Sold out, Sale, ← Back, Loading…) are owned by SpeedVendors and are not repeated here.
 */
export const foundationSystemUi = {
  skipToShop: 'Skip to shop',
  sectionsNav: 'Sections',
  menu: 'Menu',
  closeMenu: 'Close menu',
  mobileNav: 'Mobile',
  categories: 'Categories',
  allCategories: 'All',
  storeFallback: 'Store',
  logoAlt: 'Logo',
  productCountOne: '{n} product',
  productCountOther: '{n} products',
  viewProduct: 'View product',
  featuredMedia: 'Featured product',
  emptyShopTitle: 'New products are on the way',
  emptyShopBody: 'This shop is being stocked. Please check back soon.',
  emptyCategoryTitle: 'Nothing here yet',
  emptyCategoryBody: 'There are no products in this category right now.',
  showAll: 'Show all products',
  loadingProducts: 'Loading products',
  socialNav: 'Social',
  contactPrefix: 'Contact:',
} as const;

export type FoundationSystemUi = typeof foundationSystemUi;
