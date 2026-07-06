/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Export readiness gating tests — packs must not be "ready" just
 * because content exists. The full proposal walks through every gate.
 */
import { describe, it, expect } from 'vitest';
import { generateBlueprint, computeScores } from '../src/blueprint/engine';
import { exportReadiness } from '../src/blueprint/exportReadiness';
import { TenderBlueprint } from '../src/blueprint/types';
import { ExtractedTenderMetadata, Tender, TenderStatus } from '../src/types';

const tender: Tender = {
  id: 't1', name: 'T', number: 'N', client: 'C', closingDate: '2099-01-01', portal: 'P',
  status: TenderStatus.Drafting, estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};
const extracted: ExtractedTenderMetadata = {
  client: 'C', tenderName: 'T', tenderNumber: 'N', closingDate: '2099-01-01', submissionPortal: 'P',
  mandatoryRequirements: ['Provide safety methodology'], evaluationCriteria: [], requiredSchedules: [],
  pageLimits: '', wordLimits: '', attachmentsCount: 0, pricingFormsCount: 0,
  requiredCVsCount: 0, requiredProjectExamplesCount: 0, mandatoryInsurances: [], requiredPolicies: [], addendaCount: 0,
};

function freshBlueprint(): TenderBlueprint {
  return generateBlueprint({
    tender, extracted, kbFiles: [], personnel: [],
    team: [{ id: 'u1', name: 'BM', email: 'b@x.com', role: 'BID_MANAGER' }],
    documentNames: ['RFT.pdf'],
  });
}

const check = (bp: TenderBlueprint, key: any, level: any = 'Required by client') =>
  exportReadiness(bp, key, level, computeScores(bp));

describe('full-proposal gating', () => {
  it('blocks step by step until everything genuinely passes', () => {
    let bp = freshBlueprint();

    // 1. Nothing drafted yet.
    expect(check(bp, 'full-proposal').blockedBy).toMatch(/not drafted/);

    // 2. Draft every gated module → mandatory requirements still unanswered.
    bp = { ...bp, modules: bp.modules.map((m) => ({ ...m, draft: m.active ? 'Draft content' : m.draft })) };
    expect(check(bp, 'full-proposal').blockedBy).toMatch(/mandatory requirement/);

    // 3. Answer requirements → evidence gap still open.
    bp = { ...bp, requirements: bp.requirements.map((r) => ({ ...r, status: 'Complete' as const })) };
    expect(check(bp, 'full-proposal').blockedBy).toMatch(/evidence gap/);

    // 4. Formally resolve evidence → gates still unapproved.
    bp = { ...bp, evidence: bp.evidence.map((e) => ({ ...e, status: 'found' as const, resolution: 'not-required' as const })) };
    expect(check(bp, 'full-proposal').blockedBy).toMatch(/review gates/i);

    // 5. Approve module gates → final approval still missing.
    bp = { ...bp, reviews: bp.reviews.map((t) => (t.discipline === 'Final Approval' ? t : { ...t, status: 'Approved' as const })) };
    expect(check(bp, 'full-proposal').blockedBy).toMatch(/Final approval/);

    // 6. Final approval → ready.
    bp = { ...bp, reviews: bp.reviews.map((t) => ({ ...t, status: 'Approved' as const })) };
    expect(check(bp, 'full-proposal')).toEqual({ ready: true, blockedBy: null });
  });

  it('an unreviewed addendum re-blocks an otherwise ready proposal', () => {
    let bp = freshBlueprint();
    bp = {
      ...bp,
      modules: bp.modules.map((m) => ({ ...m, draft: m.active ? 'Draft' : m.draft })),
      requirements: bp.requirements.map((r) => ({ ...r, status: 'Complete' as const })),
      evidence: bp.evidence.map((e) => ({ ...e, status: 'found' as const })),
      reviews: bp.reviews.map((t) => ({ ...t, status: 'Approved' as const })),
      addenda: [{
        id: 'a1', documentName: 'Addendum_01.pdf', receivedAt: '2026-01-01', summary: 's',
        changes: [], affectedRequirementIds: [], affectedModuleKeys: [],
        pricingImpact: false, riskImpact: false, reviewed: false, provisional: true,
      }],
    };
    expect(check(bp, 'full-proposal').blockedBy).toMatch(/addendum/i);
  });
});

describe('other packs', () => {
  it('executive summary needs both a draft and an approved bid-director gate', () => {
    let bp = freshBlueprint();
    expect(check(bp, 'executive-summary').blockedBy).toMatch(/not drafted/);
    bp = { ...bp, modules: bp.modules.map((m) => (m.key === 'executive-summary' ? { ...m, draft: 'Exec summary' } : m)) };
    expect(check(bp, 'executive-summary').blockedBy).toMatch(/Bid Director/);
    bp = { ...bp, reviews: bp.reviews.map((t) => (t.moduleKey === 'executive-summary' ? { ...t, status: 'Approved' as const } : t)) };
    expect(check(bp, 'executive-summary').ready).toBe(true);
  });

  it('internal working exports stay live — their job is reporting current state', () => {
    const bp = freshBlueprint();
    for (const key of ['risk-register', 'submission-checklist', 'internal-approval-pack']) {
      expect(check(bp, key, 'Internal only').ready).toBe(true);
    }
  });
});
