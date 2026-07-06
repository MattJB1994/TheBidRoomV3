/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tender document persistence tests: storage paths derive the org from
 * the AUTHENTICATED profile (never caller input), extraction results
 * are stored (capped), and a failed insert cleans up its storage object.
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

const profileRow = { id: 'user-1', org_id: 'org-9', role: 'OWNER', full_name: 'Test', email: 't@x.com' };

beforeEach(() => {
  mock = makeSupabaseMock((c) => state.respond(c));
});

describe('addTenderDocument', () => {
  it('uploads under {org}/{tender}/{doc}/{name} with org derived from the authenticated profile', async () => {
    state.respond = (call: RecordedCall) => {
      if (call.table === 'profiles') return { data: profileRow, error: null };
      if (call.table === 'tender_documents' && hasOp(call, 'insert')) {
        return { data: { ...opArgs(call, 'insert')![0], uploaded_at: '2026-07-04T00:00:00Z' }, error: null };
      }
      return { data: null, error: null };
    };

    const file = new File(['clause text'], 'Addendum_01.pdf', { type: 'application/pdf' });
    const saved = await db.addTenderDocument('tender-abc', file, 'Addendum', { text: 'clause text', status: 'extracted' });

    expect(mock.storageOps.uploads).toHaveLength(1);
    const up = mock.storageOps.uploads[0];
    expect(up.bucket).toBe('tender-documents');
    // First path segment MUST be the profile's org — the caller passed
    // only the tender id and could not influence it.
    // Storage path uses the SANITISED filename (lowercase slug, safe
    // chars); the original display name is kept in the row.
    expect(up.path).toMatch(/^org-9\/tender-abc\/[0-9a-f-]{36}\/addendum-01\.pdf$/);

    const insert = mock.calls.find((c) => c.table === 'tender_documents' && hasOp(c, 'insert'))!;
    const row = opArgs(insert, 'insert')![0];
    expect(row.org_id).toBe('org-9');
    // Original display name is preserved even though the path is slugged.
    expect(row.name).toBe('Addendum_01.pdf');
    expect(row.extraction_status).toBe('extracted');
    expect(row.extracted_text).toBe('clause text');
    expect(saved.tag).toBe('Addendum');
    expect(saved.extractionStatus).toBe('extracted');
  });

  it('caps stored extracted text — it is analysis input, not a document store', async () => {
    state.respond = (call: RecordedCall) => {
      if (call.table === 'profiles') return { data: profileRow, error: null };
      if (call.table === 'tender_documents') return { data: { ...opArgs(call, 'insert')![0], uploaded_at: '2026-07-04T00:00:00Z' }, error: null };
      return { data: null, error: null };
    };
    const huge = 'x'.repeat(60000);
    await db.addTenderDocument('tender-abc', new File(['y'], 'big.txt'), 'Other', { text: huge, status: 'extracted' });
    const insert = mock.calls.find((c) => c.table === 'tender_documents' && hasOp(c, 'insert'))!;
    expect(opArgs(insert, 'insert')![0].extracted_text.length).toBe(24000);
  });

  it('removes the uploaded storage object when the row insert fails', async () => {
    state.respond = (call: RecordedCall) => {
      if (call.table === 'profiles') return { data: profileRow, error: null };
      if (call.table === 'tender_documents') return { data: null, error: { message: 'insert denied' } };
      return { data: null, error: null };
    };
    await expect(
      db.addTenderDocument('tender-abc', new File(['z'], 'doc.pdf'), 'RFP', { text: null, status: 'scanned', note: 'scanned' }),
    ).rejects.toThrow(/insert denied/);
    expect(mock.storageOps.removals).toHaveLength(1);
    expect(mock.storageOps.removals[0].paths[0]).toMatch(/^org-9\/tender-abc\//);
  });

  it('refuses when the caller has no organisation yet', async () => {
    state.respond = (call: RecordedCall) => {
      if (call.table === 'profiles') return { data: { ...profileRow, org_id: null }, error: null };
      return { data: null, error: null };
    };
    await expect(
      db.addTenderDocument('tender-abc', new File(['z'], 'doc.pdf'), 'RFP', { text: null, status: 'pending' }),
    ).rejects.toThrow(/organisation/i);
    expect(mock.storageOps.uploads).toHaveLength(0);
  });
});

describe('loadTenderDocuments', () => {
  it('groups documents by tender with extraction fields mapped', async () => {
    state.respond = (call: RecordedCall) => {
      if (call.table === 'tender_documents') {
        return {
          data: [
            { id: 'd1', tender_id: 't1', name: 'RFT.pdf', storage_path: 'org-9/t1/d1/RFT.pdf', size_bytes: 1024, mime_type: 'application/pdf', document_tag: 'RFP', status: 'Analysed', extracted_text: 'text', extraction_status: 'extracted', extraction_note: null, uploaded_at: '2026-07-01T00:00:00Z' },
            { id: 'd2', tender_id: 't1', name: 'scan.pdf', storage_path: 'org-9/t1/d2/scan.pdf', size_bytes: 2048, mime_type: 'application/pdf', document_tag: 'Addendum', status: 'Uploaded', extracted_text: null, extraction_status: 'scanned', extraction_note: 'scanned PDF — OCR not implemented', uploaded_at: '2026-07-02T00:00:00Z' },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    };
    const out = await db.loadTenderDocuments('org-9');
    expect(out['t1']).toHaveLength(2);
    expect(out['t1'][0].extractionStatus).toBe('extracted');
    expect(out['t1'][1].extractionStatus).toBe('scanned');
    expect(out['t1'][1].extractionNote).toMatch(/OCR not implemented/);
  });
});
