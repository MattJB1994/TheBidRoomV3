/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Prompt Composer (Part 6) + Response Pattern Library (Part 5) tests.
 * The composer builds a layered prompt from blueprint context and
 * returns a user-facing summary; the raw master prompt is never in the
 * summary. Starter text makes no unsupported claims.
 */
import { describe, it, expect } from 'vitest';
import { composePrompt, generationSummary } from '../src/blueprint/promptComposer';
import { starterText, getModulePattern } from '../src/blueprint/responsePatterns';
import { generateBlueprint } from '../src/blueprint/engine';
import { TenderBlueprint } from '../src/blueprint/types';
import { ExtractedTenderMetadata, Tender, TenderStatus } from '../src/types';

const tender: Tender = {
  id: 't1', name: 'Vanguard', number: 'N', client: 'Metro', closingDate: '2099-01-01', portal: 'P',
  status: TenderStatus.Drafting, estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};
const extracted: ExtractedTenderMetadata = {
  client: 'Metro', tenderName: 'Vanguard', tenderNumber: 'N', closingDate: '2099-01-01', submissionPortal: 'P',
  mandatoryRequirements: ['Provide a technical methodology', 'Describe systems assurance'],
  evaluationCriteria: ['Technical capability'], requiredSchedules: [],
  pageLimits: '', wordLimits: '', attachmentsCount: 0, pricingFormsCount: 1,
  requiredCVsCount: 1, requiredProjectExamplesCount: 1, mandatoryInsurances: [], requiredPolicies: [], addendaCount: 0,
};
const team = [{ id: 'u1', name: 'BM', email: 'b@x.com', role: 'BID_MANAGER' as const }];
const gen = (): TenderBlueprint => generateBlueprint({ tender, extracted, kbFiles: [], personnel: [], team, documentNames: ['RFT.pdf'] });

describe('Prompt Composer', () => {
  it('includes blueprint, requirements, commercial assumptions and notes in the prompt', () => {
    const bp = gen();
    const m = bp.modules.find((x) => x.key === 'technical-methodology' && x.active)
      ?? bp.modules.find((x) => x.active)!;
    m.sectionNotes = { includePoints: 'Mention the depot upgrade' };
    bp.inputs.winThemes = ['Low-risk delivery'];
    const { prompt, summary } = composePrompt({ bp, module: m, task: 'Draft this section' });
    // Layered context present in the raw prompt.
    expect(prompt).toContain('MASTER PROMPT');
    expect(prompt).toMatch(/TENDER:/);
    expect(prompt).toMatch(/depot upgrade/);
    expect(prompt).toMatch(/OUTPUT RULES/);
    // Summary is user-facing and structured.
    expect(summary.some((s) => /requirement/i.test(s.label))).toBe(true);
  });

  it('produces a generation summary that does NOT expose the raw master prompt', () => {
    const bp = gen();
    const m = bp.modules.find((x) => x.active)!;
    const summary = generationSummary(bp, m);
    const asText = JSON.stringify(summary);
    // The summary lists WHAT went in, not the master prompt text itself.
    expect(asText).not.toMatch(/connected infrastructure tender response/i);
    expect(asText).not.toMatch(/SYSTEM RULES/);
    expect(summary.length).toBeGreaterThan(0);
  });

  it('reflects commercial assumptions when present', () => {
    const bp = gen();
    const m = bp.modules.find((x) => x.active)!;
    bp.commercial = [{ id: 'c1', type: 'Pricing assumption', text: 'Rates assume client survey', status: 'Open', exportReady: false, source: 'Manual', createdAt: new Date().toISOString(), linkedModuleKey: m.key }];
    const { prompt, summary } = composePrompt({ bp, module: m });
    expect(prompt).toMatch(/COMMERCIAL ASSUMPTIONS/);
    expect(summary.some((s) => /commercial assumptions/i.test(s.label))).toBe(true);
  });
});

describe('Response Pattern Library', () => {
  it('provides a pattern with headings and evidence prompts for known modules', () => {
    const p = getModulePattern('systems-assurance');
    expect(p.headings.length).toBeGreaterThan(0);
    expect(p.evidencePrompts.length).toBeGreaterThan(0);
    expect(p.unsupportedClaimWarnings.length).toBeGreaterThan(0);
  });

  it('starter text makes NO unsupported claims (uses bracketed placeholders)', () => {
    const text = starterText('relevant-experience', 'Relevant Experience');
    // No asserted experience claims.
    expect(text).not.toMatch(/we have extensive experience/i);
    expect(text).not.toMatch(/proven track record/i);
    // Uses placeholder prompts and is labelled a working draft.
    expect(text).toMatch(/\[Insert/i);
    expect(text).toMatch(/working draft/i);
  });

  it('falls back to a generic pattern for modules without a specific one', () => {
    const p = getModulePattern('pitch-deck');
    expect(p.headings.length).toBeGreaterThan(0);
  });
});
