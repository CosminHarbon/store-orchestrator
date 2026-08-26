#!/usr/bin/env -S npx tsx
/**
 * Content provenance self-tests — no LLM required.
 * Run: npx tsx scripts/ai-studio-v2-content-provenance-tests.ts
 */
import {
  buildMerchantFacts,
  scanTextForSuspiciousClaims,
  scanSiteTreeForSuspiciousClaims,
  isClaimAuthorized,
} from '../shared/ai-studio-v2/contentProvenance.ts';

const ATELIER_BRIEF =
  'Atelier No. 8 is a premium Italian leather handbag brand for women who prefer understated luxury. The brand should feel sophisticated, editorial and timeless rather than flashy. Photography and craftsmanship should be central.';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function main() {
  const facts = buildMerchantFacts({
    prompt: ATELIER_BRIEF,
    productTitles: ['Milano Day Bag'],
    collectionNames: ['Essentials'],
    storeName: 'Atelier No. 8',
  });

  // Unsupported factual claims — should flag
  const invented = scanTextForSuspiciousClaims(
    'Our bags use vegetable-tanned Italian leather, aged for over 40 days in a Tuscan tannery using chestnut and mimosa bark. Handcrafted in Florence from the top 2% of hides.',
    facts.authorizedCorpus
  );
  assert(invented.length >= 3, `flags invented Atelier-style claims (${invented.length} hits)`);

  // Creative marketing — should NOT flag
  const creative = scanTextForSuspiciousClaims(
    'Crafted for the quietly confident. Designed with a timeless approach to form, texture and lasting presence.',
    facts.authorizedCorpus
  );
  assert(creative.length === 0, 'creative copy passes without flags');

  // Merchant-provided fact in brief — Italian leather is OK in creative reference
  assert(isClaimAuthorized('italian leather', facts.authorizedCorpus), 'Italian leather authorized from brief');

  // Merchant explicitly stated process — should NOT flag when in brief
  const explicitBrief = buildMerchantFacts({
    prompt:
      'Our leather is vegetable-tanned for 40 days in Tuscany using chestnut bark. Premium handbags since 1987.',
    storeName: 'Test',
  });
  const explicitCopy = scanTextForSuspiciousClaims(
    'Vegetable-tanned for 40 days in Tuscany with chestnut bark. Since 1987.',
    explicitBrief.authorizedCorpus
  );
  assert(explicitCopy.length === 0, 'merchant-stated facts are not flagged');

  // Product title from catalog — authorized
  assert(isClaimAuthorized('Milano Day Bag', facts.authorizedCorpus), 'catalog product name authorized');

  // SiteTree scan on mock node
  const document = {
    pages: {
      home: {
        nodes: [
          {
            id: 'story_01',
            content: {
              copyType: 'creative',
              title: 'Material',
              body: 'Each piece passes through a Tuscan tannery for 40 days of vegetable tanning.',
            },
          },
          {
            id: 'hero_01',
            content: {
              copyType: 'creative',
              title: 'Quiet luxury',
              subtitle: 'Italian leather handbags for understated confidence.',
            },
          },
        ],
      },
    },
  };
  const treeFlags = scanSiteTreeForSuspiciousClaims(document, facts);
  assert(
    treeFlags.some((f) => f.nodeId === 'story_01'),
    'SiteTree flags invented story body'
  );
  assert(
    !treeFlags.some((f) => f.nodeId === 'hero_01' && /italian leather/i.test(f.excerpt)),
    'hero subtitle referencing brief category is not flagged'
  );

  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll content provenance tests passed.');
}

main();
