/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The seven-stage tender workflow that the simplified navigation is built
 * around: Intake → Blueprint → Gaps → Draft → Review → Submit → Closeout.
 *
 * Each stage maps to an existing page (the intelligence is unchanged; this
 * is a navigation/presentation layer) and computes a calm status from the
 * blueprint so the stepper and Next Best Action can guide the user.
 */
import { TenderBlueprint, BlueprintScores } from './types';

export type StageId = 'intake' | 'blueprint' | 'gaps' | 'draft' | 'review' | 'submit' | 'closeout';
export type StageStatus = 'not-started' | 'current' | 'done' | 'blocked';

export interface StageDef {
  id: StageId;
  label: string;
  /** The existing page this stage routes to. */
  page: string;
  hint: string;
}

export const STAGES: StageDef[] = [
  { id: 'intake', label: 'Intake', page: 'documents', hint: 'The tender pack and documents.' },
  { id: 'blueprint', label: 'Blueprint', page: 'blueprint', hint: 'What the client asked for.' },
  { id: 'gaps', label: 'Gaps', page: 'evidence', hint: 'What is missing or blocked.' },
  { id: 'draft', label: 'Draft', page: 'drafts', hint: 'Write the response.' },
  { id: 'review', label: 'Review', page: 'reviews', hint: 'Checks and approvals.' },
  { id: 'submit', label: 'Submit', page: 'exports', hint: 'Build the submission pack.' },
  { id: 'closeout', label: 'Closeout', page: 'closeout', hint: 'Capture lessons.' },
];

export const pageToStage = (page: string): StageId | null =>
  STAGES.find((s) => s.page === page)?.id ?? SUB_PAGE_STAGE[page] ?? null;

/**
 * Secondary pages that belong to a stage but aren't the stage's primary
 * route. Requirements & Modules are part of Blueprint; Commercial & Risks
 * are part of Gaps. Mapping them here means the stepper highlights the
 * right stage and renders on these pages too.
 */
export const SUB_PAGE_STAGE: Record<string, StageId> = {
  requirements: 'blueprint',
  modules: 'blueprint',
  commercial: 'gaps',
  risks: 'gaps',
};

/** Every page that should display the workflow stepper. */
export const WORKFLOW_PAGES = new Set<string>([...STAGES.map((s) => s.page), ...Object.keys(SUB_PAGE_STAGE)]);

export interface NextBestAction {
  stage: StageId;
  page: string;
  action: string;        // recommended action
  why: string;           // why it matters
  unlocks: string;       // what it unlocks
  buttonLabel: string;   // the one primary button
  urgent: boolean;
}

/**
 * Computes each stage's status from blueprint state. A stage is "blocked"
 * when it has an outstanding hard blocker, "done" when its work is
 * complete, "current" for the earliest actionable stage, else
 * "not-started".
 */
export function computeStageStatuses(bp: TenderBlueprint | null, scores: BlueprintScores | null, hasDocuments: boolean): Record<StageId, StageStatus> {
  const s: Record<StageId, StageStatus> = {
    intake: 'not-started', blueprint: 'not-started', gaps: 'not-started',
    draft: 'not-started', review: 'not-started', submit: 'not-started', closeout: 'not-started',
  };
  if (!bp || !scores) {
    s.intake = hasDocuments ? 'done' : 'current';
    if (hasDocuments) s.blueprint = 'current';
    return s;
  }

  s.intake = 'done';
  s.blueprint = 'done';

  const missingEvidence = bp.evidence.filter((e) => e.status === 'missing' && !e.resolution).length;
  const openCommercial = bp.commercial.filter((c) => c.status === 'Open').length;
  const pendingAddenda = bp.addenda.filter((a) => !a.reviewed).length;
  const gapsOutstanding = missingEvidence + openCommercial + pendingAddenda + scores.mandatoryUnanswered;
  s.gaps = gapsOutstanding > 0 ? 'blocked' : 'done';

  const activeDrafted = bp.modules.filter((m) => m.active && m.draft).length;
  const activeTotal = bp.modules.filter((m) => m.active).length;
  s.draft = activeDrafted === 0 ? 'not-started' : activeDrafted < activeTotal ? 'current' : 'done';

  const reviewsOutstanding = bp.reviews.filter((r) => r.status !== 'Approved').length;
  s.review = activeDrafted === 0 ? 'not-started' : reviewsOutstanding > 0 ? 'blocked' : 'done';

  const requiredReady = scores.exportsRequired > 0 && scores.exportsReady >= scores.exportsRequired;
  s.submit = requiredReady ? 'done' : (s.review === 'done' ? 'current' : 'not-started');

  s.closeout = bp.closeout && bp.closeout.outcome !== 'Not submitted' ? 'done' : 'not-started';

  // Mark the earliest non-done, non-blocked stage as current.
  const order: StageId[] = ['intake', 'blueprint', 'gaps', 'draft', 'review', 'submit', 'closeout'];
  const hasCurrent = order.some((id) => s[id] === 'current');
  if (!hasCurrent) {
    const firstActionable = order.find((id) => s[id] === 'not-started' || s[id] === 'blocked');
    if (firstActionable && s[firstActionable] === 'not-started') s[firstActionable] = 'current';
  }
  return s;
}

/**
 * The single most useful next action, derived from live state. Drives the
 * persistent Next Best Action panel — replacing scattered buttons.
 */
export function computeNextBestAction(bp: TenderBlueprint | null, scores: BlueprintScores | null, hasDocuments: boolean): NextBestAction {
  if (!hasDocuments && !bp) {
    return { stage: 'intake', page: 'documents', action: 'Upload the tender pack', why: 'The blueprint is built from the tender documents.', unlocks: 'Requirements, returnables, risks and draft modules.', buttonLabel: 'Go to Intake', urgent: true };
  }
  if (!bp || !scores) {
    return { stage: 'blueprint', page: 'blueprint', action: 'Analyse the tender', why: 'No blueprint yet — analysis extracts what the client asked for.', unlocks: 'The whole workflow.', buttonLabel: 'Open Blueprint', urgent: true };
  }

  const pendingAddendum = bp.addenda.find((a) => !a.reviewed);
  if (pendingAddendum) {
    return { stage: 'gaps', page: 'evidence', action: `Review ${pendingAddendum.documentName}`, why: 'It may change scope, access or pricing and blocks affected sections.', unlocks: 'Draft review and submission pack export.', buttonLabel: 'Review addendum impact', urgent: true };
  }
  if (scores.mandatoryUnanswered > 0) {
    return { stage: 'gaps', page: 'requirements', action: `Answer ${scores.mandatoryUnanswered} mandatory requirement${scores.mandatoryUnanswered === 1 ? '' : 's'}`, why: 'Mandatory items block a compliant submission.', unlocks: 'Compliance and export readiness.', buttonLabel: 'Resolve requirements', urgent: true };
  }
  const missingEvidence = bp.evidence.filter((e) => e.status === 'missing' && !e.resolution);
  if (missingEvidence.length > 0) {
    return { stage: 'gaps', page: 'evidence', action: `Resolve the top evidence gap: ${missingEvidence[0].label}`, why: 'Claims must be backed by evidence or waived with reason.', unlocks: 'Evidence support and draft checks.', buttonLabel: 'Resolve top gap', urgent: true };
  }
  const openCommercial = bp.commercial.filter((c) => c.status === 'Open').length;
  if (openCommercial > 0) {
    return { stage: 'gaps', page: 'commercial', action: `Resolve ${openCommercial} commercial assumption${openCommercial === 1 ? '' : 's'}`, why: 'Open commercial items block the commercial exports.', unlocks: 'Commercial approval and submission pack.', buttonLabel: 'Open commercial', urgent: false };
  }
  const undrafted = bp.modules.filter((m) => m.active && !m.draft).length;
  if (undrafted > 0) {
    return { stage: 'draft', page: 'drafts', action: `Draft ${undrafted} remaining section${undrafted === 1 ? '' : 's'}`, why: 'Every activated section needs a response.', unlocks: 'Proposal checks and review.', buttonLabel: 'Go to Draft', urgent: false };
  }
  const reviewsOutstanding = bp.reviews.filter((r) => r.status !== 'Approved').length;
  if (reviewsOutstanding > 0) {
    return { stage: 'review', page: 'reviews', action: `Clear ${reviewsOutstanding} review gate${reviewsOutstanding === 1 ? '' : 's'}`, why: 'Sections need the right reviewer before export.', unlocks: 'Submission pack export.', buttonLabel: 'Go to Review', urgent: false };
  }
  if (!(scores.exportsReady >= scores.exportsRequired)) {
    return { stage: 'submit', page: 'exports', action: 'Build the submission pack', why: 'Reviews are clear — assemble the client-required exports.', unlocks: 'A submittable pack.', buttonLabel: 'Build pack', urgent: false };
  }
  return { stage: 'closeout', page: 'closeout', action: 'Capture closeout lessons', why: 'Record what worked for the next bid.', unlocks: 'Client & sector memory.', buttonLabel: 'Open Closeout', urgent: false };
}
