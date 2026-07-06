/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Worked sample (Bluewater Junction) tests — it loads instantly with no
 * AI or Supabase, is clearly a demo, and contains the full workflow with
 * intentional imperfections (blocked export, scanned/OCR-limited doc,
 * evidence gaps, commercial assumptions, unsupported/repeated claims).
 */
import { describe, it, expect, vi } from 'vitest';
import { loadWorkedSample, buildBluewaterBlueprint, sampleDocuments, SAMPLE_TENDER_ID, sampleLoopReport } from '../src/demo/bluewaterSample';
import { exportReadiness } from '../src/blueprint/exportReadiness';
import { computeScores } from '../src/blueprint/engine';

// If loading the sample ever touched AI or Supabase, these mocks would
// throw and fail the "no AI / no Supabase" tests.
vi.mock('../src/lib/ai', () => ({
  draftSection: () => { throw new Error('worked sample must not call AI'); },
  extractTenderFromDocuments: () => { throw new Error('worked sample must not call AI'); },
  analyzeAddendumViaAi: () => { throw new Error('worked sample must not call AI'); },
  sampleExtraction: {},
}));
vi.mock('../src/lib/supabase', () => ({
  getSupabase: () => { throw new Error('worked sample must not call Supabase'); },
  isDemoMode: () => true,
}));

describe('worked sample loads without AI or Supabase', () => {
  it('loads synchronously and does not throw', () => {
    const sample = loadWorkedSample();
    expect(sample.tender.id).toBe(SAMPLE_TENDER_ID);
    expect(sample.tender.name).toBe('Bluewater Junction Corridor Renewal RFT');
  });

  it('returns a fresh copy each time (reset works)', () => {
    const a = loadWorkedSample();
    const b = loadWorkedSample();
    expect(a).not.toBe(b);
    expect(a.blueprint).not.toBe(b.blueprint);
    // Mutating one must not affect the other.
    a.blueprint.modules[0].draft = 'MUTATED';
    expect(b.blueprint.modules[0].draft).not.toBe('MUTATED');
  });
});

describe('worked sample content', () => {
  const sample = loadWorkedSample();
  const bp = sample.blueprint;

  it('contains documents, blueprint, drafts, commercial, risks, reviews, closeout', () => {
    expect(sample.documents.length).toBeGreaterThan(3);
    expect(bp.requirements.length).toBeGreaterThan(0);
    expect(bp.modules.filter((m) => m.active).length).toBeGreaterThan(5);
    expect(bp.modules.some((m) => m.draft)).toBe(true);
    expect(bp.commercial.length).toBeGreaterThan(0);
    expect(bp.risks.length).toBeGreaterThan(0);
    expect(bp.reviews.length).toBeGreaterThan(0);
    expect(bp.closeout).toBeTruthy();
    expect(bp.claimRegister.length).toBeGreaterThan(0);
    expect(bp.proposalVersions.length).toBeGreaterThan(0);
  });

  it('includes at least one scanned PDF with OCR limitation messaging', () => {
    const scanned = sampleDocuments.find((d) => d.extractionStatus === 'scanned');
    expect(scanned).toBeTruthy();
    expect(scanned!.note).toMatch(/OCR is not yet available/i);
  });

  it('includes at least one evidence gap (missing evidence)', () => {
    expect(bp.evidence.some((e) => e.status === 'missing')).toBe(true);
    expect(bp.evidence.some((e) => /Assurance Lead CV/i.test(e.label))).toBe(true);
  });

  it('includes at least one commercial assumption that affects export readiness', () => {
    expect(bp.commercial.length).toBeGreaterThan(0);
    expect(bp.commercial.some((c) => c.status === 'Open')).toBe(true);
  });

  it('includes an unresolved addendum (Addendum 02) that blocks', () => {
    expect(bp.addenda.some((a) => !a.reviewed)).toBe(true);
  });

  it('includes at least one blocked export', () => {
    const scores = computeScores(bp);
    const anyBlocked = bp.exports.some((e) => {
      const r = exportReadiness(bp, e.key, e.level, scores);
      return e.level !== 'Not required' && !r.ready;
    });
    expect(anyBlocked).toBe(true);
  });

  it('flags at least one unsupported claim and one repeated claim', () => {
    expect(bp.claimRegister.some((c) => c.status === 'unsupported')).toBe(true);
    expect(bp.claimRegister.some((c) => c.repeated)).toBe(true);
  });

  it('has a proposal-checks (loop) report with blocked sections', () => {
    const report = sampleLoopReport(bp);
    expect(report.blocked.length + report.ready.length).toBeGreaterThan(0);
    expect(report.nextActions.length).toBeGreaterThan(0);
  });

  it('has a partially completed closeout with lessons', () => {
    expect(bp.closeout?.lessons).toBeTruthy();
    expect(bp.closeout?.whatSlowedUs).toMatch(/Addendum 02/i);
  });
});

describe('buildBluewaterBlueprint is deterministic in shape', () => {
  it('produces the same active-module set on repeated builds', () => {
    const a = buildBluewaterBlueprint().modules.filter((m) => m.active).map((m) => m.key).sort();
    const b = buildBluewaterBlueprint().modules.filter((m) => m.active).map((m) => m.key).sort();
    expect(a).toEqual(b);
  });
});
