/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Knowledge Base / evidence upload tests: addKbFile validates type and
 * size before uploading, uses a sanitised slug for the Storage path,
 * preserves the original display name in the row, and cleans up the
 * Storage object if the row insert fails.
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
import { MAX_UPLOAD_BYTES } from '../src/lib/uploadValidation';

function fileOfSize(name: string, bytes: number, type = ''): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

beforeEach(() => {
  mock = makeSupabaseMock((c) => state.respond(c));
});

describe('addKbFile', () => {
  it('uploads under a sanitised path and preserves the original display name', async () => {
    state.respond = (call: RecordedCall) => {
      if (call.table === 'kb_files' && hasOp(call, 'insert')) {
        return { data: { ...opArgs(call, 'insert')![0], uploader: { full_name: 'Test' } }, error: null };
      }
      return { data: null, error: null };
    };

    const file = new File(['cv content'], 'Jane Doe CV (Final #2).PDF', { type: 'application/pdf' });
    const saved = await db.addKbFile('org-9', 'user-1', file, 'CV');

    // Storage path uses the sanitised slug.
    expect(mock.storageOps.uploads).toHaveLength(1);
    const up = mock.storageOps.uploads[0];
    expect(up.bucket).toBe('kb-files');
    expect(up.path).toMatch(/^org-9\/[0-9a-f-]{36}\/jane-doe-cv-final-2\.pdf$/);

    // The row keeps the ORIGINAL display name.
    const insert = mock.calls.find((c) => c.table === 'kb_files' && hasOp(c, 'insert'))!;
    const row = opArgs(insert, 'insert')![0];
    expect(row.name).toBe('Jane Doe CV (Final #2).PDF');
    expect(row.storage_path).toMatch(/jane-doe-cv-final-2\.pdf$/);
    expect(saved.name).toBe('Jane Doe CV (Final #2).PDF');
  });

  it('rejects an unsupported file type and never uploads', async () => {
    await expect(
      db.addKbFile('org-9', 'user-1', fileOfSize('archive.zip', 1024), 'CAPABILITY'),
    ).rejects.toThrow(/unsupported file type/i);
    expect(mock.storageOps.uploads).toHaveLength(0);
  });

  it('rejects an oversized file and never uploads', async () => {
    await expect(
      db.addKbFile('org-9', 'user-1', fileOfSize('huge.pdf', MAX_UPLOAD_BYTES + 1), 'CAPABILITY'),
    ).rejects.toThrow(/too large/i);
    expect(mock.storageOps.uploads).toHaveLength(0);
  });

  it('removes the uploaded storage object when the row insert fails', async () => {
    state.respond = (call: RecordedCall) => {
      if (call.table === 'kb_files') return { data: null, error: { message: 'insert denied' } };
      return { data: null, error: null };
    };
    await expect(
      db.addKbFile('org-9', 'user-1', new File(['x'], 'policy.pdf'), 'POLICY'),
    ).rejects.toThrow(/insert denied/);
    expect(mock.storageOps.removals).toHaveLength(1);
    expect(mock.storageOps.removals[0].paths[0]).toMatch(/^org-9\//);
  });
});
