/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * /api/ai rate-limiting (Part 12) — with a valid token and a working
 * backend the request proceeds; when the rate-limit lookup FAILS, the
 * endpoint fails closed in production (503 "usage check failed") rather
 * than silently allowing unmetered spend; and an over-limit request is
 * rejected with 429.
 *
 * We mock @supabase/supabase-js so getAuthedUserId sees a valid user and
 * the ai_requests count query returns whatever the scenario needs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const scenario = vi.hoisted(() => ({
  countResult: { count: 0, error: null as any },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (_table: string) => {
      const builder: any = {
        select: () => builder,
        gte: () => Promise.resolve(scenario.countResult),
        insert: async () => ({ error: null }),
        delete: () => ({ lt: () => ({ then: (r: any) => r({ error: null }) }) }),
      };
      return builder;
    },
  }),
}));

function fakeRes() {
  const r: any = { statusCode: 0, body: null, headers: {} as Record<string, string> };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; return r; };
  r.end = () => r;
  return r;
}
const req = (over: any = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer valid-token' },
  body: {},
  ...over,
});

let handler: (req: any, res: any) => Promise<any>;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('AI_API_KEY', 'test-key');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VITE_DEMO_MODE', '');
  scenario.countResult = { count: 0, error: null };
  handler = (await import('../api/ai')).default as any;
});

afterEach(() => vi.unstubAllEnvs());

describe('/api/ai rate limiting', () => {
  it('rejects an over-limit request with 429', async () => {
    scenario.countResult = { count: 999, error: null };
    const res = fakeRes();
    await handler(req({ body: { task: 'draft', requirement: 'Write something' } }), res);
    expect(res.statusCode).toBe(429);
  });

  it('fails CLOSED with 503 when the rate-limit lookup errors in production', async () => {
    scenario.countResult = { count: null, error: { message: 'db exploded' } };
    const res = fakeRes();
    await handler(req({ body: { task: 'draft', requirement: 'Write something' } }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/usage check failed/i);
    // The raw DB error is never leaked to the client.
    expect(JSON.stringify(res.body)).not.toMatch(/exploded/);
  });

  it('allows a valid authenticated request under the limit', async () => {
    scenario.countResult = { count: 1, error: null };
    // Stub the provider call so a passing rate-limit check reaches a
    // controlled response instead of a real network request.
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'A drafted paragraph.' } }] }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const res = fakeRes();
    await handler(req({ body: { task: 'draft', requirement: 'Write something' } }), res);
    expect(res.statusCode).toBe(200);
    // The rate-limit check passed and the request reached the provider.
    expect(fetchMock).toHaveBeenCalled();
    // Never leak the key itself.
    expect(JSON.stringify(res.body)).not.toContain('test-key');
  });
});
