/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unsupported-claims detection (Part 8) — the compliance-control check
 * flags claims a draft makes without matching linked evidence, and stays
 * quiet when the evidence is present.
 */
import { describe, it, expect } from 'vitest';
import { detectUnsupportedClaims } from '../src/blueprint/aiService';
import { EvidenceItem, EvidenceType } from '../src/blueprint/types';

const ev = (type: EvidenceType, status: EvidenceItem['status'] = 'found'): EvidenceItem => ({
  id: `e_${type}`, label: `${type} item`, detail: '', type, status,
  requirementId: null, moduleKey: null, matchedFile: status === 'found' ? `${type}.pdf` : null,
});

describe('detectUnsupportedClaims', () => {
  it('flags an experience claim with no case study or project sheet', () => {
    const findings = detectUnsupportedClaims('We have a proven track record on similar projects.', []);
    expect(findings.some((f) => /case study or project sheet/i.test(f))).toBe(true);
  });

  it('stays quiet when the experience claim IS backed by a case study', () => {
    const findings = detectUnsupportedClaims('We have a proven track record on similar projects.', [ev('Case study')]);
    expect(findings.some((f) => /case study/i.test(f))).toBe(false);
  });

  it('flags an accreditation claim with no certificate', () => {
    const findings = detectUnsupportedClaims('Our systems are certified to the relevant standard.', []);
    expect(findings.some((f) => /accreditation/i.test(f))).toBe(true);
  });

  it('flags a personnel availability claim with no CV', () => {
    const findings = detectUnsupportedClaims('Our nominated key personnel will be led by a chartered engineer.', []);
    expect(findings.some((f) => /CV/i.test(f))).toBe(true);
  });

  it('does not flag personnel claims when a CV is linked', () => {
    const findings = detectUnsupportedClaims('Our nominated key personnel are available.', [ev('CV')]);
    expect(findings.some((f) => /CV/.test(f))).toBe(false);
  });

  it('flags an insurance claim with no certificate of currency', () => {
    const findings = detectUnsupportedClaims('We carry professional indemnity cover.', []);
    expect(findings.some((f) => /certificate of currency/i.test(f))).toBe(true);
  });

  it('always flags absolute-compliance wording for reviewer attention', () => {
    const findings = detectUnsupportedClaims('Our response is fully compliant with no departures.', [ev('Case study'), ev('CV')]);
    expect(findings.some((f) => /Absolute compliance claim/i.test(f))).toBe(true);
  });

  it('returns nothing for a plain, evidenced draft', () => {
    const findings = detectUnsupportedClaims('We will deliver the works to the required standard.', []);
    expect(findings).toEqual([]);
  });
});
