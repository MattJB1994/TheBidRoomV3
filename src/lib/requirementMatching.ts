/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Turns a freshly imported tender's extracted metadata into a real set
 * of Opportunity InfoRequest items — matched against the standing
 * knowledge-base library, with unmatched or insufficient items marked
 * as gaps to actively request. This is what makes "the tender shapes
 * what's needed" work for a NEW import, not just the seeded demo tender.
 *
 * The matching is deterministic keyword/category scoring, not a model
 * call — documented as such so it's clear what it can and can't do. It's
 * a reasonable stand-in for a real semantic-matching pass: same shape of
 * output (matched / requested / gap), same UI, swappable later for an
 * actual embedding-similarity or LLM-based matcher without touching the
 * Opportunity page at all.
 */
import type { ExtractedTenderMetadata, KBFile, InfoRequest, PersonnelProfile, Clarification } from '../types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'is', 'are', 'be', 'this', 'that', 'as', 'per', 'will', 'must', 'shall', 'provide', 'evidence',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[_.]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let score = 0;
  a.forEach((w) => { if (b.has(w)) score++; });
  return score;
}

/** Finds the best-scoring, not-yet-used file in `pool` for `text`. */
function bestMatch(text: string, pool: KBFile[], used: Set<string>): { file: KBFile; score: number } | null {
  const textTokens = tokenize(text);
  let best: { file: KBFile; score: number } | null = null;
  for (const f of pool) {
    if (used.has(f.id)) continue;
    const score = overlapScore(textTokens, tokenize(f.name));
    if (!best || score > best.score) best = { file: f, score };
  }
  return best;
}

function classifyMandatoryRequirement(text: string): 'EVIDENCE' | 'COMMERCIAL' {
  const t = text.toLowerCase();
  if (/(audit|financial statement|cash flow|balance sheet|solvency|bank guarantee|turnover)/.test(t)) return 'COMMERCIAL';
  return 'EVIDENCE';
}

let counter = 0;
const nextId = () => `ir_gen_${Date.now()}_${counter++}`;

/**
 * Builds InfoRequest items for a freshly imported tender by matching its
 * extracted requirements against the standing KB library. Pure function:
 * takes the current library + team, returns a new list — the caller
 * (App.tsx) decides how to merge it with any existing requests.
 */
export function generateInfoRequests(
  extracted: ExtractedTenderMetadata,
  kbFiles: KBFile[],
  personnel: PersonnelProfile[] = [],
): InfoRequest[] {
  const used = new Set<string>();
  const results: InfoRequest[] = [];

  const byCategory = (cats: KBFile['category'][]) => kbFiles.filter((f) => cats.includes(f.category));

  // 1. Mandatory requirements → EVIDENCE or COMMERCIAL
  extracted.mandatoryRequirements.forEach((req) => {
    const category = classifyMandatoryRequirement(req);
    const pool = category === 'COMMERCIAL' ? byCategory(['BENCHMARK', 'CREDENTIAL']) : byCategory(['PROJECT_EVIDENCE', 'CAPABILITY']);
    const match = bestMatch(req, pool, used);
    if (match && match.score > 0) {
      used.add(match.file.id);
      results.push({
        id: nextId(), label: req, detail: `Extracted from the imported tender's requirements.`,
        category, status: match.file.isStale ? 'REQUESTED' : 'MATCHED', matchedFile: match.file.name,
      });
    } else if (pool.length > 0) {
      // Files of the right category exist, but none scored a keyword
      // match — flagged for a human to confirm rather than guessed.
      results.push({
        id: nextId(), label: req, detail: `No confident match in the library — please confirm or attach the right evidence.`,
        category, status: 'REQUESTED',
      });
    } else {
      results.push({
        id: nextId(), label: req, detail: `No ${category === 'COMMERCIAL' ? 'commercial/financial' : 'project evidence or capability'} files in the library for this yet.`,
        category, status: 'GAP',
      });
    }
  });

  // 2. Mandatory insurances → CREDENTIAL
  extracted.mandatoryInsurances.forEach((ins) => {
    const pool = byCategory(['CREDENTIAL']);
    const match = bestMatch(ins, pool, used);
    if (match && match.score > 0) {
      used.add(match.file.id);
      results.push({ id: nextId(), label: ins, detail: 'Mandatory insurance requirement from the tender.', category: 'CREDENTIAL', status: match.file.isStale ? 'REQUESTED' : 'MATCHED', matchedFile: match.file.name });
    } else {
      results.push({ id: nextId(), label: ins, detail: 'No current certificate of currency on file — request from broker/insurer.', category: 'CREDENTIAL', status: pool.length ? 'REQUESTED' : 'GAP' });
    }
  });

  // 3. Required policies → POLICY
  extracted.requiredPolicies.forEach((pol) => {
    const pool = byCategory(['POLICY']);
    const match = bestMatch(pol, pool, used);
    if (match && match.score > 0) {
      used.add(match.file.id);
      results.push({ id: nextId(), label: pol, detail: 'Mandatory policy requirement from the tender.', category: 'POLICY', status: match.file.isStale ? 'REQUESTED' : 'MATCHED', matchedFile: match.file.name });
    } else {
      results.push({ id: nextId(), label: pol, detail: 'No matching policy document in the library yet.', category: 'POLICY', status: pool.length ? 'REQUESTED' : 'GAP' });
    }
  });

  // 4. Required CVs → CV, matched against CV-category KB files, with a
  // tailoring note pointing at what the tender emphasises for personnel.
  const cvPool = byCategory(['CV']);
  const personnelNote = extracted.evaluationCriteria.find((c) => /personnel|resource|key.*staff|cv/i.test(c))
    || 'Tailor to the tender\u2019s stated evaluation weighting for key personnel.';
  for (let i = 0; i < extracted.requiredCVsCount; i++) {
    const ordinal = extracted.requiredCVsCount > 1 ? ` #${i + 1}` : '';
    const nextFile = cvPool.find((f) => !used.has(f.id));
    if (nextFile) {
      used.add(nextFile.id);
      const person = personnel.find((p) => p.cvFile === nextFile.name);
      results.push({
        id: nextId(), label: `Key personnel CV${ordinal}`, detail: `Tender §Key Personnel — nominate and evidence a suitable lead.`,
        category: 'CV', status: 'MATCHED', matchedFile: nextFile.name,
        tailoringNote: person ? `${personnelNote} (currently mapped to ${person.headline}.)` : personnelNote,
      });
    } else {
      results.push({
        id: nextId(), label: `Key personnel CV${ordinal}`, detail: `Tender §Key Personnel — no unassigned CV left in the library.`,
        category: 'CV', status: 'GAP', tailoringNote: personnelNote,
      });
    }
  }

  return results;
}

let clarCounter = 0;
const nextClarId = () => `clar_gen_${Date.now()}_${clarCounter++}`;

/**
 * Surfaces recommended clarifications by scanning the extracted metadata
 * for the kinds of ambiguity that actually cost bid teams time: dollar
 * figures without an occurrence/aggregate basis, evaluation weightings
 * that don't sum to 100, page limits that don't say what they cover, and
 * addenda that need confirming. Each check is a plain, explainable rule
 * — not a model call — so it's obvious why a given question was raised.
 * The user can also always raise their own from the Opportunity page.
 */
export function generateRecommendedClarifications(extracted: ExtractedTenderMetadata): Clarification[] {
  const out: Clarification[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const add = (question: string, rationale: string) => {
    out.push({ id: nextClarId(), question, rationale, source: 'RECOMMENDED', status: 'DRAFT', raisedBy: 'The Bid Room', date: today });
  };

  // 1. Insurance figures without a stated basis (per-occurrence vs aggregate)
  extracted.mandatoryInsurances.forEach((ins) => {
    const hasFigure = /\$[\d,]+/.test(ins);
    const hasBasis = /(per occurrence|aggregate|per claim|per event)/i.test(ins);
    if (hasFigure && !hasBasis) {
      add(
        `Is the amount in "${ins}" per-occurrence or in aggregate?`,
        'Insurance wording states a figure without specifying the basis — this materially changes the required cover.',
      );
    }
  });

  // 2. Evaluation criteria weightings that don't sum to ~100%
  const weights = extracted.evaluationCriteria
    .map((c) => c.match(/(\d+(?:\.\d+)?)\s*%/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => parseFloat(m[1]));
  if (weights.length > 0) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.5) {
      add(
        `The stated evaluation weightings sum to ${sum}%, not 100% — please confirm the correct split.`,
        'Evaluation criteria percentages extracted from the tender do not add up to 100.',
      );
    }
  }

  // 3. Page/word limits that don't specify what they cover
  if (extracted.pageLimits && !/pricing|commercial|technical only|excluding/i.test(extracted.pageLimits)) {
    add(
      `Does the stated page limit ("${extracted.pageLimits}") include the commercial/pricing schedules, or technical content only?`,
      'Page-limit wording does not specify scope, and commercial schedules are often bundled separately.',
    );
  }

  // 4. Addenda issued — confirm they're reflected in the closing date/scope
  if (extracted.addendaCount > 0) {
    add(
      `Please confirm all ${extracted.addendaCount} addend${extracted.addendaCount === 1 ? 'um has' : 'a have'} been received and are reflected in the current closing date and scope.`,
      'The tender references addenda; missing one is a common cause of non-compliance.',
    );
  }

  // 5. Vague comparability language in mandatory requirements
  extracted.mandatoryRequirements.forEach((req) => {
    if (/\b(similar|comparable|equivalent)\b/i.test(req)) {
      add(
        `What criteria define "similar/comparable/equivalent" for: "${req}"?`,
        'The requirement uses comparability language without defining the threshold, which is open to interpretation at evaluation.',
      );
    }
  });

  return out;
}
