/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Controlled Proposal Loops — loops each section through practical tender
 * checks with CLEAR STOP CONDITIONS. Never endless autonomous revision.
 *
 * Stages: requirement → evidence → repetition → commercial → addendum →
 * human-review → export-readiness.
 *
 * Hard rules (Part 8):
 *  - stop if evidence is missing
 *  - stop if human review is required
 *  - stop if a commercial issue needs acknowledgement
 *  - stop if an addendum impact is unresolved
 *  - stop after MAX_AI_REVISIONS AI passes
 *  - never mark AI content approved; never hide missing evidence
 *
 * All checks here are deterministic and read-only over the blueprint —
 * they compute status, they don't call the model or mutate state. The
 * caller applies returned results to the blueprint.
 */
import {
  TenderBlueprint, ProposalModule, ModuleKey, LoopStage, LoopStageResult, LoopStatus, SectionLoop,
} from './types';
import { detectUnsupportedClaims } from './aiService';
import { checkRepetitionAndConsistency } from './proposalRun';

/** Maximum AI revision passes before a section must go to a human. */
export const MAX_AI_REVISIONS = 3;

const now = () => new Date().toISOString();

const linkedReqs = (bp: TenderBlueprint, m: ProposalModule) =>
  bp.requirements.filter((r) => m.requirementIds.includes(r.id));
const linkedEvidence = (bp: TenderBlueprint, m: ProposalModule) =>
  bp.evidence.filter((e) => e.moduleKey === m.key);

/* ── Individual stage checks ───────────────────────────────────────── */

/** Requirement check — does the section answer / partially answer / miss its requirements? */
export function requirementCheck(bp: TenderBlueprint, m: ProposalModule): LoopStageResult {
  const reqs = linkedReqs(bp, m);
  const draft = m.draft.toLowerCase();
  const missed = reqs.filter((r) => {
    const terms = r.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 5).slice(0, 3);
    return terms.length > 0 && !terms.some((t) => draft.includes(t));
  });
  const passed = missed.length === 0 && !!m.draft.trim();
  return {
    stage: 'requirement', passed,
    findings: reqs.length === 0
      ? ['No requirements linked to this section.']
      : missed.length === 0
        ? [`All ${reqs.length} linked requirement(s) addressed.`]
        : missed.map((r) => `Not clearly answered: ${r.id} — ${r.text.slice(0, 70)}`),
    blockedReason: missed.length ? `${missed.length} linked requirement(s) not clearly answered.` : undefined,
    suggestedAction: missed.length ? `Address ${missed[0].id} directly in the draft.` : undefined,
    confidence: reqs.length ? 'Medium' : 'Low',
    updatedAt: now(),
  };
}

/** Evidence check — are key claims supported by linked evidence? */
export function evidenceCheck(bp: TenderBlueprint, m: ProposalModule): LoopStageResult {
  const ev = linkedEvidence(bp, m);
  const unsupported = detectUnsupportedClaims(m.draft, ev);
  const missing = ev.filter((e) => e.status === 'missing' && !e.resolution);
  const passed = unsupported.length === 0 && missing.length === 0;
  return {
    stage: 'evidence', passed,
    findings: [
      ...unsupported.map((c) => c.replace(/^✗ /, 'Unsupported: ')),
      ...missing.map((e) => `Missing evidence: ${e.label}`),
      ...(passed ? ['All claims supported; no unresolved evidence gaps.'] : []),
    ],
    blockedReason: !passed ? `${unsupported.length} unsupported claim(s), ${missing.length} missing evidence item(s).` : undefined,
    suggestedAction: !passed ? 'Link evidence, waive with reason, or raise an SME request.' : undefined,
    confidence: 'High',
    updatedAt: now(),
  };
}

/** Repetition check — does the section overlap too heavily with others? */
export function repetitionCheck(bp: TenderBlueprint, m: ProposalModule): LoopStageResult {
  const issues = checkRepetitionAndConsistency(bp).filter((i) => i.kind === 'repetition' && i.affectedSections.includes(m.key));
  const passed = issues.length === 0;
  return {
    stage: 'repetition', passed,
    findings: passed ? ['No heavy repetition with other sections.'] : issues.map((i) => i.issue),
    blockedReason: passed ? undefined : `${issues.length} repetition issue(s) involving this section.`,
    suggestedAction: passed ? undefined : issues[0]?.suggestedFix,
    confidence: 'Medium',
    updatedAt: now(),
  };
}

/** Commercial check — assumptions/exclusions in prose that belong in the register. */
export function commercialCheck(bp: TenderBlueprint, m: ProposalModule): LoopStageResult {
  const draft = m.draft.toLowerCase();
  const signals = /assumption|exclud|provisional|client(?:-| )provided|dependenc|qualif|departure/i.test(draft);
  const registerText = bp.commercial.map((c) => c.text.toLowerCase()).join(' ');
  // If the draft raises commercial language but the register is empty for this module, suggest capturing it.
  const moduleItems = bp.commercial.filter((c) => c.linkedModuleKey === m.key);
  const needsCapture = signals && moduleItems.length === 0;
  const openItems = moduleItems.filter((c) => c.status === 'Open');
  const passed = !needsCapture && openItems.length === 0;
  const findings: string[] = [];
  if (needsCapture) findings.push('Draft raises commercial assumptions/exclusions not captured in the register.');
  if (openItems.length) findings.push(`${openItems.length} linked commercial item(s) still Open.`);
  if (passed) findings.push('Commercial position captured and acknowledged.');
  return {
    stage: 'commercial', passed,
    findings,
    blockedReason: passed ? undefined : 'Commercial assumptions need capturing or acknowledging.',
    suggestedAction: needsCapture ? 'Add the assumption/exclusion to the Commercial Assumptions Register.' : openItems.length ? 'Acknowledge or approve the open commercial items.' : undefined,
    confidence: registerText ? 'Medium' : 'Low',
    updatedAt: now(),
  };
}

/** Addendum check — does an unresolved addendum affect this section? */
export function addendumCheck(bp: TenderBlueprint, m: ProposalModule): LoopStageResult {
  const affecting = bp.addenda.filter((a) => a.affectedModuleKeys?.includes(m.key));
  const unresolved = affecting.filter((a) => !a.reviewed);
  const passed = unresolved.length === 0;
  return {
    stage: 'addendum', passed,
    findings: affecting.length === 0
      ? ['No addenda affect this section.']
      : unresolved.length === 0
        ? [`${affecting.length} addendum impact(s) reviewed.`]
        : unresolved.map((a) => `Unreviewed impact: ${a.documentName} — ${a.summary.slice(0, 70)}`),
    blockedReason: unresolved.length ? `${unresolved.length} unreviewed addendum impact(s).` : undefined,
    suggestedAction: unresolved.length ? 'Review the addendum impact before export.' : undefined,
    confidence: 'High',
    updatedAt: now(),
  };
}

/* ── Export readiness (the gate) ───────────────────────────────────── */

/**
 * A section is export-ready only when: mandatory linked requirements are
 * answered, evidence is found or waived, addenda impacts reviewed,
 * commercial items resolved/acknowledged, and required human review is
 * Approved. AI can never approve its own work — human review is separate.
 */
export function exportReadinessCheck(bp: TenderBlueprint, m: ProposalModule): LoopStageResult {
  const req = requirementCheck(bp, m);
  const ev = evidenceCheck(bp, m);
  const com = commercialCheck(bp, m);
  const add = addendumCheck(bp, m);
  const review = bp.reviews.find((r) => r.moduleKey === m.key);
  const humanApproved = m.draftStatus === 'Approved' || review?.status === 'Approved';

  const blockers: string[] = [];
  if (!req.passed) blockers.push('requirements not fully answered');
  if (!ev.passed) blockers.push('evidence gaps or unsupported claims');
  if (!com.passed) blockers.push('commercial items unresolved');
  if (!add.passed) blockers.push('addendum impact unreviewed');
  if (!humanApproved) blockers.push('human review not approved');

  const passed = blockers.length === 0;
  return {
    stage: 'export-readiness', passed,
    findings: passed ? ['Section meets all export-readiness conditions.'] : [`Blocked by: ${blockers.join('; ')}.`],
    blockedReason: passed ? undefined : `Blocked by: ${blockers.join('; ')}.`,
    suggestedAction: passed ? undefined : humanApproved ? 'Resolve the outstanding checks.' : 'Send to the required reviewer for approval.',
    confidence: 'High',
    updatedAt: now(),
  };
}

/* ── Loop orchestration (with stop conditions) ─────────────────────── */

const STATUS_FOR_STAGE: Record<LoopStage, LoopStatus> = {
  requirement: 'Requirement checked',
  evidence: 'Evidence checked',
  repetition: 'Repetition checked',
  commercial: 'Commercial checked',
  addendum: 'Addendum checked',
  'human-review': 'Human review required',
  'export-readiness': 'Export ready',
};

const CHECK_ORDER: LoopStage[] = ['requirement', 'evidence', 'repetition', 'commercial', 'addendum'];

/**
 * Runs the loop over one section, stopping at the first stop condition.
 * Returns the updated SectionLoop (pure — caller writes it back). Does
 * NOT call the model; the "AI revision" budget is enforced by the caller
 * incrementing `aiRevisions` when it actually regenerates.
 */
export function runSectionLoop(bp: TenderBlueprint, m: ProposalModule): SectionLoop {
  const stages: Partial<Record<LoopStage, LoopStageResult>> = { ...(m.loop?.stages ?? {}) };
  let status: LoopStatus = m.draft.trim() ? 'Draft created' : 'Not started';

  if (!m.draft.trim()) {
    return { status: 'Not started', stages, aiRevisions: m.loop?.aiRevisions ?? 0, updatedAt: now() };
  }

  for (const stage of CHECK_ORDER) {
    const result = runStage(bp, m, stage);
    stages[stage] = result;
    status = STATUS_FOR_STAGE[stage];
    if (!result.passed) {
      // Stop condition hit — evidence/commercial/addendum/requirement gap.
      return { status: 'Blocked', stages, aiRevisions: m.loop?.aiRevisions ?? 0, updatedAt: now() };
    }
  }

  // All automated checks passed → human review is required next.
  const review = bp.reviews.find((r) => r.moduleKey === m.key);
  const humanApproved = m.draftStatus === 'Approved' || review?.status === 'Approved';
  if (!humanApproved) {
    stages['human-review'] = {
      stage: 'human-review', passed: false,
      findings: ['Automated checks passed. Human review is required — AI cannot approve its own work.'],
      blockedReason: 'Awaiting human review approval.',
      suggestedAction: 'Send to the required reviewer.',
      confidence: 'High', updatedAt: now(),
    };
    return { status: 'Human review required', stages, aiRevisions: m.loop?.aiRevisions ?? 0, updatedAt: now() };
  }

  const readiness = exportReadinessCheck(bp, m);
  stages['export-readiness'] = readiness;
  return {
    status: readiness.passed ? 'Export ready' : 'Blocked',
    stages, aiRevisions: m.loop?.aiRevisions ?? 0, updatedAt: now(),
  };
}

export function runStage(bp: TenderBlueprint, m: ProposalModule, stage: LoopStage): LoopStageResult {
  switch (stage) {
    case 'requirement': return requirementCheck(bp, m);
    case 'evidence': return evidenceCheck(bp, m);
    case 'repetition': return repetitionCheck(bp, m);
    case 'commercial': return commercialCheck(bp, m);
    case 'addendum': return addendumCheck(bp, m);
    case 'export-readiness': return exportReadinessCheck(bp, m);
    case 'human-review':
      return { stage, passed: false, findings: ['Human review required.'], confidence: 'High', updatedAt: now() };
  }
}

/** True if the section has exhausted its AI revision budget. */
export function revisionBudgetExhausted(m: ProposalModule): boolean {
  return (m.loop?.aiRevisions ?? 0) >= MAX_AI_REVISIONS;
}

/* ── Proposal-wide loop report ─────────────────────────────────────── */

export interface LoopReport {
  ready: ModuleKey[];
  blocked: { key: ModuleKey; reason: string }[];
  missingEvidence: number;
  unsupportedClaims: number;
  repeatedClaims: number;
  commercialIssues: number;
  addendumImpacts: number;
  reviewsOutstanding: number;
  nextActions: string[];
}

/** Runs a chosen stage across all active drafted sections (read-only). */
export function runStageAcrossAll(bp: TenderBlueprint, stage: LoopStage): Record<ModuleKey, LoopStageResult> {
  const out = {} as Record<ModuleKey, LoopStageResult>;
  bp.modules.filter((m) => m.active && m.draft.trim()).forEach((m) => { out[m.key] = runStage(bp, m, stage); });
  return out;
}

/** Builds the proposal-wide loop report from current section loop state. */
export function buildLoopReport(bp: TenderBlueprint): LoopReport {
  const active = bp.modules.filter((m) => m.active);
  const ready: ModuleKey[] = [];
  const blocked: { key: ModuleKey; reason: string }[] = [];

  active.forEach((m) => {
    const loop = m.loop ?? runSectionLoop(bp, m);
    if (loop.status === 'Export ready' || loop.status === 'Approved') ready.push(m.key);
    else if (loop.status === 'Blocked' || loop.status === 'Human review required') {
      const reason = Object.values(loop.stages).find((s) => s && !s.passed)?.blockedReason ?? loop.status;
      blocked.push({ key: m.key, reason });
    }
  });

  const claims = bp.claimRegister ?? [];
  const missingEvidence = bp.evidence.filter((e) => e.status === 'missing' && !e.resolution).length;
  const unsupportedClaims = claims.filter((c) => c.status === 'unsupported').length;
  const repeatedClaims = claims.filter((c) => c.repeated).length;
  const commercialIssues = bp.commercial.filter((c) => c.status === 'Open').length;
  const addendumImpacts = bp.addenda.filter((a) => !a.reviewed).length;
  const reviewsOutstanding = bp.reviews.filter((r) => r.status !== 'Approved').length;

  const nextActions: string[] = [];
  if (missingEvidence) nextActions.push(`Resolve ${missingEvidence} evidence gap(s).`);
  if (unsupportedClaims) nextActions.push(`Substantiate or soften ${unsupportedClaims} unsupported claim(s).`);
  if (repeatedClaims) nextActions.push(`Review ${repeatedClaims} repeated claim(s).`);
  if (commercialIssues) nextActions.push(`Acknowledge ${commercialIssues} open commercial item(s).`);
  if (addendumImpacts) nextActions.push(`Review ${addendumImpacts} addendum impact(s).`);
  if (blocked.length) nextActions.push(`Clear ${blocked.length} blocked section(s).`);
  if (!nextActions.length) nextActions.push('All sections have passed automated checks — send to human review or export.');

  return { ready, blocked, missingEvidence, unsupportedClaims, repeatedClaims, commercialIssues, addendumImpacts, reviewsOutstanding, nextActions };
}
