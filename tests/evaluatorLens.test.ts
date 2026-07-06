/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Evaluator Lens (Part 3.5) — reads a draft as an evaluator would and
 * returns a review aid (rating, findings, improvements, unsupported
 * claims, missing coverage). It is explicitly NOT an outcome prediction.
 */
import { describe, it, expect } from 'vitest';
import { evaluatorLens } from '../src/blueprint/aiService';
import { Requirement, EvidenceItem, EvidenceType } from '../src/blueprint/types';

const req = (id: string, text: string, evidenceRequired = false): Requirement => ({
  id, text, clauseRef: '', type: 'Technical', priority: 'High', mandatory: true, scored: true,
  responseRequired: true, evidenceRequired, moduleKey: 'technical-methodology', ownerId: null,
  reviewerId: null, dueDate: null, status: 'Not started', compliance: 'Not assessed', risk: 'Low', notes: '',
  sourceDocument: 'RFT.pdf',
});
const ev = (type: EvidenceType): EvidenceItem => ({
  id: `e_${type}`, label: `${type}`, detail: '', type, status: 'found',
  requirementId: null, moduleKey: 'technical-methodology', matchedFile: `${type}.pdf`,
});

describe('evaluatorLens', () => {
  it('rates a generic, unevidenced draft as Weak and flags issues', () => {
    const result = evaluatorLens(
      'We bring world-class, cutting-edge, extensive experience to every project.',
      [req('R1', 'Provide a detailed signalling methodology')],
      [],
    );
    expect(result.rating).toBe('Weak');
    expect(result.scoreEstimate).toBeLessThan(45);
    expect(result.findings.some((f) => /generic/i.test(f))).toBe(true);
    expect(result.missingRequirements.length).toBeGreaterThan(0);
  });

  it('rates a specific, requirement-answering, evidenced draft more highly', () => {
    const result = evaluatorLens(
      'Our signalling methodology follows a 4-stage delivery approach with 12 hold points, referencing project sheet PS-014.',
      [req('R1', 'Provide a signalling methodology', true)],
      [ev('Methodology'), ev('Case study')],
    );
    expect(['Adequate', 'Strong']).toContain(result.rating);
    expect(result.scoreEstimate).toBeGreaterThan(45);
  });

  it('surfaces unsupported claims through the lens', () => {
    const result = evaluatorLens('We have a proven track record on similar projects.', [], []);
    expect(result.unsupportedClaims.length).toBeGreaterThan(0);
  });

  it('never returns a score above 100 or below 0', () => {
    const empty = evaluatorLens('', [], []);
    expect(empty.scoreEstimate).toBe(0);
    const packed = evaluatorLens('Specific detail with 5 numbers 1 2 3 4 referencing PS-1.', [req('R1', 'x')], [ev('Case study'), ev('CV'), ev('Program')]);
    expect(packed.scoreEstimate).toBeLessThanOrEqual(100);
  });
});
