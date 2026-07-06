/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Addendum impact tests — the heuristic fallback is always labelled
 * provisional, and applying an impact links it to the review task and
 * risk it creates (so the linkage survives persistence).
 */
import { describe, it, expect } from 'vitest';
import { generateBlueprint, analyzeAddendum, applyAddendumImpact } from '../src/blueprint/engine';
import { ExtractedTenderMetadata, Tender, TenderStatus } from '../src/types';

const tender: Tender = {
  id: 't1', name: 'T', number: 'N', client: 'C', closingDate: '2099-01-01', portal: 'P',
  status: TenderStatus.Drafting, estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};
const extracted: ExtractedTenderMetadata = {
  client: 'C', tenderName: 'T', tenderNumber: 'N', closingDate: '2099-01-01', submissionPortal: 'P',
  mandatoryRequirements: ['Complete pricing schedule with fixed rates', 'Program of works with key dates'],
  evaluationCriteria: [], requiredSchedules: [], pageLimits: '', wordLimits: '',
  attachmentsCount: 0, pricingFormsCount: 1, requiredCVsCount: 0, requiredProjectExamplesCount: 0,
  mandatoryInsurances: [], requiredPolicies: [], addendaCount: 0,
};

const bp = generateBlueprint({
  tender, extracted, kbFiles: [], personnel: [],
  team: [{ id: 'u1', name: 'BM', email: 'b@x.com', role: 'BID_MANAGER' }],
  documentNames: ['RFT.pdf'],
});

describe('provisional heuristic assessment', () => {
  const impact = analyzeAddendum('Addendum_02.pdf', bp);

  it('is explicitly labelled provisional and asks for human review', () => {
    expect(impact.provisional).toBe(true);
    expect(impact.summary).toMatch(/PROVISIONAL/);
    expect(impact.summary).toMatch(/human must review/i);
  });

  it('only flags requirement ids that actually exist', () => {
    const validIds = new Set(bp.requirements.map((r) => r.id));
    impact.affectedRequirementIds.forEach((id) => expect(validIds.has(id)).toBe(true));
  });
});

describe('applyAddendumImpact linkage', () => {
  const impact = { ...analyzeAddendum('Addendum_03.pdf', bp), documentId: 'doc_abc' };
  const next = applyAddendumImpact(bp, impact);
  const stored = next.addenda[0];

  it('records the impact with links to its review task, risk and document', () => {
    expect(stored.documentId).toBe('doc_abc');
    expect(stored.reviewTaskId).toBeTruthy();
    expect(stored.riskId).toBeTruthy();
    expect(next.reviews.some((t) => t.id === stored.reviewTaskId && t.title.includes('Addendum_03.pdf'))).toBe(true);
    expect(next.risks.some((r) => r.id === stored.riskId && r.source === 'Addendum')).toBe(true);
  });

  it('flags affected requirements and bumps the addenda count', () => {
    const flagged = next.requirements.filter((r) => r.addendumFlag?.includes('Addendum_03.pdf'));
    expect(flagged.length).toBe(impact.affectedRequirementIds.length);
    expect(next.addendaCount).toBe(bp.addendaCount + 1);
  });

  it('does not mutate the original blueprint', () => {
    expect(bp.addenda.length).toBe(0);
    expect(bp.requirements.every((r) => !r.addendumFlag)).toBe(true);
  });
});
