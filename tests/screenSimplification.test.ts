/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Screen-simplification safeguards for Draft and Review.
 *
 * Draft should present a guided flow (one primary action + a More actions
 * menu) and group AI actions under "Improve with AI" — not a wall of
 * visible buttons. Review should present plain-language "Proposal Checks".
 * These parse the source so the simplified structure can't silently
 * regress.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');
const draft = read('../src/components/blueprint/DraftsPage.tsx');
const reviews = read('../src/components/blueprint/ReviewsPage.tsx');

describe('Draft is a guided flow, not a button wall', () => {
  it('groups AI actions under "Improve with AI"', () => {
    expect(draft).toMatch(/Improve with AI/);
    expect(draft).toMatch(/IMPROVE_ACTIONS/);
  });

  it('no longer exposes the old five-button PRIMARY_ACTIONS toolbar', () => {
    expect(draft).not.toMatch(/const PRIMARY_ACTIONS/);
    expect(draft).not.toMatch(/const MORE_ACTIONS\b/);
  });

  it('collapses the proposal-wide toolbar into a guided step + More actions menu', () => {
    expect(draft).toMatch(/guidedStep/);
    expect(draft).toMatch(/More actions/);
    // The four proposal-wide actions are no longer all rendered as
    // always-visible ProposalButtons in one row.
    const proposalButtonRenders = (draft.match(/<ProposalButton/g) ?? []).length;
    expect(proposalButtonRenders).toBeLessThanOrEqual(2);
  });

  it('drives per-module primary action from state (Start / Add notes / Improve / Resolve / Send for review)', () => {
    expect(draft).toMatch(/Start section/);
    expect(draft).toMatch(/Add notes/);
    expect(draft).toMatch(/Improve section/);
    expect(draft).toMatch(/Resolve issues/);
    expect(draft).toMatch(/Send for review/);
  });
});

describe('Review presents Proposal Checks', () => {
  it('renders a Proposal Checks panel', () => {
    expect(reviews).toMatch(/Proposal Checks/);
  });

  it('includes the six plain-language checks', () => {
    for (const label of ['Requirement coverage', 'Evidence support', 'Repetition', 'Commercial consistency', 'Addendum impact', 'Human review']) {
      expect(reviews).toContain(label);
    }
  });

  it('uses Passed / Needs attention / Blocked states', () => {
    expect(reviews).toMatch(/'Passed'/);
    expect(reviews).toMatch(/'Needs attention'/);
    expect(reviews).toMatch(/'Blocked'/);
  });
});
