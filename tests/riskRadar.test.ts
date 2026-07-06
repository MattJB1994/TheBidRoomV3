/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tender Risk Radar (Part 3.1) — derives tender-specific risks (scope,
 * program, insurance/accreditation gaps, client-data reliance, addenda,
 * returnables…) from the blueprint, tagged with category, severity,
 * affected module and export impact.
 */
import { describe, it, expect } from 'vitest';
import { runRiskRadar, riskRadarSummary } from '../src/blueprint/riskRadar';
import { generateBlueprint, applyAddendumImpact, analyzeAddendum } from '../src/blueprint/engine';
import { TenderBlueprint } from '../src/blueprint/types';
import { ExtractedTenderMetadata, Tender, TenderStatus } from '../src/types';

const tender: Tender = {
  id: 't1', name: 'Vanguard', number: 'N', client: 'Metro', closingDate: '2099-01-01', portal: 'P',
  status: TenderStatus.Drafting, estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};
const baseExtracted: ExtractedTenderMetadata = {
  client: 'Metro', tenderName: 'Vanguard', tenderNumber: 'N', closingDate: '2099-01-01', submissionPortal: 'P',
  mandatoryRequirements: ['Deliver works as required to be advised', 'Program milestones must be met', 'Use client-provided survey data'],
  evaluationCriteria: ['Technical'], requiredSchedules: [],
  pageLimits: '', wordLimits: '', attachmentsCount: 0, pricingFormsCount: 1,
  requiredCVsCount: 0, requiredProjectExamplesCount: 0,
  mandatoryInsurances: ['Public liability'], requiredPolicies: [], addendaCount: 0,
};
const team = [{ id: 'u1', name: 'BM', email: 'b@x.com', role: 'BID_MANAGER' as const }];
const gen = (extra: Partial<ExtractedTenderMetadata> = {}): TenderBlueprint =>
  generateBlueprint({ tender, extracted: { ...baseExtracted, ...extra }, kbFiles: [], personnel: [], team, documentNames: ['RFT.pdf'] });

describe('Tender Risk Radar', () => {
  it('flags unclear scope from open-ended requirement wording', () => {
    const risks = runRiskRadar(gen());
    expect(risks.some((r) => r.category === 'Scope')).toBe(true);
  });

  it('flags reliance on client supplied data', () => {
    const risks = runRiskRadar(gen());
    expect(risks.some((r) => r.category === 'Client data reliance')).toBe(true);
  });

  it('flags an insurance gap when required but no certificate is linked', () => {
    const risks = runRiskRadar(gen());
    const ins = risks.find((r) => r.category === 'Insurance');
    expect(ins).toBeTruthy();
    expect(ins!.affectsExport).toBe(true);
    expect(ins!.rating).toBe('High');
  });

  it('flags an unreviewed addendum as a scope-change risk affecting export', () => {
    let bp = gen();
    bp = applyAddendumImpact(bp, analyzeAddendum('Addendum_01.pdf', bp));
    const risks = runRiskRadar(bp);
    const add = risks.find((r) => r.category === 'Addendum');
    expect(add).toBeTruthy();
    expect(add!.affectsExport).toBe(true);
  });

  it('tags every radar risk with source, category and status', () => {
    const risks = runRiskRadar(gen());
    expect(risks.length).toBeGreaterThan(0);
    risks.forEach((r) => {
      expect(r.source).toBe('Risk Radar');
      expect(r.category).toBeTruthy();
      expect(r.status).toBe('Open');
    });
  });

  it('summarises radar risks (total, high, affecting export)', () => {
    const risks = runRiskRadar(gen());
    const summary = riskRadarSummary(risks);
    expect(summary.total).toBe(risks.length);
    expect(summary.high).toBeGreaterThanOrEqual(1);
    expect(summary.affectingExport).toBeGreaterThanOrEqual(1);
  });
});
