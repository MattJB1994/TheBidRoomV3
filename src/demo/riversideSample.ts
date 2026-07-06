/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Riverside Water Treatment Upgrade RFT — a second worked sample.
 *
 * This one is a WON, submitted tender with a completed closeout, so that:
 *  - Client & Sector Memory has more than one tender to group (it shares
 *    the "Water" sector with nothing yet, but pairs with Bluewater under
 *    tender type "RFT" and shows a populated closeout);
 *  - the Closeout page shows a fully completed, positive outcome;
 *  - the workflow shows a finished tender (most stages done).
 *
 * Deterministic, AI-free and Supabase-free like the Bluewater sample.
 */
import { generateBlueprint } from '../blueprint/engine';
import { buildClaimRegister } from '../blueprint/proposalRun';
import { runSectionLoop } from '../blueprint/proposalLoops';
import { starterText } from '../blueprint/responsePatterns';
import { TenderBlueprint, ModuleKey } from '../blueprint/types';
import { Tender, TenderStatus, ExtractedTenderMetadata, TeamMember } from '../types';
import { SampleDoc, WorkedSample, sampleTeam } from './bluewaterSample';

export const RIVERSIDE_TENDER_ID = 'demo-riverside';

export const riversideTender: Tender = {
  id: RIVERSIDE_TENDER_ID,
  name: 'Riverside Water Treatment Upgrade RFT',
  number: 'RWA-2026-RFT-0088',
  client: 'Riverside Water Authority',
  closingDate: '2026-05-15',
  portal: 'Client procurement portal',
  status: TenderStatus.Submitted,
  estimatedValue: '$12-15m',
  probabilityOfWin: 100,
  ownerId: 'demo-user-1',
};

export const riversideDocuments: SampleDoc[] = [
  { id: 'rdoc-rft', name: 'Riverside WTP RFT.pdf', tag: 'RFT', extractionStatus: 'extracted' },
  { id: 'rdoc-scope', name: 'Scope of Works.pdf', tag: 'Scope', extractionStatus: 'extracted' },
  { id: 'rdoc-pricing', name: 'Pricing Schedule.xlsx', tag: 'Pricing schedule', extractionStatus: 'extracted' },
  { id: 'rdoc-compliance', name: 'Compliance Matrix.xlsx', tag: 'Compliance matrix', extractionStatus: 'extracted' },
];

const riversideExtracted: ExtractedTenderMetadata = {
  client: 'Riverside Water Authority',
  tenderName: 'Riverside Water Treatment Upgrade RFT',
  tenderNumber: 'RWA-2026-RFT-0088',
  closingDate: '2026-05-15',
  submissionPortal: 'Client procurement portal',
  summary: 'Riverside Water Authority sought design and construction services to upgrade the Riverside water treatment plant, including process, civil and environmental works.',
  mandatoryRequirements: [
    'Provide a technical methodology for treatment plant upgrade delivery',
    'Describe your design management approach',
    'Provide quality management including ITPs and hold points',
    'Provide environmental management including erosion and sediment control',
    'Describe safety and Safety in Design management',
    'Nominate key personnel and provide CVs',
    'Provide relevant experience on comparable water treatment projects',
    'Complete the pricing schedule',
    'State commercial assumptions and exclusions',
    'Complete and return all returnable schedules',
  ],
  evaluationCriteria: ['Technical capability', 'Delivery methodology', 'Key personnel', 'Relevant experience', 'Price'],
  requiredSchedules: ['Schedule A — Pricing', 'Schedule B — Returnable compliance', 'Schedule C — Key personnel'],
  pageLimits: '40 pages excluding CVs and schedules',
  wordLimits: '',
  attachmentsCount: 4,
  pricingFormsCount: 1,
  requiredCVsCount: 4,
  requiredProjectExamplesCount: 2,
  mandatoryInsurances: ['Public liability $20m', 'Professional indemnity $10m'],
  requiredPolicies: ['WHS', 'Environmental', 'Quality'],
  addendaCount: 0,
};

const ACTIVE: ModuleKey[] = [
  'executive-summary', 'technical-methodology', 'design-management', 'safety',
  'quality-management', 'environmental-management', 'key-personnel', 'cvs',
  'relevant-experience', 'case-studies', 'commercial-assumptions', 'pricing-response',
  'compliance-matrix', 'returnable-schedules', 'submission-checklist',
];

function wonDraft(name: string, key: ModuleKey): string {
  return `${starterText(key, name)}\n\nOur upgrade approach is evidenced by comparable water treatment delivery and a named, available team. Interfaces with live plant operations are managed through staged tie-ins.\n\n*(Submitted version.)*`;
}

/** Builds the Riverside sample — a finished, won tender. */
export function buildRiversideBlueprint(): TenderBlueprint {
  let bp = generateBlueprint({
    tender: riversideTender, extracted: riversideExtracted,
    kbFiles: [], personnel: [], team: sampleTeam,
    documentNames: riversideDocuments.map((d) => d.name),
  });

  bp = { ...bp, modules: bp.modules.map((m) => ACTIVE.includes(m.key) ? { ...m, active: true, activationReason: m.activationReason ?? 'Activated for the Riverside sample.' } : m) };

  // Everything drafted and approved (a finished submission).
  bp.modules = bp.modules.map((m) => m.active
    ? { ...m, draft: wonDraft(m.name, m.key), draftStatus: 'Approved' }
    : m);

  // Requirements complete, evidence found, reviews approved.
  bp.requirements = bp.requirements.map((r) => ({ ...r, status: 'Complete', compliance: 'Compliant' }));
  bp.evidence = bp.evidence.map((e) => ({ ...e, status: 'found', matchedFile: e.matchedFile ?? `${e.type.toLowerCase().replace(/\s+/g, '-')}.pdf` }));
  bp.reviews = bp.reviews.map((r) => ({ ...r, status: 'Approved' }));

  const now = new Date().toISOString();
  bp.commercial = [
    { id: 'rcom-1', type: 'Pricing assumption', text: 'Rates assume continuous plant access during the upgrade.', status: 'Approved', exportReady: true, source: 'Analysis', createdAt: now, linkedModuleKey: 'pricing-response', reviewerId: 'demo-user-3' },
    { id: 'rcom-2', type: 'Scope exclusion', text: 'Excludes decommissioning of the legacy clarifier.', status: 'Approved', exportReady: true, source: 'Manual', createdAt: now, linkedModuleKey: 'commercial-assumptions', reviewerId: 'demo-user-3' },
  ];

  bp.proposalNotes = {
    proposalStory: 'A low-risk plant upgrade by a team that has delivered comparable water treatment works.',
    clientPriorities: 'Continuity of supply, safety around live plant, environmental compliance.',
    keyDifferentiators: 'Comparable water treatment delivery; strong environmental credentials.',
    termsToUse: 'staged tie-ins, continuity of supply',
    updatedAt: now,
  };

  bp.claimRegister = buildClaimRegister(bp);
  bp.modules = bp.modules.map((m) => (m.active && m.draft ? { ...m, loop: runSectionLoop(bp, m) } : m));

  bp.proposalVersions = [{
    id: 'rver-1', createdAt: now, userId: 'demo-user-1', action: 'review-ready',
    masterPromptVersion: 'v1', affectedModules: ACTIVE,
    summary: 'Review-ready draft prepared and submitted.', notesUsed: true, snapshots: [],
  }];

  // Completed, positive closeout — feeds Client & Sector Memory.
  bp.closeout = {
    outcome: 'Won',
    clientFeedback: 'Evaluators noted the clarity of the staged tie-in methodology and the strength of the named team.',
    whatWorked: 'Reusing the environmental management and Safety in Design sections from prior water projects saved roughly a week.',
    whatSlowedUs: 'Pricing sign-off waited on a late subcontractor quote.',
    evidenceReused: 'Two water treatment case studies and the environmental management plan.',
    sectionsReused: 'Environmental Management, Safety in Design, Quality Management.',
    gapsEncountered: 'Needed an additional process engineer CV mid-bid.',
    lessons: 'Lock subcontractor pricing earlier; keep the water-sector case studies current.',
    commercialLessons: 'The clarifier exclusion was well received — reuse that wording.',
    reusablePatterns: 'Staged tie-in methodology; environmental compliance narrative.',
    updatedAt: now,
  };

  return bp;
}

export function loadRiversideSample(): WorkedSample {
  return {
    tender: { ...riversideTender },
    team: sampleTeam.map((t) => ({ ...t })),
    documents: riversideDocuments.map((d) => ({ ...d })),
    blueprint: buildRiversideBlueprint(),
    kbFiles: [],
  };
}
