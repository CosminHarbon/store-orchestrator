/**
 * Content provenance for AI Studio V2 generation.
 * Distinguishes merchant facts, AI creative copy, and design direction.
 */

export type CopyProvenance = 'merchant' | 'creative';

export type MerchantFacts = {
  /** Original merchant brief — authoritative for what they stated */
  brief: string;
  storeName?: string;
  productTitles: string[];
  collectionNames: string[];
  /** Combined lowercase text used to authorize factual claims */
  authorizedCorpus: string;
  /** Human-readable authorized facts for prompts */
  authorizedSummary: string[];
};

export type ContentProvenanceFlag = {
  nodeId: string;
  field: string;
  excerpt: string;
  reason: string;
  patternId: string;
};

/** Patterns that often indicate invented factual claims when absent from merchant input */
export const SUSPICIOUS_FACT_PATTERNS: Array<{
  id: string;
  pattern: RegExp;
  reason: string;
}> = [
  {
    id: 'duration',
    pattern: /\b\d+\s+(?:days?|hours?|weeks?|months?|years?)\b/i,
    reason: 'specific duration not provided by merchant',
  },
  {
    id: 'since_year',
    pattern: /\bsince\s+(?:18|19|20)\d{2}\b/i,
    reason: 'founding/history year not provided by merchant',
  },
  {
    id: 'percentage',
    pattern: /\btop\s+\d+\s*%|\d+\s*%\s+of\b/i,
    reason: 'statistical claim not provided by merchant',
  },
  {
    id: 'made_in_place',
    pattern: /\b(?:made|crafted|handmade|produced|finished|stitched|built)\s+(?:in|at)\s+[A-Z][a-zA-Z]+(?:,\s*[A-Z][a-zA-Z]+)?/,
    reason: 'specific production location not provided by merchant',
  },
  {
    id: 'tannery_process',
    pattern: /\b(?:tannery|vegetable[- ]tann(?:ed|ing)|mimosa bark|chestnut bark|aged for)\b/i,
    reason: 'specific material/process claim not provided by merchant',
  },
  {
    id: 'ranking_claim',
    pattern: /\btop\s+\d+\s*(?:percent|%|grade)\b|\bgrade\s+[A-Z]\b/i,
    reason: 'ranking/grade claim not provided by merchant',
  },
  {
    id: 'hand_in_city',
    pattern: /\bhand(?:crafted|made|finished|stitched)?\s+(?:in|by\s+craftsmen\s+in)\s+(?:Florence|Tuscany|Milan|Paris|Italy)\b/i,
    reason: 'specific handcraft location not provided by merchant',
  },
];

const CONTENT_STRING_KEYS = [
  'title',
  'subtitle',
  'body',
  'statement',
  'subtext',
  'text',
  'blurb',
  'cta',
  'caption',
  'kicker',
  'announcement',
] as const;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Build authorized fact corpus from merchant-provided inputs only */
export function buildMerchantFacts(opts: {
  prompt: string;
  productTitles?: string[];
  collectionNames?: string[];
  profileStoreName?: string;
  storeName?: string;
}): MerchantFacts {
  const brief = opts.prompt.trim();
  const productTitles = opts.productTitles ?? [];
  const collectionNames = opts.collectionNames ?? [];
  const storeName = opts.storeName || opts.profileStoreName;

  const corpusParts = [brief, storeName ?? '', ...productTitles, ...collectionNames].filter(Boolean);
  const authorizedCorpus = normalize(corpusParts.join(' '));

  const authorizedSummary: string[] = [];
  if (storeName) authorizedSummary.push(`Store name: ${storeName}`);
  authorizedSummary.push(`Merchant brief: ${brief}`);
  if (productTitles.length) authorizedSummary.push(`Products: ${productTitles.join(', ')}`);
  if (collectionNames.length) authorizedSummary.push(`Collections: ${collectionNames.join(', ')}`);

  return {
    brief,
    storeName,
    productTitles,
    collectionNames,
    authorizedCorpus,
    authorizedSummary,
  };
}

/** True when matched claim is substantiated by merchant-provided corpus */
export function isClaimAuthorized(match: string, authorizedCorpus: string): boolean {
  const m = normalize(match);
  if (!m) return true;
  if (authorizedCorpus.includes(m)) return true;

  // Allow if all significant tokens from the match appear in merchant corpus
  const tokens = m.split(/[^a-z0-9]+/i).filter((t) => t.length >= 4);
  if (tokens.length === 0) return true;
  const matched = tokens.filter((t) => authorizedCorpus.includes(t));
  return matched.length >= Math.ceil(tokens.length * 0.85);
}

export function scanTextForSuspiciousClaims(
  text: string,
  authorizedCorpus: string
): Array<{ patternId: string; reason: string; excerpt: string }> {
  if (!text || text.length < 8) return [];
  const flags: Array<{ patternId: string; reason: string; excerpt: string }> = [];

  for (const { id, pattern, reason } of SUSPICIOUS_FACT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const excerpt = match[0].trim();
      if (!isClaimAuthorized(excerpt, authorizedCorpus)) {
        flags.push({ patternId: id, reason, excerpt });
      }
    }
  }
  return flags;
}

/** Scan DesignSpec text fields for invented factual claims */
export function scanDesignSpecForSuspiciousClaims(
  designSpec: {
    designIntent?: {
      coreConcept?: string;
      photographyDirection?: string;
      typographyDirection?: string;
      premiumCharacteristics?: string[];
    };
    pageIntent?: { homeNarrative?: string };
  },
  facts: MerchantFacts
): ContentProvenanceFlag[] {
  const flags: ContentProvenanceFlag[] = [];
  const fields: Array<[string, string | undefined]> = [
    ['designIntent.coreConcept', designSpec.designIntent?.coreConcept],
    ['designIntent.photographyDirection', designSpec.designIntent?.photographyDirection],
    ['designIntent.typographyDirection', designSpec.designIntent?.typographyDirection],
    ['pageIntent.homeNarrative', designSpec.pageIntent?.homeNarrative],
  ];
  for (const char of designSpec.designIntent?.premiumCharacteristics ?? []) {
    fields.push(['designIntent.premiumCharacteristics', char]);
  }

  for (const [field, value] of fields) {
    if (!value) continue;
    for (const hit of scanTextForSuspiciousClaims(value, facts.authorizedCorpus)) {
      flags.push({
        nodeId: 'designSpec',
        field,
        excerpt: hit.excerpt,
        reason: hit.reason,
        patternId: hit.patternId,
      });
    }
  }
  return flags;
}

function collectContentStrings(
  content: Record<string, unknown>,
  prefix = ''
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const key of CONTENT_STRING_KEYS) {
    const v = content[key];
    if (typeof v === 'string' && v.trim()) out.push([prefix ? `${prefix}.${key}` : key, v]);
  }
  if (Array.isArray(content.items)) {
    for (const [i, item] of content.items.entries()) {
      if (item && typeof item === 'object') {
        out.push(
          ...collectContentStrings(item as Record<string, unknown>, `${prefix ? prefix + '.' : ''}items[${i}]`)
        );
      }
    }
  }
  return out;
}

/** Scan SiteTree node copy for unsupported factual claims */
export function scanSiteTreeForSuspiciousClaims(
  document: { pages: { home: { nodes: Array<{ id: string; content?: Record<string, unknown> }> } } },
  facts: MerchantFacts
): ContentProvenanceFlag[] {
  const flags: ContentProvenanceFlag[] = [];
  for (const node of document.pages.home.nodes) {
    const content = (node.content ?? {}) as Record<string, unknown>;
    if (content.copyType === 'merchant') continue;

    for (const [field, text] of collectContentStrings(content)) {
      for (const hit of scanTextForSuspiciousClaims(text, facts.authorizedCorpus)) {
        flags.push({
          nodeId: node.id,
          field,
          excerpt: hit.excerpt,
          reason: hit.reason,
          patternId: hit.patternId,
        });
      }
    }
  }
  return flags;
}

export function getDesignSpecProvenanceRules(): string {
  return `
CONTENT PROVENANCE (DesignSpec):
- DesignSpec describes positioning, audience, emotional goals, visual/typography/composition direction — NOT invented business facts.
- photographyDirection: describe style and mood ("soft material stills, negative space") — NOT specific processes ("vegetable-tanned for 40 days in Tuscany") unless the merchant brief states them.
- designIntent and pageIntent must not introduce locations, years, durations, percentages, certifications, or production methods absent from the merchant brief.
- You MAY use evocative creative language. You MUST NOT fabricate verifiable claims.`.trim();
}

export function getSiteArchitectProvenanceRules(facts: MerchantFacts): string {
  return `
CONTENT PROVENANCE (SiteTree copy):
Merchant facts are authoritative. AI creative copy must NOT introduce unsupported factual claims.

MERCHANT-PROVIDED FACTS (you may reference these):
${facts.authorizedSummary.map((l) => `- ${l}`).join('\n')}

THREE copy types:
1. merchant — exact or paraphrased facts from the brief/catalog above
2. creative — emotionally compelling marketing language WITHOUT invented facts
3. (omit copyType for product/commerce bindings — never modify product data)

Rules for content fields (title, subtitle, body, statement, blurb, text, cta):
- Prefer sophisticated CREATIVE copy when facts are insufficient:
  GOOD: "Crafted for the quietly confident." / "Designed with a timeless approach to form."
  BAD: "Vegetable-tanned Italian leather, aged for 40 days in Tuscany." (unless merchant stated this)
  BAD: "Made in Florence since 1987." / "Top 2% of hides." / "Chestnut and mimosa bark tanning"
- Do NOT invent: locations, years, durations, processes, percentages, certifications, suppliers, tanneries, ateliers, awards.
- Product titles/descriptions come from live catalog bindings — do not invent SKUs or specs.
- Optional on each node content object: "copyType": "merchant" | "creative" (default creative for generated marketing).
- editorialSplit.body and brandStatement.statement are high-risk — use creative/evocative language, not fake provenance.`.trim();
}

export function getContentProvenanceRepairPrompt(flags: ContentProvenanceFlag[]): string {
  return `Fix SiteTree copy to remove unsupported factual claims. Return JSON ONLY: { siteId, designSystemId, architectureNotes?, nodes: [...] }

Replace invented facts with sophisticated CREATIVE marketing language — do not make copy generic or lifeless.
Do NOT change section structure, type/variant, or node ids unless required.
Preserve design intent and on-brand tone.

Flagged claims to remove or rewrite:
${flags.map((f) => `- node ${f.nodeId} ${f.field}: "${f.excerpt}" (${f.reason})`).join('\n')}

Use copyType: "creative" on rewritten marketing fields.`;
}
