/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tender Blueprint domain model. The blueprint is the intelligence layer:
 * everything the app derived from the tender documents — requirements,
 * activated proposal modules, evidence map, review gates, risks, addenda
 * impacts and the export package plan — lives here, keyed per tender.
 *
 * These types are the contract between the UI and the analysis engine
 * (src/blueprint/engine.ts today; a live AI pipeline later — the shapes
 * are designed so the backend can be swapped without touching pages).
 */

/* ── Requirements ─────────────────────────────────────────────────── */

export type RequirementType =
  | 'Submission instruction' | 'Mandatory returnable' | 'Evaluation criteria'
  | 'Technical' | 'Commercial' | 'Legal' | 'Safety' | 'Assurance' | 'Program'
  | 'Personnel' | 'Experience' | 'Pricing' | 'Insurance' | 'Accreditation'
  | 'Template' | 'Formatting' | 'Evidence' | 'Clarification' | 'Addendum' | 'Risk';

export type RequirementPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type RequirementStatus = 'Not started' | 'In progress' | 'Drafted' | 'In review' | 'Complete';
export type ComplianceState = 'Compliant' | 'Partial' | 'Non-compliant' | 'Not assessed';
export type RiskRating = 'High' | 'Medium' | 'Low' | 'None';

export interface Requirement {
  id: string;                      // e.g. "REQ-004"
  text: string;                    // the client's requirement, verbatim
  sourceDocument: string;          // which uploaded document it came from
  clauseRef: string;               // clause / section reference
  type: RequirementType;
  priority: RequirementPriority;
  mandatory: boolean;
  scored: boolean;                 // evaluated / scored by the client
  responseRequired: boolean;
  evidenceRequired: boolean;
  moduleKey: ModuleKey | null;     // linked proposal module
  ownerId: string | null;          // TeamMember.id
  reviewerId: string | null;       // TeamMember.id
  dueDate: string | null;          // ISO date
  status: RequirementStatus;
  compliance: ComplianceState;
  risk: RiskRating;
  notes: string;
  /** Suggested response approach — placeholder AI output. */
  suggestedApproach?: string;
  /** Set when an addendum changed this requirement. */
  addendumFlag?: string;
  /** Extraction confidence, when the requirement came from live AI analysis. */
  confidence?: 'high' | 'medium' | 'low';
}

/* ── Proposal modules ─────────────────────────────────────────────── */

export type ModuleKey =
  | 'executive-summary' | 'client-needs' | 'technical-methodology' | 'design-management'
  | 'construction-methodology' | 'program-staging' | 'possession-access-planning'
  | 'key-personnel' | 'cvs' | 'relevant-experience' | 'case-studies'
  | 'safety' | 'systems-assurance' | 'quality-management' | 'environmental-management'
  | 'interface-management' | 'stakeholder-management' | 'risk-opportunity'
  | 'pricing-response' | 'commercial-assumptions' | 'departures-clarifications'
  | 'compliance-matrix' | 'returnable-schedules' | 'pitch-deck' | 'submission-checklist';

export type DraftStatus = 'Not started' | 'Drafting' | 'Drafted' | 'In review' | 'Approved';
export type ReviewDiscipline =
  | 'Technical' | 'Commercial' | 'Legal / Contract' | 'Safety' | 'Assurance'
  | 'Bid Manager' | 'Bid Director' | 'Final Approval';

export interface ProposalModule {
  key: ModuleKey;
  name: string;
  active: boolean;
  activationReason: string | null;  // why the analysis switched it on (null = manually added)
  manuallyToggled: boolean;
  requirementIds: string[];         // linked requirements
  evidenceIds: string[];            // linked evidence items
  draftStatus: DraftStatus;
  draft: string;                    // markdown draft content
  ownerId: string | null;
  reviewerDiscipline: ReviewDiscipline;
  dueDate: string | null;
  wordLimit: number | null;         // words, where the tender sets one
  comments: ModuleComment[];
  /** Per-section direction the user gives the drafting engine. Persisted
      and fed into every later pass; never lost on regeneration. */
  sectionNotes?: SectionNotes;
  /** True once the user has hand-edited the draft — the full run-through
      must not silently overwrite it (it asks first). Set by the editor,
      cleared when a pass legitimately replaces the content. */
  manuallyEdited?: boolean;
  /** First-pass structured output (purpose, key messages, gaps…). */
  firstPass?: FirstPassMeta;
  /** Controlled Proposal Loop state for this section. */
  loop?: SectionLoop;
}

/* ── Controlled Proposal Loops ─────────────────────────────────────
   Each section is looped through practical tender checks with clear
   stop conditions — never endless autonomous revision. */

export type LoopStage =
  | 'requirement' | 'evidence' | 'repetition' | 'commercial' | 'addendum' | 'human-review' | 'export-readiness';

export type LoopStatus =
  | 'Not started' | 'Draft created' | 'Requirement checked' | 'Evidence checked'
  | 'Repetition checked' | 'Commercial checked' | 'Addendum checked'
  | 'Human review required' | 'Approved' | 'Export ready' | 'Blocked';

export interface LoopStageResult {
  stage: LoopStage;
  passed: boolean;
  findings: string[];
  blockedReason?: string;
  suggestedAction?: string;
  confidence: 'Low' | 'Medium' | 'High';
  updatedAt: string;
}

export interface SectionLoop {
  status: LoopStatus;
  stages: Partial<Record<LoopStage, LoopStageResult>>;
  /** AI revision passes used (capped — see MAX_AI_REVISIONS). */
  aiRevisions: number;
  updatedAt: string;
}

/** Structured direction for one section (Stage 2). All optional. */
export interface SectionNotes {
  notes?: string;                   // free-form section notes
  includePoints?: string;           // specific points to include
  avoidPoints?: string;             // points to avoid
  differentiators?: string;
  evidenceToUse?: string;
  evidenceToAvoid?: string;
  toneInstruction?: string;
  reviewerDirection?: string;       // final reviewer direction / SME comments
  updatedAt?: string;
}

/** First-pass structured metadata produced alongside the draft (Stage 1). */
export interface FirstPassMeta {
  purpose: string;                  // what this section is for
  keyMessages: string[];
  evidenceNeeded: string[];
  gaps: string[];                   // unresolved gaps
  assumptions: string[];
  unsupportedClaims: string[];      // flagged claims lacking evidence
  suggestedReviewer: string;
  generatedAt: string;
}

export interface ModuleComment {
  id: string;
  author: string;
  text: string;
  date: string;
}

/* ── Evidence ─────────────────────────────────────────────────────── */

export type EvidenceStatus = 'found' | 'check' | 'missing';   // green / amber / red
export type EvidenceType =
  | 'Case study' | 'CV' | 'Project sheet' | 'Past tender response' | 'Methodology'
  | 'Policy' | 'Insurance certificate' | 'Accreditation' | 'Program'
  | 'Pricing assumption' | 'Commercial note' | 'Client reference'
  | 'Technical standard' | 'Design example' | 'Safety document' | 'Assurance document';

export interface EvidenceItem {
  id: string;
  label: string;                    // what is needed
  detail: string;                   // why / where it comes from
  type: EvidenceType;
  status: EvidenceStatus;
  requirementId: string | null;
  moduleKey: ModuleKey | null;
  matchedFile: string | null;       // knowledge-base file satisfying it
  /** 0–100 match confidence from the evidence matcher. */
  confidence?: number;
  /** Why the matcher picked this file (name / content / category signals). */
  matchReason?: string;
  resolution?: 'uploaded' | 'linked' | 'not-required' | 'clarification' | 'risk';
  notes?: string;
}

/* ── Review gates ─────────────────────────────────────────────────── */

export type ReviewStatus = 'Not started' | 'In review' | 'Changes requested' | 'Approved';

export interface ReviewTask {
  id: string;
  title: string;                    // e.g. "Technical review — Technical Methodology"
  moduleKey: ModuleKey | null;      // null = tender-level task (e.g. addendum review)
  discipline: ReviewDiscipline;
  reviewerId: string | null;
  dueDate: string | null;
  status: ReviewStatus;
  comments: string;
  requiredChanges: string;
}

/* ── Risks ────────────────────────────────────────────────────────── */

export interface RiskItem {
  id: string;
  title: string;
  detail: string;
  rating: RiskRating;
  source: 'Analysis' | 'Addendum' | 'Manual' | 'Evidence gap' | 'Risk Radar';
  requirementId: string | null;
  mitigation: string;
  ownerId: string | null;
  status: 'Open' | 'Mitigated' | 'Accepted' | 'Closed';
  /** Tender Risk Radar metadata (optional; set for radar-detected risks). */
  category?: RiskCategory;
  clauseRef?: string;
  affectedModuleKey?: ModuleKey | null;
  suggestedAction?: string;
  affectsExport?: boolean;
}

export type RiskCategory =
  | 'Scope' | 'Program' | 'Client information' | 'Insurance' | 'Accreditation'
  | 'Design warranty' | 'Commercial' | 'Contract' | 'Pricing' | 'Addendum'
  | 'Client data reliance' | 'Clarification' | 'Returnable';

/* ── Addenda ──────────────────────────────────────────────────────── */

export interface AddendumImpact {
  id: string;
  documentName: string;
  receivedAt: string;
  summary: string;
  changes: string[];
  affectedRequirementIds: string[];
  affectedModuleKeys: ModuleKey[];
  pricingImpact: boolean;
  riskImpact: boolean;
  reviewed: boolean;
  /** True when this assessment is a heuristic placeholder (no AI
      analysis ran) — always shown as needing human review. */
  provisional: boolean;
  /** The persisted tender document this addendum came from. */
  documentId?: string;
  /** The review task created for this addendum (applyAddendumImpact). */
  reviewTaskId?: string;
  /** The risk raised for this addendum (applyAddendumImpact). */
  riskId?: string;
}

/* ── Exports ──────────────────────────────────────────────────────── */

export type ExportRequirementLevel = 'Required by client' | 'Optional' | 'Internal only' | 'Not required';
export type ExportKey =
  | 'full-proposal' | 'executive-summary' | 'compliance-matrix' | 'returnable-schedules'
  | 'pricing-assumptions' | 'commercial-departures' | 'risk-register' | 'cv-pack'
  | 'case-study-pack' | 'pitch-deck' | 'submission-checklist' | 'internal-approval-pack'
  | 'clarification-register';

export interface ExportPackage {
  key: ExportKey;
  name: string;
  level: ExportRequirementLevel;
  description: string;
  ready: boolean;                   // gate: is this exportable in good conscience
  blockedBy: string | null;         // human explanation when not ready
  lastExportedAt: string | null;
}

/* ── Commercial Assumptions Register ──────────────────────────────
   First-class commercial control: the qualifications, exclusions,
   pricing assumptions, provisional/optional items and contract concerns
   the bid is taking a position on. Visible on the dashboard and gating
   export readiness — unacknowledged commercial items block the pack. */

export type CommercialItemType =
  | 'Pricing assumption' | 'Scope exclusion' | 'Clarification' | 'Departure'
  | 'Provisional item' | 'Optional item' | 'Client dependency'
  | 'Information gap' | 'Commercial risk' | 'Contract concern';

export type CommercialItemStatus = 'Open' | 'Acknowledged' | 'Approved' | 'Withdrawn';

export interface CommercialItem {
  id: string;
  type: CommercialItemType;
  text: string;
  /** Tender clause this position responds to, where known. */
  clauseRef?: string;
  /** Pricing schedule / returnable it relates to, where known. */
  linkedSchedule?: string;
  linkedModuleKey?: ModuleKey | null;
  reviewerId?: string | null;
  status: CommercialItemStatus;
  /** Whether this item has been cleared for inclusion in exports. */
  exportReady: boolean;
  source: 'Analysis' | 'Manual' | 'Addendum';
  createdAt: string;
}

/* ── Proposal Run Through (two-pass whole-proposal drafting) ───────
   The narrative layer over module drafting: global direction, a claim
   register that catches repetition/unsupported claims across sections,
   and a version history of full run-throughs. See
   src/blueprint/proposalRun.ts (the ProposalNarrativeEngine). */

/** Global direction applied to the whole proposal (Stage 2). */
export interface ProposalNotes {
  proposalStory?: string;           // the through-line the proposal should tell
  clientPriorities?: string;
  keyDifferentiators?: string;
  commercialPosition?: string;
  termsToUse?: string;
  termsToAvoid?: string;
  toneOfVoice?: string;
  competitorAssumptions?: string;
  bidStrategy?: string;
  updatedAt?: string;
}

export type ClaimStatus = 'supported' | 'unsupported';

/** One claim tracked across the proposal (Claim Register). */
export interface ProposalClaim {
  id: string;
  text: string;                     // the claim, normalised
  sections: ModuleKey[];            // sections it appears in
  status: ClaimStatus;
  repeated: boolean;                // appears in more than one section
  riskLevel: 'Low' | 'Medium' | 'High';
  linkedEvidence: string[];         // matched evidence file names, if any
  suggestedRewrite?: string;
}

export type ProposalRunAction = 'first-pass' | 'full-run' | 'review-ready';

/** A saved version created by a full run-through (Stage 3/5). */
export interface ProposalVersion {
  id: string;
  createdAt: string;
  userId: string | null;
  action: ProposalRunAction;
  masterPromptVersion: string;
  affectedModules: ModuleKey[];
  summary: string;                  // human summary of what changed
  notesUsed: boolean;               // whether section/global notes were applied
  /** Snapshot of each affected module's draft, for compare/restore. */
  snapshots: { key: ModuleKey; draft: string }[];
}

/* ── Tender Closeout Learning ──────────────────────────────────────
   Captured after submission; feeds Client & Sector Memory. */

export type CloseoutOutcome = 'Not submitted' | 'Submitted' | 'Won' | 'Lost' | 'Withdrawn' | 'Pending';

export interface TenderCloseout {
  outcome: CloseoutOutcome;
  finalVersionId?: string;          // ProposalVersion.id of the submitted draft
  clientFeedback?: string;
  whatWorked?: string;
  whatSlowedUs?: string;
  evidenceReused?: string;
  sectionsReused?: string;
  gapsEncountered?: string;
  lessons?: string;
  commercialLessons?: string;
  addendaLessons?: string;
  reusablePatterns?: string;
  updatedAt?: string;
}

/* ── Strategy inputs (win themes etc.) ────────────────────────────── */

export interface ProjectInputs {
  winThemes: string[];
  clientHotButtons: string[];
  preferredTerminology: string[];
  termsToAvoid: string[];
  commercialPosition: string;
  keyAssumptions: string[];
  keyExclusions: string[];
  competitorNotes: string;
  proposalTone: 'Executive' | 'Technical' | 'Balanced';
  strategicNotes: string;
}

/* ── Project metadata captured at creation ────────────────────────── */

export interface ProjectMeta {
  submissionType: string;           // e.g. "RFT", "RFQ", "EOI", "RFP"
  sector: string;                   // e.g. "Rail", "Water", "Roads"
  bidManagerId: string | null;
  internalRef: string;
  portal: string;
  notes: string;
  /** Submission due time, e.g. "14:00" (date lives on the tender). */
  dueTime?: string;
}

/* ── The blueprint aggregate ──────────────────────────────────────── */

export interface TenderBlueprint {
  tenderId: string;
  generatedAt: string;
  summary: string;                  // short narrative summary of the tender
  submissionType: string;
  pageLimits: string;
  wordLimits: string;
  requiredTemplates: string[];
  requiredAccreditations: string[];
  requiredInsurances: string[];
  returnables: string[];            // required returnable schedules
  evaluationCriteria: string[];
  addendaCount: number;

  requirements: Requirement[];
  modules: ProposalModule[];
  evidence: EvidenceItem[];
  reviews: ReviewTask[];
  risks: RiskItem[];
  addenda: AddendumImpact[];
  exports: ExportPackage[];
  /** Commercial Assumptions Register — first-class commercial control. */
  commercial: CommercialItem[];
  /** Global proposal direction (Proposal Run Through). */
  proposalNotes: ProposalNotes;
  /** Claim Register — claims tracked across sections. */
  claimRegister: ProposalClaim[];
  /** Version history of full proposal run-throughs. */
  proposalVersions: ProposalVersion[];
  /** Tender Closeout Learning (post-submission). */
  closeout?: TenderCloseout;
  inputs: ProjectInputs;
  meta: ProjectMeta;
  /** Set the first time a user edits the blueprint after generation.
      Drives the "you have manual edits" warning before re-analysis so
      regeneration can't silently discard team work. */
  editedAt?: string;
}

/* ── Derived health scores ────────────────────────────────────────── */

export interface BlueprintScores {
  readiness: number;                // 0–100 submission readiness
  compliance: number;               // 0–100
  mandatoryTotal: number;
  mandatoryUnanswered: number;
  evidenceGaps: number;
  evidenceChecks: number;
  highRisks: number;
  commercialIssues: number;
  addendaPending: number;
  awaitingReview: number;
  overdueTasks: number;
  wordLimitIssues: number;
  exportsReady: number;
  exportsRequired: number;
}
