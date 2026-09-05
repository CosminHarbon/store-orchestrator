import type { ClaimKind, ClaimRecord, IntelligenceInput } from './types';

const PATTERNS: Array<{ kind: ClaimKind; re: RegExp }> = [
  { kind: 'handmade_artisan', re: /(?<!not\s)\b(handmade|hand-made|artisan|handcrafted|hand-crafted|made by artisans)\b/i },
  { kind: 'sustainability', re: /\b(sustainable|organic|eco-friendly|recycled|carbon[- ]neutral)\b/i },
  { kind: 'origin', re: /\b(made in|from the .+ estate|italian|french|japanese origin|single-origin)\b/i },
  { kind: 'material', re: /\b(full-grain|solid gold|sterling|cashmere|merino|ceramic|olive oil)\b/i },
  { kind: 'durability', re: /\b(lifetime|indestructible|unbreakable|built to last forever)\b/i },
  { kind: 'warranty', re: /\b(warranty|guarantee)\b/i },
  { kind: 'shipping', re: /\b(free shipping|ships in|delivered in)\b/i },
  { kind: 'returns', re: /\b(free returns|return policy|30-day returns)\b/i },
  { kind: 'scarcity', re: /\b(limited edition|only \d+ left|selling out|last chance)\b/i },
  { kind: 'medical_technical_performance', re: /\b(clinically|medical|heals|cures|anc|noise cancelling|hi-res|spatial audio)\b/i },
  { kind: 'discount', re: /\b(\d+%\s*off|sale|markdown)\b/i },
];

function scan(text: string, source: ClaimRecord['source'], productId?: string): ClaimRecord[] {
  const found: ClaimRecord[] = [];
  for (const row of PATTERNS) {
    const m = text.match(row.re);
    if (m) {
      found.push({
        kind: row.kind,
        text: m[0],
        source,
        allowed: source !== 'unsupported',
        productId,
      });
    }
  }
  return found;
}

export function collectSupportedClaims(input: IntelligenceInput): ClaimRecord[] {
  const out: ClaimRecord[] = [];
  const merchantBlob = [input.merchant.description, input.merchant.tagline, ...(input.merchant.explicitClaims || [])]
    .filter(Boolean)
    .join(' ');
  out.push(...scan(merchantBlob, 'merchant'));
  if (input.merchant.policies?.shipping) out.push(...scan(input.merchant.policies.shipping, 'policy'));
  if (input.merchant.policies?.returns) out.push(...scan(input.merchant.policies.returns, 'policy'));
  if (input.merchant.policies?.warranty) out.push(...scan(input.merchant.policies.warranty, 'policy'));
  if (input.merchant.policies?.origin) out.push(...scan(input.merchant.policies.origin, 'policy'));
  if (input.merchant.policies?.sustainability) out.push(...scan(input.merchant.policies.sustainability, 'policy'));
  for (const p of input.products) {
    out.push(...scan([p.title, p.description].join(' '), 'product', p.id));
  }
  for (const c of input.collections) {
    out.push(...scan([c.name, c.description || ''].join(' '), 'collection'));
  }
  return out;
}

export function flagUnsupportedCopy(text: string, supported: ClaimRecord[]): ClaimRecord[] {
  const hits = scan(text, 'unsupported');
  return hits.filter((hit) => {
    const ok = supported.some((s) => s.allowed && s.kind === hit.kind && s.source !== 'unsupported');
    return !ok;
  });
}
