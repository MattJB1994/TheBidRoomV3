/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Demo-mode seed data. Entirely fictional. It models a single sample
 * tender, worked end-to-end, so every screen and status the app can show
 * is populated:
 *
 *   Workspace : Cindervale Rail & Systems Advisory (CRSA)  [fictional]
 *   Client    : Tarnwick Metropolitan Transit Authority (TMTA)  [fictional]
 *   Tender    : Vanguard Line Signalling Renewal & Systems Assurance
 *
 * Names, places, standards, credentials and authorities here are invented
 * for demonstration and do not refer to any real organisation. (.example
 * email domains are reserved for documentation per RFC 2606.)
 */

import { KBFile, Tender, TenderStatus, ComplianceItem, ComplianceStatus, ProposalSection, TeamMember, LessonsLearnedItem, AuditLog, InfoRequest, IntelNote, Clarification, RateCardItem, PricingLine, PersonnelProfile } from '../types';

export const mockTeam: TeamMember[] = [
  { id: 'u1', name: 'Priya Raman', email: 'p.raman@cindervale.example', role: 'OWNER' },
  { id: 'u2', name: 'Tom Castellano', email: 't.castellano@cindervale.example', role: 'BID_MANAGER' },
  { id: 'u3', name: 'Ada Whitlock', email: 'a.whitlock@cindervale.example', role: 'TECHNICAL_REVIEWER' },
  { id: 'u4', name: 'Henrik Solberg', email: 'h.solberg@cindervale.example', role: 'COMMERCIAL_REVIEWER' },
  { id: 'u5', name: 'Mei Lin Zhao', email: 'm.zhao@cindervale.example', role: 'CONTRIBUTOR' },
];

export const mockKBFiles: KBFile[] = [
  {
    id: 'f1',
    name: 'CRSA_Signalling_Systems_Capability_Statement_v3.pdf',
    category: 'CAPABILITY',
    size: '4.2 MB',
    uploadedAt: '2026-01-15',
    uploadedBy: 'Priya Raman',
    lastVerifiedAt: '2026-06-01',
    isStale: false,
  },
  {
    id: 'f2',
    name: 'CV_Ada_Whitlock_Systems_Assurance_Lead.pdf',
    category: 'CV',
    size: '1.8 MB',
    uploadedAt: '2025-11-20',
    uploadedBy: 'Tom Castellano',
    lastVerifiedAt: '2026-05-10',
    isStale: false,
  },
  {
    id: 'f2_2',
    name: 'CV_Mei_Lin_Zhao_Signalling_Engineer.pdf',
    category: 'CV',
    size: '1.4 MB',
    uploadedAt: '2026-02-10',
    uploadedBy: 'Tom Castellano',
    lastVerifiedAt: '2026-02-10',
    isStale: false,
  },
  {
    id: 'f3',
    name: 'Project_Evidence_Brackenford_Junction_Resignalling.docx',
    category: 'PROJECT_EVIDENCE',
    size: '5.6 MB',
    uploadedAt: '2024-03-12',
    uploadedBy: 'Tom Castellano',
    lastVerifiedAt: '2025-05-12', // Stale! (older than 12 months)
    isStale: true,
  },
  {
    id: 'f3_2',
    name: 'Project_Evidence_Northgate_Interlocking_Renewal.docx',
    category: 'PROJECT_EVIDENCE',
    size: '8.1 MB',
    uploadedAt: '2026-03-01',
    uploadedBy: 'Ada Whitlock',
    lastVerifiedAt: '2026-03-01',
    isStale: false,
  },
  {
    id: 'f4',
    name: 'CRSA_Work_Health_Safety_Policy_2026.pdf',
    category: 'POLICY',
    size: '2.1 MB',
    uploadedAt: '2026-01-02',
    uploadedBy: 'Henrik Solberg',
    lastVerifiedAt: '2026-01-02',
    isStale: false,
  },
  {
    id: 'f4_2',
    name: 'CRSA_TMTA_Prequalification_Certificate_2026.pdf',
    category: 'CREDENTIAL',
    size: '1.1 MB',
    uploadedAt: '2026-04-15',
    uploadedBy: 'Priya Raman',
    lastVerifiedAt: '2026-04-15',
    isStale: false,
  },
  {
    id: 'f5',
    name: 'Commercial_Rate_Card_Systems_Engineering_2025.xlsx',
    category: 'BENCHMARK',
    size: '12.4 MB',
    uploadedAt: '2025-08-14',
    uploadedBy: 'Henrik Solberg',
    lastVerifiedAt: '2025-08-14',
    isStale: false,
  },
  {
    id: 'f5_2',
    name: 'Commercial_Pricing_Matrix_Contractor_Rates_2026.xlsx',
    category: 'BENCHMARK',
    size: '3.4 MB',
    uploadedAt: '2026-05-18',
    uploadedBy: 'Henrik Solberg',
    lastVerifiedAt: '2026-05-18',
    isStale: false,
  },
];

// One sample tender, worked end-to-end.
export const mockTenders: Tender[] = [
  {
    id: 't1',
    name: 'Vanguard Line Signalling Renewal & Systems Assurance',
    number: 'TMTA-2026-VLS-014',
    client: 'Tarnwick Metropolitan Transit Authority (TMTA)',
    closingDate: '2026-07-28',
    portal: 'Tarnwick Procure Portal',
    status: TenderStatus.Drafting,
    estimatedValue: '$2,150,000',
    probabilityOfWin: 68,
    ownerId: 'u2',
  },
];

export const mockComplianceItems: ComplianceItem[] = [
  {
    id: 'c1',
    requirement: 'Provide evidence of delivering at least three signalling assurance packages on the TMTA network in the past 5 years.',
    tenderReference: 'Section 4.1.2 - Experience Requirements',
    isMandatory: true,
    responseSection: '1.1 Track Record & Case Studies',
    sourceFiles: ['CRSA_Signalling_Systems_Capability_Statement_v3.pdf', 'Project_Evidence_Brackenford_Junction_Resignalling.docx'],
    ownerId: 'u2',
    status: ComplianceStatus.Drafted,
    gap: null,
    reviewerId: 'u3',
  },
  {
    id: 'c2',
    requirement: 'Nominate a Systems Assurance Lead with a minimum of 15 years experience, holding Chartered Systems Engineer (CSE) registration.',
    tenderReference: 'Section 6.3 - Key Personnel Attributes',
    isMandatory: true,
    responseSection: '1.2 Key Personnel & Resource Allocation',
    sourceFiles: ['CV_Ada_Whitlock_Systems_Assurance_Lead.pdf'],
    ownerId: 'u2',
    status: ComplianceStatus.Drafted,
    gap: null,
    reviewerId: 'u1',
  },
  {
    id: 'c3',
    requirement: 'Demonstrate active risk management alignment with the TMTA Systems Safety Framework (SSF-7) and the SMS-12 safety standard.',
    tenderReference: 'Schedule B - Risk Management Framework',
    isMandatory: true,
    responseSection: '2.1 Risk Mitigation & Safety Assurance',
    sourceFiles: ['CRSA_Work_Health_Safety_Policy_2026.pdf'],
    ownerId: 'u5',
    status: ComplianceStatus.SourceMatched,
    gap: null,
    reviewerId: 'u3',
  },
  {
    id: 'c4',
    requirement: 'Submit audited financial statements for the past 3 fiscal years including cash flow and balance sheet metrics.',
    tenderReference: 'Part A - Commercial Prequalification',
    isMandatory: true,
    responseSection: '3.1 Financial Capability Statement',
    sourceFiles: [],
    ownerId: 'u4',
    status: ComplianceStatus.NeedsEvidence,
    gap: 'Audit letters for FY24 and FY25 are pending external accountancy sign-off.',
    reviewerId: 'u4',
  },
  {
    id: 'c5',
    requirement: 'Provide a Workplace Health & Safety policy compliant with the TMTA SMS-12 safety standard.',
    tenderReference: 'Schedule D - WHS Management',
    isMandatory: true,
    responseSection: '2.2 WHS Compliance Declaration',
    sourceFiles: ['CRSA_Work_Health_Safety_Policy_2026.pdf'],
    ownerId: 'u5',
    status: ComplianceStatus.Approved,
    gap: null,
    reviewerId: 'u3',
  },
];

export const mockProposalSections: ProposalSection[] = [
  {
    id: 's1',
    title: '1.1 Track Record & Case Studies',
    status: ComplianceStatus.Drafted,
    content: `### 1.1.1 Overview of Rail Infrastructure Delivery

Cindervale Rail & Systems Advisory (CRSA) brings substantial, direct expertise in the delivery of rail signalling and systems assurance services. Over the past five years, we have managed complex, multi-stage signalling renewals across busy network environments.

Our experience includes the [Brackenford Junction Resignalling] where CRSA took technical leadership. In this project, we successfully configured, verified, and certified signalling assets across 11 legacy interlockings.

Our project execution uses a standardised, systems-engineering methodology, ensuring that [zero signalling-related incidents across 16 possession windows] were recorded. This methodology aligns with the Tarnwick Metropolitan Transit Authority (TMTA) Asset Standards Office (ASO) frameworks.

### 1.1.2 Reusable Project Evidence Integration

For each asset lifecycle stage, CRSA deploys pre-verified engineering templates, accelerating safety-case documentation by up to 40% while preserving full compliance with TMTA standards.`,
    claims: [
      {
        id: 'cl1',
        text: 'Brackenford Junction Resignalling',
        sourceFile: 'Project_Evidence_Brackenford_Junction_Resignalling.docx',
        sourcePage: 'Page 3, Paragraph 2',
        extractedEvidence: 'CRSA served as lead systems assurance partner for the Brackenford Junction resignalling from 2022 to 2024.',
        confidenceScore: 97,
        lastUpdatedDate: '2024-03-12',
        isStale: true, // Warning! Underlying evidence file is stale.
      },
      {
        id: 'cl2',
        text: 'zero signalling-related incidents across 16 possession windows',
        sourceFile: 'CRSA_Signalling_Systems_Capability_Statement_v3.pdf',
        sourcePage: 'Page 14, Section 3.2',
        extractedEvidence: 'Across the 16 possession windows, CRSA certified signalling without a single safety incident or delay.',
        confidenceScore: 95,
        lastUpdatedDate: '2026-01-15',
        isStale: false,
      }
    ],
    reviewerId: 'u3',
    lastSavedAt: '2026-06-29 16:45',
    approved: false,
  },
  {
    id: 's2',
    title: '1.2 Key Personnel & Resource Allocation',
    status: ComplianceStatus.Drafted,
    content: `### 1.2.1 Lead Systems Assurance Nomination

CRSA nominates [Ada Whitlock] as the Systems Assurance Lead for this engagement. Ada is a registered Chartered Systems Engineer (CSE) with 17 years of experience in safety-critical systems. She has steered assurance programs for over $400M of heavy rail infrastructure.

Ada is recognised on the [Chartered Systems Engineer (CSE) Register for Electrical and Information Systems Engineering].

### 1.2.2 Availability and Project Dedication

Ada is 100% allocated to this engagement for the first six months, ensuring continuous oversight during the critical detailed design review phases.`,
    claims: [
      {
        id: 'cl3',
        text: 'Ada Whitlock',
        sourceFile: 'CV_Ada_Whitlock_Systems_Assurance_Lead.pdf',
        sourcePage: 'Page 1, Resume Summary',
        extractedEvidence: 'Ada Whitlock, CSE, with 17 years in signalling systems engineering.',
        confidenceScore: 100,
        lastUpdatedDate: '2025-11-20',
        isStale: false,
      },
      {
        id: 'cl4',
        text: 'Chartered Systems Engineer (CSE) Register for Electrical and Information Systems Engineering',
        sourceFile: 'CV_Ada_Whitlock_Systems_Assurance_Lead.pdf',
        sourcePage: 'Page 4, Credentials Section',
        extractedEvidence: 'CSE Registration ID: 4122909 - Electrical, Information Systems, Systems Engineering.',
        confidenceScore: 99,
        lastUpdatedDate: '2025-11-20',
        isStale: false,
      }
    ],
    reviewerId: 'u1',
    lastSavedAt: '2026-06-30 09:12',
    approved: false,
  },
  {
    id: 's3',
    title: '2.1 Risk Mitigation & Safety Assurance',
    status: ComplianceStatus.SourceMatched,
    content: `### 2.1.1 Risk Framework Alignment

CRSA's safety engineering is built directly on the [TMTA Systems Safety Framework (SSF-7)]. We embed hazard logs into a unified, version-controlled repository to verify that hazards are mitigated to SFAIRP (So Far As Is Reasonably Practicable).

Our system logs hazards, monitors risk metrics, and guarantees that [CRSA maintains a fully compliant TMTA SMS-12 safety management structure].`,
    claims: [
      {
        id: 'cl5',
        text: 'TMTA Systems Safety Framework (SSF-7)',
        sourceFile: 'CRSA_Work_Health_Safety_Policy_2026.pdf',
        sourcePage: 'Page 12, Risk Management Policy',
        extractedEvidence: 'All CRSA projects must comply with the TMTA Systems Safety Framework (SSF-7).',
        confidenceScore: 96,
        lastUpdatedDate: '2026-01-02',
        isStale: false,
      },
      {
        id: 'cl6',
        text: 'CRSA maintains a fully compliant TMTA SMS-12 safety management structure',
        sourceFile: 'CRSA_Work_Health_Safety_Policy_2026.pdf',
        sourcePage: 'Page 2, Scope and Accreditation',
        extractedEvidence: 'Certified TMTA SMS-12 compliant, updated for current transit standards.',
        confidenceScore: 94,
        lastUpdatedDate: '2026-01-02',
        isStale: false,
      }
    ],
    reviewerId: 'u3',
    lastSavedAt: '2026-06-25 10:20',
    approved: false,
  },
  {
    id: 's4',
    title: '2.2 WHS Compliance Declaration',
    status: ComplianceStatus.Approved,
    content: `### 2.2.1 Workplace Health & Safety Commitment

CRSA operates a Workplace Health & Safety management system certified compliant with the [TMTA SMS-12 safety standard]. Our WHS policy is reviewed annually and signed at director level.

This section has been reviewed and approved by the technical review gate.`,
    claims: [
      {
        id: 'cl7',
        text: 'TMTA SMS-12 safety standard',
        sourceFile: 'CRSA_Work_Health_Safety_Policy_2026.pdf',
        sourcePage: 'Page 1, Policy Statement',
        extractedEvidence: 'CRSA WHS management system certified against TMTA SMS-12.',
        confidenceScore: 98,
        lastUpdatedDate: '2026-01-02',
        isStale: false,
      }
    ],
    reviewerId: 'u3',
    lastSavedAt: '2026-06-24 14:05',
    approved: true,
  },
];

export const mockLessonsLearned: LessonsLearnedItem[] = [
  {
    id: 'l0',
    tenderId: 'prev-100',
    tenderName: 'Northgate Interlocking Renewal — Assurance Services',
    outcome: 'WON',
    keyInsights: [
      'Nominating a graduate engineer alongside the CSE lead signalled bench strength — the evaluator panel commented on succession depth.',
      'Submitting the clarification on insurance wording early avoided a last-minute scramble at close.'
    ],
    date: '2026-04-02',
  },
  {
    id: 'l1',
    tenderId: 'prev-101',
    tenderName: 'Brackenford Junction Resignalling Assurance Scope',
    outcome: 'WON',
    keyInsights: [
      'Linking CV details to CSE credential numbers early in the response saved 3 days in the commercial evaluation stage.',
      'Shorter, structured case studies with explicit TMTA asset standard numbers scored 15% higher than descriptive paragraphs.'
    ],
    date: '2025-10-12',
  },
  {
    id: 'l2',
    tenderId: 'prev-102',
    tenderName: 'Eastmere Depot Power & Signalling ISA Program',
    outcome: 'LOST',
    keyInsights: [
      'Lost due to lack of documented legacy interlocking capability evidence.',
      'Future bids must specify relay-based vs computer-based interlocking experience explicitly.'
    ],
    date: '2026-02-18',
  },
];

export const mockAuditLogs: AuditLog[] = [
  { id: 'a1', timestamp: '2026-06-30 09:12:33', userId: 'u2', userName: 'Tom Castellano', action: 'DRAFT_SAVE', details: 'Saved section: 1.2 Key Personnel & Resource Allocation' },
  { id: 'a2', timestamp: '2026-06-30 08:44:12', userId: 'u1', userName: 'Priya Raman', action: 'FILE_UPLOAD', details: 'Uploaded: CRSA_Work_Health_Safety_Policy_2026.pdf' },
  { id: 'a3', timestamp: '2026-06-29 17:15:02', userId: 'u3', userName: 'Ada Whitlock', action: 'SOURCE_MATCH', details: 'Matched claim "Ada Whitlock" to CV_Ada_Whitlock_Systems_Assurance_Lead.pdf' },
  { id: 'a4', timestamp: '2026-06-28 11:30:15', userId: 'u2', userName: 'Tom Castellano', action: 'TENDER_INTAKE', details: 'Extracted requirements for Vanguard Line Signalling Renewal (TMTA-2026-VLS-014)' },
];

// ── Opportunity: tender-shaped information requests ─────────────────
// Derived from the Vanguard Line tender. Items already satisfied by the
// standing knowledge base are MATCHED; the rest are actively REQUESTED
// or flagged as a GAP for the team to provide.
export const mockInfoRequests: InfoRequest[] = [
  {
    id: 'ir1',
    label: 'Three signalling assurance packages on the TMTA network (last 5 yrs)',
    detail: 'Tender §4.1.2 Experience Requirements — needs project evidence with TMTA asset references.',
    category: 'EVIDENCE',
    status: 'MATCHED',
    matchedFile: 'Project_Evidence_Northgate_Interlocking_Renewal.docx',
  },
  {
    id: 'ir2',
    label: 'Brackenford Junction evidence pack (re-verify)',
    detail: 'Tender §4.1.2 — strong match, but the source file is stale (>12 months).',
    category: 'EVIDENCE',
    status: 'REQUESTED',
    matchedFile: 'Project_Evidence_Brackenford_Junction_Resignalling.docx',
    assignedTo: 'u2',
  },
  {
    id: 'ir3',
    label: 'CV — Systems Assurance Lead (CSE, 15+ yrs)',
    detail: 'Tender §6.3 Key Personnel. Matched to Ada Whitlock.',
    category: 'CV',
    status: 'MATCHED',
    matchedFile: 'CV_Ada_Whitlock_Systems_Assurance_Lead.pdf',
    tailoringNote: 'Tender weights level-crossing assurance heavily — tailor Ada\u2019s CV to foreground Brackenford Junction and SSF-7 risk work.',
  },
  {
    id: 'ir4',
    label: 'CV — Verification & Validation Engineer',
    detail: 'Tender §6.4 nominates a second key role; no current CV in the library.',
    category: 'CV',
    status: 'GAP',
    tailoringNote: 'Tailor to emphasise computer-based interlocking V&V (a lesson-learned weakness on Eastmere Depot).',
    assignedTo: 'u3',
  },
  {
    id: 'ir5',
    label: 'WHS policy aligned to TMTA SMS-12',
    detail: 'Tender Schedule D. Matched to current policy.',
    category: 'POLICY',
    status: 'MATCHED',
    matchedFile: 'CRSA_Work_Health_Safety_Policy_2026.pdf',
  },
  {
    id: 'ir6',
    label: 'Audited financials FY23–FY25',
    detail: 'Tender Part A Commercial Prequalification.',
    category: 'COMMERCIAL',
    status: 'GAP',
    response: '',
    assignedTo: 'u4',
  },
  {
    id: 'ir7',
    label: 'TMTA prequalification certificate (current)',
    detail: 'Tender §2.1 — supplier must be prequalified on the TMTA panel.',
    category: 'CREDENTIAL',
    status: 'MATCHED',
    matchedFile: 'CRSA_TMTA_Prequalification_Certificate_2026.pdf',
  },
  {
    id: 'ir8',
    label: 'Professional Indemnity insurance ($20M) certificate of currency',
    detail: 'Tender §5.2 Mandatory Insurances.',
    category: 'CREDENTIAL',
    status: 'REQUESTED',
    assignedTo: 'u4',
  },
];

// ── Opportunity intelligence (NOT attached to any CV) ───────────────
export const mockIntel: IntelNote[] = [
  {
    id: 'in1',
    title: 'Evaluation skews technical, not price',
    body: 'Technical capability + sourced evidence is weighted 45%, personnel 30%, price only 25%. Lead with traceable evidence; don\u2019t win on rate alone.',
    tag: 'EVALUATION',
    author: 'Tom Castellano',
    date: '2026-06-26',
  },
  {
    id: 'in2',
    title: 'Incumbent struggled on possession overruns',
    body: 'TMTA flagged repeated weekend-possession overruns by the incumbent on the prior contract. Foreground our zero-overrun record at Brackenford Junction.',
    tag: 'INCUMBENT',
    author: 'Priya Raman',
    date: '2026-06-24',
  },
  {
    id: 'in3',
    title: 'Client driver: SFAIRP evidence trail',
    body: 'TMTA\u2019s new safety director wants demonstrable SFAIRP hazard close-out, not just a framework reference. Tie SSF-7 claims to actual hazard-log artefacts.',
    tag: 'CLIENT',
    author: 'Ada Whitlock',
    date: '2026-06-28',
  },
];

// ── Clarifications register (manual + recommended) ──────────────────
export const mockClarifications: Clarification[] = [
  {
    id: 'cl_q1',
    question: 'Will TMTA accept computer-based interlocking evidence from comparable metro networks, or must all examples be on the TMTA network?',
    rationale: 'Section 4.1.2 is ambiguous on whether off-network evidence counts toward the three-package minimum.',
    source: 'MANUAL',
    status: 'SUBMITTED',
    raisedBy: 'Tom Castellano',
    date: '2026-06-27',
  },
  {
    id: 'cl_q2',
    question: 'Is the $50M public liability limit per-occurrence or in aggregate?',
    rationale: 'Insurance wording differs between the cover sheet and Schedule F.',
    source: 'RECOMMENDED',
    status: 'DRAFT',
    raisedBy: 'The Bid Room',
    date: '2026-06-29',
  },
  {
    id: 'cl_q3',
    question: 'Does the 40-page limit include the commercial pricing schedules, or technical content only?',
    rationale: 'Page-limit clause references "technical submission" but the pricing forms are bundled.',
    source: 'RECOMMENDED',
    status: 'DRAFT',
    raisedBy: 'The Bid Room',
    date: '2026-06-29',
  },
];

// ── Pricing: rate card (custom + benchmark) and build-up ────────────
export const mockRates: RateCardItem[] = [
  { id: 'rate1', role: 'Principal / Owner', unit: 'day', rate: 2200, source: 'CUSTOM' },
  { id: 'rate2', role: 'Systems Assurance Lead (CSE)', unit: 'day', rate: 1850, source: 'CUSTOM' },
  { id: 'rate3', role: 'Signalling Engineer', unit: 'day', rate: 1450, source: 'BENCHMARK' },
  { id: 'rate4', role: 'V&V Engineer', unit: 'day', rate: 1400, source: 'BENCHMARK' },
  { id: 'rate5', role: 'Commercial Lead', unit: 'day', rate: 1600, source: 'CUSTOM' },
];

export const mockPricingLines: PricingLine[] = [
  { id: 'pl1', description: 'Systems assurance & safety case lead', rateId: 'rate2', quantity: 60, markupPct: 12 },
  { id: 'pl2', description: 'Signalling design verification', rateId: 'rate3', quantity: 45, markupPct: 12 },
  { id: 'pl3', description: 'Independent V&V of interlocking', rateId: 'rate4', quantity: 30, markupPct: 12 },
  { id: 'pl4', description: 'Commercial & pricing management', rateId: 'rate5', quantity: 15, markupPct: 10 },
  { id: 'pl5', description: 'Principal oversight & client liaison', rateId: 'rate1', quantity: 8, markupPct: 10 },
];

// ── Personnel / CV profiles ──────────────────────────────────────────
// Keyed to mockTeam by id. cvFile references the matching Knowledge Base
// entry so the Opportunity page's CV-tailoring notes (matched by
// matchedFile) surface directly on each person's profile.
export const mockPersonnel: PersonnelProfile[] = [
  {
    id: 'u1',
    headline: 'Principal & Practice Owner',
    yearsExperience: 22,
    credentials: ['Chartered Systems Engineer (CSE)', 'TMTA Prequalified Supplier Representative'],
    projectHistory: [
      { project: 'Northgate Interlocking Renewal', role: 'Engagement Principal', period: '2025–2026', summary: 'Client-facing principal overseeing systems assurance delivery and commercial governance.' },
      { project: 'Brackenford Junction Resignalling', role: 'Engagement Principal', period: '2022–2024', summary: 'Directed the assurance program across 11 legacy interlockings with zero safety incidents.' },
    ],
  },
  {
    id: 'u2',
    headline: 'Bid Manager',
    yearsExperience: 11,
    credentials: ['MAPM (Association for Project Management)'],
    projectHistory: [
      { project: 'Eastmere Depot Power & Signalling ISA Program', role: 'Bid Manager', period: '2026', summary: 'Managed the bid; captured the lesson on legacy interlocking evidence gaps.' },
      { project: 'Brackenford Junction Resignalling', role: 'Bid Manager', period: '2021–2022', summary: 'Led the winning bid submission and TMTA clarification process.' },
    ],
  },
  {
    id: 'u3',
    headline: 'Systems Assurance Lead',
    yearsExperience: 17,
    credentials: ['Chartered Systems Engineer (CSE) — Registration 4122909', 'TMTA Systems Safety Framework (SSF-7) Assessor'],
    cvFile: 'CV_Ada_Whitlock_Systems_Assurance_Lead.pdf',
    projectHistory: [
      { project: 'Brackenford Junction Resignalling', role: 'Systems Assurance Lead', period: '2022–2024', summary: 'Led systems assurance across 11 legacy interlockings; zero incidents across 16 possession windows.' },
      { project: 'Northgate Interlocking Renewal', role: 'Systems Assurance Lead', period: '2025–2026', summary: 'Hazard log ownership and SFAIRP close-out for computer-based interlocking renewal.' },
    ],
  },
  {
    id: 'u4',
    headline: 'Commercial Lead',
    yearsExperience: 14,
    credentials: ['CPA (Certified Practising Accountant)'],
    projectHistory: [
      { project: 'Brackenford Junction Resignalling', role: 'Commercial Lead', period: '2022–2024', summary: 'Owned pricing strategy and the performance security bond structure.' },
    ],
  },
  {
    id: 'u5',
    headline: 'Signalling Engineer',
    yearsExperience: 6,
    credentials: ['Graduate Engineer (Engineers Australia)'],
    cvFile: 'CV_Mei_Lin_Zhao_Signalling_Engineer.pdf',
    projectHistory: [
      { project: 'Northgate Interlocking Renewal', role: 'Signalling Engineer', period: '2026', summary: 'Detailed design verification for computer-based interlocking upgrade.' },
    ],
  },
];
