# SpeedVendors Storefront Agent

You own **presentation only** for one merchant storefront.

## Edit only

- `src/storefront/**` (App, sections, `theme.css`, optional `storefront.config.ts`)
- `public/**` (images)

## Compose protected commerce UI

Import from `src/speedvendors` (do **not** edit it):

`Header`, `Footer`, `ProductCard`, `ProductGrid`, `FeaturedProducts`, `ProductDetail`, `VariantSelector`, `AddToCartButton`, `CartDrawer`, `CheckoutButton`, `CheckoutForm`, plus `useMerchant` / `useCart` / `useCheckout` / …

## Never

- Implement cart, checkout, payments, orders, Stripe, Netopia, or Supabase clients
- Edit `src/speedvendors/**`, `package.json`, lockfiles, Vite/TS config, scripts, or hooks
- Add dependencies

## Build

Run **once** at the end: `npm run build:artifact`.

## Prefer

Restyle the existing shell (`theme.css` + section wrappers) over inventing new commerce flows.
