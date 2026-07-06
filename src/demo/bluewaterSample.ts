/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Bluewater Junction Corridor Renewal RFT — a fully worked, deterministic
 * demo sample. Loads instantly, never calls AI or Supabase, and is
 * intentionally imperfect so the whole workflow (blockers, gaps, addenda,
 * commercial, drafts, checks, exports, closeout) has something to show.
 *
 * Built by running the real engine (generateBlueprint) to get a valid,
 * fully-typed blueprint, then layering realistic issues on top — so the
 * sample always matches the current type shapes without hand-maintaining
 * every field.
 */
import { generateBlueprint, applyAddendumImpact, analyzeAddendum } from '../blueprint/engine';
import { runSectionLoop, buildLoopReport } from '../blueprint/proposalLoops';
import { buildClaimRegister } from '../blueprint/proposalRun';
import { runRiskRadar } from '../blueprint/riskRadar';
import { starterText } from '../blueprint/responsePatterns';
import { TenderBlueprint, ModuleKey } from '../blueprint/types';
import { Tender, TenderStatus, ExtractedTenderMetadata, TeamMember, KBFile } from '../types';

export const SAMPLE_TENDER_ID = 'demo-bluewater';

export const sampleTender: Tender = {
  id: SAMPLE_TENDER_ID,
  name: 'Bluewater Junction Corridor Renewal RFT',
  number: 'HWR-2026-RFT-0142',
  client: 'Harbour & Western Rail',
  closingDate: '2026-08-28',
  portal: 'Client procurement portal',
  status: TenderStatus.Drafting,
  estimatedValue: '$18-24m',
  probabilityOfWin: 55,
  ownerId: 'demo-user-1',
};

export const sampleTeam: TeamMember[] = [
  { id: 'demo-user-1', name: 'Alex Bidmanager', email: 'alex@example.com', role: 'BID_MANAGER' },
  { id: 'demo-user-2', name: 'Sam Technical', email: 'sam@example.com', role: 'CONTRIBUTOR' },
  { id: 'demo-user-3', name: 'Jordan Commercial', email: 'jordan@example.com', role: 'CONTRIBUTOR' },
];

/** Documents shown in Intake — includes one scanned (OCR-limited) addendum. */
export interface SampleDoc {
  id: string;
  name: string;
  tag: string;
  extractionStatus: 'extracted' | 'scanned' | 'pending';
  note?: string;
}
export const sampleDocuments: SampleDoc[] = [
  { id: 'doc-rft', name: 'Bluewater Junction RFT.pdf', tag: 'RFT', extractionStatus: 'extracted' },
  { id: 'doc-scope', name: 'Scope of Works.pdf', tag: 'Scope', extractionStatus: 'extracted' },
  { id: 'doc-pricing', name: 'Pricing Schedule.xlsx', tag: 'Pricing schedule', extractionStatus: 'extracted' },
  { id: 'doc-compliance', name: 'Compliance Matrix.xlsx', tag: 'Compliance matrix', extractionStatus: 'extracted' },
  { id: 'doc-add1', name: 'Addendum 01.pdf', tag: 'Addendum', extractionStatus: 'extracted' },
  { id: 'doc-add2', name: 'Addendum 02 (scanned).pdf', tag: 'Addendum', extractionStatus: 'scanned', note: 'Scanned/image-only PDF — no text layer. OCR is not yet available, so this file was not analysed. It is stored and can still be used as evidence; upload a text-based version for analysis.' },
  { id: 'doc-ev-cv', name: 'Team CVs (partial).pdf', tag: 'Evidence', extractionStatus: 'extracted' },
  { id: 'doc-ev-ins', name: 'Insurance Certificate (expired).pdf', tag: 'Evidence', extractionStatus: 'extracted' },
];

const sampleExtracted: ExtractedTenderMetadata = {
  client: 'Harbour & Western Rail',
  tenderName: 'Bluewater Junction Corridor Renewal RFT',
  tenderNumber: 'HWR-2026-RFT-0142',
  closingDate: '2026-08-28',
  submissionPortal: 'Client procurement portal',
  summary: 'Harbour & Western Rail seeks design and construction support services for the Bluewater Junction Corridor Renewal. The submission carries mandatory returnables, scored technical criteria and a pricing schedule, and has been amended by two addenda.',
  mandatoryRequirements: [
    'Provide a technical methodology for corridor renewal delivery',
    'Describe your design management approach and interdisciplinary coordination',
    'Detail possession and rail corridor access planning, including access windows',
    'Describe the systems assurance approach, verification and RVTM',
    'Describe safety and Safety in Design management',
    'Provide environmental management including spoil handling and erosion and sediment control',
    'Provide quality management including ITPs and hold points',
    'Nominate key personnel and provide CVs, including an Assurance Lead',
    'Provide relevant experience on comparable brownfield rail corridor projects',
    'Complete the pricing schedule including provisional items',
    'State commercial assumptions, exclusions and departures',
    'Complete and return all returnable schedules',
    'Acknowledge all addenda',
  ],
  evaluationCriteria: ['Technical capability', 'Delivery methodology', 'Key personnel', 'Relevant experience', 'Price'],
  requiredSchedules: ['Schedule A — Pricing', 'Schedule B — Returnable compliance', 'Schedule C — Key personnel', 'Schedule D — Departures'],
  pageLimits: '60 pages excluding CVs and schedules',
  wordLimits: '',
  attachmentsCount: 8,
  pricingFormsCount: 1,
  requiredCVsCount: 6,
  requiredProjectExamplesCount: 3,
  mandatoryInsurances: ['Public liability $20m', 'Professional indemnity $10m'],
  requiredPolicies: ['WHS', 'Environmental', 'Quality'],
  addendaCount: 2,
};

/** Deterministic first-pass-style draft body (no AI). */
function sampleDraft(name: string, key: ModuleKey, opts: { repeatBrownfield?: boolean; unsupported?: boolean; partial?: boolean } = {}): string {
  const base = starterText(key, name);
  const extras: string[] = [];
  if (opts.repeatBrownfield) extras.push('Our brownfield rail corridor experience is extensive and directly comparable to this renewal, drawing on repeated delivery in live rail environments.');
  if (opts.unsupported) extras.push('We have a proven track record and extensive experience delivering similar projects safely and on programme.');
  if (opts.partial) extras.push('*(Partial: this section addresses methodology but does not yet cover the access-window requirement.)*');
  return `${base}\n\n${extras.join('\n\n')}\n\n*(Demo first-pass working draft — not final.)*`;
}

const ACTIVE_SAMPLE_MODULES: ModuleKey[] = [
  'executive-summary', 'technical-methodology', 'design-management', 'possession-access-planning',
  'interface-management', 'safety', 'systems-assurance', 'quality-management', 'environmental-management',
  'key-personnel', 'cvs', 'relevant-experience', 'case-studies', 'commercial-assumptions',
  'pricing-response', 'departures-clarifications', 'compliance-matrix', 'returnable-schedules', 'submission-checklist',
];

/**
 * Builds the fully worked Bluewater sample blueprint. Deterministic and
 * AI-free: it runs the engine, then applies the intentional imperfections
 * the demo is meant to exercise.
 */
export function buildBluewaterBlueprint(): TenderBlueprint {
  let bp = generateBlueprint({
    tender: sampleTender, extracted: sampleExtracted,
    kbFiles: [], personnel: [], team: sampleTeam,
    documentNames: sampleDocuments.map((d) => d.name),
  });

  // Ensure the specified modules are active.
  bp = {
    ...bp,
    modules: bp.modules.map((m) => ACTIVE_SAMPLE_MODULES.includes(m.key)
      ? { ...m, active: true, activationReason: m.activationReason ?? 'Activated for the Bluewater sample.' }
      : m),
  };

  // Draft several modules with realistic issues (repetition, unsupported
  // claims, partial coverage).
  bp.modules = bp.modules.map((m) => {
    if (!m.active) return m;
    switch (m.key) {
      case 'executive-summary':
        return { ...m, draft: sampleDraft(m.name, m.key, { repeatBrownfield: true }), draftStatus: 'Drafted' };
      case 'technical-methodology':
        return { ...m, draft: sampleDraft(m.name, m.key, { repeatBrownfield: true, partial: true }), draftStatus: 'Drafted' };
      case 'relevant-experience':
        return { ...m, draft: sampleDraft(m.name, m.key, { repeatBrownfield: true, unsupported: true }), draftStatus: 'Drafted' };
      case 'systems-assurance':
        return { ...m, draft: sampleDraft(m.name, m.key, { unsupported: true }), draftStatus: 'In review' };
      case 'possession-access-planning':
        return { ...m, draft: sampleDraft(m.name, m.key, { repeatBrownfield: true }), draftStatus: 'Drafted' };
      case 'design-management':
      case 'safety':
      case 'environmental-management':
        return { ...m, draft: sampleDraft(m.name, m.key), draftStatus: 'Drafting' };
      default:
        return m;
    }
  });

  // Section notes on a couple of modules + global proposal notes.
  bp.modules = bp.modules.map((m) => m.key === 'technical-methodology'
    ? { ...m, sectionNotes: { includePoints: 'Emphasise possession productivity and assurance-led delivery', avoidPoints: 'Avoid generic "world-class" language', updatedAt: new Date().toISOString() } }
    : m);
  bp.proposalNotes = {
    proposalStory: 'A low-risk, assurance-led renewal by a team that knows this corridor.',
    clientPriorities: 'Safety, possession productivity, minimal disruption to live services.',
    keyDifferentiators: 'Directly comparable brownfield rail delivery; named team already known to the client.',
    termsToUse: 'assurance-led, possession productivity, interface management',
    termsToAvoid: 'world-class, cutting-edge',
    toneOfVoice: 'practical, specific, confident',
    updatedAt: new Date().toISOString(),
  };

  // Evidence: force the specified gaps.
  const gapLabels: Record<string, string> = {
    'CV': 'Assurance Lead CV',
    'Insurance certificate': 'Current insurance certificate (expired / below $20m limit)',
    'Environmental document': 'Environmental spoil handling method',
    'Program': 'Current access planning example',
    'Pricing assumption': 'Pricing assumption backup',
    'Assurance document': 'Systems assurance project evidence (weak)',
    'Safety document': 'Safety performance record',
  };
  bp.evidence = bp.evidence.map((e) => {
    if (gapLabels[e.type]) {
      return { ...e, status: 'missing', matchedFile: null, label: gapLabels[e.type], resolution: undefined };
    }
    return e;
  });
  // Guarantee at least the key gaps exist even if the engine didn't seed them.
  const ensureGap = (type: any, label: string, moduleKey: ModuleKey) => {
    if (!bp.evidence.some((e) => e.label === label)) {
      bp.evidence = [{ id: `demo-ev-${bp.evidence.length}`, label, detail: 'Required by the tender; not yet provided.', type, status: 'missing', requirementId: null, moduleKey, matchedFile: null }, ...bp.evidence];
    }
  };
  ensureGap('CV', 'Assurance Lead CV', 'key-personnel');
  ensureGap('Insurance certificate', 'Current insurance certificate (expired / below $20m limit)', 'commercial-assumptions');
  ensureGap('Environmental document', 'Environmental spoil handling method', 'environmental-management');
  ensureGap('Assurance document', 'Systems assurance project evidence (weak)', 'systems-assurance');

  // Commercial assumptions — the specified set, one Open (blocks export).
  const now = new Date().toISOString();
  bp.commercial = [
    { id: 'demo-com-1', type: 'Pricing assumption', text: 'Assumes the client-supplied survey is accurate.', status: 'Open', exportReady: false, source: 'Analysis', createdAt: now, linkedModuleKey: 'pricing-response', reviewerId: 'demo-user-3' },
    { id: 'demo-com-2', type: 'Client dependency', text: 'Assumes possessions are available as stated in Addendum 02.', status: 'Open', exportReady: false, source: 'Addendum', createdAt: now, linkedModuleKey: 'possession-access-planning', reviewerId: 'demo-user-3' },
    { id: 'demo-com-3', type: 'Scope exclusion', text: 'Excludes unexpected contaminated spoil outside supplied data.', status: 'Acknowledged', exportReady: false, source: 'Analysis', createdAt: now, linkedModuleKey: 'environmental-management', reviewerId: 'demo-user-3' },
    { id: 'demo-com-4', type: 'Scope exclusion', text: 'Pricing excludes redesign caused by late scope change.', status: 'Acknowledged', exportReady: false, source: 'Manual', createdAt: now, linkedModuleKey: 'commercial-assumptions', reviewerId: 'demo-user-3' },
    { id: 'demo-com-5', type: 'Provisional item', text: 'Provisional item rates subject to final access staging.', status: 'Open', exportReady: false, source: 'Analysis', createdAt: now, linkedModuleKey: 'pricing-response', reviewerId: 'demo-user-3' },
  ];

  // Addenda: 01 (close-date + environmental change, reviewed) and 02
  // (scanned, unreviewed → blocks export).
  const add1 = analyzeAddendum('Addendum 01.pdf', bp);
  add1.summary = 'Addendum 01 changes the tender close date to 28 August 2026 and adds an environmental spoil-handling requirement.';
  add1.affectedModuleKeys = ['environmental-management', 'program-staging'];
  add1.reviewed = true;
  bp = applyAddendumImpact(bp, add1);
  const add2 = analyzeAddendum('Addendum 02 (scanned).pdf', bp);
  add2.summary = 'Addendum 02 (scanned) updates possession/access windows. Scanned — not analysed; requires manual review.';
  add2.affectedModuleKeys = ['possession-access-planning', 'pricing-response'];
  add2.reviewed = false;
  add2.provisional = true;
  bp = applyAddendumImpact(bp, add2);

  // Risk Radar → merge into the register (de-duped).
  const radar = runRiskRadar(bp);
  const existing = new Set(bp.risks.map((r) => r.title));
  bp.risks = [...radar.filter((r) => !existing.has(r.title)), ...bp.risks];

  // Claim register + loop status (Proposal Checks) computed deterministically.
  bp.claimRegister = buildClaimRegister(bp);
  bp.modules = bp.modules.map((m) => (m.active && m.draft ? { ...m, loop: runSectionLoop(bp, m) } : m));

  // Version history — one first-pass entry.
  bp.proposalVersions = [{
    id: 'demo-ver-1', createdAt: now, userId: 'demo-user-1', action: 'first-pass',
    masterPromptVersion: 'v1', affectedModules: ACTIVE_SAMPLE_MODULES,
    summary: 'First pass generated across all activated sections.', notesUsed: false,
    snapshots: [],
  }];

  // Partially completed closeout.
  bp.closeout = {
    outcome: 'Pending',
    whatWorked: 'Early requirement extraction and the evidence map surfaced the Assurance Lead CV gap in week one.',
    whatSlowedUs: 'Addendum 02 was scanned; access assumptions had to be reviewed manually.',
    evidenceReused: 'Two brownfield rail case studies reused from the prior corridor tender.',
    sectionsReused: 'Safety in Design and Interface Management adapted from previous submissions.',
    lessons: 'Confirm insurance currency at kickoff; chase the Assurance Lead CV earlier.',
    updatedAt: now,
  };

  return bp;
}

export interface WorkedSample {
  tender: Tender;
  team: TeamMember[];
  documents: SampleDoc[];
  blueprint: TenderBlueprint;
  kbFiles: KBFile[];
}

/**
 * Loads the worked sample. Pure and synchronous — NEVER calls AI or
 * Supabase. Returns a fresh copy each time so "reset" works.
 */
export function loadWorkedSample(): WorkedSample {
  return {
    tender: { ...sampleTender },
    team: sampleTeam.map((t) => ({ ...t })),
    documents: sampleDocuments.map((d) => ({ ...d })),
    blueprint: buildBluewaterBlueprint(),
    kbFiles: [],
  };
}

/** Loop report for the sample (used by Review). */
export function sampleLoopReport(bp: TenderBlueprint) {
  return buildLoopReport(bp);
}
