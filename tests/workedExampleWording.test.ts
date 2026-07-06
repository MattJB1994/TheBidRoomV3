/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UI wording + worked-example accessibility safeguards.
 *
 *  - The product UI should call the Bluewater project a "worked example" /
 *    "example project", not "demo sample" / "demo mode".
 *  - The worked example must be reachable both from the public homepage
 *    CTA and from the dashboard even when other tenders already exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');
const app = read('../src/App.tsx');
const dashboard = read('../src/components/blueprint/DashboardPage.tsx');
const publicPages = read('../src/components/PublicPages.tsx');

describe('worked-example wording', () => {
  it('the dashboard uses "worked example" wording, not "demo sample"', () => {
    expect(dashboard).toMatch(/worked example/i);
    expect(dashboard).not.toMatch(/demo sample/i);
    expect(dashboard).not.toMatch(/load worked sample/i);
  });

  it('the reset badge says "Example project", not "Demo sample"', () => {
    expect(app).toMatch(/Example project · reset/);
    expect(app).not.toMatch(/Demo sample · reset/);
  });

  it('the public homepage CTA says "Open worked example"', () => {
    expect(publicPages).toMatch(/Open worked example/);
    expect(publicPages).not.toMatch(/Explore the worked sample/);
  });
});

describe('worked-example accessibility', () => {
  it('the public CTA calls onOpenWorkedExample (loads the sample), not just navigate', () => {
    expect(publicPages).toMatch(/onOpenWorkedExample/);
    // The hero ghost CTA wires to onOpenWorkedExample when in demo mode.
    expect(publicPages).toMatch(/onOpenWorkedExample\(\)/);
  });

  it('the dashboard exposes the worked example in the portfolio header (not only when empty)', () => {
    // The "Recent projects" header renders an Open worked example button
    // guarded only by onLoadSample, independent of tenders.length === 0.
    const portfolioIdx = dashboard.indexOf('Recent projects');
    const emptyIdx = dashboard.indexOf('tenders.length === 0');
    expect(portfolioIdx).toBeGreaterThan(-1);
    // There is an onLoadSample button after the portfolio heading.
    expect(dashboard.slice(portfolioIdx, portfolioIdx + 400)).toMatch(/onLoadSample/);
    expect(portfolioIdx).toBeGreaterThan(emptyIdx);
  });
});
