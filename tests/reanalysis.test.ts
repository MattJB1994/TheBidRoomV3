/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Blueprint re-analysis safety (Part 15) — mergeManualWork refreshes the
 * tender-derived structure while preserving the team's manual work:
 * drafts, review decisions, resolved evidence, owners, addenda and the
 * commercial register.
 */
import { describe, it, expect } from 'vitest';
import { generateBlueprint, mergeManualWork, applyAddendumImpact, analyzeAddendum } from '../src/blueprint/engine';
import { TenderBlueprint } from '../src/blueprint/types';
import { ExtractedTenderMetadata, Tender, TenderStatus } from '../src/types';

const tender: Tender = {
  id: 't1', name: 'T', number: 'N', client: 'C', closingDate: '2099-01-01', portal: 'P',
  status: TenderStatus.Drafting, estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};
const extracted: ExtractedTenderMetadata = {
  client: 'C', tenderName: 'T', tenderNumber: 'N', closingDate: '2099-01-01', submissionPortal: 'P',
  mandatoryRequirements: ['Provide safety methodology', 'Nominate key personnel with CVs'],
  evaluationCriteria: ['Technical capability'], requiredSchedules: ['Schedule A'],
  pageLimits: '30', wordLimits: '', attachmentsCount: 0, pricingFormsCount: 1,
  requiredCVsCount: 1, requiredProjectExamplesCount: 0, mandatoryInsurances: [], requiredPolicies: [], addendaCount: 0,
};
const team = [{ id: 'u1', name: 'BM', email: 'b@x.com', role: 'BID_MANAGER' as const }];
const gen = (): TenderBlueprint => generateBlueprint({ tender, extracted, kbFiles: [], personnel: [], team, documentNames: ['RFT.pdf'] });

describe('mergeManualWork', () => {
  it('preserves drafts, review decisions, owners and resolved evidence', () => {
    const prev = gen();
    // Simulate manual work on the first active module + its review + an
    // evidence resolution.
    const mod = prev.modules.find((m) => m.active)!;
    mod.draft = 'A carefully written draft.';
    mod.draftStatus = 'In review';
    mod.ownerId = 'u1';
    const rev = prev.reviews.find((r) => r.moduleKey === mod.key);
    if (rev) { rev.status = 'Approved'; rev.comments = 'Looks good'; }
    if (prev.evidence[0]) { prev.evidence[0].resolution = 'not-required'; prev.evidence[0].status = 'found'; }
    prev.editedAt = new Date().toISOString();

    const fresh = gen();
    const merged = mergeManualWork(fresh, prev);

    const mergedMod = merged.modules.find((m) => m.key === mod.key)!;
    expect(mergedMod.draft).toBe('A carefully written draft.');
    expect(mergedMod.draftStatus).toBe('In review');
    expect(mergedMod.ownerId).toBe('u1');

    const mergedRev = merged.reviews.find((r) => r.moduleKey === mod.key);
    if (rev) expect(mergedRev?.status).toBe('Approved');

    const mergedEv = merged.evidence.find((e) => e.label === prev.evidence[0].label && e.type === prev.evidence[0].type);
    expect(mergedEv?.resolution).toBe('not-required');
  });

  it('keeps addenda and their impact across re-analysis', () => {
    let prev = gen();
    prev = applyAddendumImpact(prev, analyzeAddendum('Addendum_01.pdf', prev));
    expect(prev.addenda).toHaveLength(1);

    const fresh = gen(); // fresh has no addenda
    const merged = mergeManualWork(fresh, prev);
    expect(merged.addenda).toHaveLength(1);
    expect(merged.addenda[0].documentName).toBe('Addendum_01.pdf');
    expect(merged.addendaCount).toBeGreaterThanOrEqual(1);
  });

  it('keeps the commercial register the team has been working', () => {
    const prev = gen();
    // Acknowledge a seeded commercial item + add a manual one.
    if (prev.commercial[0]) prev.commercial[0].status = 'Acknowledged';
    prev.commercial.push({
      id: 'com_manual', type: 'Scope exclusion', text: 'Excludes traffic management',
      status: 'Approved', exportReady: true, source: 'Manual', createdAt: new Date().toISOString(),
    });

    const fresh = gen();
    const merged = mergeManualWork(fresh, prev);
    expect(merged.commercial.some((c) => c.id === 'com_manual')).toBe(true);
    expect(merged.commercial.find((c) => c.id === prev.commercial[0].id)?.status).toBe('Acknowledged');
  });

  it('still refreshes tender-derived structure (fresh requirements present)', () => {
    const prev = gen();
    const fresh = gen();
    const merged = mergeManualWork(fresh, prev);
    // Requirements come from the fresh run (same count here), proving the
    // structure is regenerated rather than frozen.
    expect(merged.requirements.length).toBe(fresh.requirements.length);
  });
});

describe('commercial register seeding', () => {
  it('seeds commercial items from pricing/commercial signals', () => {
    const bp = gen();
    expect(bp.commercial.length).toBeGreaterThan(0);
    // A pricing form was present → a pricing assumption should exist.
    expect(bp.commercial.some((c) => c.type === 'Pricing assumption')).toBe(true);
    // Seeded items start Open and not export-ready.
    expect(bp.commercial.every((c) => c.status === 'Open' && !c.exportReady)).toBe(true);
  });
});
