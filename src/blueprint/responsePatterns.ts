/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Response Pattern Library — default structure and SAFE starter text for
 * each infrastructure proposal module, so users never face a blank
 * section.
 *
 * Hard rule: starter text must NOT make unsupported claims. It uses
 * bracketed placeholders that prompt the user to insert evidence, e.g.
 *   "[Insert relevant project evidence showing comparable delivery]"
 * never "We have extensive experience delivering similar projects."
 */
import { ModuleKey } from './types';

export interface ModulePattern {
  headings: string[];
  evidencePrompts: string[];
  commonRisks: string[];
  reviewNotes: string;
  /** Warnings about claims that would be unsupported without evidence. */
  unsupportedClaimWarnings: string[];
}

const PATTERNS: Partial<Record<ModuleKey, ModulePattern>> = {
  'executive-summary': {
    headings: ['Our understanding', 'Why us (evidence-backed)', 'Key commitments', 'Value & assurance'],
    evidencePrompts: ['[Reference the strongest 2-3 comparable projects — see Relevant Experience]', '[Name the nominated project lead — see Key Personnel]'],
    commonRisks: ['Generic opening that could apply to any tender', 'Claims not backed elsewhere in the proposal'],
    reviewNotes: 'Bid Director review. Must summarise the proposal, not introduce new claims.',
    unsupportedClaimWarnings: ['Avoid "extensive experience" without linked case studies', 'Avoid naming personnel without a linked CV'],
  },
  'technical-methodology': {
    headings: ['Delivery approach', 'Method by work element', 'Interfaces & assurance (cross-ref)', 'Risk controls'],
    evidencePrompts: ['[Insert the methodology reference or standard this approach follows]', '[Reference Systems Assurance for verification detail — do not duplicate]'],
    commonRisks: ['Duplicating assurance detail that belongs in Systems Assurance', 'Vague "proven methodology" claims'],
    reviewNotes: 'Technical review required.',
    unsupportedClaimWarnings: ['Avoid claiming a method is "proven" without a project reference'],
  },
  'systems-assurance': {
    headings: ['Assurance framework', 'Verification & validation', 'RVTM / acceptance', 'Assurance evidence'],
    evidencePrompts: ['[Insert an assurance document or comparable assurance project example]', '[Reference the applicable assurance standard]'],
    commonRisks: ['Assurance capability claimed without a project example or accreditation'],
    reviewNotes: 'Assurance review required.',
    unsupportedClaimWarnings: ['Avoid "assurance capability" claims without a linked assurance document or example'],
  },
  'design-management': {
    headings: ['Design management approach', 'Interdisciplinary coordination', 'Design reviews & deliverables'],
    evidencePrompts: ['[Insert a comparable design-managed project — see Relevant Experience]', '[Reference the design management plan or standard]'],
    commonRisks: ['Design warranty exposure not qualified in Commercial Assumptions'],
    reviewNotes: 'Technical / design review required.',
    unsupportedClaimWarnings: ['Avoid design-capability claims without a design example'],
  },
  'program-staging': {
    headings: ['Program overview', 'Staging & sequencing', 'Access / possession windows', 'Program assumptions'],
    evidencePrompts: ['[Attach or reference the delivery program]', '[List the program assumptions — add to Commercial Assumptions]'],
    commonRisks: ['Program certainty claimed without stated assumptions', 'Access windows assumed but not confirmed'],
    reviewNotes: 'Technical / delivery review required.',
    unsupportedClaimWarnings: ['Avoid "on-schedule delivery" claims without a program and assumptions'],
  },
  'key-personnel': {
    headings: ['Team structure', 'Nominated key personnel', 'Availability & commitment'],
    evidencePrompts: ['[Insert each nominated person and link their CV]', '[State availability — do not claim without confirmation]'],
    commonRisks: ['Availability claimed without a nominated person or CV'],
    reviewNotes: 'Bid Manager review required.',
    unsupportedClaimWarnings: ['Avoid availability/nomination claims without a linked CV'],
  },
  'relevant-experience': {
    headings: ['Comparable project summary', 'Relevance to this tender', 'Outcomes & references'],
    evidencePrompts: ['[Insert relevant project evidence showing comparable delivery experience]', '[Attach project sheets or client references]'],
    commonRisks: ['Experience asserted without a project sheet or case study'],
    reviewNotes: 'Bid Manager / project owner review required.',
    unsupportedClaimWarnings: ['Avoid "proven track record" without linked project evidence'],
  },
  'case-studies': {
    headings: ['Project overview', 'Challenge & approach', 'Outcome & relevance'],
    evidencePrompts: ['[Insert a specific case study with client, value, scope and outcome]'],
    commonRisks: ['Reusing the same case study across many sections (repetition)'],
    reviewNotes: 'Bid Manager / project owner review required.',
    unsupportedClaimWarnings: ['Avoid outcome claims without a documented case study'],
  },
  'safety': {
    headings: ['Safety management approach', 'Safety in Design', 'Safe work methods', 'Safety record (if evidenced)'],
    evidencePrompts: ['[Insert safety management plan or SWMS reference]', '[Insert safety record only if a supporting document exists]'],
    commonRisks: ['Safety performance figures claimed without a supporting record'],
    reviewNotes: 'Safety review required.',
    unsupportedClaimWarnings: ['Avoid safety-performance claims (e.g. LTIFR, zero harm) without a linked record'],
  },
  'commercial-assumptions': {
    headings: ['Pricing assumptions', 'Exclusions', 'Qualifications & dependencies'],
    evidencePrompts: ['[List each assumption, exclusion and dependency — mirror in the Commercial Assumptions Register]'],
    commonRisks: ['Assumptions in prose not captured in the register'],
    reviewNotes: 'Commercial review required.',
    unsupportedClaimWarnings: [],
  },
  'pricing-response': {
    headings: ['Pricing basis', 'Rates & schedules', 'Provisional / optional items'],
    evidencePrompts: ['[Reference the pricing schedule and its basis]', '[Cross-reference Commercial Assumptions]'],
    commonRisks: ['Pricing basis inconsistent with the Commercial Assumptions Register'],
    reviewNotes: 'Commercial review required.',
    unsupportedClaimWarnings: [],
  },
  'departures-clarifications': {
    headings: ['Departures', 'Qualifications', 'Clarifications sought'],
    evidencePrompts: ['[List each departure with the affected clause and proposed wording]'],
    commonRisks: ['Departures not routed to contract/legal review'],
    reviewNotes: 'Contract / legal review required.',
    unsupportedClaimWarnings: [],
  },
  'construction-methodology': {
    headings: ['Construction approach', 'Staging & sequencing', 'Site constraints & buildability', 'Interfaces (cross-ref)'],
    evidencePrompts: ['[Reference a comparable construction-staged project — see Relevant Experience]', '[Reference the delivery program — see Program & Staging]'],
    commonRisks: ['Duplicating program detail that belongs in Program & Staging', 'Site constraints assumed but not confirmed'],
    reviewNotes: 'Technical / delivery review required.',
    unsupportedClaimWarnings: ['Avoid buildability claims without a comparable project reference'],
  },
  'possession-access-planning': {
    headings: ['Access strategy', 'Possession / occupation planning', 'Contingency & handback'],
    evidencePrompts: ['[Reference comparable possession/shutdown delivery — see Relevant Experience]', '[List access-window assumptions — add to Commercial Assumptions]'],
    commonRisks: ['Access windows assumed but not confirmed with the client', 'Handback obligations under-scoped'],
    reviewNotes: 'Technical / delivery review required.',
    unsupportedClaimWarnings: ['Avoid claiming possession availability without confirmation'],
  },
  'stakeholder-management': {
    headings: ['Stakeholder map', 'Engagement approach', 'Authority approvals & consultation'],
    evidencePrompts: ['[Reference a comparable stakeholder-managed project]', '[List the key authorities and third parties]'],
    commonRisks: ['Community / authority approval timelines outside our control'],
    reviewNotes: 'Bid Manager review required.',
    unsupportedClaimWarnings: ['Avoid claiming relationships with authorities without evidence'],
  },
  'quality-management': {
    headings: ['Quality management system', 'ITPs & hold points', 'Quality records & assurance'],
    evidencePrompts: ['[Reference the quality management plan or certification]', '[Reference sample ITPs / hold-point schedules]'],
    commonRisks: ['Quality certification claimed without a certificate'],
    reviewNotes: 'Technical review required.',
    unsupportedClaimWarnings: ['Avoid ISO/quality certification claims without a linked certificate'],
  },
  'environmental-management': {
    headings: ['Environmental management approach', 'Approvals & compliance', 'Erosion / sediment / contamination controls'],
    evidencePrompts: ['[Reference the environmental management plan]', '[Reference comparable environmentally-constrained delivery]'],
    commonRisks: ['Approval timelines outside our control', 'Contamination risk not qualified commercially'],
    reviewNotes: 'Technical review required.',
    unsupportedClaimWarnings: ['Avoid sustainability claims without supporting documentation'],
  },
  'submission-checklist': {
    headings: ['Mandatory returnables', 'Review gate status', 'Final approval'],
    evidencePrompts: ['[Confirm each returnable is attached and each gate approved]'],
    commonRisks: ['Marking complete before review gates pass'],
    reviewNotes: 'Final approval required.',
    unsupportedClaimWarnings: [],
  },
};

const GENERIC: ModulePattern = {
  headings: ['Our understanding', 'Our approach', 'Evidence', 'Risks & controls'],
  evidencePrompts: ['[Insert relevant evidence for this section]'],
  commonRisks: ['Generic wording that does not answer the requirement'],
  reviewNotes: 'Review required before export.',
  unsupportedClaimWarnings: ['Avoid claims that are not backed by linked evidence'],
};

export function getModulePattern(key: ModuleKey): ModulePattern {
  return PATTERNS[key] ?? GENERIC;
}

/**
 * Safe starter text for a module — headings plus placeholder prompts.
 * Contains NO unsupported claims; every substantive line is a bracketed
 * prompt for the user to fill with evidence. Marked as a working draft.
 */
export function starterText(key: ModuleKey, moduleName: string): string {
  const p = getModulePattern(key);
  const body = p.headings
    .map((h, i) => `### ${h}\n${p.evidencePrompts[i] ?? '[Insert content for this section, backed by linked evidence.]'}`)
    .join('\n\n');
  return `## ${moduleName}\n\n${body}\n\n> *Working draft from the Response Pattern Library — starter structure only, not final content. Replace the bracketed prompts with evidence-backed content.*`;
}
