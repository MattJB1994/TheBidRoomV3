/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Module drafting service — the typed AI boundary for the Drafts page.
 * With a configured backend it calls the existing /api/ai 'draft' task
 * (same endpoint pattern, key stays server-side). In demo mode it
 * produces structured, deterministic content so every drafting action
 * works end-to-end without infrastructure.
 *
 * Inputs deliberately include everything the live pipeline needs:
 * requirements, evidence, win themes, terminology, tone and limits.
 */
import { draftSection } from '../lib/ai';
import { isDemoMode } from '../lib/supabase';
import { ProposalModule, Requirement, EvidenceItem, ProjectInputs } from './types';

export type DraftAction =
  | 'generate' | 'strengthen' | 'add-evidence' | 'more-technical' | 'more-executive'
  | 'shorten' | 'expand' | 'rewrite-for-evaluator' | 'add-case-study'
  | 'add-risks' | 'check-compliance' | 'check-source' | 'check-claims' | 'prepare-review' | 'evaluator-lens';

export const DRAFT_ACTION_LABEL: Record<DraftAction, string> = {
  'generate': 'Generate first draft',
  'strengthen': 'Strengthen answer',
  'add-evidence': 'Add evidence',
  'more-technical': 'Make more technical',
  'more-executive': 'Make more executive',
  'shorten': 'Shorten',
  'expand': 'Expand',
  'rewrite-for-evaluator': 'Rewrite for evaluator',
  'add-case-study': 'Add case study',
  'add-risks': 'Add risks & mitigations',
  'check-compliance': 'Check compliance',
  'check-source': 'Check against source',
  'check-claims': 'Check unsupported claims',
  'prepare-review': 'Prepare for review',
  'evaluator-lens': 'Evaluator Lens',
};

export interface ModuleDraftRequest {
  module: ProposalModule;
  requirements: Requirement[];       // requirements linked to this module
  evidence: EvidenceItem[];          // evidence linked to this module
  inputs: ProjectInputs;             // win themes, terminology, tone…
  tenderName: string;
  clientName: string;
  action: DraftAction;
  currentDraft: string;
  /** Pre-composed prompt from the Prompt Composer (preferred source of
      the AI instruction). When present, live drafting sends THIS rather
      than building an ad-hoc prompt — so every drafting action shares the
      same layered context (blueprint, pattern, requirements, evidence,
      notes, commercial assumptions, addenda, claim register, terminology).
      The composer is created by the caller so aiService stays free of the
      proposalRun/promptComposer import cycle. */
  composedPrompt?: string;
}

export interface ModuleDraftResult {
  content: string;                   // the new draft (markdown)
  /** For check actions: findings instead of a rewrite. */
  findings?: string[];
}

/**
 * Detects claims a draft makes that aren't backed by linked evidence —
 * the compliance-control feature that separates The Bid Room from a
 * generic AI writer. Each rule is explainable: it fires when the draft
 * uses claim language of a given kind AND no evidence of the type that
 * would substantiate it is linked to the module. Deterministic, so it
 * behaves identically in demo and live modes.
 */
export function detectUnsupportedClaims(draft: string, evidence: EvidenceItem[]): string[] {
  const text = draft.toLowerCase();
  const has = (types: EvidenceItem['type'][]) =>
    evidence.some((e) => types.includes(e.type) && (e.status === 'found' || !!e.matchedFile));
  const mentions = (...terms: string[]) => terms.some((t) => text.includes(t));

  const findings: string[] = [];
  const rule = (claimed: boolean, supported: boolean, message: string) => {
    if (claimed && !supported) findings.push(`✗ ${message}`);
  };

  rule(
    mentions('years of experience', 'proven track record', 'successfully delivered', 'extensive experience', 'similar projects', 'comparable projects'),
    has(['Case study', 'Project sheet', 'Past tender response']),
    'Experience / track-record claim with no linked case study or project sheet. Link one or soften the claim.',
  );
  rule(
    mentions('accredited', 'accreditation', 'certified to', 'certification'),
    has(['Accreditation', 'Policy']),
    'Accreditation / certification claim with no linked certificate. Attach the accreditation.',
  );
  rule(
    mentions('availability', 'our team will', 'nominated', 'key personnel', 'will be led by'),
    has(['CV']),
    'Personnel availability / nomination claim with no linked CV. Link the nominated person\u2019s CV.',
  );
  rule(
    mentions('fully compliant', 'without departure', 'no departures', 'meet all requirements', 'unconditional'),
    false,
    'Absolute compliance claim ("fully compliant" / "no departures"). Confirm no departures exist before submitting this wording.',
  );
  rule(
    mentions('delivery program', 'delivery programme', 'programme of works', 'milestones will'),
    has(['Program', 'Pricing assumption', 'Commercial note']),
    'Delivery-program claim with no linked program or stated assumptions. Attach the program or record the assumptions.',
  );
  rule(
    mentions('safety record', 'ltifr', 'zero harm', 'safety performance', 'incident-free'),
    has(['Safety document']),
    'Safety-performance claim with no linked safety record. Attach the supporting record.',
  );
  rule(
    mentions('assurance capability', 'assurance framework', 'verification and validation', 'rvtm', 'systems assurance'),
    has(['Assurance document', 'Case study', 'Accreditation']),
    'Assurance-capability claim with no linked assurance document or project example.',
  );
  rule(
    mentions('professional indemnity', 'public liability', 'certificate of currency'),
    has(['Insurance certificate']),
    'Insurance claim with no linked certificate of currency.',
  );
  return findings;
}

/**
 * Evaluator Lens — reads a draft as the client evaluator would and
 * returns a review aid (NOT a prediction of the actual tender outcome).
 * Deterministic and explainable.
 */
export interface EvaluatorLensResult {
  rating: 'Strong' | 'Adequate' | 'Weak';
  scoreEstimate: number;            // 0-100 heuristic quality score (review aid only)
  findings: string[];
  improvements: string[];
  unsupportedClaims: string[];
  missingRequirements: string[];
}

export function evaluatorLens(
  draft: string,
  requirements: Requirement[],
  evidence: EvidenceItem[],
): EvaluatorLensResult {
  const findings: string[] = [];
  const improvements: string[] = [];
  const text = draft.toLowerCase();
  const words = draft.split(/\s+/).filter(Boolean).length;

  const missing = requirements.filter((r) => {
    const terms = r.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 5).slice(0, 3);
    return terms.length > 0 && !terms.some((t) => text.includes(t));
  });
  const coverage = requirements.length ? (requirements.length - missing.length) / requirements.length : 1;
  if (missing.length) {
    findings.push(`Does not clearly address ${missing.length} of ${requirements.length} linked requirement(s).`);
    improvements.push(`Answer ${missing.map((r) => r.id).join(', ')} directly, in the client's terms.`);
  } else if (requirements.length) {
    findings.push('Addresses all linked requirements.');
  }

  const linkedEv = evidence.filter((e) => e.matchedFile || e.status === 'found');
  if (linkedEv.length === 0 && requirements.some((r) => r.evidenceRequired)) {
    findings.push('No evidence is linked where the requirement expects proof.');
    improvements.push('Link case studies, CVs, certificates or project sheets to support claims.');
  }

  const unsupportedClaims = detectUnsupportedClaims(draft, evidence).map((c) => c.replace(/^✗ /, ''));
  if (unsupportedClaims.length) improvements.push('Substantiate or soften the flagged unsupported claims.');

  const genericHits = (text.match(/world[- ]class|cutting[- ]edge|extensive experience|market[- ]leading|best[- ]in[- ]class|synerg/g) ?? []).length;
  if (genericHits) {
    findings.push(`Contains ${genericHits} generic phrase(s) an evaluator would mark down.`);
    improvements.push('Replace generic marketing language with specific, evidenced detail.');
  }

  const hasSpecifics = /\d/.test(draft) || requirements.some((r) => r.clauseRef && text.includes(r.clauseRef.toLowerCase()));
  if (!hasSpecifics && words > 40) {
    findings.push('Reads as generic — few specifics (numbers, named projects, clause references).');
    improvements.push('Add concrete figures, named projects and clause references.');
  }

  let score = Math.round(coverage * 55);
  score += Math.min(linkedEv.length, 3) * 8;
  score += hasSpecifics ? 12 : 0;
  score -= Math.min(unsupportedClaims.length, 3) * 8;
  score -= Math.min(genericHits, 3) * 5;
  if (!draft.trim()) score = 0;
  score = Math.max(0, Math.min(100, score));

  const rating: EvaluatorLensResult['rating'] = score >= 70 ? 'Strong' : score >= 45 ? 'Adequate' : 'Weak';
  if (!improvements.length) improvements.push('Strong response — a final human review for tone and win-theme reinforcement is still recommended.');

  return { rating, scoreEstimate: score, findings, improvements, unsupportedClaims, missingRequirements: missing.map((r) => `${r.id}: ${r.text.slice(0, 70)}`) };
}

const strategyBlock = (inputs: ProjectInputs): string => {
  const bits: string[] = [];
  if (inputs.winThemes.length) bits.push(`Win themes: ${inputs.winThemes.join('; ')}`);
  if (inputs.clientHotButtons.length) bits.push(`Client hot buttons: ${inputs.clientHotButtons.join('; ')}`);
  if (inputs.preferredTerminology.length) bits.push(`Use terminology: ${inputs.preferredTerminology.join(', ')}`);
  if (inputs.termsToAvoid.length) bits.push(`Avoid terms: ${inputs.termsToAvoid.join(', ')}`);
  if (inputs.proposalTone) bits.push(`Tone: ${inputs.proposalTone}`);
  return bits.join('\n');
};

export async function runDraftAction(req: ModuleDraftRequest): Promise<ModuleDraftResult> {
  const { module: mod, requirements, evidence, inputs, action, currentDraft } = req;

  if (action === 'evaluator-lens') {
    const lens = evaluatorLens(currentDraft, requirements, evidence);
    const findings = [
      `Rating: ${lens.rating} (quality estimate ${lens.scoreEstimate}/100 — review aid only, not an outcome prediction).`,
      ...lens.findings.map((f) => `• ${f}`),
      ...(lens.unsupportedClaims.length ? [`Unsupported: ${lens.unsupportedClaims.length} claim(s).`] : []),
      ...(lens.missingRequirements.length ? [`Missing coverage: ${lens.missingRequirements.join('; ')}`] : []),
      'Improvements:',
      ...lens.improvements.map((f) => `→ ${f}`),
    ];
    return { content: currentDraft, findings };
  }

  /* Check actions never rewrite — they report. Deterministic both modes. */
  if (action === 'check-compliance' || action === 'check-source') {
    const findings: string[] = [];
    const words = currentDraft.toLowerCase();
    requirements.forEach((r) => {
      const keyTerms = r.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 5).slice(0, 3);
      const covered = keyTerms.some((t) => words.includes(t));
      findings.push(`${covered ? '✓' : '✗'} ${r.id} — ${covered ? 'addressed in draft' : 'not clearly addressed'}: ${r.text.slice(0, 90)}${r.text.length > 90 ? '…' : ''}`);
    });
    if (mod.wordLimit) {
      const count = currentDraft.split(/\s+/).filter(Boolean).length;
      findings.push(`${count <= mod.wordLimit ? '✓' : '✗'} Word limit — ${count} / ${mod.wordLimit} words`);
    }
    if (!requirements.length) findings.push('No requirements are linked to this module.');
    return { content: currentDraft, findings };
  }

  /* Unsupported-claims check — the compliance-control differentiator.
     Deterministic, explainable pattern rules (documented as rules, not a
     model call): each looks for claim language in the draft that would
     need a specific evidence type, and flags it when no such evidence is
     linked to the module. */
  if (action === 'check-claims') {
    const findings = detectUnsupportedClaims(currentDraft, evidence);
    return {
      content: currentDraft,
      findings: findings.length
        ? findings
        : ['✓ No unsupported claims detected. Every checked claim type has matching linked evidence (or none was claimed).'],
    };
  }

  /* Prepare-for-review — a combined readiness read before a gate. */
  if (action === 'prepare-review') {
    const findings: string[] = [];
    const words = currentDraft.split(/\s+/).filter(Boolean).length;
    findings.push(`${currentDraft.trim() ? '✓' : '✗'} Draft present (${words} words${mod.wordLimit ? ` / ${mod.wordLimit} limit` : ''}).`);
    if (mod.wordLimit && words > mod.wordLimit) findings.push(`✗ Over the word limit by ${words - mod.wordLimit} words.`);
    const unlinked = requirements.filter((r) => {
      const keyTerms = r.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 5).slice(0, 3);
      return !keyTerms.some((t) => currentDraft.toLowerCase().includes(t));
    });
    findings.push(`${unlinked.length === 0 ? '✓' : '✗'} ${requirements.length - unlinked.length}/${requirements.length} linked requirements addressed.`);
    const claims = detectUnsupportedClaims(currentDraft, evidence);
    findings.push(`${claims.length === 0 ? '✓' : '✗'} ${claims.length} unsupported claim${claims.length === 1 ? '' : 's'} to resolve before review.`);
    const missingEv = evidence.filter((e) => e.status === 'missing').length;
    findings.push(`${missingEv === 0 ? '✓' : '✗'} ${missingEv} linked evidence gap${missingEv === 1 ? '' : 's'}.`);
    return { content: currentDraft, findings };
  }

  /* Live backend: route through the existing /api/ai draft task. Prefer
     the Prompt Composer's layered prompt (shared by every action); fall
     back to an ad-hoc prompt only if no composed prompt was supplied. */
  if (!isDemoMode()) {
    const evidenceText = evidence.filter((e) => e.matchedFile).map((e) => `- ${e.matchedFile}: ${e.label}`).join('\n');
    if (req.composedPrompt) {
      const instruction = action === 'generate'
        ? '\n\nDraft this section now.'
        : `\n\nEditing instruction: ${DRAFT_ACTION_LABEL[action]}. Current draft follows — revise it accordingly, do not start over:\n${currentDraft}`;
      const content = await draftSection(`${req.composedPrompt}${instruction}`, { evidence: evidenceText || undefined, sectionTitle: mod.name });
      return { content };
    }
    const requirementText = requirements.map((r) => `- (${r.id}) ${r.text}`).join('\n') || mod.name;
    const instruction = action === 'generate' ? '' : `\n\nEditing instruction: ${DRAFT_ACTION_LABEL[action]}. Current draft follows — revise it accordingly, do not start over:\n${currentDraft}`;
    const content = await draftSection(
      `${requirementText}\n\n${strategyBlock(inputs)}${mod.wordLimit ? `\nKeep under ${mod.wordLimit} words.` : ''}${instruction}`,
      { evidence: evidenceText || undefined, sectionTitle: mod.name },
    );
    return { content };
  }

  /* Demo mode: deterministic transforms so every button visibly works. */
  await new Promise((r) => setTimeout(r, 900));
  const evidenceLines = evidence.filter((e) => e.matchedFile).map((e) => `- **${e.matchedFile}** — ${e.type.toLowerCase()} supporting: ${e.label}`);
  const themes = inputs.winThemes.length ? inputs.winThemes : ['Proven delivery on the client\u2019s own network', 'Assured, low-risk methodology'];

  switch (action) {
    case 'generate': {
      const reqBullets = requirements.slice(0, 5).map((r) => `- ${r.text}`).join('\n') || '- (No linked requirements — add some from the Requirements register.)';
      return {
        content: `## ${mod.name}\n\n${req.clientName} requires confidence that ${req.tenderName.toLowerCase().includes('assurance') ? 'the assurance package will be delivered without programme risk' : 'this scope will be delivered safely, on programme and to standard'}. Our response is built around ${themes[0].toLowerCase()}.\n\n### What the tender asks for\n${reqBullets}\n\n### Our response\nWe will meet each requirement through our established delivery framework, evidenced below rather than asserted. ${themes.map((t) => t.endsWith('.') ? t : t + '.').join(' ')}\n\n${evidenceLines.length ? `### Supporting evidence\n${evidenceLines.join('\n')}` : '### Supporting evidence\n*No matched evidence yet — resolve the gaps on the Evidence page and re-run “Add evidence”.*'}\n\n*(Demo model output — connect AI_API_KEY for live drafting.)*`,
      };
    }
    case 'strengthen':
      return { content: currentDraft + `\n\n> **Strengthened:** Each claim above is verifiable — referees, registration numbers and certificate IDs are available on request, and delivery metrics are drawn from audited project close-out reports.` };
    case 'add-evidence':
      return { content: currentDraft + (evidenceLines.length ? `\n\n### Evidence appended\n${evidenceLines.join('\n')}` : `\n\n*No matched evidence to append — resolve gaps on the Evidence page first.*`) };
    case 'more-technical':
      return { content: currentDraft + `\n\n### Technical basis\nDelivery follows our certified management system: staged verification against the client\u2019s framework, requirements traceability maintained in the RVTM, and independent competency checks for all nominated personnel.` };
    case 'more-executive':
      return { content: `**In one page:** we are the low-risk choice — recent, directly comparable delivery, a named team the client already knows, and an assured methodology mapped to the client\u2019s own framework.\n\n${currentDraft}` };
    case 'shorten': {
      const paras = currentDraft.split('\n\n');
      return { content: paras.slice(0, Math.max(2, Math.ceil(paras.length / 2))).join('\n\n') };
    }
    case 'expand':
      return { content: currentDraft + `\n\n### Delivery detail\nMobilisation begins within five working days of award. Week one establishes the requirements baseline and interfaces register; verification evidence is produced progressively so the client sees assurance artefacts from the first reporting period, not at the end.` };
    case 'rewrite-for-evaluator':
      return { content: `*(Restructured so each evaluation criterion can be scored directly.)*\n\n${currentDraft.replace(/### /g, '### [Scored] ')}` };
    case 'add-case-study':
      return { content: currentDraft + `\n\n### Case study — ${evidence.find((e) => e.type === 'Case study' && e.matchedFile)?.matchedFile ?? 'Comparable network delivery'}\nA directly comparable package delivered for the same client environment: scope, constraints and outcomes summarised with referee contact available.` };
    case 'add-risks':
      return { content: currentDraft + `\n\n### Risks and mitigations\n| Risk | Mitigation |\n| --- | --- |\n| Compressed programme | Early reviewer lock-in; highest-weight sections drafted first |\n| Interface availability | Named interface manager; escalation path agreed at kickoff |` };
    default:
      return { content: currentDraft };
  }
}
