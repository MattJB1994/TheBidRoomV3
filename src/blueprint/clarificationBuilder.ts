/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SME Request Builder + Clarification / Departures Generator.
 *
 * Both are deterministic generators that turn blueprint state (missing
 * evidence, requirement gaps, commercial risks, ambiguous clauses) into
 * clear, copyable draft items a bid manager would actually send or lodge.
 * They produce proposed wording; they don't auto-submit anything.
 */
import {
  TenderBlueprint, EvidenceItem, Requirement, ModuleKey, ReviewDiscipline,
} from './types';
import { MODULE_NAME } from './engine';

/* ── SME Request Builder ───────────────────────────────────────────── */

export interface SmeRequest {
  id: string;
  title: string;
  requiredInput: string;
  linkedRequirementId: string | null;
  linkedRequirementText: string | null;
  linkedModuleKey: ModuleKey | null;
  linkedModuleName: string | null;
  evidenceNeeded: string;
  suggestedRecipientRole: ReviewDiscipline | 'SME';
  suggestedMessage: string;         // copyable
  dueDate: string | null;
  status: 'Draft' | 'Sent' | 'Answered' | 'Closed';
  createdAt: string;
}

const DISCIPLINE_FOR_MODULE: Partial<Record<ModuleKey, ReviewDiscipline>> = {
  'systems-assurance': 'Assurance', 'safety': 'Safety', 'pricing-response': 'Commercial',
  'commercial-assumptions': 'Commercial', 'departures-clarifications': 'Legal / Contract',
  'technical-methodology': 'Technical', 'design-management': 'Technical',
  'construction-methodology': 'Technical', 'quality-management': 'Technical',
  'environmental-management': 'Technical',
};

let sseq = 0;
const sid = () => `sme_${(sseq++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Builds an SME request from a specific missing-evidence item. */
export function buildSmeRequestFromEvidence(bp: TenderBlueprint, evidence: EvidenceItem): SmeRequest {
  const req = bp.requirements.find((r) => r.id === evidence.requirementId) ?? null;
  const moduleKey = evidence.moduleKey ?? req?.moduleKey ?? null;
  const moduleName = moduleKey ? MODULE_NAME[moduleKey] : null;
  const clause = req?.clauseRef ? ` from ${req.clauseRef}` : '';
  const reqRef = req ? `${req.id}${clause}` : 'the linked requirement';
  const blocking = moduleName ? ` and is blocking the ${moduleName} section` : '';
  const message = `Can you provide ${evidence.label.toLowerCase().startsWith('a ') || evidence.label.toLowerCase().startsWith('an ') ? '' : 'a '}${evidence.label}? This is required for ${reqRef}${blocking}.`;
  return {
    id: sid(),
    title: `Provide: ${evidence.label}`,
    requiredInput: evidence.label,
    linkedRequirementId: req?.id ?? null,
    linkedRequirementText: req?.text ?? null,
    linkedModuleKey: moduleKey,
    linkedModuleName: moduleName,
    evidenceNeeded: evidence.type,
    suggestedRecipientRole: (moduleKey && DISCIPLINE_FOR_MODULE[moduleKey]) || 'SME',
    suggestedMessage: message,
    dueDate: null,
    status: 'Draft',
    createdAt: new Date().toISOString(),
  };
}

/** Builds SME requests for every unresolved missing-evidence item. */
export function buildSmeRequests(bp: TenderBlueprint): SmeRequest[] {
  return bp.evidence
    .filter((e) => e.status === 'missing' && !e.resolution)
    .map((e) => buildSmeRequestFromEvidence(bp, e));
}

/* ── Clarification / Departures Generator ──────────────────────────── */

export type ClarificationItemType =
  | 'Clarification' | 'Assumption' | 'Exclusion' | 'Qualification'
  | 'Departure' | 'Provisional item' | 'Client dependency';

export interface ClarificationItem {
  id: string;
  type: ClarificationItemType;
  sourceRequirementId: string | null;
  sourceClause: string | null;
  reason: string;
  proposedWording: string;          // copyable draft wording
  ownerId: string | null;
  reviewerRole: ReviewDiscipline;
  status: 'Draft' | 'In review' | 'Approved' | 'Submitted' | 'Withdrawn';
  affectsExport: boolean;
  createdAt: string;
}

let cseq = 0;
const cid = () => `clar_${(cseq++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const AMBIGUOUS = /as required|to be advised|tba|tbc|where applicable|as necessary|as appropriate|as directed|to be confirmed/i;
const RELIANCE = /client(?:-| )provided|client(?:-| )supplied|provided by the (?:principal|client)|existing (?:survey|data|drawings)/i;

/**
 * Generates a controlled clarification / departures register from the
 * blueprint: ambiguous clauses → clarifications, client-data reliance →
 * dependencies, commercial risks → assumptions/exclusions, and unmet
 * mandatory requirements → qualifications. Each item carries proposed
 * wording the team can lodge or adapt.
 */
export function generateClarifications(bp: TenderBlueprint): ClarificationItem[] {
  const items: ClarificationItem[] = [];
  const now = () => new Date().toISOString();

  // Ambiguous clauses → clarification questions.
  bp.requirements.filter((r) => AMBIGUOUS.test(r.text)).slice(0, 6).forEach((r) => {
    items.push({
      id: cid(), type: 'Clarification',
      sourceRequirementId: r.id, sourceClause: r.clauseRef || null,
      reason: `Requirement ${r.id} uses open-ended wording that leaves scope unclear.`,
      proposedWording: `Please confirm the intended scope for ${r.clauseRef || r.id}: "${r.text.slice(0, 90)}${r.text.length > 90 ? '…' : ''}". We have assumed [state assumption] for pricing.`,
      ownerId: r.ownerId, reviewerRole: 'Bid Manager', status: 'Draft', affectsExport: false, createdAt: now(),
    });
  });

  // Client-data reliance → client dependencies.
  bp.requirements.filter((r) => RELIANCE.test(r.text)).slice(0, 4).forEach((r) => {
    items.push({
      id: cid(), type: 'Client dependency',
      sourceRequirementId: r.id, sourceClause: r.clauseRef || null,
      reason: `Requirement ${r.id} relies on client-supplied information.`,
      proposedWording: `Our response and pricing assume the client provides [survey/data/drawings] by [date]. Delays or inaccuracies in this information may affect program and cost.`,
      ownerId: r.ownerId, reviewerRole: 'Commercial', status: 'Draft', affectsExport: true, createdAt: now(),
    });
  });

  // Commercial risks → assumptions / exclusions.
  bp.commercial.filter((c) => c.type === 'Commercial risk' || c.type === 'Contract concern').slice(0, 4).forEach((c) => {
    items.push({
      id: cid(), type: c.type === 'Contract concern' ? 'Departure' : 'Assumption',
      sourceRequirementId: null, sourceClause: c.clauseRef || null,
      reason: c.text,
      proposedWording: c.type === 'Contract concern'
        ? `We propose a departure to ${c.clauseRef || 'the referenced clause'}: [state departure and rationale].`
        : `Our offer assumes [state assumption arising from: ${c.text.slice(0, 80)}].`,
      ownerId: null, reviewerRole: c.type === 'Contract concern' ? 'Legal / Contract' : 'Commercial',
      status: 'Draft', affectsExport: c.type === 'Contract concern', createdAt: now(),
    });
  });

  // Unmet mandatory requirements → qualifications.
  bp.requirements.filter((r) => r.mandatory && r.compliance === 'Non-compliant').slice(0, 4).forEach((r) => {
    items.push({
      id: cid(), type: 'Qualification',
      sourceRequirementId: r.id, sourceClause: r.clauseRef || null,
      reason: `Mandatory requirement ${r.id} is currently marked non-compliant.`,
      proposedWording: `We qualify our response to ${r.clauseRef || r.id}: [state the qualification and the compliant alternative offered].`,
      ownerId: r.ownerId, reviewerRole: 'Legal / Contract', status: 'Draft', affectsExport: true, createdAt: now(),
    });
  });

  return items;
}
