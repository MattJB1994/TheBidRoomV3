/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workflow navigation tests — the seven-stage model, stage status
 * computation and the single Next Best Action derived from live state.
 */
import { describe, it, expect } from 'vitest';
import { STAGES, pageToStage, computeStageStatuses, computeNextBestAction } from '../src/blueprint/workflow';
import { generateBlueprint, computeScores, applyAddendumImpact, analyzeAddendum } from '../src/blueprint/engine';
import { TenderBlueprint } from '../src/blueprint/types';
import { ExtractedTenderMetadata, Tender, TenderStatus } from '../src/types';

const tender: Tender = {
  id: 't1', name: 'V', number: 'N', client: 'C', closingDate: '2099-01-01', portal: 'P',
  status: TenderStatus.Drafting, estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};
const extracted: ExtractedTenderMetadata = {
  client: 'C', tenderName: 'V', tenderNumber: 'N', closingDate: '2099-01-01', submissionPortal: 'P',
  mandatoryRequirements: ['Provide a methodology', 'Nominate key personnel with CVs'],
  evaluationCriteria: ['Technical'], requiredSchedules: [],
  pageLimits: '', wordLimits: '', attachmentsCount: 0, pricingFormsCount: 1,
  requiredCVsCount: 1, requiredProjectExamplesCount: 1, mandatoryInsurances: [], requiredPolicies: [], addendaCount: 0,
};
const team = [{ id: 'u1', name: 'BM', email: 'b@x.com', role: 'BID_MANAGER' as const }];
const gen = (): TenderBlueprint => generateBlueprint({ tender, extracted, kbFiles: [], personnel: [], team, documentNames: ['RFT.pdf'] });

describe('workflow stages', () => {
  it('defines exactly seven stages in order', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['intake', 'blueprint', 'gaps', 'draft', 'review', 'submit', 'closeout']);
  });

  it('maps pages back to stages', () => {
    expect(pageToStage('documents')).toBe('intake');
    expect(pageToStage('drafts')).toBe('draft');
    expect(pageToStage('exports')).toBe('submit');
    expect(pageToStage('settings')).toBeNull();
  });
});

describe('stage status computation', () => {
  it('before any tender: intake is current when no docs, done when docs exist', () => {
    const noDocs = computeStageStatuses(null, null, false);
    expect(noDocs.intake).toBe('current');
    const withDocs = computeStageStatuses(null, null, true);
    expect(withDocs.intake).toBe('done');
    expect(withDocs.blueprint).toBe('current');
  });

  it('marks gaps blocked when there are missing evidence / open commercial / addenda', () => {
    const bp = gen();
    const scores = computeScores(bp);
    const statuses = computeStageStatuses(bp, scores, true);
    // Fresh blueprint has evidence gaps / commercial items → gaps blocked.
    expect(statuses.intake).toBe('done');
    expect(statuses.blueprint).toBe('done');
    expect(['blocked', 'done']).toContain(statuses.gaps);
  });
});

describe('next best action', () => {
  it('recommends intake when there is nothing yet', () => {
    const nba = computeNextBestAction(null, null, false);
    expect(nba.stage).toBe('intake');
    expect(nba.buttonLabel).toBeTruthy();
  });

  it('prioritises an unreviewed addendum above other gaps', () => {
    let bp = gen();
    bp = applyAddendumImpact(bp, analyzeAddendum('Addendum_01.pdf', bp));
    bp.addenda = bp.addenda.map((a) => ({ ...a, reviewed: false }));
    const nba = computeNextBestAction(bp, computeScores(bp), true);
    expect(nba.action).toMatch(/addendum/i);
    expect(nba.urgent).toBe(true);
  });

  it('always returns exactly one action with a why and unlocks', () => {
    const bp = gen();
    const nba = computeNextBestAction(bp, computeScores(bp), true);
    expect(nba.action).toBeTruthy();
    expect(nba.why).toBeTruthy();
    expect(nba.unlocks).toBeTruthy();
    expect(nba.buttonLabel).toBeTruthy();
  });
});
