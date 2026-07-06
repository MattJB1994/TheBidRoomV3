/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tender Risk Radar — flags tender risks BEFORE the team starts drafting.
 *
 * Reads the blueprint (requirements, evidence, commercial register,
 * addenda, returnables, insurances/accreditations) and derives the
 * common infrastructure-tender risks: unclear scope, unrealistic
 * program, missing client information, insurance/accreditation gaps,
 * design warranty exposure, commercial/contract/pricing risk, addendum
 * scope change, reliance on client-supplied data, unresolved
 * clarifications and missing returnables.
 *
 * Deterministic and read-only. Returns RiskItem[] tagged source
 * 'Risk Radar' with category, source clause, affected module, severity,
 * suggested action and whether it affects export readiness.
 */
import { TenderBlueprint, RiskItem, RiskCategory, RiskRating, ModuleKey } from './types';

let seq = 0;
const rid = () => `radar_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

interface RadarRule {
  category: RiskCategory;
  detect: (bp: TenderBlueprint) => Omit<RiskItem, 'id' | 'source' | 'category' | 'status'>[];
}

const mk = (
  title: string,
  detail: string,
  rating: RiskRating,
  opts: { clauseRef?: string; affectedModuleKey?: ModuleKey | null; suggestedAction?: string; affectsExport?: boolean; requirementId?: string | null } = {},
): Omit<RiskItem, 'id' | 'source' | 'category' | 'status'> => ({
  title, detail, rating, mitigation: '', ownerId: null,
  requirementId: opts.requirementId ?? null,
  clauseRef: opts.clauseRef, affectedModuleKey: opts.affectedModuleKey ?? null,
  suggestedAction: opts.suggestedAction, affectsExport: opts.affectsExport ?? false,
});

const RULES: RadarRule[] = [
  {
    category: 'Scope',
    detect: (bp) => {
      const vague = bp.requirements.filter((r) => /as required|to be advised|tbа|tbc|where applicable|as necessary|as appropriate/i.test(r.text));
      return vague.slice(0, 3).map((r) => mk(
        'Unclear scope boundary',
        `Requirement ${r.id} uses open-ended wording ("${r.text.slice(0, 60)}…") that leaves the scope boundary unclear.`,
        'Medium',
        { clauseRef: r.clauseRef, affectedModuleKey: r.moduleKey, requirementId: r.id, suggestedAction: 'Raise a clarification to fix the scope boundary.' },
      ));
    },
  },
  {
    category: 'Client data reliance',
    detect: (bp) => {
      const reliant = bp.requirements.filter((r) => /client(?:-| )provided|client(?:-| )supplied|provided by the (?:principal|client)|existing (?:survey|data|drawings)/i.test(r.text));
      return reliant.slice(0, 2).map((r) => mk(
        'Reliance on client supplied data',
        `Requirement ${r.id} relies on client-supplied information; if it is late or inaccurate, delivery risk transfers to us.`,
        'Medium',
        { clauseRef: r.clauseRef, affectedModuleKey: r.moduleKey, requirementId: r.id, suggestedAction: 'Record a commercial assumption qualifying reliance on client data.' },
      ));
    },
  },
  {
    category: 'Program',
    detect: (bp) => {
      const programReq = bp.requirements.some((r) => /program|programme|milestone|completion date|timeframe/i.test(r.text));
      const hasProgramEvidence = bp.evidence.some((e) => e.type === 'Program' && (e.status === 'found' || e.matchedFile));
      return programReq && !hasProgramEvidence
        ? [mk('Program feasibility not evidenced', 'The tender sets program/milestone expectations but no delivery program or supporting assumptions are linked.', 'High', { affectedModuleKey: 'program-staging', suggestedAction: 'Attach a delivery program and record its assumptions.', affectsExport: false })]
        : [];
    },
  },
  {
    category: 'Insurance',
    detect: (bp) => {
      const required = bp.requiredInsurances ?? [];
      const held = bp.evidence.filter((e) => e.type === 'Insurance certificate' && (e.status === 'found' || e.matchedFile)).length;
      return required.length && held === 0
        ? [mk('Insurance gap', `The tender requires ${required.length} insurance(s) but no certificate of currency is linked.`, 'High', { affectedModuleKey: 'commercial-assumptions', suggestedAction: 'Attach certificates of currency or raise an SME request.', affectsExport: true })]
        : [];
    },
  },
  {
    category: 'Accreditation',
    detect: (bp) => {
      const required = bp.requiredAccreditations ?? [];
      const held = bp.evidence.filter((e) => e.type === 'Accreditation' && (e.status === 'found' || e.matchedFile)).length;
      return required.length && held === 0
        ? [mk('Accreditation gap', `The tender requires ${required.length} accreditation(s) but none is linked as evidence.`, 'High', { affectedModuleKey: 'systems-assurance', suggestedAction: 'Attach the accreditation certificate or raise an SME request.', affectsExport: true })]
        : [];
    },
  },
  {
    category: 'Design warranty',
    detect: (bp) => {
      const design = bp.requirements.some((r) => /design (?:warrant|liabilit|fit for purpose)|fitness for purpose/i.test(r.text));
      return design
        ? [mk('Design warranty / fitness-for-purpose exposure', 'The tender imposes design warranty or fitness-for-purpose obligations that may exceed standard PI cover.', 'Medium', { affectedModuleKey: 'departures-clarifications', suggestedAction: 'Consider a departure and confirm PI cover.' })]
        : [];
    },
  },
  {
    category: 'Pricing',
    detect: (bp) => {
      const pricingItems = bp.commercial.filter((c) => c.type === 'Pricing assumption');
      const hasPricingForm = /pricing|schedule of rates|lump sum|provisional/i.test(bp.summary);
      return hasPricingForm && pricingItems.length === 0
        ? [mk('Pricing schedule inconsistency risk', 'The tender includes pricing schedules but no pricing assumptions are recorded, risking inconsistent commercial positions.', 'Medium', { affectedModuleKey: 'pricing-response', suggestedAction: 'Record pricing assumptions in the Commercial Assumptions Register.' })]
        : [];
    },
  },
  {
    category: 'Addendum',
    detect: (bp) => bp.addenda.filter((a) => !a.reviewed).map((a) => mk(
      'Addendum changing scope',
      `${a.documentName} has not been reviewed and may change scope, pricing or requirements.`,
      'High',
      { suggestedAction: 'Review the addendum impact before export.', affectsExport: true },
    )),
  },
  {
    category: 'Clarification',
    detect: (bp) => {
      const open = bp.commercial.filter((c) => c.type === 'Clarification' && c.status === 'Open').length;
      return open
        ? [mk('Unresolved clarification', `${open} clarification(s) remain open and could change the response.`, 'Medium', { affectedModuleKey: 'departures-clarifications', suggestedAction: 'Resolve or submit the open clarifications.' })]
        : [];
    },
  },
  {
    category: 'Returnable',
    detect: (bp) => {
      const returnables = bp.returnables ?? [];
      // A returnable with no matching module/requirement coverage is a gap.
      const uncovered = returnables.filter((ret) => !bp.requirements.some((r) => r.text.toLowerCase().includes(ret.toLowerCase().slice(0, 12))));
      return uncovered.length
        ? [mk('Missing returnable coverage', `${uncovered.length} returnable schedule(s) may not be covered by a drafted response.`, 'Medium', { affectedModuleKey: 'returnable-schedules', suggestedAction: 'Confirm each returnable has an owner and a response.', affectsExport: true })]
        : [];
    },
  },
];

/**
 * Runs the Risk Radar over a blueprint and returns tender risks. Pure —
 * the caller decides whether to merge these into bp.risks (deduping on
 * title) or show them in a dedicated radar view.
 */
export function runRiskRadar(bp: TenderBlueprint): RiskItem[] {
  const out: RiskItem[] = [];
  for (const rule of RULES) {
    for (const partial of rule.detect(bp)) {
      out.push({ ...partial, id: rid(), source: 'Risk Radar', category: rule.category, status: 'Open' });
    }
  }
  return out;
}

/** Summary counts for the radar (dashboard / blueprint tile). */
export function riskRadarSummary(risks: RiskItem[]): { total: number; high: number; affectingExport: number } {
  const radar = risks.filter((r) => r.source === 'Risk Radar');
  return {
    total: radar.length,
    high: radar.filter((r) => r.rating === 'High').length,
    affectingExport: radar.filter((r) => r.affectsExport).length,
  };
}
