/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Blueprint engine tests — tender creation (blueprint generation),
 * source-referenced rich extraction, content-based evidence matching,
 * and module activation rules.
 */
import { describe, it, expect } from 'vitest';
import { generateBlueprint, computeScores } from '../src/blueprint/engine';
import { ExtractedTenderMetadata, KBFile, Tender, TenderStatus } from '../src/types';

const tender: Tender = {
  id: 't_test', name: 'Test Signalling Package', number: 'T-001', client: 'Test Transit',
  closingDate: '2099-01-01', portal: 'Portal', status: TenderStatus.Drafting,
  estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};

const team = [
  { id: 'u1', name: 'Bid Manager', email: 'bm@x.com', role: 'BID_MANAGER' as const },
  { id: 'u2', name: 'Tech Reviewer', email: 'tr@x.com', role: 'TECHNICAL_REVIEWER' as const },
];

const kbFile = (over: Partial<KBFile>): KBFile => ({
  id: 'f1', name: 'file.pdf', category: 'CAPABILITY', size: '1 MB',
  uploadedAt: '2026-01-01', uploadedBy: 'x', lastVerifiedAt: '2026-01-01', isStale: false,
  ...over,
});

const legacyExtraction: ExtractedTenderMetadata = {
  client: 'Test Transit', tenderName: 'Test Signalling Package', tenderNumber: 'T-001',
  closingDate: '2099-01-01', submissionPortal: 'Portal',
  mandatoryRequirements: [
    'Nominated Systems Assurance Lead with Chartered registration and CV',
    'Safety in Design methodology aligned with WHS obligations',
  ],
  evaluationCriteria: ['Technical capability (40%)', 'Pricing (30%)'],
  requiredSchedules: ['Schedule A - Conformance'],
  pageLimits: '30 pages', wordLimits: '', attachmentsCount: 2, pricingFormsCount: 2,
  requiredCVsCount: 1, requiredProjectExamplesCount: 0,
  mandatoryInsurances: ['PI insurance $20m'], requiredPolicies: [], addendaCount: 0,
};

describe('tender creation → blueprint generation (legacy extraction)', () => {
  const bp = generateBlueprint({
    tender, extracted: legacyExtraction, kbFiles: [], personnel: [], team,
    documentNames: ['RFT.pdf'],
  });

  it('builds a requirements register from every metadata source', () => {
    // 2 mandatory + 2 criteria + 1 schedule + 1 insurance + 1 page limit + 1 pricing forms
    expect(bp.requirements.length).toBe(8);
    expect(bp.requirements.filter((r) => r.mandatory).length).toBeGreaterThan(0);
  });

  it('always activates the submission checklist', () => {
    expect(bp.modules.find((m) => m.key === 'submission-checklist')?.active).toBe(true);
  });

  it('activates modules per detection rules with reasons', () => {
    const active = Object.fromEntries(bp.modules.map((m) => [m.key, m]));
    expect(active['key-personnel'].active).toBe(true);           // CV requested
    expect(active['safety'].active).toBe(true);                  // Safety in Design
    expect(active['systems-assurance'].active).toBe(true);       // assurance lead
    expect(active['pricing-response'].active).toBe(true);        // pricing forms + criterion
    expect(active['technical-methodology'].active).toBe(true);   // technical criterion
    expect(active['design-management'].active).toBe(false);      // never mentioned
    bp.modules.filter((m) => m.active).forEach((m) => expect(m.activationReason).toBeTruthy());
  });

  it('creates a review gate per active module and computes scores', () => {
    const activeCount = bp.modules.filter((m) => m.active).length;
    expect(bp.reviews.length).toBe(activeCount);
    const scores = computeScores(bp);
    expect(scores.mandatoryTotal).toBeGreaterThan(0);
    expect(scores.readiness).toBeGreaterThanOrEqual(0);
    expect(scores.readiness).toBeLessThanOrEqual(100);
  });

  it('marks unmatched evidence as missing (red), never silently found', () => {
    // Empty knowledge base → every evidence item must be a gap.
    expect(bp.evidence.length).toBeGreaterThan(0);
    expect(bp.evidence.every((e) => e.status === 'missing')).toBe(true);
  });
});

describe('rich (source-referenced) extraction path', () => {
  const rich: ExtractedTenderMetadata = {
    ...legacyExtraction,
    summary: 'Live-extracted summary.',
    commercialRisks: ['Rates fixed with no escalation'],
    clarificationsNeeded: ['Confirm wet-signature requirement'],
    requirements: [
      { text: 'Nominate a chartered signalling engineer and provide their CV', category: 'Personnel', sourceDocument: 'Part_B.pdf', clauseRef: 'Cl. 4.2.1', confidence: 'high', mandatory: true, evidenceRequired: true },
      { text: 'Certificates of currency for PI insurance of $20m', category: 'Insurance', sourceDocument: 'Conditions.docx', clauseRef: '§9.3', confidence: 'medium', mandatory: true, evidenceRequired: true },
    ],
  };
  const bp = generateBlueprint({ tender, extracted: rich, kbFiles: [], personnel: [], team, documentNames: ['a.pdf', 'b.docx'] });

  it('uses the rich register as the primary source with provenance', () => {
    const first = bp.requirements[0];
    expect(first.sourceDocument).toBe('Part_B.pdf');
    expect(first.clauseRef).toBe('Cl. 4.2.1');
    expect(first.confidence).toBe('high');
    expect(first.type).toBe('Personnel');
    // Legacy mandatoryRequirements are NOT duplicated in rich mode.
    expect(bp.requirements.some((r) => r.text.startsWith('Safety in Design methodology'))).toBe(false);
  });

  it('uses the extracted summary and surfaces extraction risks/clarifications', () => {
    expect(bp.summary).toBe('Live-extracted summary.');
    expect(bp.risks.some((r) => r.title.startsWith('Commercial risk:'))).toBe(true);
    expect(bp.reviews.some((t) => t.title.startsWith('Clarification to client'))).toBe(true);
  });
});

describe('content-based evidence matching', () => {
  it('matches a misnamed file by its extracted content, with confidence and reason', () => {
    const kb = [kbFile({
      id: 'cv1', name: 'scan_0042.pdf', category: 'CV',
      contentText: 'Curriculum vitae — chartered signalling engineer, systems assurance lead, 12 years verification experience.',
    })];
    const bp = generateBlueprint({
      tender,
      extracted: { ...legacyExtraction, mandatoryRequirements: ['Nominated chartered signalling engineer CV with assurance experience'], evaluationCriteria: [], requiredSchedules: [], mandatoryInsurances: [], pricingFormsCount: 0, pageLimits: '' },
      kbFiles: kb, personnel: [], team, documentNames: ['RFT.pdf'],
    });
    const ev = bp.evidence.find((e) => e.type === 'CV');
    expect(ev?.status).toBe('found');
    expect(ev?.matchedFile).toBe('scan_0042.pdf');
    expect(ev?.confidence).toBeGreaterThan(0);
    expect(ev?.matchReason).toMatch(/document text covers/);
  });

  it('a stale match is a real match that needs checking, not found', () => {
    const kb = [kbFile({ id: 'p1', name: 'WHS_Policy_signalling_safety.pdf', category: 'POLICY', isStale: true, contentText: 'Safety in design WHS methodology obligations for signalling works.' })];
    const bp = generateBlueprint({
      tender,
      extracted: { ...legacyExtraction, mandatoryRequirements: ['Safety in Design methodology aligned with WHS obligations for signalling'], evaluationCriteria: [], requiredSchedules: [], mandatoryInsurances: [], pricingFormsCount: 0, pageLimits: '' },
      kbFiles: kb, personnel: [], team, documentNames: ['RFT.pdf'],
    });
    expect(bp.evidence[0].status).toBe('check');
  });
});
