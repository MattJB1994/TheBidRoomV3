/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Proposal Narrative Engine — the layer that turns isolated module
 * drafts into one connected submission (Proposal Run Through).
 *
 * It does NOT replace per-module drafting (DraftsPage / aiService); it
 * wraps the whole proposal so the five stages can operate across every
 * activated module at once:
 *
 *   1. First Pass Draft        — generateFirstPass()      (all modules)
 *   2. User Notes and Direction — SectionNotes / ProposalNotes (types)
 *   3. Full Proposal Run Through — runFullProposal()       (master prompt)
 *   4. Consistency & Repetition — checkRepetitionAndConsistency()
 *   5. Review Ready Draft       — prepareReviewReady()
 *
 * The engine holds the full proposal context (blueprint as source of
 * truth, global + section notes, evidence map, commercial assumptions,
 * addenda, a section dependency map and a claim register) so each
 * section is drafted with awareness of the others — cross-referencing
 * detail rather than duplicating it.
 *
 * Live drafting routes through /api/ai (task "draft"); demo mode uses
 * deterministic transforms so every button visibly works without a key.
 */
import {
  TenderBlueprint, ProposalModule, ModuleKey, Requirement, EvidenceItem,
  FirstPassMeta, ProposalClaim, ProposalVersion, ProposalRunAction, SectionNotes,
} from './types';
import { detectUnsupportedClaims } from './aiService';
import { draftSection } from '../lib/ai';
import { isDemoMode } from '../lib/supabase';

/** Bumped when the master prompt changes, so versions record which one produced them. */
export const MASTER_PROMPT_VERSION = 'v1';

/**
 * The master proposal prompt. Prepended to every section in a full
 * run-through so the model treats the proposal as one connected
 * submission rather than independent answers.
 */
export const MASTER_PROMPT = [
  'You are preparing a connected infrastructure tender response, not independent standalone answers.',
  'Each section must do its job without repeating other sections.',
  'Use the full proposal context before drafting each section.',
  'Where detail belongs in another section, cross reference it briefly rather than duplicating it.',
  'Prioritise compliance, evidence, clarity and commercial consistency over polished generic writing.',
  'Use the Tender Blueprint as the source of truth and answer the client\u2019s requirements directly.',
  'Vary language across sections and avoid repetitive generic claims.',
  'Never claim experience, accreditation, availability or performance without linked evidence — flag it instead.',
  'Preserve commercial assumptions, user notes and reviewer comments. Keep the tone practical, specific and professional.',
].join(' ');

/**
 * Section dependency map — where detail lives, and what merely
 * cross-references it. Drives the run-through's "own vs reference"
 * guidance and the repetition check. `owns` = topics this section is the
 * home for; `references` = sections it should point to, not duplicate.
 */
export const SECTION_DEPENDENCIES: Partial<Record<ModuleKey, { owns: string[]; references: ModuleKey[] }>> = {
  'executive-summary': { owns: ['the strongest overall win themes'], references: ['relevant-experience', 'key-personnel', 'technical-methodology', 'pricing-response'] },
  'technical-methodology': { owns: ['delivery method', 'technical approach'], references: ['systems-assurance', 'design-management', 'safety'] },
  'systems-assurance': { owns: ['assurance', 'verification and validation', 'RVTM', 'acceptance'], references: [] },
  'design-management': { owns: ['design management', 'interdisciplinary design'], references: ['technical-methodology'] },
  'program-staging': { owns: ['program', 'staging', 'milestones', 'access windows', 'construction methodology'], references: [] },
  'construction-methodology': { owns: ['construction methodology', 'site constraints', 'buildability'], references: ['program-staging', 'interface-management'] },
  'possession-access-planning': { owns: ['possessions', 'rail/corridor access', 'access windows'], references: ['program-staging'] },
  'quality-management': { owns: ['quality management', 'ITPs', 'hold points', 'quality records'], references: [] },
  'environmental-management': { owns: ['environmental management', 'approvals', 'erosion/sediment control'], references: [] },
  'stakeholder-management': { owns: ['stakeholders', 'community', 'authority consultation'], references: ['interface-management'] },
  'commercial-assumptions': { owns: ['exclusions', 'assumptions', 'qualifications', 'departures'], references: ['pricing-response'] },
  'pricing-response': { owns: ['pricing basis', 'rates'], references: ['commercial-assumptions'] },
  'relevant-experience': { owns: ['detailed project proof'], references: [] },
  'case-studies': { owns: ['project case histories'], references: ['relevant-experience'] },
  'key-personnel': { owns: ['personnel detail', 'CV content'], references: [] },
  'cvs': { owns: ['CV detail'], references: ['key-personnel'] },
  'interface-management': { owns: ['interfaces', 'stakeholders', 'third parties'], references: [] },
  'safety': { owns: ['safety', 'safety in design', 'WHS'], references: [] },
  'departures-clarifications': { owns: ['departures', 'qualifications', 'clarifications'], references: ['commercial-assumptions'] },
};

/* ── Stage 1: First Pass Draft ─────────────────────────────────────── */

export interface FirstPassSection {
  key: ModuleKey;
  draft: string;
  meta: FirstPassMeta;
}

const linkedReqs = (bp: TenderBlueprint, m: ProposalModule): Requirement[] =>
  bp.requirements.filter((r) => m.requirementIds.includes(r.id));
const linkedEvidence = (bp: TenderBlueprint, m: ProposalModule): EvidenceItem[] =>
  bp.evidence.filter((e) => e.moduleKey === m.key);

function firstPassMeta(bp: TenderBlueprint, m: ProposalModule, draft: string): FirstPassMeta {
  const reqs = linkedReqs(bp, m);
  const ev = linkedEvidence(bp, m);
  const dep = SECTION_DEPENDENCIES[m.key];
  return {
    purpose: dep?.owns.length ? `Own: ${dep.owns.join(', ')}.` : `Respond to the ${m.name.toLowerCase()} requirements.`,
    keyMessages: (bp.inputs.winThemes.length ? bp.inputs.winThemes : ['Proven, low-risk delivery']).slice(0, 3),
    evidenceNeeded: reqs.filter((r) => r.evidenceRequired).map((r) => r.text.slice(0, 80)),
    gaps: ev.filter((e) => e.status === 'missing').map((e) => e.label),
    assumptions: bp.commercial.filter((c) => c.linkedModuleKey === m.key).map((c) => c.text.slice(0, 80)),
    unsupportedClaims: detectUnsupportedClaims(draft, ev),
    suggestedReviewer: m.reviewerDiscipline,
    generatedAt: new Date().toISOString(),
  };
}

/** Builds the grounding context string for one section (used by both passes). */
function sectionContext(bp: TenderBlueprint, m: ProposalModule, opts: { includeSiblings?: boolean } = {}): string {
  const reqs = linkedReqs(bp, m);
  const ev = linkedEvidence(bp, m).filter((e) => e.matchedFile);
  const dep = SECTION_DEPENDENCIES[m.key];
  const notes = m.sectionNotes;
  const parts: string[] = [];

  parts.push(`SECTION: ${m.name}`);
  if (dep?.owns.length) parts.push(`This section OWNS: ${dep.owns.join(', ')}.`);
  if (dep?.references.length) parts.push(`Cross-reference (do not duplicate): ${dep.references.join(', ')}.`);
  parts.push(`REQUIREMENTS:\n${reqs.map((r) => `- (${r.id}) ${r.text}`).join('\n') || '- (none linked)'}`);
  if (ev.length) parts.push(`LINKED EVIDENCE:\n${ev.map((e) => `- ${e.matchedFile}: ${e.label}`).join('\n')}`);
  if (m.wordLimit) parts.push(`Keep under ${m.wordLimit} words.`);

  if (notes) {
    const n: string[] = [];
    if (notes.notes) n.push(`Notes: ${notes.notes}`);
    if (notes.includePoints) n.push(`Must include: ${notes.includePoints}`);
    if (notes.avoidPoints) n.push(`Avoid: ${notes.avoidPoints}`);
    if (notes.differentiators) n.push(`Differentiators: ${notes.differentiators}`);
    if (notes.evidenceToUse) n.push(`Use evidence: ${notes.evidenceToUse}`);
    if (notes.evidenceToAvoid) n.push(`Avoid evidence: ${notes.evidenceToAvoid}`);
    if (notes.toneInstruction) n.push(`Tone: ${notes.toneInstruction}`);
    if (notes.reviewerDirection) n.push(`Reviewer direction: ${notes.reviewerDirection}`);
    if (n.length) parts.push(`SECTION NOTES (follow these):\n${n.join('\n')}`);
  }

  if (opts.includeSiblings) {
    const global = bp.proposalNotes;
    const g: string[] = [];
    if (global.proposalStory) g.push(`Proposal story: ${global.proposalStory}`);
    if (global.clientPriorities) g.push(`Client priorities: ${global.clientPriorities}`);
    if (global.keyDifferentiators) g.push(`Differentiators: ${global.keyDifferentiators}`);
    if (global.termsToUse) g.push(`Use terms: ${global.termsToUse}`);
    if (global.termsToAvoid) g.push(`Avoid terms: ${global.termsToAvoid}`);
    if (global.toneOfVoice) g.push(`Tone: ${global.toneOfVoice}`);
    if (bp.inputs.winThemes.length) g.push(`Win themes: ${bp.inputs.winThemes.join('; ')}`);
    if (g.length) parts.push(`GLOBAL PROPOSAL DIRECTION:\n${g.join('\n')}`);
  }
  return parts.join('\n\n');
}

function demoFirstPass(bp: TenderBlueprint, m: ProposalModule): string {
  const reqs = linkedReqs(bp, m);
  const dep = SECTION_DEPENDENCIES[m.key];
  const theme = bp.inputs.winThemes[0] ?? 'proven, low-risk delivery on comparable infrastructure';
  const refLine = dep?.references.length ? `\n\n*See ${dep.references.join(', ')} for supporting detail — referenced here, not repeated.*` : '';
  return [
    `## ${m.name}`,
    `**Purpose:** ${dep?.owns.length ? `home for ${dep.owns.join(', ')}` : `respond to the ${m.name.toLowerCase()} requirements`}.`,
    `${bp.meta.sector || 'The'} client requires confidence in ${m.name.toLowerCase()}. Our response is anchored in ${theme}.`,
    reqs.length ? `### What the tender asks for\n${reqs.slice(0, 4).map((r) => `- ${r.text}`).join('\n')}` : '',
    `### Our response (first pass)\nWe address each requirement directly, evidenced rather than asserted.${refLine}`,
    `*(First-pass working draft — not final. Add section notes, then run the full proposal pass.)*`,
  ].filter(Boolean).join('\n\n');
}

/**
 * Stage 1 — generate a first pass across ALL activated modules together.
 * Returns a section per module with a working draft + structured meta;
 * never claims the proposal is complete.
 */
export async function generateFirstPass(bp: TenderBlueprint): Promise<FirstPassSection[]> {
  const active = bp.modules.filter((m) => m.active);
  const out: FirstPassSection[] = [];
  for (const m of active) {
    let draft: string;
    if (isDemoMode()) {
      await new Promise((r) => setTimeout(r, 15));
      draft = demoFirstPass(bp, m);
    } else {
      draft = await draftSection(
        `${MASTER_PROMPT}\n\nProduce a FIRST-PASS working draft (not final) for this section:\n\n${sectionContext(bp, m, { includeSiblings: true })}`,
        { sectionTitle: m.name },
      );
    }
    out.push({ key: m.key, draft, meta: firstPassMeta(bp, m, draft) });
  }
  return out;
}

/* ── Stage 3: Full Proposal Run Through ────────────────────────────── */

export interface FullRunSection {
  key: ModuleKey;
  draft: string;
  /** True if this section had manual edits the run would overwrite. */
  hadManualEdits: boolean;
}

function demoFullRun(bp: TenderBlueprint, m: ProposalModule): string {
  const dep = SECTION_DEPENDENCIES[m.key];
  const base = m.draft || demoFirstPass(bp, m);
  const refNote = dep?.references.length
    ? `\n\n> **Connected:** detail on ${dep.references.join(', ')} lives in those sections; summarised here to avoid repetition.`
    : '';
  const notesApplied = m.sectionNotes?.notes || m.sectionNotes?.includePoints
    ? `\n\n> **Section direction applied:** ${[m.sectionNotes?.includePoints, m.sectionNotes?.notes].filter(Boolean).join(' ')}`
    : '';
  return `${base}${refNote}${notesApplied}\n\n*(Refined in the full proposal run-through — language varied, cross-references added, aligned to the proposal story.)*`;
}

/**
 * Stage 3 — refine ALL modules together using the master prompt, with
 * full-proposal awareness (previous/following sections, global + section
 * notes, dependency map). Returns the proposed new draft per section and
 * whether each had manual edits — the CALLER decides how to apply them
 * (preserve / blend / replace / compare); this never silently overwrites.
 */
export async function runFullProposal(bp: TenderBlueprint): Promise<FullRunSection[]> {
  const active = bp.modules.filter((m) => m.active);
  const out: FullRunSection[] = [];
  for (const m of active) {
    let draft: string;
    if (isDemoMode()) {
      await new Promise((r) => setTimeout(r, 15));
      draft = demoFullRun(bp, m);
    } else {
      const siblings = active.filter((s) => s.key !== m.key).map((s) => `${s.name}: ${(s.draft || '').slice(0, 200)}`).join('\n');
      draft = await draftSection(
        `${MASTER_PROMPT}\n\nFULL PROPOSAL RUN-THROUGH. Refine THIS section as part of the whole submission.\n\n${sectionContext(bp, m, { includeSiblings: true })}\n\nCURRENT DRAFT:\n${m.draft || '(none — draft it now)'}\n\nOTHER SECTIONS (for cross-reference, do not duplicate):\n${siblings}`,
        { sectionTitle: m.name },
      );
    }
    out.push({ key: m.key, draft, hadManualEdits: !!m.manuallyEdited });
  }
  return out;
}

/* ── Stage 4: Consistency & Repetition Check ───────────────────────── */

export interface ConsistencyIssue {
  id: string;
  kind: 'repetition' | 'inconsistency' | 'unsupported' | 'unanswered' | 'commercial';
  issue: string;
  affectedSections: ModuleKey[];
  severity: 'Low' | 'Medium' | 'High';
  suggestedFix: string;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'will', 'our', 'are', 'from', 'has', 'have', 'section', 'client', 'tender', 'proposal', 'response', 'their', 'which', 'they', 'each']);

/** Extract meaningful 3-word phrases from a draft. */
function phrases(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  const out: string[] = [];
  for (let i = 0; i < words.length - 2; i++) out.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

/**
 * Stage 4 — scan all draft sections for repetition, inconsistency,
 * unsupported claims, unanswered requirements and commercial mismatches.
 */
export function checkRepetitionAndConsistency(bp: TenderBlueprint): ConsistencyIssue[] {
  const active = bp.modules.filter((m) => m.active && m.draft);
  const issues: ConsistencyIssue[] = [];
  let n = 0;
  const uid = () => `iss_${n++}`;

  // Repeated phrases across sections.
  const phraseSections = new Map<string, Set<ModuleKey>>();
  active.forEach((m) => {
    new Set(phrases(m.draft)).forEach((p) => {
      const set = phraseSections.get(p) ?? new Set();
      set.add(m.key);
      phraseSections.set(p, set);
    });
  });
  const repeated = [...phraseSections.entries()].filter(([, s]) => s.size >= 3).sort((a, b) => b[1].size - a[1].size).slice(0, 5);
  repeated.forEach(([phrase, sections]) => {
    const secs = [...sections];
    const home = secs.find((k) => SECTION_DEPENDENCIES[k]?.owns.length) ?? secs[0];
    issues.push({
      id: uid(), kind: 'repetition',
      issue: `"${phrase}" repeated across ${sections.size} sections with similar wording.`,
      affectedSections: secs, severity: sections.size >= 4 ? 'High' : 'Medium',
      suggestedFix: `Keep the detailed treatment in ${bp.modules.find((m) => m.key === home)?.name ?? home} and use shorter references elsewhere.`,
    });
  });

  // Unsupported claims per section.
  active.forEach((m) => {
    const claims = detectUnsupportedClaims(m.draft, linkedEvidence(bp, m));
    if (claims.length) {
      issues.push({
        id: uid(), kind: 'unsupported',
        issue: `${m.name} makes ${claims.length} claim${claims.length === 1 ? '' : 's'} without linked evidence.`,
        affectedSections: [m.key], severity: 'High',
        suggestedFix: `Link supporting evidence or soften the wording. ${claims[0].replace(/^✗ /, '')}`,
      });
    }
  });

  // Requirements not clearly answered by their module's draft.
  active.forEach((m) => {
    const reqs = linkedReqs(bp, m);
    const unanswered = reqs.filter((r) => {
      const terms = r.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 5).slice(0, 3);
      return terms.length > 0 && !terms.some((t) => m.draft.toLowerCase().includes(t));
    });
    if (unanswered.length) {
      issues.push({
        id: uid(), kind: 'unanswered',
        issue: `${m.name} does not clearly answer ${unanswered.length} linked requirement${unanswered.length === 1 ? '' : 's'}.`,
        affectedSections: [m.key], severity: 'Medium',
        suggestedFix: `Address ${unanswered[0].id} directly: ${unanswered[0].text.slice(0, 80)}.`,
      });
    }
  });

  // Commercial position mentioned in drafts but not in the register.
  const registerText = bp.commercial.map((c) => c.text.toLowerCase()).join(' ');
  active.forEach((m) => {
    if (/assumption|excludes?|provisional|client(?:-| )provided|survey/i.test(m.draft)) {
      const mentionsSurvey = /client(?:-| )provided|survey/i.test(m.draft);
      if (mentionsSurvey && !/survey/.test(registerText)) {
        issues.push({
          id: uid(), kind: 'commercial',
          issue: `${m.name} mentions a pricing assumption (client-provided survey) not in the Commercial Assumptions Register.`,
          affectedSections: [m.key], severity: 'Medium',
          suggestedFix: 'Add it to the Commercial Assumptions Register and cross-reference it.',
        });
      }
    }
  });

  return issues;
}

/* ── Claim Register ────────────────────────────────────────────────── */

/** Claim patterns tracked across the proposal, with a normalised label. */
const CLAIM_PATTERNS: { label: string; re: RegExp; evidence: EvidenceItem['type'][] }[] = [
  { label: 'Similar project experience', re: /similar projects?|comparable projects?|proven track record|extensive experience/i, evidence: ['Case study', 'Project sheet'] },
  { label: 'Rail corridor experience', re: /rail corridor|brownfield rail|possession|corridor access/i, evidence: ['Case study', 'Project sheet'] },
  { label: 'Assurance capability', re: /assurance capability|verification and validation|rvtm|systems assurance/i, evidence: ['Assurance document', 'Accreditation'] },
  { label: 'Safety performance', re: /safety record|zero harm|ltifr|safety performance/i, evidence: ['Safety document'] },
  { label: 'Personnel availability', re: /available|availability|nominated|key personnel/i, evidence: ['CV'] },
  { label: 'Design management capability', re: /design management|interdisciplinary design/i, evidence: ['Design example', 'Case study'] },
  { label: 'Commercial compliance', re: /fully compliant|no departures|unconditional/i, evidence: [] },
  { label: 'Program certainty', re: /on schedule|programme certainty|program certainty|milestones will/i, evidence: ['Program'] },
  { label: 'Local experience', re: /local experience|local knowledge|local presence/i, evidence: ['Case study', 'Project sheet'] },
];

/**
 * Builds the Claim Register: which tracked claims appear in which
 * sections, whether they're supported by linked evidence, repeated, and
 * a suggested rewrite for repeated ones.
 */
export function buildClaimRegister(bp: TenderBlueprint): ProposalClaim[] {
  const active = bp.modules.filter((m) => m.active && m.draft);
  const claims: ProposalClaim[] = [];
  CLAIM_PATTERNS.forEach((pat, i) => {
    const sections = active.filter((m) => pat.re.test(m.draft)).map((m) => m.key);
    if (!sections.length) return;
    // Supported if ANY section carrying the claim has matching evidence.
    const supported = pat.evidence.length === 0
      ? false
      : sections.some((k) => bp.evidence.some((e) => e.moduleKey === k && pat.evidence.includes(e.type) && (e.status === 'found' || !!e.matchedFile)));
    const repeated = sections.length > 1;
    const linkedEv = bp.evidence.filter((e) => sections.includes(e.moduleKey!) && pat.evidence.includes(e.type) && e.matchedFile).map((e) => e.matchedFile!) as string[];
    const home = sections.find((k) => SECTION_DEPENDENCIES[k]?.owns.length) ?? sections[0];
    claims.push({
      id: `claim_${i}`,
      text: pat.label,
      sections,
      status: supported ? 'supported' : 'unsupported',
      repeated,
      riskLevel: !supported ? 'High' : repeated ? 'Medium' : 'Low',
      linkedEvidence: linkedEv,
      suggestedRewrite: repeated
        ? `Keep the detailed claim in ${bp.modules.find((m) => m.key === home)?.name ?? home}; cross-reference it briefly elsewhere.`
        : !supported
          ? 'Link supporting evidence or soften the claim.'
          : undefined,
    });
  });
  return claims;
}

/* ── Stage 5: Review Ready Draft ───────────────────────────────────── */

export interface ReviewReadyResult {
  version: ProposalVersion;
  claimRegister: ProposalClaim[];
  issues: ConsistencyIssue[];
  /** What still needs a human — never an approval. */
  reviewSummary: string[];
}

/**
 * Stage 5 — assemble the best version for HUMAN review. Refreshes the
 * claim register + consistency report and produces a summary of what
 * still needs review. Does NOT mark anything approved — it records a
 * 'review-ready' version and returns what a reviewer must still check.
 */
export function prepareReviewReady(bp: TenderBlueprint, userId: string | null): ReviewReadyResult {
  const claimRegister = buildClaimRegister(bp);
  const issues = checkRepetitionAndConsistency(bp);
  const active = bp.modules.filter((m) => m.active);

  const reviewSummary: string[] = [];
  const undrafted = active.filter((m) => !m.draft).length;
  if (undrafted) reviewSummary.push(`${undrafted} activated section${undrafted === 1 ? '' : 's'} still undrafted.`);
  const unsupported = claimRegister.filter((c) => c.status === 'unsupported').length;
  if (unsupported) reviewSummary.push(`${unsupported} unsupported claim${unsupported === 1 ? '' : 's'} to substantiate or soften.`);
  const highIssues = issues.filter((i) => i.severity === 'High').length;
  if (highIssues) reviewSummary.push(`${highIssues} high-severity consistency issue${highIssues === 1 ? '' : 's'} to resolve.`);
  const openCommercial = bp.commercial.filter((c) => c.status === 'Open').length;
  if (openCommercial) reviewSummary.push(`${openCommercial} open commercial item${openCommercial === 1 ? '' : 's'} to acknowledge or approve.`);
  const pendingAddenda = bp.addenda.filter((a) => !a.reviewed).length;
  if (pendingAddenda) reviewSummary.push(`${pendingAddenda} addendum impact${pendingAddenda === 1 ? '' : 's'} to review.`);
  if (!reviewSummary.length) reviewSummary.push('No blocking issues detected — a reviewer should still read the full proposal for tone and win-theme reinforcement.');

  const version = makeVersion('review-ready', active, userId, `Prepared review-ready draft: ${issues.length} consistency issue(s), ${unsupported} unsupported claim(s) flagged. Not approved — ready for human review.`, hasAnyNotes(bp));
  return { version, claimRegister, issues, reviewSummary };
}

/* ── Version handling ──────────────────────────────────────────────── */

function hasAnyNotes(bp: TenderBlueprint): boolean {
  const g = bp.proposalNotes;
  const globalHas = !!(g.proposalStory || g.clientPriorities || g.keyDifferentiators || g.termsToUse || g.termsToAvoid);
  const sectionHas = bp.modules.some((m) => m.sectionNotes && Object.values(m.sectionNotes).some((v) => typeof v === 'string' && v.trim()));
  return globalHas || sectionHas;
}

export function makeVersion(
  action: ProposalRunAction,
  affected: ProposalModule[],
  userId: string | null,
  summary: string,
  notesUsed: boolean,
): ProposalVersion {
  return {
    id: `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    userId,
    action,
    masterPromptVersion: MASTER_PROMPT_VERSION,
    affectedModules: affected.map((m) => m.key),
    summary,
    notesUsed,
    snapshots: affected.map((m) => ({ key: m.key, draft: m.draft })),
  };
}
