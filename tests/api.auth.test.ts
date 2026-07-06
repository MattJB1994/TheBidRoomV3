/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * /api/ai auth tests — the endpoint fails CLOSED: without a valid
 * bearer token every task is refused, including status, and no
 * provider call can be reached.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

function fakeRes() {
  const r: any = { statusCode: 0, body: null, headers: {} as Record<string, string> };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; return r; };
  r.end = () => r;
  return r;
}

const req = (over: any = {}) => ({ method: 'POST', headers: {}, body: {}, ...over });

let handler: (req: any, res: any) => Promise<any>;

beforeAll(async () => {
  // A key IS configured — auth must still be the wall.
  vi.stubEnv('AI_API_KEY', 'test-key');
  // No Supabase env → getAuthedUserId can never verify a token, so
  // every request is unauthenticated. Fail closed means 401, not
  // "proceed anyway".
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_URL', '');
  handler = (await import('../api/ai')).default as any;
});

describe('/api/ai fails closed', () => {
  it('rejects non-POST', async () => {
    const res = fakeRes();
    await handler(req({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects an unauthenticated draft request with 401 (never reaches the provider)', async () => {
    const res = fakeRes();
    await handler(req({ body: { task: 'draft', requirement: 'Write something' } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/);
  });

  it('rejects an unauthenticated extract request with 401', async () => {
    const res = fakeRes();
    await handler(req({ body: { task: 'extract', documents: [{ name: 'x.pdf', text: 'text' }] } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('even the status task requires auth (no anonymous configuration probing)', async () => {
    const res = fakeRes();
    await handler(req({ body: { task: 'status' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('a malformed bearer token is still 401', async () => {
    const res = fakeRes();
    await handler(req({ headers: { authorization: 'Bearer not-a-real-token' }, body: { task: 'draft', requirement: 'x' } }), res);
    expect(res.statusCode).toBe(401);
  });
});
