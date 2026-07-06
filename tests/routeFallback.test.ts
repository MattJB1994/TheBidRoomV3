/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Route-fallback safeguard. Every page rendered directly in App's main
 * route switch (`currentPage === 'x'`) must be listed in
 * knownPrivatePages, otherwise it renders with the Dashboard fallback
 * underneath it (the bug that previously affected Commercial and
 * Closeout). This test parses App.tsx and fails if any route is missing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(resolve(here, '../src/App.tsx'), 'utf8');

/** Pages intentionally rendered as public/entry views, not private routes. */
const INTENTIONAL_NON_PRIVATE = new Set<string>([]);

describe('route fallback safeguard', () => {
  const routedPages = [...new Set(
    [...appSrc.matchAll(/currentPage === '([a-z-]+)'/g)].map((m) => m[1]),
  )];

  const knownBlock = appSrc.match(/knownPrivatePages = \[([\s\S]*?)\];/);
  const knownPrivatePages = knownBlock
    ? [...knownBlock[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
    : [];

  it('parses routed pages and the knownPrivatePages list', () => {
    expect(routedPages.length).toBeGreaterThan(10);
    expect(knownPrivatePages.length).toBeGreaterThan(10);
  });

  it('includes commercial and closeout (the previously-missing pages)', () => {
    expect(knownPrivatePages).toContain('commercial');
    expect(knownPrivatePages).toContain('closeout');
  });

  it('lists every routed page in knownPrivatePages (or intentionally public)', () => {
    const missing = routedPages.filter((p) => !knownPrivatePages.includes(p) && !INTENTIONAL_NON_PRIVATE.has(p));
    expect(missing, `these routed pages are missing from knownPrivatePages: ${missing.join(', ')}`).toEqual([]);
  });
});
