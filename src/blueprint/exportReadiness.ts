/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Export readiness gating — pure and testable. A pack is NOT ready just
 * because some content exists: these rules check what actually matters
 * before a pack should leave the building — mandatory requirements
 * answered, evidence found or formally waived, drafts written, the
 * relevant review gates approved, addenda reviewed, commercial issues
 * closed, word limits respected, and (for the full proposal) final
 * approval. Internal working exports (risk register, checklist,
 * approval pack) stay available because their whole point is reporting
 * current state, including incompleteness.
 */
import { TenderBlueprint, ExportKey, ExportRequirementLevel, BlueprintScores } from './types';

export interface ExportReadiness {
  ready: boolean;
  blockedBy: string | null;
}

const firstBlock = (checks: [boolean, string][]): ExportReadiness => {
  const failing = checks.find(([ok]) => !ok);
  return failing ? { ready: false, blockedBy: failing[1] } : { ready: true, blockedBy: null };
};

export function exportReadiness(bp: TenderBlueprint, key: ExportKey, level: ExportRequirementLevel, scores: BlueprintScores): ExportReadiness {
  const activeMods = bp.modules.filter((m) => m.active);
  const gateApproved = (moduleKey: string) =>
    bp.reviews.filter((t) => t.moduleKey === moduleKey).every((t) => t.status === 'Approved') &&
    bp.reviews.some((t) => t.moduleKey === moduleKey);
  const moduleGates = bp.reviews.filter((t) => t.discipline !== 'Final Approval');
  const allGatesApproved = moduleGates.length > 0 && moduleGates.every((t) => t.status === 'Approved');
  const finalApproved = bp.reviews.find((t) => t.discipline === 'Final Approval')?.status === 'Approved';
  const addendaPending = bp.addenda.filter((a) => !a.reviewed).length;
  const mandatoryUnanswered = bp.requirements.filter((r) => r.mandatory && (r.status === 'Not started' || r.status === 'In progress')).length;
  const evidenceGaps = bp.evidence.filter((e) => e.status === 'missing').length; // formally waived items are resolved, not gaps
  // Commercial control now comes from the Commercial Assumptions
  // Register: any Open (unacknowledged) item is an unresolved position,
  // plus any open commercial/pricing risk.
  const openCommercialItems = (bp.commercial ?? []).filter((c) => c.status === 'Open').length;
  const commercialRiskOpen = bp.risks.filter((r) => r.status === 'Open' && /commercial|pricing/i.test(r.title)).length;
  const commercialOpen = openCommercialItems + commercialRiskOpen;
  const undraftedActive = activeMods.filter((m) => !m.draft && m.key !== 'submission-checklist' && m.key !== 'compliance-matrix' && m.key !== 'returnable-schedules').length;

  switch (key) {
    case 'full-proposal':
      return firstBlock([
        [undraftedActive === 0, `${undraftedActive} active module${undraftedActive === 1 ? '' : 's'} not drafted`],
        [mandatoryUnanswered === 0, `${mandatoryUnanswered} mandatory requirement${mandatoryUnanswered === 1 ? '' : 's'} unanswered`],
        [evidenceGaps === 0, `${evidenceGaps} evidence gap${evidenceGaps === 1 ? '' : 's'} open (resolve or formally waive)`],
        [scores.wordLimitIssues === 0, `${scores.wordLimitIssues} module${scores.wordLimitIssues === 1 ? '' : 's'} over word limit`],
        [addendaPending === 0, `${addendaPending} addendum${addendaPending === 1 ? '' : 'a'} not yet reviewed`],
        [allGatesApproved, 'Module review gates not all approved'],
        [finalApproved, 'Final approval not granted'],
      ]);
    case 'executive-summary': {
      const m = bp.modules.find((x) => x.key === 'executive-summary');
      return firstBlock([
        [!!m?.draft, 'Executive Summary module not drafted'],
        [gateApproved('executive-summary'), 'Bid Director review not approved'],
      ]);
    }
    case 'compliance-matrix':
      return level === 'Required by client'
        ? firstBlock([
            [mandatoryUnanswered === 0, `${mandatoryUnanswered} mandatory requirement${mandatoryUnanswered === 1 ? '' : 's'} unanswered`],
            [addendaPending === 0, 'Addenda pending review — matrix may be stale'],
          ])
        : { ready: true, blockedBy: null }; // internal working document
    case 'returnable-schedules':
      return firstBlock([
        [bp.requirements.filter((r) => r.type === 'Mandatory returnable').every((r) => r.status === 'Complete'), 'Returnable requirements not all complete'],
        [addendaPending === 0, 'Addenda pending review — returnable list may have changed'],
      ]);
    case 'pricing-assumptions':
      return firstBlock([
        [!!((bp.commercial ?? []).length || bp.inputs.keyAssumptions.length || bp.inputs.commercialPosition), 'Add commercial assumptions in the Commercial register first'],
        [commercialOpen === 0, `${commercialOpen} open commercial item${commercialOpen === 1 ? '' : 's'} to resolve or acknowledge`],
        [gateApproved('pricing-response') || gateApproved('commercial-assumptions'), 'Commercial review not approved'],
      ]);
    case 'commercial-departures': {
      const active = bp.modules.find((m) => m.key === 'departures-clarifications')?.active;
      return active
        ? firstBlock([[gateApproved('departures-clarifications'), 'Legal / contract review not approved']])
        : { ready: true, blockedBy: null };
    }
    case 'cv-pack':
      return firstBlock([
        [bp.evidence.some((e) => e.type === 'CV' && e.status === 'found'), 'No CV evidence matched yet'],
        [gateApproved('cvs') || gateApproved('key-personnel'), 'Bid Manager review of CVs not approved'],
      ]);
    case 'case-study-pack':
      return firstBlock([
        [bp.evidence.some((e) => e.type === 'Case study' && e.status === 'found'), 'No case-study evidence matched yet'],
      ]);
    case 'pitch-deck': {
      const m = bp.modules.find((x) => x.key === 'pitch-deck');
      return firstBlock([
        [!!m?.active, 'No shortlist / presentation stage detected'],
        [!!m?.draft || bp.inputs.winThemes.length > 0, 'Add win themes or a pitch-deck draft first'],
      ]);
    }
    // Internal working exports: their purpose is reporting the CURRENT
    // state (including incompleteness), so they stay live.
    case 'risk-register':
    case 'submission-checklist':
    case 'internal-approval-pack':
      return { ready: true, blockedBy: null };
    default:
      return { ready: true, blockedBy: null };
  }
}
