/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Blueprint persistence tests against a mocked Supabase client:
 * whole-blueprint save writes every child table with the org id,
 * load reassembles the aggregate, and a concurrent server-side update
 * is detected and refused instead of silently overwritten.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock, RecordedCall, hasOp, opArgs } from './helpers/mockSupabase';

const state = vi.hoisted(() => ({
  respond: (_call: any): any => ({ data: null, error: null }),
}));

vi.mock('../src/lib/supabase', () => ({
  getSupabase: () => mock.client,
  isDemoMode: () => false,
  isSupabaseConfigured: () => true,
  authHeaders: async () => ({}),
}));

let mock = makeSupabaseMock((c) => state.respond(c));

import * as db from '../src/lib/db';
import { generateBlueprint } from '../src/blueprint/engine';
import { ExtractedTenderMetadata, Tender, TenderStatus } from '../src/types';

const tender: Tender = {
  id: 'tender-abc', name: 'T', number: 'N', client: 'C', closingDate: '2099-01-01', portal: 'P',
  status: TenderStatus.Drafting, estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};
const extracted: ExtractedTenderMetadata = {
  client: 'C', tenderName: 'T', tenderNumber: 'N', closingDate: '2099-01-01', submissionPortal: 'P',
  mandatoryRequirements: ['Provide safety methodology'], evaluationCriteria: [], requiredSchedules: [],
  pageLimits: '', wordLimits: '', attachmentsCount: 0, pricingFormsCount: 0,
  requiredCVsCount: 0, requiredProjectExamplesCount: 0, mandatoryInsurances: [], requiredPolicies: [], addendaCount: 0,
};
const bp = () => generateBlueprint({
  tender, extracted, kbFiles: [], personnel: [],
  team: [{ id: 'u1', name: 'BM', email: 'b@x.com', role: 'BID_MANAGER' }],
  documentNames: ['RFT.pdf'],
});

const CHILD_TABLES = [
  'blueprint_requirements', 'blueprint_modules', 'blueprint_evidence',
  'blueprint_reviews', 'blueprint_risks', 'blueprint_addenda', 'blueprint_exports',
];

beforeEach(() => {
  mock = makeSupabaseMock((c) => state.respond(c));
});

describe('saveBlueprint', () => {
  it('upserts the core row and replaces every child table with org-scoped rows', async () => {
    state.respond = (call: RecordedCall) => {
      if (call.table === 'blueprints' && hasOp(call, 'select')) return { data: null, error: null }; // no server row yet
      return { data: null, error: null };
    };

    await db.saveBlueprint('org-9', bp());

    const upsert = mock.calls.find((c) => c.table === 'blueprints' && hasOp(c, 'upsert'));
    expect(upsert).toBeTruthy();
    expect(opArgs(upsert!, 'upsert')![0].org_id).toBe('org-9');
    expect(opArgs(upsert!, 'upsert')![0].tender_id).toBe('tender-abc');

    for (const table of CHILD_TABLES) {
      const del = mock.calls.find((c) => c.table === table && hasOp(c, 'delete'));
      expect(del, `${table} should be cleared`).toBeTruthy();
      const ins = mock.calls.find((c) => c.table === table && hasOp(c, 'insert'));
      if (ins) {
        const rows = opArgs(ins, 'insert')![0] as any[];
        rows.forEach((r) => {
          expect(r.org_id).toBe('org-9');
          expect(r.tender_id).toBe('tender-abc');
          expect(r.data).toBeTruthy(); // the full typed entity rides in jsonb
        });
      }
    }
  });

  it('refuses to overwrite a blueprint someone else saved since we loaded it', async () => {
    // 1. Load with server updated_at = T1 → baseline recorded.
    state.respond = (call: RecordedCall) => {
      if (call.table === 'blueprints') {
        return { data: [{ tender_id: 'tender-abc', updated_at: 'T1', summary: '', submission_type: 'RFT', page_limits: '', word_limits: '', addenda_count: 0, generated_at: 'g', inputs: {}, meta: {} }], error: null };
      }
      return { data: [], error: null };
    };
    await db.loadBlueprints('org-9');

    // 2. Server has moved to T2 (a teammate saved) → our save must throw.
    state.respond = (call: RecordedCall) => {
      if (call.table === 'blueprints' && hasOp(call, 'maybeSingle')) return { data: { updated_at: 'T2' }, error: null };
      return { data: null, error: null };
    };
    const mine = { ...bp(), tenderId: 'tender-abc' };
    await expect(db.saveBlueprint('org-9', mine)).rejects.toBeInstanceOf(db.BlueprintConflictError);

    // 3. And no destructive child-table writes happened before the refusal.
    for (const table of CHILD_TABLES) {
      expect(mock.calls.some((c) => c.table === table && hasOp(c, 'delete'))).toBe(false);
    }
  });
});

describe('loadBlueprints', () => {
  it('reassembles the aggregate from the core row and child tables', async () => {
    state.respond = (call: RecordedCall) => {
      if (call.table === 'blueprints') {
        return {
          data: [{
            tender_id: 'tender-abc', updated_at: 'T5', generated_at: 'g', summary: 'S',
            submission_type: 'RFT', page_limits: '30', word_limits: '', addenda_count: 1,
            returnables: ['Sched A'], evaluation_criteria: [], required_templates: [],
            required_accreditations: [], required_insurances: [], inputs: { winThemes: ['theme'] }, meta: { sector: 'Rail' },
          }],
          error: null,
        };
      }
      if (call.table === 'blueprint_requirements') {
        return { data: [{ tender_id: 'tender-abc', data: { id: 'REQ-001', text: 'req', mandatory: true } }], error: null };
      }
      return { data: [], error: null };
    };

    const out = await db.loadBlueprints('org-9');
    const loaded = out['tender-abc'];
    expect(loaded.summary).toBe('S');
    expect(loaded.returnables).toEqual(['Sched A']);
    expect(loaded.requirements[0].id).toBe('REQ-001');
    expect(loaded.inputs.winThemes).toEqual(['theme']);
    expect(loaded.meta.sector).toBe('Rail');
  });
});
