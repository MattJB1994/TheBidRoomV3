/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Second worked sample (Riverside, Won) + populated Client & Sector
 * Memory. Loads with no AI / no Supabase, is a finished won tender, and
 * together with Bluewater gives the memory layer real data to group.
 */
import { describe, it, expect, vi } from 'vitest';
import { loadRiversideSample, RIVERSIDE_TENDER_ID } from '../src/demo/riversideSample';
import { loadAllSamples } from '../src/demo/sampleRegistry';
import { buildMemory, BlueprintWithContext } from '../src/blueprint/clientMemory';

vi.mock('../src/lib/ai', () => ({
  draftSection: () => { throw new Error('sample must not call AI'); },
  extractTenderFromDocuments: () => { throw new Error('sample must not call AI'); },
  analyzeAddendumViaAi: () => { throw new Error('sample must not call AI'); },
  sampleExtraction: {},
}));
vi.mock('../src/lib/supabase', () => ({
  getSupabase: () => { throw new Error('sample must not call Supabase'); },
  isDemoMode: () => true,
}));

describe('Riverside worked sample (Won)', () => {
  const s = loadRiversideSample();
  const bp = s.blueprint;

  it('loads without AI or Supabase and is the Riverside tender', () => {
    expect(s.tender.id).toBe(RIVERSIDE_TENDER_ID);
    expect(s.tender.name).toMatch(/Riverside/);
  });

  it('is a finished, won tender: drafts approved, reviews approved, closeout Won', () => {
    const active = bp.modules.filter((m) => m.active);
    expect(active.every((m) => m.draftStatus === 'Approved')).toBe(true);
    expect(bp.reviews.every((r) => r.status === 'Approved')).toBe(true);
    expect(bp.closeout?.outcome).toBe('Won');
    expect(bp.closeout?.reusablePatterns).toBeTruthy();
    expect(bp.closeout?.clientFeedback).toBeTruthy();
  });

  it('has no missing evidence or open commercial (it was submitted)', () => {
    expect(bp.evidence.some((e) => e.status === 'missing')).toBe(false);
    expect(bp.commercial.every((c) => c.status === 'Approved')).toBe(true);
  });
});

describe('sample registry loads both samples', () => {
  it('returns Bluewater and Riverside as fresh copies', () => {
    const all = loadAllSamples();
    expect(all.length).toBe(2);
    const ids = all.map((s) => s.tender.id);
    expect(ids).toContain('demo-bluewater');
    expect(ids).toContain(RIVERSIDE_TENDER_ID);
    // Fresh copies each call.
    const again = loadAllSamples();
    expect(again[0].blueprint).not.toBe(all[0].blueprint);
  });
});

describe('Client & Sector Memory is populated by the samples', () => {
  it('groups the two samples by tender type (both RFT) with a real count', () => {
    const all = loadAllSamples();
    const context: BlueprintWithContext[] = all.map((s) => ({
      bp: s.blueprint, client: s.tender.client,
      sector: s.blueprint.meta?.sector ?? 'Unspecified',
      tenderType: 'RFT',
    }));
    const byType = buildMemory(context, 'tenderType');
    expect(byType.length).toBe(1);
    expect(byType[0].tenderCount).toBe(2);
    expect(byType[0].commonModules.length).toBeGreaterThan(0);
  });

  it('groups by client with one tender each (distinct clients)', () => {
    const all = loadAllSamples();
    const context: BlueprintWithContext[] = all.map((s) => ({
      bp: s.blueprint, client: s.tender.client, sector: 'x', tenderType: 'RFT',
    }));
    const byClient = buildMemory(context, 'client');
    expect(byClient.length).toBe(2);
  });
});
