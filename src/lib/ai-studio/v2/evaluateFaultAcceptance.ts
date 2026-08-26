/**
 * DEV harness — evaluate critic scorecard against fault acceptance criteria.
 * Never sends fixture answers to the model; only judges returned critic JSON.
 */
import type { CritiqueScoreCard } from '@shared/ai-studio-v2/critiqueScoreCard.ts';
import type { CriticFaultAcceptance, CriticFaultId } from './criticFaultFixtures.ts';
import { faultFixtureById } from './criticFaultFixtures.ts';

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 } as const;

export type FaultAcceptanceResult = {
  faultId: CriticFaultId;
  passed: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
};

function textBlob(scorecard: CritiqueScoreCard): string {
  const parts: string[] = [
    scorecard.renderVerification?.summary || '',
    scorecard.decisionReason || '',
    ...(scorecard.criticalIssues || []),
    ...(scorecard.priorityFixes || []).map((f) => f.summary),
  ];
  for (const n of scorecard.renderVerification?.nodes || []) {
    parts.push(n.nodeId, n.type, ...(n.notes || []));
    for (const m of n.mismatches || []) {
      parts.push(m.type, m.evidence, m.nodeId || '', m.property || '');
    }
  }
  for (const key of [
    'overall',
    'typography',
    'spacing',
    'imagery',
    'mobileQuality',
    'brandFit',
    'premiumPerception',
    'visualHierarchy',
    'composition',
    'productPresentation',
    'sectionTransitions',
    'color',
  ] as const) {
    const dim = scorecard[key];
    parts.push(...(dim.observations || []), ...(dim.issues || []), ...(dim.evidence || []));
  }
  return parts.join(' ').toLowerCase();
}

function allMismatches(scorecard: CritiqueScoreCard) {
  return (scorecard.renderVerification?.nodes || []).flatMap((n) =>
    (n.mismatches || []).map((m) => ({
      ...m,
      nodeId: m.nodeId || n.nodeId,
      nodeType: n.type,
    }))
  );
}

function severityOk(
  severity: 'low' | 'medium' | 'high' | undefined,
  min?: 'low' | 'medium' | 'high'
): boolean {
  if (!min) return true;
  if (!severity) return false;
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[min];
}

function nodeMatches(
  nodeId: string | undefined,
  nodeType: string | undefined,
  acceptance: CriticFaultAcceptance
): boolean {
  const id = (nodeId || '').toLowerCase();
  const type = (nodeType || '').toLowerCase();
  if (acceptance.nodeTypes.some((t) => type === t.toLowerCase() || id.includes(t.toLowerCase()))) {
    return true;
  }
  return acceptance.nodeIdHints.some(
    (h) => id.includes(h.toLowerCase()) || type.includes(h.toLowerCase())
  );
}

/**
 * Semantic acceptance for A–E fault fixtures.
 * Requires: matching mismatch category (+ node) OR strong textual+dimension signal.
 */
export function evaluateFaultAcceptance(
  faultId: CriticFaultId,
  scorecard: CritiqueScoreCard
): FaultAcceptanceResult {
  const fixture = faultFixtureById(faultId);
  const acceptance = fixture.acceptance;
  const checks: FaultAcceptanceResult['checks'] = [];

  if (!acceptance) {
    return {
      faultId,
      passed: true,
      checks: [{ name: 'no_acceptance', ok: true, detail: 'No acceptance criteria (clean run)' }],
    };
  }

  const mismatches = allMismatches(scorecard);
  const blob = textBlob(scorecard);

  const typeMatch = mismatches.filter((m) => acceptance.mismatchTypes.includes(m.type));
  const typedAndNoded = typeMatch.filter((m) => nodeMatches(m.nodeId, m.nodeType, acceptance));
  const severityMatch = typedAndNoded.filter((m) => severityOk(m.severity, acceptance.minSeverity));

  checks.push({
    name: 'mismatch_category',
    ok: typeMatch.length > 0,
    detail:
      typeMatch.length > 0
        ? `Found ${typeMatch.map((m) => m.type).join(', ')}`
        : `Expected one of: ${acceptance.mismatchTypes.join(', ')}`,
  });

  checks.push({
    name: 'node_attribution',
    ok: typedAndNoded.length > 0,
    detail:
      typedAndNoded.length > 0
        ? `Bound to ${typedAndNoded.map((m) => m.nodeId).join(', ')}`
        : `Expected node types/hints: ${[...acceptance.nodeTypes, ...acceptance.nodeIdHints].join(', ')}`,
  });

  checks.push({
    name: 'severity',
    ok: severityMatch.length > 0 || (typeMatch.length > 0 && !acceptance.minSeverity),
    detail:
      severityMatch.length > 0
        ? `Severity ok (${severityMatch.map((m) => m.severity).join(', ')})`
        : `Need ≥ ${acceptance.minSeverity || 'any'}`,
  });

  if (acceptance.preferMobileViewport) {
    const mobileOk = mismatches.some(
      (m) =>
        acceptance.mismatchTypes.includes(m.type) &&
        (m.viewport === 'mobile' || m.viewport === 'both' || /mobile/i.test(m.evidence || ''))
    );
    const mobileDimIssues = (scorecard.mobileQuality.issues?.length || 0) > 0;
    const mobileScoreLow = scorecard.mobileQuality.score <= 6.5;
    checks.push({
      name: 'mobile_specificity',
      ok: mobileOk || mobileDimIssues || mobileScoreLow,
      detail: mobileOk
        ? 'Mismatch marked mobile/both'
        : mobileDimIssues || mobileScoreLow
          ? 'mobileQuality dimension flagged'
          : 'Expected mobile-specific signal',
    });
  }

  const dimHit = acceptance.dimensionHints.some((d) => {
    const dim = scorecard[d as keyof CritiqueScoreCard];
    if (!dim || typeof dim !== 'object' || !('score' in dim)) return false;
    const ds = dim as { score: number; issues?: string[] };
    return (ds.issues?.length || 0) > 0 || ds.score <= 6.5;
  });
  const textHit =
    acceptance.nodeIdHints.some((h) => blob.includes(h.toLowerCase())) &&
    acceptance.mismatchTypes.some(
      (t) =>
        blob.includes(t.replace(/_/g, ' ')) ||
        (t === 'missing_or_unreadable_element' &&
          /(invisible|unreadable|illegible|missing|contrast|cannot read|not visible)/i.test(
            blob
          )) ||
        (t === 'abnormal_section_spacing' &&
          /(gap|spacing|whitespace|empty band|rhythm|vertical)/i.test(blob)) ||
        (t === 'broken_crop' && /(crop|clipped|cut off|framing)/i.test(blob)) ||
        (t === 'mobile_typography' && /(mobile|overflow|oversized|too large)/i.test(blob)) ||
        (t === 'typography_mismatch' &&
          /(comic|system font|inappropriate|typeface|typography|serif|sans)/i.test(blob))
    );

  checks.push({
    name: 'semantic_fallback',
    ok: dimHit && textHit,
    detail:
      dimHit && textHit
        ? 'Dimension + textual semantic signals present'
        : `dimHit=${dimHit} textHit=${textHit}`,
  });

  const structuredPass =
    checks.find((c) => c.name === 'mismatch_category')!.ok &&
    checks.find((c) => c.name === 'node_attribution')!.ok &&
    checks.find((c) => c.name === 'severity')!.ok;

  const mobileCheck = checks.find((c) => c.name === 'mobile_specificity');
  const mobilePass = !mobileCheck || mobileCheck.ok;

  const fallbackPass =
    checks.find((c) => c.name === 'semantic_fallback')!.ok &&
    (checks.find((c) => c.name === 'mismatch_category')!.ok ||
      checks.find((c) => c.name === 'node_attribution')!.ok);

  const passed = (structuredPass && mobilePass) || (fallbackPass && mobilePass);

  return { faultId, passed, checks };
}
