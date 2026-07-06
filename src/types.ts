/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Organization {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  orgId: string;
  description: string;
}

export enum TenderStatus {
  Draft = 'DRAFT',
  InIntake = 'IN_INTAKE',
  SourcingMatched = 'SOURCING_MATCHED',
  Drafting = 'DRAFTING',
  UnderReview = 'UNDER_REVIEW',
  Approved = 'APPROVED',
  Exported = 'EXPORTED',
  Submitted = 'SUBMITTED',
}

export interface Tender {
  id: string;
  name: string;
  number: string;
  client: string;
  closingDate: string;
  portal: string;
  status: TenderStatus;
  estimatedValue: string;
  probabilityOfWin: number;
  ownerId: string;
}

/** One requirement as extracted by the AI, with source provenance. */
export interface ExtractedRequirement {
  text: string;
  /** Free-form category from the model; mapped to RequirementType by the engine. */
  category: string;
  sourceDocument: string;
  clauseRef: string;
  confidence: 'high' | 'medium' | 'low';
  mandatory?: boolean;
  scored?: boolean;
  evidenceRequired?: boolean;
}

export interface ExtractedTenderMetadata {
  client: string;
  tenderName: string;
  tenderNumber: string;
  closingDate: string;
  submissionPortal: string;
  mandatoryRequirements: string[];
  evaluationCriteria: string[];
  requiredSchedules: string[];
  pageLimits: string;
  wordLimits: string;
  attachmentsCount: number;
  pricingFormsCount: number;
  requiredCVsCount: number;
  requiredProjectExamplesCount: number;
  mandatoryInsurances: string[];
  requiredPolicies: string[];
  addendaCount: number;

  /* Rich extraction (multi-document pipeline). All optional so the
     legacy single-document path and the demo sample keep working. */
  summary?: string;
  submissionInstructions?: string[];
  closingTime?: string;
  weightedCriteria?: { criterion: string; weight: string }[];
  /** Source-referenced requirements across every category — the primary
      input the blueprint engine uses when present. */
  requirements?: ExtractedRequirement[];
  clarificationsNeeded?: string[];
  commercialRisks?: string[];
  legalRisks?: string[];
  addendaReferences?: string[];
  /** Names of the documents that were analysed. */
  sourceDocuments?: string[];
  /** Honest pipeline notes, e.g. "X.pdf appears scanned — OCR not yet implemented". */
  extractionNotes?: string[];
}

export enum ComplianceStatus {
  NotStarted = 'NOT_STARTED',
  SourceMatched = 'SOURCE_MATCHED',
  Drafted = 'DRAFTED',
  NeedsEvidence = 'NEEDS_EVIDENCE',
  NeedsTechnicalReview = 'NEEDS_TECHNICAL_REVIEW',
  NeedsCommercialReview = 'NEEDS_COMMERCIAL_REVIEW',
  Approved = 'APPROVED',
}

export interface ComplianceItem {
  id: string;
  requirement: string;
  tenderReference: string;
  isMandatory: boolean;
  responseSection: string;
  sourceFiles: string[];
  ownerId: string;
  status: ComplianceStatus;
  gap: string | null;
  reviewerId: string;
}

export interface KBFile {
  id: string;
  name: string;
  category: 'CV' | 'PROJECT_EVIDENCE' | 'CREDENTIAL' | 'POLICY' | 'BENCHMARK' | 'CAPABILITY' | 'UNSORTED';
  size: string;
  uploadedAt: string;
  uploadedBy: string;
  lastVerifiedAt: string;
  isStale: boolean;
  // Present only for files uploaded this session in demo mode / before a
  // real Storage upload completes: a browser object URL pointing at the
  // actual selected File, so "view" is a real file, not a placeholder.
  // Revoked on removal (see handleRemoveKBFile in App.tsx).
  objectUrl?: string;
  /** Extracted document text (kb_files.content_text), used for
      content-based evidence matching. Truncated client-side. */
  contentText?: string;
}

export interface Claim {
  id: string;
  text: string;
  sourceFile: string;
  sourcePage: string;
  extractedEvidence: string;
  confidenceScore: number;
  lastUpdatedDate: string;
  isStale: boolean;
}

export interface ProposalSection {
  id: string;
  title: string;
  status: ComplianceStatus;
  content: string;
  claims: Claim[];
  reviewerId: string;
  lastSavedAt: string;
  approved: boolean;
}

export interface Invite {
  id: string;
  email: string;
  role: TeamMember['role'];
  token: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  createdAt: string;
  expiresAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'BID_MANAGER' | 'TECHNICAL_REVIEWER' | 'COMMERCIAL_REVIEWER' | 'CONTRIBUTOR' | 'VIEWER';
  avatarUrl?: string;
}

// A personnel/CV profile, keyed to a TeamMember. Kept separate from
// TeamMember (account/role info) since CV content — credentials, project
// history — is bid content that gets tailored per opportunity, not an
// account attribute.
export interface ProjectHistoryEntry {
  project: string;
  role: string;
  period: string;   // e.g. "2022–2024"
  summary: string;
}

export interface PersonnelProfile {
  id: string;              // matches TeamMember.id
  headline: string;        // e.g. "Systems Assurance Lead, CSE"
  yearsExperience: number;
  credentials: string[];
  cvFile?: string;         // knowledge-base file name, if one exists
  projectHistory: ProjectHistoryEntry[];
}

export interface LessonsLearnedItem {
  id: string;
  tenderId: string;
  tenderName: string;
  outcome: 'WON' | 'LOST' | 'WITHDRAWN';
  keyInsights: string[];
  date: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
}

// ── Opportunity-driven workspace ────────────────────────────────────
// An InfoRequest is something the *imported tender* determined we need.
// The app matches it against the standing knowledge base; anything not
// satisfied becomes a GAP it actively requests from the user/team.
export interface InfoRequest {
  id: string;
  label: string;                  // what is needed
  detail: string;                 // why / where in the tender it comes from
  category: 'EVIDENCE' | 'CV' | 'POLICY' | 'COMMERCIAL' | 'CREDENTIAL';
  status: 'MATCHED' | 'PROVIDED' | 'REQUESTED' | 'GAP';
  matchedFile?: string;           // standing-library KB file that satisfies it
  response?: string;              // info the user supplies for a gap
  tailoringNote?: string;         // for CV items: how the tender shapes the CV
  assignedTo?: string;
}

// Intelligence captured FOR THE OPPORTUNITY (not tied to any CV). This is
// additional knowledge: client drivers, incumbent, evaluation signals.
export interface IntelNote {
  id: string;
  title: string;
  body: string;
  tag: 'CLIENT' | 'INCUMBENT' | 'EVALUATION' | 'COMPETITOR' | 'STRATEGY' | 'RISK';
  author: string;
  date: string;
}

// A clarification question about the opportunity, raised to the client.
// Either entered manually, or surfaced as a recommendation by the app.
export interface Clarification {
  id: string;
  question: string;
  rationale?: string;
  source: 'MANUAL' | 'RECOMMENDED';
  status: 'DRAFT' | 'SUBMITTED' | 'ANSWERED';
  answer?: string;
  raisedBy: string;
  date: string;
}

// ── Pricing ─────────────────────────────────────────────────────────
export interface RateCardItem {
  id: string;
  role: string;
  unit: 'day' | 'hour';
  rate: number;                   // dollars per unit
  source: 'CUSTOM' | 'BENCHMARK';
}

export interface PricingLine {
  id: string;
  description: string;
  rateId: string;                 // references RateCardItem.id
  quantity: number;               // number of units
  markupPct: number;              // percent applied on top of cost
}
