/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A minimal chainable Supabase client mock. Every `.from(table)` call
 * records its method chain; awaiting the chain resolves through the
 * test's `respond` function, which inspects the recorded call to decide
 * the payload. Storage uploads/removals are recorded for assertions.
 */

export interface RecordedCall {
  table: string;
  ops: [string, any[]][];
}

export function makeSupabaseMock(respond: (call: RecordedCall) => { data?: any; error?: any }) {
  const calls: RecordedCall[] = [];
  const storageOps = { uploads: [] as { bucket: string; path: string; name?: string }[], removals: [] as { bucket: string; paths: string[] }[] };

  const from = (table: string) => {
    const call: RecordedCall = { table, ops: [] };
    calls.push(call);
    const q: any = new Proxy(() => {}, {
      get(_target, prop: string) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          const p = Promise.resolve(respond(call));
          return (p as any)[prop].bind(p);
        }
        return (...args: any[]) => {
          call.ops.push([prop, args]);
          return q;
        };
      },
    });
    return q;
  };

  const client = {
    from,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: any) => {
          storageOps.uploads.push({ bucket, path, name: file?.name });
          return { error: null };
        },
        remove: async (paths: string[]) => {
          storageOps.removals.push({ bucket, paths });
          return { error: null };
        },
      }),
    },
  };

  return { client, calls, storageOps };
}

/** Convenience: does this recorded call include the given method? */
export const hasOp = (call: RecordedCall, op: string) => call.ops.some(([name]) => name === op);
export const opArgs = (call: RecordedCall, op: string) => call.ops.find(([name]) => name === op)?.[1];
