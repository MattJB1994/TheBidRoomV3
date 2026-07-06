/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Calm-theme safeguards. Locks in the redesign direction: warm off-white
 * canvas, ink text, one indigo accent, a single sans font, neutralised
 * informational pills, and a primary button that uses the accent (not
 * slate-900). Parses source so the palette can't drift back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');
const css = read('../src/index.css');
const ui = read('../src/components/ui.tsx');
const dashboard = read('../src/components/blueprint/DashboardPage.tsx');

describe('calm theme tokens', () => {
  it('defines the warm canvas, ink text and single indigo accent', () => {
    expect(css).toMatch(/--color-canvas:\s*#FAFAF8/i);
    expect(css).toMatch(/--color-ink:\s*#1A1A2E/i);
    expect(css).toMatch(/--color-accent:\s*#4F46E5/i);
  });

  it('uses one sans-serif family everywhere (serif/mono aliased to Inter)', () => {
    expect(css).toMatch(/--font-serif:\s*"Inter"/);
    expect(css).toMatch(/--font-mono:\s*"Inter"/);
    // No Lora / JetBrains Mono font imports remain.
    expect(css).not.toMatch(/Lora/);
    expect(css).not.toMatch(/JetBrains\+Mono/);
  });
});

describe('calm components', () => {
  it('primary button uses the indigo accent, not slate-900', () => {
    expect(ui).toMatch(/PrimaryButton[\s\S]{0,400}bg-indigo-600/);
    expect(ui).not.toMatch(/PrimaryButton[\s\S]{0,400}bg-slate-900/);
  });

  it('informational pill tones (blue, indigo) render as neutral gray', () => {
    // In the PILL map, blue and indigo map to slate/gray backgrounds.
    expect(ui).toMatch(/indigo:\s*'bg-slate-100/);
    expect(ui).toMatch(/blue:\s*'bg-slate-100/);
  });

  it('cards use a single border (no competing border+shadow)', () => {
    // The base card has a border and rounded-2xl but no shadow-xs/sm.
    expect(ui).toMatch(/rounded-2xl/);
    expect(ui).not.toMatch(/border border-slate-200 rounded-xl shadow-xs/);
  });
});

describe('calm dashboard', () => {
  it('shows a single readiness ring (compliance ring removed from hero)', () => {
    const ringCount = (dashboard.match(/<ScoreRing/g) ?? []).length;
    expect(ringCount).toBe(1);
  });

  it('collapses all-clear stats into a single line', () => {
    expect(dashboard).toMatch(/All clear:/);
  });

  it('no longer renders the duplicate Next best actions list card', () => {
    expect(dashboard).not.toMatch(/Next best actions/);
  });
});
