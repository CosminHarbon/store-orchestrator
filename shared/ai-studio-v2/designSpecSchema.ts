import { ALLOWED_FONTS } from './fonts.ts';
import { DESIGN_SPEC_LIMITS } from './designSpecLimits.ts';
import { designSpecLimitsForPrompt } from './designSpecValidation.ts';
import { getDesignSpecProvenanceRules } from './contentProvenance.ts';
import {
  buildCreativeStrategySchema,
  creativeStrategyPromptBlock,
  ensureCreativeStrategy,
  TYPOGRAPHY_ROLES,
  type CreativeStrategy,
} from './creativeStrategy.ts';

type Zod = typeof import('zod').z;

export const DESIGN_SPEC_VERSION = 1 as const;
export const BRAND_DESIGN_SYSTEM_VERSION = 1 as const;
export const CREATIVE_MODES = ['faithful', 'balanced', 'surprise'] as const;

export function buildDesignSpecSchemas(z: Zod) {
  const hexColor = z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/)
    .transform((v) => v.toUpperCase());

  const fontSchema = z.enum(ALLOWED_FONTS);

  const designIntentSchema = z.object({
    coreConcept: z.string().min(1).max(DESIGN_SPEC_LIMITS.coreConcept),
    emotionalGoal: z.string().min(1).max(DESIGN_SPEC_LIMITS.emotionalGoal),
    visualHierarchy: z.string().min(1).max(DESIGN_SPEC_LIMITS.visualHierarchy),
    compositionPrinciples: z.array(z.string().min(1).max(160)).min(1).max(12),
    photographyDirection: z.string().min(1).max(DESIGN_SPEC_LIMITS.photographyDirection),
    typographyDirection: z.string().min(1).max(DESIGN_SPEC_LIMITS.typographyDirection),
    interactionDirection: z.string().min(1).max(DESIGN_SPEC_LIMITS.interactionDirection),
    premiumCharacteristics: z.array(z.string().min(1).max(120)).min(1).max(12),
    avoidPatterns: z.array(z.string().min(1).max(160)).min(1).max(16),
  });

  const designTokensSchema = z.object({
    primary: hexColor,
    background: hexColor,
    text: hexColor,
    accent: hexColor,
    secondary: hexColor,
    headingFont: fontSchema,
    bodyFont: fontSchema,
    radius: z.enum(['sharp', 'soft', 'rounded', 'pill']).default('soft'),
    shadow: z.enum(['none', 'soft', 'lift']).default('soft'),
    density: z.enum(['sparse', 'balanced', 'dense']).default('balanced'),
    buttonStyle: z.enum(['solid', 'outline', 'pill', 'ghost']).default('solid'),
    motion: z.enum(['none', 'subtle', 'cinematic']).default('subtle'),
    /** Phase 3 — artDirection.typography.scale, carried through so the renderer can
     *  actually express it (see v2.css --ai-v2-* type-scale vars). Defaults to
     *  'expressive' to match artDirection.typography.scale's own schema default, so
     *  every pre-Phase-3 DesignSpec renders pixel-identical to before this field existed. */
    typographyScale: z.enum(['restrained', 'expressive']).default('expressive'),
    /** Phase 3 — creativeStrategy.typographyRole, mirrored onto brand tokens so the
     *  renderer root can express it globally (kicker/label + price grammar), not just
     *  the narrow per-node hero/brandStatement emphasis strategyDefaults.ts already sets. */
    typographyRole: z.enum(TYPOGRAPHY_ROLES).default('balanced'),
  });

  const brandDesignSystemSchema = z.object({
    version: z.literal(BRAND_DESIGN_SYSTEM_VERSION),
    archetype: z.string().min(1).max(80),
    tokens: designTokensSchema,
    intentSummary: z.string().min(1).max(DESIGN_SPEC_LIMITS.coreConcept),
    navStyle: z.enum(['minimal', 'transparent', 'solid', 'editorial']).default('minimal'),
    cardStyle: z.enum(['minimal', 'bordered', 'editorial', 'overlay']).default('editorial'),
    imageTreatment: z.string().max(200).optional(),
  });

  const designSpecSchema = z.object({
    version: z.literal(DESIGN_SPEC_VERSION),
    creativeMode: z.enum(CREATIVE_MODES).default('balanced'),
    brand: z.object({
      businessType: z.string().min(1).max(80),
      audience: z.string().min(1).max(200),
      positioning: z.string().min(1).max(120),
      personality: z.array(z.string().min(1).max(40)).min(1).max(8),
      priceLevel: z.enum(['accessible', 'premium', 'luxury']).default('premium'),
      language: z.enum(['ro', 'en']).default('en'),
      storeName: z.string().min(1).max(80).optional(),
    }),
    designIntent: designIntentSchema,
    artDirection: z.object({
      archetype: z.string().min(1).max(80),
      typography: z.object({
        display: fontSchema,
        body: fontSchema,
        scale: z.enum(['restrained', 'expressive']).default('expressive'),
      }),
      colorStrategy: z.object({
        primary: hexColor,
        background: hexColor,
        text: hexColor,
        accent: hexColor,
        secondary: hexColor,
        /** Short mood phrase — not a color essay */
        mood: z.string().max(DESIGN_SPEC_LIMITS.colorMood).optional(),
      }),
      photography: z.object({
        style: z.string().min(1).max(200),
        treatment: z.string().min(1).max(200),
        avoid: z.array(z.string().max(80)).max(8).default([]),
      }),
      density: z.enum(['sparse', 'balanced', 'dense']).default('balanced'),
      radius: z.enum(['sharp', 'soft', 'mixed']).default('soft'),
      shadow: z.enum(['none', 'soft', 'lift']).default('soft'),
      motion: z.enum(['none', 'subtle', 'cinematic']).default('subtle'),
    }),
    ux: z.object({
      primaryConversion: z.string().min(1).max(DESIGN_SPEC_LIMITS.primaryConversion),
      /** Concise CTA treatment — keywords: solid|outline|pill|ghost */
      ctaStyle: z.string().min(1).max(DESIGN_SPEC_LIMITS.ctaStyle),
      /** Concise nav treatment — keywords: minimal|transparent|solid|editorial */
      navStyle: z.string().min(1).max(DESIGN_SPEC_LIMITS.navStyle),
      /** 1–2 sentence discovery strategy */
      discovery: z.string().min(1).max(DESIGN_SPEC_LIMITS.discovery),
      mobileStrategy: z.string().min(1).max(DESIGN_SPEC_LIMITS.mobileStrategy),
    }),
    pageIntent: z.object({
      homeNarrative: z.string().min(1).max(DESIGN_SPEC_LIMITS.homeNarrative),
      mustHave: z.array(z.string().min(1).max(80)).max(12).default([]),
      mustAvoid: z.array(z.string().min(1).max(120)).max(16).default([]),
    }),
    productPresentation: z.enum(['luxury', 'street', 'tech', 'editorial']).optional(),
    /** Phase 5A — page architecture intent. Optional for backward-compatible V2 drafts. */
    creativeStrategy: buildCreativeStrategySchema(z).optional(),
  });

  type DesignSpec = ReturnType<(typeof designSpecSchema)['parse']>;
  type BrandDesignSystem = ReturnType<(typeof brandDesignSystemSchema)['parse']>;

  /** Fill creativeStrategy for older drafts; clamp experimentation to creativeMode. */
  function withCreativeStrategy(spec: DesignSpec): DesignSpec & { creativeStrategy: CreativeStrategy } {
    const creativeStrategy = ensureCreativeStrategy(spec);
    return { ...spec, creativeStrategy };
  }

  function brandDesignSystemFromSpec(spec: DesignSpec): BrandDesignSystem {
    // Resolved (never-missing) creativeStrategy, purely to read typographyRole here —
    // same inference `withCreativeStrategy` already relies on for drafts predating the field.
    const creativeStrategy = ensureCreativeStrategy(spec);
    return brandDesignSystemSchema.parse({
      version: BRAND_DESIGN_SYSTEM_VERSION,
      archetype: spec.artDirection.archetype,
      tokens: {
        primary: spec.artDirection.colorStrategy.primary,
        background: spec.artDirection.colorStrategy.background,
        text: spec.artDirection.colorStrategy.text,
        accent: spec.artDirection.colorStrategy.accent,
        secondary: spec.artDirection.colorStrategy.secondary,
        headingFont: spec.artDirection.typography.display,
        bodyFont: spec.artDirection.typography.body,
        radius:
          spec.artDirection.radius === 'sharp'
            ? 'sharp'
            : spec.artDirection.radius === 'mixed'
              ? 'rounded'
              : 'soft',
        shadow: spec.artDirection.shadow,
        density: spec.artDirection.density,
        buttonStyle: /pill/i.test(spec.ux.ctaStyle)
          ? 'pill'
          : /outline/i.test(spec.ux.ctaStyle)
            ? 'outline'
            : /ghost/i.test(spec.ux.ctaStyle)
              ? 'ghost'
              : 'solid',
        motion: spec.artDirection.motion,
        typographyScale: spec.artDirection.typography.scale,
        typographyRole: creativeStrategy.typographyRole,
      },
      intentSummary: spec.designIntent.coreConcept,
      navStyle: /transparent|immersive/i.test(spec.ux.navStyle)
        ? 'transparent'
        : /editorial/i.test(spec.ux.navStyle)
          ? 'editorial'
          : /solid/i.test(spec.ux.navStyle)
            ? 'solid'
            : 'minimal',
      cardStyle: 'editorial',
      imageTreatment: spec.artDirection.photography.treatment,
    });
  }

  return {
    designSpecSchema,
    designIntentSchema,
    brandDesignSystemSchema,
    designTokensSchema,
    brandDesignSystemFromSpec,
    withCreativeStrategy,
  };
}

export function getDesignSpecSystemPrompt(): string {
  const limits = designSpecLimitsForPrompt();
  return `You are a senior brand and creative director for premium ecommerce.
You decide brand direction AND page architecture intent. Colors/fonts matter, but architecture decisions matter more for distinctiveness.

Return JSON ONLY matching this exact shape:
{
  "version": 1,
  "creativeMode": "faithful|balanced|surprise",
  "brand": {
    "businessType": "...",
    "audience": "...",
    "positioning": "...",
    "personality": ["..."],
    "priceLevel": "accessible|premium|luxury",
    "language": "ro|en",
    "storeName": "Brand name"
  },
  "designIntent": {
    "coreConcept": "2-3 sentences explaining WHY the visual system is chosen — not generic 'modern premium'",
    "emotionalGoal": "...",
    "visualHierarchy": "what dominates, what is secondary, what is quiet",
    "compositionPrinciples": ["sparse rhythm", "..."],
    "photographyDirection": "...",
    "typographyDirection": "specific direction — not 'clean fonts'",
    "interactionDirection": "...",
    "premiumCharacteristics": ["..."],
    "avoidPatterns": ["specific things to avoid for THIS brand"]
  },
  "artDirection": {
    "archetype": "snake_case_archetype",
    "typography": { "display": "Playfair Display|Cormorant Garamond|...", "body": "Inter|Manrope|...", "scale": "restrained|expressive" },
    "colorStrategy": { "primary":"#RRGGBB","background":"#RRGGBB","text":"#RRGGBB","accent":"#RRGGBB","secondary":"#RRGGBB","mood":"quiet warm stone" },
    "photography": { "style":"...", "treatment":"...", "avoid":[] },
    "density": "sparse|balanced|dense",
    "radius": "sharp|soft|mixed",
    "shadow": "none|soft|lift",
    "motion": "none|subtle|cinematic"
  },
  "ux": {
    "primaryConversion": "...",
    "ctaStyle": "outline ghost buttons, understated",
    "navStyle": "transparent immersive over hero",
    "discovery": "How shoppers encounter product for THIS brand — derive from creativeStrategy, not a default rail pattern",
    "mobileStrategy": "..."
  },
  "pageIntent": {
    "homeNarrative": "the homepage story arc in 2-4 sentences",
    "mustHave": ["specific section intents — not generic checklist"],
    "mustAvoid": ["sections or patterns to omit for this brand"]
  },
  "productPresentation": "luxury|street|tech|editorial",
  "creativeStrategy": { /* see rules below — REQUIRED */ }
}

${creativeStrategyPromptBlock()}

FIELD LENGTH RULES (structured + concise — NOT paragraphs in short fields):
${limits}

Architecture reasoning (do this while filling creativeStrategy — not after):
1. What should dominate the first viewport (atmosphere / type / product / split / offer)?
2. How quickly should commerce appear (immediate|early|mid|delayed)?
3. What pageComposition fits brandFit + intentionalDistinctiveness?
4. What rhythm and density should the scroll have?
5. Does typography or imagery carry structural weight?
6. How asymmetric should composition feel?
7. What product discovery model fits (not the same rail-by-default)?
8. What generic ecommerce spine must be avoided? Put that in distinctivenessBrief.

creativeMode behavior (REQUIRED):
- faithful: category-appropriate commercial familiarity; experimentationLevel low|medium; still reject obviously generic template thinking
- balanced: allow meaningful changes in rhythm, heroPhilosophy, commerceEntry, asymmetry; experimentationLevel medium
- surprise: favor less-common pageComposition when brand-fit allows; asymmetry may be high; typography may be dominant_structural; unusual pacing OK; experimentationLevel medium|high; ecommerce must remain usable

Semantic guidance:
- colorStrategy.mood: concise evocative phrase (5–15 words). NOT a paragraph about color theory.
- ux.ctaStyle / ux.navStyle: one short phrase each; include solid|outline|pill|ghost and minimal|transparent|solid|editorial keywords respectively.
- ux.discovery: MUST follow creativeStrategy.commerceEntry + commerceModel. Do NOT default to "spotlight then horizontal rail" unless that strategy is intentional.
- designIntent.coreConcept: richer creative reasoning (2–3 sentences).
- productPresentation: presentation mode for product chrome (luxury|street|tech|editorial) — NOT a page template selector and NOT a substitute for creativeStrategy.

Rules:
- designIntent.coreConcept must explain WHY — bad: "Modern premium design."
- Choose fonts ONLY from: ${ALLOWED_FONTS.join(', ')}
- Colors must be valid #RRGGBB with strong contrast
- Match language to the brief (Romanian brief → ro, else en)
- Do NOT invent HTML or components — creative direction + architecture intent only
- Do NOT force novelty that breaks brand fit

${getDesignSpecProvenanceRules()}`;
}

export function getDesignSpecRepairPrompt(validationErrors: string): string {
  return `Fix the DesignSpec JSON so it passes validation. Return JSON ONLY — the complete DesignSpec object (version 1).

Do NOT silently truncate mid-thought. Shorten overlong fields by rewriting them more concisely while preserving creative meaning.

Field rules:
${designSpecLimitsForPrompt()}

Validation errors to fix:
${validationErrors}

Keep colors, fonts, archetype, and designIntent meaning intact unless an error requires changing them.

Preserve the draft's creativeStrategy object verbatim (all 13 fields) unless a validation error names a creativeStrategy path. It carries the page architecture decision and must not be dropped or re-invented during repair.`;
}
