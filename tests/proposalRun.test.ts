/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Proposal Run Through tests — the two-pass whole-proposal workflow:
 * first pass across all modules, notes usage, full run-through not
 * silently overwriting manual edits, repetition/consistency checks,
 * claim register, review-ready (never approved), and version history.
 */
import { describe, it, expect } from 'vitest';
import {
  generateFirstPass, runFullProposal, checkRepetitionAndConsistency,
  buildClaimRegister, prepareReviewReady, makeVersion, MASTER_PROMPT, MASTER_PROMPT_VERSION,
} from '../src/blueprint/proposalRun';
import { generateBlueprint } from '../src/blueprint/engine';
import { TenderBlueprint } from '../src/blueprint/types';
import { ExtractedTenderMetadata, Tender, TenderStatus } from '../src/types';

const tender: Tender = {
  id: 't1', name: 'Vanguard Signalling', number: 'N', client: 'Metro', closingDate: '2099-01-01', portal: 'P',
  status: TenderStatus.Drafting, estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};
const extracted: ExtractedTenderMetadata = {
  client: 'Metro', tenderName: 'Vanguard Signalling', tenderNumber: 'N', closingDate: '2099-01-01', submissionPortal: 'P',
  mandatoryRequirements: ['Nominate key personnel with CVs', 'Describe the systems assurance approach', 'Provide a technical methodology'],
  evaluationCriteria: ['Technical capability'], requiredSchedules: [],
  pageLimits: '', wordLimits: '', attachmentsCount: 0, pricingFormsCount: 1,
  requiredCVsCount: 1, requiredProjectExamplesCount: 1, mandatoryInsurances: [], requiredPolicies: [], addendaCount: 0,
};
const team = [{ id: 'u1', name: 'BM', email: 'b@x.com', role: 'BID_MANAGER' as const }];
const gen = (): TenderBlueprint => generateBlueprint({ tender, extracted, kbFiles: [], personnel: [], team, documentNames: ['RFT.pdf'] });

describe('Stage 1 — first pass across all sections', () => {
  it('generates a working draft + structured meta for every activated module', async () => {
    const bp = gen();
    const active = bp.modules.filter((m) => m.active);
    const sections = await generateFirstPass(bp);
    expect(sections.map((s) => s.key).sort()).toEqual(active.map((m) => m.key).sort());
    sections.forEach((s) => {
      expect(s.draft.length).toBeGreaterThan(0);
      expect(s.meta.purpose).toBeTruthy();
      expect(Array.isArray(s.meta.keyMessages)).toBe(true);
      expect(Array.isArray(s.meta.unsupportedClaims)).toBe(true);
      expect(s.meta.suggestedReviewer).toBeTruthy();
    });
  });

  it('labels the first pass as a working draft, not final', async () => {
    const bp = gen();
    const sections = await generateFirstPass(bp);
    expect(sections.some((s) => /working draft|first-pass|not final/i.test(s.draft))).toBe(true);
  });
});

describe('Stage 3 — full proposal run through', () => {
  it('processes all active modules and reports which had manual edits', async () => {
    const bp = gen();
    // Give every active module a draft; mark one as manually edited.
    bp.modules = bp.modules.map((m) => (m.active ? { ...m, draft: `Draft for ${m.name}` } : m));
    const edited = bp.modules.find((m) => m.active)!;
    edited.manuallyEdited = true;

    const result = await runFullProposal(bp);
    expect(result.length).toBe(bp.modules.filter((m) => m.active).length);
    const editedResult = result.find((r) => r.key === edited.key)!;
    expect(editedResult.hadManualEdits).toBe(true);
    // The run returns proposed drafts — it does NOT mutate the blueprint
    // (the caller decides how to apply, so manual edits are never
    // silently overwritten).
    expect(bp.modules.find((m) => m.key === edited.key)!.draft).toBe(`Draft for ${edited.name}`);
  });

  it('uses section notes and global notes in the run (demo transforms surface them)', async () => {
    const bp = gen();
    const mod = bp.modules.find((m) => m.active)!;
    mod.draft = 'Base draft';
    mod.sectionNotes = { includePoints: 'Mention the depot upgrade', notes: 'Keep it tight' };
    bp.proposalNotes = { proposalStory: 'One connected story', termsToUse: 'assurance-led' };

    const result = await runFullProposal(bp);
    const section = result.find((r) => r.key === mod.key)!;
    // Demo run-through echoes applied section direction.
    expect(section.draft).toMatch(/depot upgrade/i);
  });
});

describe('Stage 4 — repetition & consistency check', () => {
  it('detects a phrase repeated across several sections', () => {
    const bp = gen();
    const active = bp.modules.filter((m) => m.active).slice(0, 4);
    active.forEach((m) => { m.draft = 'Our brownfield rail corridor experience is extensive and proven.'; });
    const issues = checkRepetitionAndConsistency(bp);
    expect(issues.some((i) => i.kind === 'repetition')).toBe(true);
    const rep = issues.find((i) => i.kind === 'repetition')!;
    expect(rep.affectedSections.length).toBeGreaterThanOrEqual(3);
    expect(rep.suggestedFix).toBeTruthy();
  });

  it('flags unsupported claims per section', () => {
    const bp = gen();
    const mod = bp.modules.find((m) => m.active)!;
    mod.draft = 'We have a proven track record on similar projects.';
    const issues = checkRepetitionAndConsistency(bp);
    expect(issues.some((i) => i.kind === 'unsupported' && i.affectedSections.includes(mod.key))).toBe(true);
  });
});

describe('Claim Register', () => {
  it('stores claims by section, marks unsupported and repeated', () => {
    const bp = gen();
    const active = bp.modules.filter((m) => m.active).slice(0, 2);
    active.forEach((m) => { m.draft = 'We bring extensive experience on similar projects and a proven track record.'; });
    const register = buildClaimRegister(bp);
    const exp = register.find((c) => c.text === 'Similar project experience');
    expect(exp).toBeTruthy();
    expect(exp!.sections.length).toBeGreaterThanOrEqual(2);
    expect(exp!.repeated).toBe(true);
    // No case-study evidence linked → unsupported, high risk.
    expect(exp!.status).toBe('unsupported');
    expect(exp!.suggestedRewrite).toBeTruthy();
  });
});

describe('Stage 5 — review ready draft', () => {
  it('produces a review summary and a version, but never marks approved', () => {
    const bp = gen();
    bp.modules = bp.modules.map((m) => (m.active ? { ...m, draft: `Draft ${m.name}` } : m));
    const result = prepareReviewReady(bp, 'u1');
    expect(result.version.action).toBe('review-ready');
    expect(result.reviewSummary.length).toBeGreaterThan(0);
    expect(Array.isArray(result.claimRegister)).toBe(true);
    // Nothing gets marked Approved by preparing a review-ready draft.
    expect(bp.modules.every((m) => m.draftStatus !== 'Approved')).toBe(true);
    expect(bp.reviews.every((r) => r.status !== 'Approved')).toBe(true);
  });
});

describe('Version handling', () => {
  it('records the action, master prompt version, affected modules and snapshots', () => {
    const bp = gen();
    const active = bp.modules.filter((m) => m.active);
    active.forEach((m) => { m.draft = `Content ${m.key}`; });
    const version = makeVersion('full-run', active, 'u1', 'Ran full pass', true);
    expect(version.action).toBe('full-run');
    expect(version.masterPromptVersion).toBe(MASTER_PROMPT_VERSION);
    expect(version.affectedModules.sort()).toEqual(active.map((m) => m.key).sort());
    expect(version.snapshots.length).toBe(active.length);
    expect(version.snapshots[0].draft).toContain('Content');
    expect(version.notesUsed).toBe(true);
  });
});

describe('Master prompt', () => {
  it('instructs the model to treat the proposal as one connected submission', () => {
    expect(MASTER_PROMPT).toMatch(/connected infrastructure tender response/i);
    expect(MASTER_PROMPT).toMatch(/without repeating other sections/i);
    expect(MASTER_PROMPT).toMatch(/cross reference/i);
  });
});
