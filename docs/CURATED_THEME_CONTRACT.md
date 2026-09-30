# Curated theme contract

SpeedVendors curated themes (starting with **Novatee**) are presentation packages that plug into the shared commerce runtime. This document is the checklist Claude / Cursor must satisfy for every future theme.

## Do not implement

- No commerce hooks, cart, checkout, payments, delivery, locker, or API clients
- No credentials, store API keys, or environment secrets
- No hard-coded products, prices, SKUs, or demo catalogs
- No arbitrary HTML / CSS-in-JS from merchants, and no executable URLs (`javascript:`, `data:`)
- No second configuration format for AI — reuse `StorefrontContentConfig`

## Required deliverables

| Artifact | Purpose |
|----------|---------|
| `manifest.ts` | Safe catalogue metadata + `availableContentSlots` + hero modes |
| `defaults.ts` | All merchant-facing marketing defaults (no copy left in JSX) |
| `editorSchema` (or equivalent) | Declarative editable fields for the generic form renderer |
| `theme.css` | Styles **scoped** under `[data-sv-theme="<id>"]` |
| Root component | e.g. `NovateeStorefront.tsx` — composes sections + protected commerce UI only |
| Sections | Hero / shop wrappers / marketing blocks |
| `systemUi.ts` | A11y & functional chrome labels (Skip link, Menu, …) — not merchant slots |
| Catalogue thumbnail | Optimized, non-sensitive preview image |
| Registration | Allowlisted entry in `themeRegistry.ts` only |

## Manifest metadata (safe)

- Stable `id` (lowercase slug)
- Display `name`
- Short description
- Category / style tags
- Preview image path
- `availableContentSlots[]`
- `supportedHeroMediaModes[]`

## Editable-field schema

Each field declares:

- `key` — path into `ContentSlots` (e.g. `hero.headline`, `whyCards`)
- `label`, `group`
- `type`: `text` | `textarea` | `image` | `choice` | `boolean` | `string-list` | `why-cards` | `hero-stats` | `social-links` | `product` | `nav-labels` | `section-controls`
- Optional: `maxLength`, `maxCount`, `options`, `helpText`, `visibleWhen`, `placeholder`

The merchant Website Builder renders **`CuratedThemeForm`** from this schema. Do **not** ship a brand-new hard-coded editor per theme unless a control is genuinely unique.

## Content classification

### Live commerce (never editable in theme)

Product titles, prices, images, variants, collections, cart lines, delivery/payment options — all from SpeedVendors commerce.

### System interface (central / theme `systemUi`)

Cart, Checkout, Add to cart, Menu, Quantity, Skip links, category “All”, etc. Do not duplicate into every theme’s marketing slots.

### Merchant marketing (content slots + defaults)

Announcement, hero copy/CTAs/media modes, marquee, section headings, Why cards, footer marketing, social links, logo/alt, optional promo media, section visibility/order for approved marketing blocks.

### Theme-owned design

Decorative SVG, layout geometry, animations, default type system, visual effects — not merchant-editable.

## Sections

Optional marketing sections may be shown/hidden and reordered via `content.sections`.

- **Novatee:** `marquee` | `featured` | `why`
- **Foundation:** `marquee` | `collections` | `featured` | `editorial` | `why` | `ctaBand`

Section IDs are theme-local. Sanitizers drop unknown ids for the active theme — do not widen a single global union every time a theme adds a block.

**Never hideable:** hero, shop/catalog, header/cart, checkout handoff, footer shell.

## Canonical configuration

```ts
{
  version: 1,
  themeId: 'novatee' | 'foundation' | /* allowlisted */,
  status: 'draft' | 'published',
  content: ThemeSpecificContent,
  updatedAt?: string
}
```

`content` is validated by a **registry-dispatched** sanitizer (`mergeThemeContent(themeId, …)`):

- Shared/common slots for fields every theme reuses
- `NovateeContentSlots` / `FoundationContentSlots` for theme-specific keys
- Theme-specific defaults, editor schema, and section allowlists
- Unknown fields removed; existing Novatee drafts remain compatible

Used by: manual editor ↔ saved draft ↔ runtime `__SV_CONTENT__` ↔ future AI designer.

- Sanitize on **save** and **runtime inject**, not on every keystroke (trimming must not eat Space while typing).
- Unknown fields rejected/removed; no HTML/JS.
## CSS & a11y

- Scope all theme rules under `[data-sv-theme="<id>"]`
- Responsive desktop + mobile
- Focus styles, skip link, meaningful alt text for merchant media
- Prefer `prefers-reduced-motion` where animations exist

## Registry

Themes resolve only through an explicit allowlist (`themeRegistry.ts`). Unknown IDs fall back to Novatee. Never load themes from arbitrary paths or URLs.

## Validation

Run `validateCuratedThemeContract({ themeId, availableContentSlots, defaults, editorSchema, supportedHeroMediaModes })` so manifest slots, defaults, and editor fields stay aligned.

## Novatee is the reference

Ship the next Claude design by copying the Novatee package shape (manifest, defaults, schema, scoped CSS, root, sections) — not by forking a one-off merchant editor.
