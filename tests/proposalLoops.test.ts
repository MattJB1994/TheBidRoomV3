/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Controlled Proposal Loops (Part 8) tests — per-section checks with stop
 * conditions: requirement coverage, evidence support, repetition,
 * commercial capture, addendum blocking, human review before approval,
 * export readiness gating, and the AI revision cap.
 */
import { describe, it, expect } from 'vitest';
import {
  requirementCheck, evidenceCheck, repetitionCheck, commercialCheck, addendumCheck,
  exportReadinessCheck, runSectionLoop, buildLoopReport, revisionBudgetExhausted,
  runStageAcrossAll, MAX_AI_REVISIONS,
} from '../src/blueprint/proposalLoops';
import { generateBlueprint, applyAddendumImpact, analyzeAddendum } from '../src/blueprint/engine';
import { TenderBlueprint, ProposalModule } from '../src/blueprint/types';
import { ExtractedTenderMetadata, Tender, TenderStatus } from '../src/types';

const tender: Tender = {
  id: 't1', name: 'Vanguard', number: 'N', client: 'Metro', closingDate: '2099-01-01', portal: 'P',
  status: TenderStatus.Drafting, estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};
const extracted: ExtractedTenderMetadata = {
  client: 'Metro', tenderName: 'Vanguard', tenderNumber: 'N', closingDate: '2099-01-01', submissionPortal: 'P',
  mandatoryRequirements: ['Provide a technical methodology for signalling delivery', 'Describe systems assurance approach'],
  evaluationCriteria: ['Technical capability'], requiredSchedules: [],
  pageLimits: '', wordLimits: '', attachmentsCount: 0, pricingFormsCount: 1,
  requiredCVsCount: 1, requiredProjectExamplesCount: 1, mandatoryInsurances: [], requiredPolicies: [], addendaCount: 0,
};
const team = [{ id: 'u1', name: 'BM', email: 'b@x.com', role: 'BID_MANAGER' as const }];
const gen = (): TenderBlueprint => generateBlueprint({ tender, extracted, kbFiles: [], personnel: [], team, documentNames: ['RFT.pdf'] });
const firstActive = (bp: TenderBlueprint): ProposalModule => bp.modules.find((m) => m.active)!;

describe('Loop stage checks', () => {
  it('requirement check flags missing requirement coverage', () => {
    const bp = gen();
    const m = firstActive(bp);
    m.draft = 'This section talks about something entirely unrelated to the requirement.';
    const res = requirementCheck(bp, m);
    if (m.requirementIds.length) {
      expect(res.passed).toBe(false);
      expect(res.blockedReason).toBeTruthy();
    }
  });

  it('evidence check flags unsupported claims', () => {
    const bp = gen();
    const m = firstActive(bp);
    m.draft = 'We have a proven track record on similar projects.';
    const res = evidenceCheck(bp, m);
    expect(res.passed).toBe(false);
    expect(res.findings.some((f) => /unsupported/i.test(f))).toBe(true);
  });

  it('repetition check flags repeated content across sections', () => {
    const bp = gen();
    bp.modules.filter((m) => m.active).slice(0, 4).forEach((m) => { m.draft = 'Our brownfield rail corridor experience is extensive and proven repeatedly.'; });
    const m = firstActive(bp);
    const res = repetitionCheck(bp, m);
    expect(res.passed).toBe(false);
  });

  it('commercial check suggests capturing assumptions found in prose', () => {
    const bp = gen();
    const m = firstActive(bp);
    bp.commercial = []; // nothing captured for this module
    m.draft = 'Our pricing assumes the client will provide survey data and excludes traffic management.';
    const res = commercialCheck(bp, m);
    expect(res.passed).toBe(false);
    expect(res.suggestedAction).toMatch(/register/i);
  });

  it('addendum check blocks a section with an unreviewed impacting addendum', () => {
    let bp = gen();
    const m = firstActive(bp);
    // Craft an addendum impact that affects this module, unreviewed.
    const impact = analyzeAddendum('Addendum_01.pdf', bp);
    impact.affectedModuleKeys = [m.key];
    impact.reviewed = false;
    bp = applyAddendumImpact(bp, impact);
    const target = bp.modules.find((x) => x.key === m.key)!;
    const res = addendumCheck(bp, target);
    expect(res.passed).toBe(false);
    expect(res.blockedReason).toMatch(/addendum/i);
  });
});

describe('Loop orchestration & stop conditions', () => {
  it('sets Not started when there is no draft', () => {
    const bp = gen();
    const m = firstActive(bp);
    m.draft = '';
    expect(runSectionLoop(bp, m).status).toBe('Not started');
  });

  it('stops at Blocked when evidence is missing (does not reach approval)', () => {
    const bp = gen();
    const m = firstActive(bp);
    m.draft = 'We have extensive experience and a proven track record on comparable projects.';
    const loop = runSectionLoop(bp, m);
    expect(['Blocked', 'Human review required']).toContain(loop.status);
    expect(loop.status).not.toBe('Approved');
    expect(loop.status).not.toBe('Export ready');
  });

  it('requires human review before a clean section can be approved (AI never self-approves)', () => {
    const bp = gen();
    const m = firstActive(bp);
    // A draft that answers requirements with no risky claims, no linked evidence gaps.
    const reqTerms = bp.requirements.filter((r) => m.requirementIds.includes(r.id)).map((r) => r.text).join(' ');
    m.draft = `This section addresses: ${reqTerms}. Content is specific and measured.`;
    // Remove missing-evidence items for this module to pass evidence check.
    bp.evidence = bp.evidence.map((e) => (e.moduleKey === m.key ? { ...e, status: 'found', matchedFile: 'proof.pdf' } : e));
    const loop = runSectionLoop(bp, m);
    // Not approved by the loop — human review required.
    expect(loop.status).not.toBe('Approved');
  });

  it('export readiness is blocked until review is approved, passes when all resolved', () => {
    const bp = gen();
    const m = firstActive(bp);
    const reqTerms = bp.requirements.filter((r) => m.requirementIds.includes(r.id)).map((r) => r.text).join(' ');
    m.draft = `This section addresses: ${reqTerms}.`;
    bp.evidence = bp.evidence.map((e) => (e.moduleKey === m.key ? { ...e, status: 'found', matchedFile: 'p.pdf' } : e));
    bp.commercial = [];
    // Before approval → blocked.
    expect(exportReadinessCheck(bp, m).passed).toBe(false);
    // Approve the review + section.
    m.draftStatus = 'Approved';
    bp.reviews = bp.reviews.map((r) => (r.moduleKey === m.key ? { ...r, status: 'Approved' } : r));
    const after = exportReadinessCheck(bp, m);
    expect(after.passed).toBe(true);
  });

  it('enforces the max AI revision count', () => {
    const bp = gen();
    const m = firstActive(bp);
    m.loop = { status: 'Draft created', stages: {}, aiRevisions: MAX_AI_REVISIONS, updatedAt: new Date().toISOString() };
    expect(revisionBudgetExhausted(m)).toBe(true);
    m.loop.aiRevisions = MAX_AI_REVISIONS - 1;
    expect(revisionBudgetExhausted(m)).toBe(false);
  });
});

describe('Proposal-wide loop report', () => {
  it('summarises ready/blocked sections and next actions', () => {
    const bp = gen();
    bp.modules = bp.modules.map((m) => (m.active ? { ...m, draft: 'We have a proven track record.' } : m));
    const report = buildLoopReport(bp);
    expect(Array.isArray(report.blocked)).toBe(true);
    expect(report.nextActions.length).toBeGreaterThan(0);
  });

  it('runs a single stage across all drafted sections', () => {
    const bp = gen();
    bp.modules = bp.modules.map((m) => (m.active ? { ...m, draft: 'Draft content addressing the requirement.' } : m));
    const results = runStageAcrossAll(bp, 'evidence');
    expect(Object.keys(results).length).toBe(bp.modules.filter((m) => m.active).length);
  });
});
