/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The Tender Blueprint engine. Converts the raw AI extraction
 * (ExtractedTenderMetadata from /api/ai or the demo sample) plus the
 * standing knowledge base into a full TenderBlueprint: a typed
 * requirements register, activated proposal modules (with the reason
 * each one switched on), an evidence map with green/amber/red status,
 * review gates, a risk register and an export package plan.
 *
 * Everything here is deterministic and synchronous so the product works
 * end-to-end today; the shapes match what a live AI pipeline would
 * return, so this module is the seam where that pipeline plugs in later.
 */
import {
  TenderBlueprint, Requirement, RequirementType, ProposalModule, ModuleKey,
  EvidenceItem, EvidenceType, ReviewTask, RiskItem, ExportPackage, ProjectInputs,
  ProjectMeta, BlueprintScores, ReviewDiscipline, AddendumImpact,
  CommercialItem, CommercialItemType,
} from './types';
import { ExtractedTenderMetadata, KBFile, PersonnelProfile, TeamMember, Tender } from '../types';

/* ── Module catalogue ─────────────────────────────────────────────── */

export const MODULE_CATALOGUE: { key: ModuleKey; name: string; discipline: ReviewDiscipline }[] = [
  { key: 'executive-summary', name: 'Executive Summary', discipline: 'Bid Director' },
  { key: 'client-needs', name: 'Understanding of Client Needs', discipline: 'Bid Manager' },
  { key: 'technical-methodology', name: 'Technical Methodology', discipline: 'Technical' },
  { key: 'design-management', name: 'Design Management', discipline: 'Technical' },
  { key: 'construction-methodology', name: 'Construction Methodology', discipline: 'Technical' },
  { key: 'program-staging', name: 'Program & Staging', discipline: 'Technical' },
  { key: 'possession-access-planning', name: 'Possession / Access Planning', discipline: 'Technical' },
  { key: 'key-personnel', name: 'Key Personnel', discipline: 'Bid Manager' },
  { key: 'cvs', name: 'CVs', discipline: 'Bid Manager' },
  { key: 'relevant-experience', name: 'Relevant Experience', discipline: 'Bid Manager' },
  { key: 'case-studies', name: 'Case Studies', discipline: 'Bid Manager' },
  { key: 'safety', name: 'Safety & Safety in Design', discipline: 'Safety' },
  { key: 'systems-assurance', name: 'Systems Assurance', discipline: 'Assurance' },
  { key: 'quality-management', name: 'Quality Management', discipline: 'Technical' },
  { key: 'environmental-management', name: 'Environmental Management', discipline: 'Technical' },
  { key: 'interface-management', name: 'Interface Management', discipline: 'Technical' },
  { key: 'stakeholder-management', name: 'Stakeholder Management', discipline: 'Bid Manager' },
  { key: 'risk-opportunity', name: 'Risk & Opportunity', discipline: 'Bid Manager' },
  { key: 'pricing-response', name: 'Pricing Response', discipline: 'Commercial' },
  { key: 'commercial-assumptions', name: 'Commercial Assumptions', discipline: 'Commercial' },
  { key: 'departures-clarifications', name: 'Departures & Clarifications', discipline: 'Legal / Contract' },
  { key: 'compliance-matrix', name: 'Compliance Matrix', discipline: 'Bid Manager' },
  { key: 'returnable-schedules', name: 'Returnable Schedules', discipline: 'Bid Manager' },
  { key: 'pitch-deck', name: 'Pitch Deck', discipline: 'Bid Director' },
  { key: 'submission-checklist', name: 'Final Submission Checklist', discipline: 'Final Approval' },
];

export const MODULE_NAME: Record<ModuleKey, string> = Object.fromEntries(
  MODULE_CATALOGUE.map((m) => [m.key, m.name]),
) as Record<ModuleKey, string>;

/* ── Small helpers ────────────────────────────────────────────────── */

let seq = 0;
const rid = () => `REQ-${String(++seq).padStart(3, '0')}`;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const has = (haystack: string, ...needles: string[]) => {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
};

const daysBefore = (iso: string, days: number): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

/* ── Evidence matching ────────────────────────────────────────────
   Content-based when kb_files.content_text is available (extracted at
   upload time by the document pipeline), with filename and category as
   additional signals. Returns a confidence score and a human-readable
   reason so the UI can explain WHY a file was matched. */

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'of', 'a', 'an', 'to', 'in', 'on', 'at', 'past', 'least', 'three', 'must', 'shall', 'provide', 'submit', 'submitted', 'tenderer', 'tenderers', 'all', 'any', 'each', 'from', 'their', 'that', 'this', 'within']);

const keywords = (text: string): string[] =>
  Array.from(new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  ));

export interface EvidenceMatch {
  file: KBFile;
  /** 0–100. */
  confidence: number;
  reason: string;
}

/**
 * Scores one KB file against a requirement. Signals, strongest first:
 * extracted document content overlap, filename overlap, category
 * affinity. Staleness never changes the score — it changes the STATUS
 * (a stale match is real but needs re-verification).
 */
function scoreFile(reqText: string, evType: EvidenceType, file: KBFile, preferredCategories: KBFile['category'][]): { score: number; reasons: string[] } {
  const words = keywords(reqText);
  if (!words.length) return { score: 0, reasons: [] };
  const reasons: string[] = [];
  let score = 0;

  const nameHay = file.name.toLowerCase().replace(/[_\-.]/g, ' ');
  const nameHits = words.filter((w) => nameHay.includes(w));
  if (nameHits.length) {
    score += nameHits.length * 12;
    reasons.push(`filename mentions ${nameHits.slice(0, 3).map((w) => `"${w}"`).join(', ')}`);
  }

  if (file.contentText) {
    const contentHay = file.contentText.toLowerCase();
    const contentHits = words.filter((w) => contentHay.includes(w));
    if (contentHits.length) {
      // Content overlap is the strongest signal — it's the document
      // itself, not a filename guess.
      score += Math.min(contentHits.length, 8) * 9;
      reasons.push(`document text covers ${contentHits.length} key term${contentHits.length === 1 ? '' : 's'} (${contentHits.slice(0, 4).map((w) => `"${w}"`).join(', ')})`);
    }
  }

  if (preferredCategories.includes(file.category)) {
    score += 10;
    reasons.push(`right library category (${file.category.replace(/_/g, ' ').toLowerCase()})`);
  } else if (nameHits.length === 0 && !file.contentText) {
    // Wrong category, no name signal, no content — not a candidate.
    return { score: 0, reasons: [] };
  }

  void evType;
  return { score, reasons };
}

/** Match threshold: below this, a "match" would be a guess we don't make. */
const MATCH_THRESHOLD = 22;

function bestEvidenceMatch(reqText: string, evType: EvidenceType, pool: KBFile[], allFiles: KBFile[], used: Set<string>, preferredCategories: KBFile['category'][]): EvidenceMatch | null {
  // Search the preferred-category pool first, then everything — a
  // correctly named file in the wrong category still beats nothing.
  let best: EvidenceMatch | null = null;
  for (const file of [...pool, ...allFiles.filter((f) => !pool.includes(f))]) {
    if (used.has(file.id)) continue;
    const { score, reasons } = scoreFile(reqText, evType, file, preferredCategories);
    if (score > (best?.confidence ?? 0)) {
      best = { file, confidence: score, reason: reasons.join('; ') };
    }
  }
  if (!best || best.confidence < MATCH_THRESHOLD) return null;
  return { ...best, confidence: Math.min(99, best.confidence) };
}

export const emptyInputs = (): ProjectInputs => ({
  winThemes: [], clientHotButtons: [], preferredTerminology: [], termsToAvoid: [],
  commercialPosition: '', keyAssumptions: [], keyExclusions: [], competitorNotes: '',
  proposalTone: 'Balanced', strategicNotes: '',
});

export const emptyMeta = (): ProjectMeta => ({
  submissionType: 'RFT', sector: 'Rail', bidManagerId: null, internalRef: '', portal: '', notes: '',
});

/* ── Requirement classification ───────────────────────────────────── */

function classify(text: string): { type: RequirementType; moduleKey: ModuleKey } {
  if (has(text, 'cv', 'key personnel', 'nominated', 'resume', 'chartered', 'registration'))
    return { type: 'Personnel', moduleKey: 'key-personnel' };
  if (has(text, 'experience', 'similar project', 'past project', 'case histor', 'delivered at least', 'examples'))
    return { type: 'Experience', moduleKey: 'relevant-experience' };
  if (has(text, 'insurance', 'indemnity', 'liability'))
    return { type: 'Insurance', moduleKey: 'returnable-schedules' };
  if (has(text, 'financial statement', 'audited', 'pricing', 'rates', 'lump sum', 'fee'))
    return { type: 'Commercial', moduleKey: 'pricing-response' };
  if (has(text, 'safety', 'whs', 'ohs', 'safety in design'))
    return { type: 'Safety', moduleKey: 'safety' };
  if (has(text, 'assurance', 'verification', 'validation', 'rvtm', 'tao', 'systems safety', 'ssf'))
    return { type: 'Assurance', moduleKey: 'systems-assurance' };
  if (has(text, 'program', 'staging', 'possession', 'sequenc', 'key dates', 'milestone'))
    return { type: 'Program', moduleKey: 'program-staging' };
  if (has(text, 'accredit', 'certification', 'iso ', 'iso9', 'iso4'))
    return { type: 'Accreditation', moduleKey: 'returnable-schedules' };
  if (has(text, 'policy', 'modern slavery', 'code of conduct', 'statement'))
    return { type: 'Legal', moduleKey: 'returnable-schedules' };
  if (has(text, 'methodology', 'approach', 'delivery method', 'technical'))
    return { type: 'Technical', moduleKey: 'technical-methodology' };
  if (has(text, 'design management', 'design'))
    return { type: 'Technical', moduleKey: 'design-management' };
  if (has(text, 'interface', 'stakeholder', 'third part', 'coordination'))
    return { type: 'Technical', moduleKey: 'interface-management' };
  if (has(text, 'risk'))
    return { type: 'Risk', moduleKey: 'risk-opportunity' };
  return { type: 'Technical', moduleKey: 'technical-methodology' };
}

const EVIDENCE_TYPE_FOR: Partial<Record<RequirementType, EvidenceType>> = {
  Personnel: 'CV', Experience: 'Case study', Insurance: 'Insurance certificate',
  Commercial: 'Commercial note', Safety: 'Safety document', Assurance: 'Assurance document',
  Program: 'Program', Accreditation: 'Accreditation', Legal: 'Policy',
  Technical: 'Methodology', Risk: 'Commercial note', Pricing: 'Pricing assumption',
};

const KB_POOL_FOR: Partial<Record<RequirementType, KBFile['category'][]>> = {
  Personnel: ['CV'], Experience: ['PROJECT_EVIDENCE', 'CAPABILITY'],
  Insurance: ['CREDENTIAL'], Commercial: ['BENCHMARK', 'CREDENTIAL'],
  Safety: ['POLICY'], Assurance: ['CAPABILITY', 'POLICY'], Program: ['PROJECT_EVIDENCE'],
  Accreditation: ['CREDENTIAL'], Legal: ['POLICY'], Technical: ['CAPABILITY', 'PROJECT_EVIDENCE'],
};

/* ── Blueprint generation ─────────────────────────────────────────── */

export interface GenerateBlueprintInput {
  tender: Tender;
  extracted: ExtractedTenderMetadata;
  kbFiles: KBFile[];
  personnel: PersonnelProfile[];
  team: TeamMember[];
  documentNames: string[];
  meta?: Partial<ProjectMeta>;
}

export function generateBlueprint(input: GenerateBlueprintInput): TenderBlueprint {
  const { tender, extracted, kbFiles, team, documentNames } = input;
  seq = 0;
  const sourceDoc = documentNames[0] ?? 'Tender documents';
  const due = tender.closingDate;
  const owner = (role: TeamMember['role']): string | null => team.find((m) => m.role === role)?.id ?? team[0]?.id ?? null;
  const bidManager = input.meta?.bidManagerId ?? owner('BID_MANAGER');
  const techReviewer = owner('TECHNICAL_REVIEWER');
  const commReviewer = owner('COMMERCIAL_REVIEWER');

  const requirements: Requirement[] = [];
  const evidence: EvidenceItem[] = [];
  const usedKb = new Set<string>();
  const activation = new Map<ModuleKey, string>();
  const activate = (key: ModuleKey, reason: string) => { if (!activation.has(key)) activation.set(key, reason); };

  const pushRequirement = (partial: Omit<Requirement, 'id' | 'ownerId' | 'reviewerId' | 'dueDate' | 'status' | 'compliance' | 'notes'> & { ownerId?: string | null }) => {
    const r: Requirement = {
      id: rid(), ownerId: partial.ownerId ?? bidManager,
      reviewerId: partial.moduleKey && ['pricing-response', 'commercial-assumptions'].includes(partial.moduleKey) ? commReviewer : techReviewer,
      dueDate: daysBefore(due, 7), status: 'Not started', compliance: 'Not assessed', notes: '',
      ...partial,
    };
    requirements.push(r);
    return r;
  };

  const addEvidence = (req: Requirement, type: EvidenceType, preferredCategories: KBFile['category'][]) => {
    const pool = kbFiles.filter((f) => preferredCategories.includes(f.category));
    const match = bestEvidenceMatch(req.text, type, pool, kbFiles, usedKb, preferredCategories);
    if (match) usedKb.add(match.file.id);
    const status: EvidenceItem['status'] = match ? (match.file.isStale ? 'check' : 'found') : 'missing';
    evidence.push({
      id: uid('ev'), label: req.text.length > 90 ? req.text.slice(0, 87) + '…' : req.text,
      detail: match
        ? `Matched to ${match.file.name} (${match.confidence}% confidence): ${match.reason}${match.file.isStale ? '. File is stale — re-verify before submission.' : '.'}`
        : pool.length > 0
          ? `No confident match — ${pool.length} ${type.toLowerCase()}-related file${pool.length === 1 ? '' : 's'} exist in the library; link the right one or upload new evidence.`
          : 'Nothing of this type in the knowledge base yet.',
      type, status, requirementId: req.id, moduleKey: req.moduleKey,
      matchedFile: match?.file.name ?? null,
      confidence: match?.confidence,
      matchReason: match?.reason,
    });
  };

  /* Shared module-activation rules, applied per requirement in both the
     rich (AI) and legacy extraction paths. */
  const applyActivationRules = (text: string, type: RequirementType) => {
    if (type === 'Personnel') { activate('key-personnel', 'CVs / key people are requested in the tender.'); activate('cvs', 'CVs / key people are requested in the tender.'); }
    if (type === 'Experience') { activate('relevant-experience', 'Past experience / similar project examples are requested.'); activate('case-studies', 'Past experience / similar project examples are requested.'); }
    if (has(text, 'methodology', 'approach', 'delivery method') || type === 'Technical') activate('technical-methodology', 'A methodology / technical approach is requested.');
    if (has(text, 'design management', 'interdisciplinary design', 'design review', 'design deliverable')) activate('design-management', 'Design management is mentioned in the tender.');
    if (has(text, 'construction methodology', 'construction method', 'site constraint', 'delivery sequenc', 'sequencing', 'buildability')) activate('construction-methodology', 'Construction methodology / staging / site constraints are mentioned.');
    if (type === 'Program' || has(text, 'program', 'staging', 'possession', 'key dates', 'milestone', 'access window')) activate('program-staging', 'Program, staging or key dates are mentioned.');
    if (has(text, 'possession', 'shutdown', 'rail access', 'corridor access', 'access window', 'track access', 'occupation')) activate('possession-access-planning', 'Possessions / rail or corridor access / access windows are mentioned.');
    if (has(text, 'safety', 'whs', 'safety in design') || type === 'Safety') activate('safety', 'Safety / WHS / Safety in Design is mentioned.');
    if (type === 'Assurance' || has(text, 'assurance', 'verification', 'validation', 'rvtm')) activate('systems-assurance', 'Assurance, verification/validation or systems-safety frameworks are mentioned.');
    if (has(text, 'quality management', 'itp', 'hold point', 'inspection and test', 'test plan', 'quality record', 'quality plan')) activate('quality-management', 'Quality management / ITPs / hold points are mentioned.');
    if (has(text, 'environmental', 'sustainability', 'contamination', 'erosion', 'sediment control', 'environmental management', 'ecolog')) activate('environmental-management', 'Environmental management / sustainability / approvals are mentioned.');
    if (has(text, 'interface', 'utilities', 'adjacent contractor', 'discipline coordination')) activate('interface-management', 'Interfaces, utilities or discipline coordination are mentioned.');
    if (has(text, 'stakeholder', 'community', 'authority approval', 'third party consultation', 'consultation', 'engagement')) activate('stakeholder-management', 'Stakeholder engagement / community / authority consultation is mentioned.');
    if (type === 'Pricing' || type === 'Commercial' || type === 'Insurance') { activate('commercial-assumptions', 'Commercial and financial requirements are included.'); }
    if (type === 'Pricing') activate('pricing-response', 'Pricing requirements are included in the tender.');
    if (type === 'Risk') activate('risk-opportunity', 'Risk requirements are included in the tender.');
    if (type === 'Mandatory returnable' || has(text, 'compliance matrix', 'returnable schedule')) { activate('returnable-schedules', 'The tender includes required returnable schedules.'); activate('compliance-matrix', 'A returnable/compliance structure is included in the tender.'); }
    if (has(text, 'presentation', 'interview', 'shortlist')) activate('pitch-deck', 'A presentation / interview / shortlist stage is mentioned.');
    if (has(text, 'departure', 'qualification', 'exclusion')) activate('departures-clarifications', 'Departures / qualifications are addressed in the tender.');
  };

  /** Category label from the AI extraction → RequirementType. */
  const CATEGORY_TO_TYPE: Record<string, RequirementType> = {
    'submission instruction': 'Submission instruction', 'mandatory returnable': 'Mandatory returnable',
    'evaluation criteria': 'Evaluation criteria', 'technical': 'Technical', 'commercial': 'Commercial',
    'legal': 'Legal', 'safety': 'Safety', 'assurance': 'Assurance', 'program': 'Program',
    'personnel': 'Personnel', 'experience': 'Experience', 'pricing': 'Pricing',
    'insurance': 'Insurance', 'accreditation': 'Accreditation', 'template': 'Template',
    'formatting': 'Formatting', 'evidence': 'Evidence', 'clarification': 'Clarification',
    'addendum': 'Addendum', 'risk': 'Risk',
  };

  const MODULE_FOR_TYPE: Partial<Record<RequirementType, ModuleKey>> = {
    'Mandatory returnable': 'returnable-schedules', 'Evaluation criteria': 'technical-methodology',
    'Submission instruction': 'submission-checklist', 'Pricing': 'pricing-response',
    'Insurance': 'returnable-schedules', 'Accreditation': 'returnable-schedules',
    'Template': 'returnable-schedules', 'Formatting': 'submission-checklist',
    'Safety': 'safety', 'Assurance': 'systems-assurance', 'Program': 'program-staging',
    'Personnel': 'key-personnel', 'Experience': 'relevant-experience',
    'Commercial': 'commercial-assumptions', 'Legal': 'departures-clarifications',
    'Risk': 'risk-opportunity',
  };

  const richItems = (extracted.requirements ?? []).filter((r) => r.text?.trim());

  if (richItems.length > 0) {
    /* ── Rich path: source-referenced requirements from live AI ───── */
    richItems.forEach((item) => {
      const type = CATEGORY_TO_TYPE[item.category?.toLowerCase()?.trim() ?? ''] ?? classify(item.text).type;
      const moduleKey = MODULE_FOR_TYPE[type] ?? classify(item.text).moduleKey;
      const mandatory = item.mandatory ?? type === 'Mandatory returnable';
      const evidenceRequired = item.evidenceRequired ?? ['Personnel', 'Experience', 'Insurance', 'Accreditation', 'Legal', 'Safety', 'Evidence'].includes(type);
      const req = pushRequirement({
        text: item.text,
        sourceDocument: item.sourceDocument || sourceDoc,
        clauseRef: item.clauseRef || '—',
        type, moduleKey,
        priority: mandatory ? 'Critical' : item.scored ? 'High' : 'Medium',
        mandatory, scored: item.scored ?? type === 'Evaluation criteria',
        responseRequired: type !== 'Insurance' && type !== 'Accreditation',
        evidenceRequired,
        risk: item.confidence === 'low' ? 'Medium' : type === 'Insurance' || type === 'Commercial' ? 'Medium' : 'Low',
        suggestedApproach: suggestApproach(type),
        confidence: item.confidence,
      });
      if (evidenceRequired) {
        const evType = EVIDENCE_TYPE_FOR[type] ?? 'Methodology';
        addEvidence(req, evType, KB_POOL_FOR[type] ?? ['CAPABILITY']);
      }
      applyActivationRules(item.text, type);
    });
  } else {
  /* ── Legacy path: high-level metadata arrays (demo sample /
        older extractions without a requirements register) ─────────── */

  /* 1. Mandatory requirements → typed register + evidence + activation */
  extracted.mandatoryRequirements.forEach((text, i) => {
    const { type, moduleKey } = classify(text);
    const req = pushRequirement({
      text, sourceDocument: sourceDoc, clauseRef: `Cl. ${i + 2}.1.${i + 1}`,
      type, priority: 'Critical', mandatory: true, scored: false,
      responseRequired: true, evidenceRequired: true, moduleKey,
      risk: type === 'Insurance' || type === 'Commercial' ? 'Medium' : 'Low',
      suggestedApproach: suggestApproach(type),
    });
    addEvidence(req, EVIDENCE_TYPE_FOR[type] ?? 'Methodology', KB_POOL_FOR[type] ?? ['CAPABILITY']);
    applyActivationRules(text, type);
  });

  /* 2. Evaluation criteria → scored requirements */
  extracted.evaluationCriteria.forEach((text, i) => {
    const { moduleKey } = classify(text);
    pushRequirement({
      text, sourceDocument: sourceDoc, clauseRef: `Evaluation Plan §${i + 1}`,
      type: 'Evaluation criteria', priority: 'High', mandatory: false, scored: true,
      responseRequired: true, evidenceRequired: false, moduleKey, risk: 'None',
      suggestedApproach: 'Structure the response so evaluators can score this criterion directly — lead with proof, quantify outcomes, mirror the client\u2019s language.',
    });
    applyActivationRules(text, 'Evaluation criteria');
    if (has(text, 'pricing', 'commercial', 'price')) activate('pricing-response', 'Pricing is an evaluated criterion.');
    if (has(text, 'personnel', 'credential')) { activate('key-personnel', 'Key personnel are evaluated.'); activate('cvs', 'Key personnel are evaluated.'); }
    if (has(text, 'technical', 'capability', 'evidence')) activate('technical-methodology', 'Technical capability is an evaluated criterion.');
  });

  /* 3. Returnable schedules → mandatory returnables */
  extracted.requiredSchedules.forEach((text, i) => {
    pushRequirement({
      text: `Complete and submit: ${text}`, sourceDocument: sourceDoc, clauseRef: `Returnables Sch. ${String.fromCharCode(65 + i)}`,
      type: 'Mandatory returnable', priority: 'Critical', mandatory: true, scored: false,
      responseRequired: true, evidenceRequired: false, moduleKey: 'returnable-schedules', risk: 'Low',
      suggestedApproach: 'Use the client\u2019s template exactly as issued — evaluators reject reformatted returnables.',
    });
  });
  if (extracted.requiredSchedules.length) {
    activate('returnable-schedules', 'The tender includes required returnable schedules.');
    activate('compliance-matrix', 'A returnable/compliance structure is included in the tender.');
  }

  /* 4. Insurances + policies */
  extracted.mandatoryInsurances.forEach((text, i) => {
    const req = pushRequirement({
      text, sourceDocument: sourceDoc, clauseRef: `Conditions §9.${i + 1}`,
      type: 'Insurance', priority: 'Critical', mandatory: true, scored: false,
      responseRequired: false, evidenceRequired: true, moduleKey: 'returnable-schedules', risk: 'Medium',
      suggestedApproach: 'Attach a current certificate of currency at or above the stated cover.',
    });
    addEvidence(req, 'Insurance certificate', ['CREDENTIAL']);
  });
  extracted.requiredPolicies.forEach((text, i) => {
    const req = pushRequirement({
      text, sourceDocument: sourceDoc, clauseRef: `Conditions §10.${i + 1}`,
      type: 'Legal', priority: 'High', mandatory: true, scored: false,
      responseRequired: false, evidenceRequired: true, moduleKey: 'returnable-schedules', risk: 'Low',
      suggestedApproach: 'Attach the current controlled version of the policy.',
    });
    addEvidence(req, 'Policy', ['POLICY']);
  });
  } // end legacy path

    /* 5. Formatting limits (skipped when the rich register already has one) */
  if (extracted.pageLimits && !requirements.some((r) => r.type === 'Formatting')) {
    pushRequirement({
      text: `Observe page limits: ${extracted.pageLimits}`, sourceDocument: sourceDoc, clauseRef: 'Submission instructions',
      type: 'Formatting', priority: 'High', mandatory: true, scored: false,
      responseRequired: false, evidenceRequired: false, moduleKey: 'submission-checklist', risk: 'Low',
    });
  }

  /* 6. Pricing forms */
  if (extracted.pricingFormsCount > 0 && !requirements.some((r) => r.type === 'Pricing')) {
    activate('pricing-response', `${extracted.pricingFormsCount} pricing form${extracted.pricingFormsCount === 1 ? '' : 's'} must be returned.`);
    activate('commercial-assumptions', 'Pricing schedules are included in the tender.');
    pushRequirement({
      text: `Complete ${extracted.pricingFormsCount} pricing form${extracted.pricingFormsCount === 1 ? '' : 's'} / commercial schedule${extracted.pricingFormsCount === 1 ? '' : 's'}.`,
      sourceDocument: sourceDoc, clauseRef: 'Commercial schedules', type: 'Pricing', priority: 'Critical',
      mandatory: true, scored: true, responseRequired: true, evidenceRequired: false,
      moduleKey: 'pricing-response', risk: 'Medium',
      suggestedApproach: 'Build up rates in the pricing workbook; document every assumption in Commercial Assumptions.',
    });
  }

  /* Always-on modules */
  activate('executive-summary', 'Every submission opens with an executive summary.');
  activate('client-needs', 'Demonstrating understanding of the client\u2019s drivers is always expected.');
  activate('submission-checklist', 'Always activated — final gate before submission.');
  if (extracted.addendaCount > 0) activate('departures-clarifications', 'Addenda have been issued; clarifications/departures tracking is needed.');

  /* Modules from catalogue */
  const modules: ProposalModule[] = MODULE_CATALOGUE.map((def) => {
    const reason = activation.get(def.key) ?? null;
    const linked = requirements.filter((r) => r.moduleKey === def.key).map((r) => r.id);
    const linkedEvidence = evidence.filter((e) => e.moduleKey === def.key).map((e) => e.id);
    return {
      key: def.key, name: def.name, active: reason !== null, activationReason: reason,
      manuallyToggled: false, requirementIds: linked, evidenceIds: linkedEvidence,
      draftStatus: 'Not started', draft: '', ownerId: bidManager,
      reviewerDiscipline: def.discipline, dueDate: daysBefore(due, def.key === 'submission-checklist' ? 1 : 5),
      wordLimit: def.key === 'executive-summary' ? 800 : def.key === 'technical-methodology' ? 3000 : null,
      comments: [],
    };
  });

  /* Review gates for active modules */
  const reviews: ReviewTask[] = modules.filter((m) => m.active).map((m) => ({
    id: uid('rev'),
    title: `${m.reviewerDiscipline} review — ${m.name}`,
    moduleKey: m.key, discipline: m.reviewerDiscipline,
    reviewerId: m.reviewerDiscipline === 'Commercial' ? commReviewer : m.reviewerDiscipline === 'Bid Manager' ? bidManager : techReviewer,
    dueDate: daysBefore(due, m.key === 'submission-checklist' ? 1 : 3),
    status: 'Not started', comments: '', requiredChanges: '',
  }));

  /* Clarifications the analysis says are worth raising → tracked tasks */
  (extracted.clarificationsNeeded ?? []).slice(0, 6).forEach((q) => {
    reviews.push({
      id: uid('rev'), title: `Clarification to client — ${q.slice(0, 60)}${q.length > 60 ? '…' : ''}`,
      moduleKey: null, discipline: 'Bid Manager', reviewerId: bidManager,
      dueDate: daysBefore(due, 10), status: 'Not started', comments: q, requiredChanges: '',
    });
  });

  /* Risks: analysis-derived + evidence gaps */
  const risks: RiskItem[] = [];
  [...(extracted.commercialRisks ?? []).map((r) => ({ r, t: 'Commercial risk' })),
   ...(extracted.legalRisks ?? []).map((r) => ({ r, t: 'Legal / contract risk' }))].slice(0, 8).forEach(({ r, t }) => {
    risks.push({
      id: uid('risk'), title: `${t}: ${r.slice(0, 70)}${r.length > 70 ? '…' : ''}`, detail: r,
      rating: 'Medium', source: 'Analysis', requirementId: null,
      mitigation: '', ownerId: t.startsWith('Commercial') ? commReviewer : bidManager, status: 'Open',
    });
  });
  const shortRunway = Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000) < 21;
  if (shortRunway) {
    risks.push({
      id: uid('risk'), title: 'Compressed submission runway',
      detail: `Fewer than three weeks remain before close (${due}). Review gates need early scheduling.`,
      rating: 'High', source: 'Analysis', requirementId: null,
      mitigation: 'Lock reviewer availability now; draft highest-weight sections first.',
      ownerId: bidManager, status: 'Open',
    });
  }
  evidence.filter((e) => e.status === 'missing').slice(0, 4).forEach((e) => {
    risks.push({
      id: uid('risk'), title: `Missing evidence: ${e.type}`,
      detail: e.label, rating: e.type === 'Insurance certificate' ? 'High' : 'Medium',
      source: 'Evidence gap', requirementId: e.requirementId,
      mitigation: 'Upload or source the evidence, or raise a clarification with the client.',
      ownerId: bidManager, status: 'Open',
    });
  });
  if (extracted.pricingFormsCount > 1) {
    risks.push({
      id: uid('risk'), title: 'Multiple commercial schedules to reconcile',
      detail: `${extracted.pricingFormsCount} pricing forms must stay internally consistent with the assumptions register.`,
      rating: 'Medium', source: 'Analysis', requirementId: null,
      mitigation: 'Single owner for all commercial schedules; reconcile before commercial review.',
      ownerId: commReviewer, status: 'Open',
    });
  }

    const isActive = (k: ModuleKey) => modules.find((m) => m.key === k)?.active ?? false;

  /* Export package plan */
  const exports: ExportPackage[] = [
    { key: 'full-proposal', name: 'Full Proposal Document', level: 'Required by client', description: 'The complete technical and management response, assembled from approved module drafts.', ready: false, blockedBy: 'No module drafts approved yet', lastExportedAt: null },
    { key: 'executive-summary', name: 'Executive Summary', level: 'Required by client', description: 'Standalone executive summary extract.', ready: false, blockedBy: 'Executive summary not drafted', lastExportedAt: null },
    { key: 'compliance-matrix', name: 'Compliance Matrix', level: isActive('compliance-matrix') ? 'Required by client' : 'Internal only', description: 'Requirement-by-requirement compliance statement (PDF + CSV).', ready: true, blockedBy: null, lastExportedAt: null },
    { key: 'returnable-schedules', name: 'Returnable Schedules', level: extracted.requiredSchedules.length ? 'Required by client' : 'Not required', description: 'Client templates completed and collated in submission order.', ready: false, blockedBy: 'Returnables not yet marked complete', lastExportedAt: null },
    { key: 'pricing-assumptions', name: 'Pricing Assumptions', level: isActive('pricing-response') ? 'Required by client' : 'Not required', description: 'Commercial basis of the offer: rates build-up and assumptions register.', ready: false, blockedBy: 'Commercial review not complete', lastExportedAt: null },
    { key: 'commercial-departures', name: 'Departures & Qualifications', level: isActive('departures-clarifications') ? 'Optional' : 'Not required', description: 'Contract departures and qualifications table.', ready: true, blockedBy: null, lastExportedAt: null },
    { key: 'clarification-register', name: 'Clarification Register', level: isActive('departures-clarifications') || extracted.addendaCount > 0 ? 'Optional' : 'Not required', description: 'Clarifications sought from the client, with proposed wording and status.', ready: true, blockedBy: null, lastExportedAt: null },
    { key: 'risk-register', name: 'Risk Register', level: 'Internal only', description: 'Bid risk register with mitigations and owners.', ready: true, blockedBy: null, lastExportedAt: null },
    { key: 'cv-pack', name: 'CV Pack', level: isActive('cvs') ? 'Required by client' : 'Not required', description: `Tailored CVs for the ${extracted.requiredCVsCount || 'nominated'} key personnel.`, ready: false, blockedBy: 'CVs not yet reviewed', lastExportedAt: null },
    { key: 'case-study-pack', name: 'Case Study Pack', level: isActive('case-studies') ? 'Required by client' : 'Optional', description: `Project case histories (${extracted.requiredProjectExamplesCount || 3} required).`, ready: false, blockedBy: 'Case studies not selected', lastExportedAt: null },
    { key: 'pitch-deck', name: 'Pitch Deck', level: isActive('pitch-deck') ? 'Required by client' : 'Not required', description: 'Presentation pack for the interview / shortlist stage.', ready: false, blockedBy: 'No shortlist stage detected', lastExportedAt: null },
    { key: 'submission-checklist', name: 'Submission Checklist', level: 'Internal only', description: 'The final gate: every mandatory item checked before lodgement.', ready: true, blockedBy: null, lastExportedAt: null },
    { key: 'internal-approval-pack', name: 'Internal Approval Pack', level: 'Internal only', description: 'Gate status, commercial position and risk summary for internal sign-off.', ready: true, blockedBy: null, lastExportedAt: null },
  ];

  /* Commercial Assumptions Register — seeded from the tender's commercial
     signals; the team then adds, acknowledges and approves items. Starts
     Open (unacknowledged Open items gate the commercial exports). */
  const commercial: CommercialItem[] = [];
  const nowIso = new Date().toISOString();
  const pushCommercial = (type: CommercialItemType, text: string, extra: Partial<CommercialItem> = {}) => {
    commercial.push({
      id: uid('com'), type, text, status: 'Open', exportReady: false,
      source: 'Analysis', createdAt: nowIso, reviewerId: commReviewer,
      linkedModuleKey: null, ...extra,
    });
  };
  (extracted.commercialRisks ?? []).slice(0, 6).forEach((r) =>
    pushCommercial('Commercial risk', r, { linkedModuleKey: 'commercial-assumptions' }));
  (extracted.legalRisks ?? []).slice(0, 6).forEach((r) =>
    pushCommercial('Contract concern', r, { linkedModuleKey: 'departures-clarifications' }));
  if (extracted.pricingFormsCount > 0) {
    pushCommercial('Pricing assumption', `Confirm the basis for the ${extracted.pricingFormsCount} pricing schedule(s): rates, provisional sums and inclusions/exclusions.`, { linkedModuleKey: 'pricing-response' });
  }
  // Rich requirements flagged Commercial/Pricing become tracked positions.
  (extracted.requirements ?? [])
    .filter((r) => ['Commercial', 'Pricing'].includes(CATEGORY_TO_TYPE[r.category?.toLowerCase()?.trim() ?? ''] ?? ''))
    .slice(0, 6)
    .forEach((r) => pushCommercial(
      (CATEGORY_TO_TYPE[r.category?.toLowerCase()?.trim() ?? ''] === 'Pricing') ? 'Pricing assumption' : 'Commercial risk',
      r.text,
      { clauseRef: r.clauseRef || undefined, linkedModuleKey: 'commercial-assumptions' },
    ));

  return {
    tenderId: tender.id,
    generatedAt: new Date().toISOString(),
    summary: extracted.summary?.trim() || `${extracted.client} is seeking ${extracted.tenderName.toLowerCase().startsWith('the') ? '' : 'a response to '}${extracted.tenderName} (${extracted.tenderNumber}), closing ${extracted.closingDate} via ${extracted.submissionPortal.split('(')[0].trim()}. The submission carries ${extracted.mandatoryRequirements.length} mandatory requirements, ${extracted.requiredSchedules.length} returnable schedules and ${extracted.evaluationCriteria.length} evaluation criteria.`,
    submissionType: input.meta?.submissionType || 'RFT',
    pageLimits: extracted.pageLimits,
    wordLimits: extracted.wordLimits,
    requiredTemplates: extracted.requiredSchedules.filter((s) => has(s, 'schedule', 'form', 'template')),
    requiredAccreditations: extracted.mandatoryRequirements.filter((r) => has(r, 'accredit', 'certif', 'registration', 'chartered')),
    requiredInsurances: extracted.mandatoryInsurances,
    returnables: extracted.requiredSchedules,
    evaluationCriteria: extracted.evaluationCriteria,
    addendaCount: extracted.addendaCount,
    requirements, modules, evidence, reviews, risks,
    addenda: [],
    exports,
    commercial,
    proposalNotes: {},
    claimRegister: [],
    proposalVersions: [],
    inputs: emptyInputs(),
    meta: { ...emptyMeta(), ...input.meta, bidManagerId: bidManager },
  };
}

function suggestApproach(type: RequirementType): string {
  switch (type) {
    case 'Personnel': return 'Nominate named individuals with the required registrations; tailor each CV to the tender\u2019s scope and cite verifiable credentials.';
    case 'Experience': return 'Select recent, directly comparable projects; quantify outcomes and name referees the client can contact.';
    case 'Insurance': return 'Attach current certificates of currency at or above the stated cover levels.';
    case 'Commercial': return 'Provide audited statements / commercial evidence exactly as requested; flag anything commercially sensitive.';
    case 'Safety': return 'Reference the certified safety management system and map it to the client\u2019s framework.';
    case 'Assurance': return 'Map the assurance approach to the client\u2019s framework clause-by-clause; reference prior assurance deliverables.';
    default: return 'Answer the requirement directly, evidence every claim, and mirror the client\u2019s terminology.';
  }
}

/* ── Scores ───────────────────────────────────────────────────────── */

export function computeScores(bp: TenderBlueprint): BlueprintScores {
  const activeModules = bp.modules.filter((m) => m.active);
  const mandatory = bp.requirements.filter((r) => r.mandatory);
  const mandatoryUnanswered = mandatory.filter((r) => r.status === 'Not started' || r.status === 'In progress').length;
  const gaps = bp.evidence.filter((e) => e.status === 'missing').length;
  const checks = bp.evidence.filter((e) => e.status === 'check').length;
  const highRisks = bp.risks.filter((r) => r.rating === 'High' && r.status === 'Open').length;
  const commercialIssues = bp.risks.filter((r) => r.status === 'Open' && (r.title.toLowerCase().includes('commercial') || r.title.toLowerCase().includes('pricing'))).length
    + bp.requirements.filter((r) => (r.type === 'Pricing' || r.type === 'Commercial') && r.compliance === 'Non-compliant').length
    + (bp.commercial ?? []).filter((c) => c.status === 'Open').length;
  const addendaPending = bp.addenda.filter((a) => !a.reviewed).length;
  const awaitingReview = bp.reviews.filter((t) => t.status === 'In review').length;
  const today = new Date().toISOString().split('T')[0];
  const overdueTasks = bp.reviews.filter((t) => t.status !== 'Approved' && t.dueDate && t.dueDate < today).length
    + bp.requirements.filter((r) => r.status !== 'Complete' && r.dueDate && r.dueDate < today).length;
  const wordLimitIssues = activeModules.filter((m) => m.wordLimit && m.draft && m.draft.split(/\s+/).filter(Boolean).length > m.wordLimit).length;

  const compliant = bp.requirements.filter((r) => r.compliance === 'Compliant').length;
  const compliance = bp.requirements.length ? Math.round((compliant / bp.requirements.length) * 100) : 0;

  // Readiness: weighted blend of requirement progress, evidence coverage,
  // draft progress and review approvals.
  const reqDone = bp.requirements.length ? bp.requirements.filter((r) => r.status === 'Complete' || r.status === 'In review').length / bp.requirements.length : 0;
  const evCovered = bp.evidence.length ? bp.evidence.filter((e) => e.status === 'found').length / bp.evidence.length : 1;
  const drafts = activeModules.length ? activeModules.filter((m) => m.draftStatus === 'Approved' || m.draftStatus === 'Drafted' || m.draftStatus === 'In review').length / activeModules.length : 0;
  const approvals = bp.reviews.length ? bp.reviews.filter((t) => t.status === 'Approved').length / bp.reviews.length : 0;
  const readiness = Math.round((reqDone * 0.3 + evCovered * 0.3 + drafts * 0.25 + approvals * 0.15) * 100);

  const required = bp.exports.filter((e) => e.level === 'Required by client');
  return {
    readiness, compliance,
    mandatoryTotal: mandatory.length, mandatoryUnanswered,
    evidenceGaps: gaps, evidenceChecks: checks, highRisks, commercialIssues,
    addendaPending, awaitingReview, overdueTasks, wordLimitIssues,
    exportsReady: required.filter((e) => e.ready).length, exportsRequired: required.length,
  };
}

/* ── Addendum impact analysis ─────────────────────────────────────── */

/**
 * PROVISIONAL addendum impact — the heuristic fallback used when no AI
 * analysis could run (demo mode, AI not configured, or the addendum's
 * text couldn't be extracted). It flags the areas addenda most commonly
 * touch (commercial schedules, program, returnables) and is clearly
 * labelled as provisional: the review task it creates asks a human to
 * confirm against the actual document. The live path is
 * buildAddendumImpact in src/blueprint/addendumService.ts.
 */
export function analyzeAddendum(documentName: string, bp: TenderBlueprint): AddendumImpact {
  const pricingReqs = bp.requirements.filter((r) => r.type === 'Pricing' || r.type === 'Commercial');
  const programReqs = bp.requirements.filter((r) => r.type === 'Program' || r.type === 'Formatting');
  const affected = [...pricingReqs.slice(0, 2), ...programReqs.slice(0, 1)];
  const affectedModules = Array.from(new Set(affected.map((r) => r.moduleKey).filter((k): k is ModuleKey => !!k)));
  if (!affectedModules.includes('pricing-response') && bp.modules.find((m) => m.key === 'pricing-response')?.active) affectedModules.push('pricing-response');

  return {
    id: uid('add'),
    documentName,
    receivedAt: new Date().toISOString().split('T')[0],
    summary: `PROVISIONAL — no AI analysis was available for "${documentName}", so this is a heuristic flag of the areas addenda most commonly change (commercial schedules, program dates, returnables). A human must review the addendum and confirm or correct this assessment.`,
    changes: [
      'Possible revision to commercial schedule quantities or rates basis (unconfirmed).',
      'Possible change to key dates / program constraints (unconfirmed).',
      'Returnable list should be re-checked against the addendum\u2019s instructions.',
    ],
    affectedRequirementIds: affected.map((r) => r.id),
    affectedModuleKeys: affectedModules,
    pricingImpact: pricingReqs.length > 0,
    riskImpact: true,
    reviewed: false,
    provisional: true,
  };
}

/**
 * Merges the manual work a team did on the PREVIOUS blueprint onto a
 * freshly regenerated one, so re-analysis refreshes the tender-derived
 * structure (requirements, activation, evidence matches) without
 * discarding human effort. Carried forward, matched by stable key:
 *   modules  — draft text, draft status, owner, due date, manual toggles
 *   reviews  — status, comments, required changes (matched by module+discipline)
 *   evidence — manual resolution + notes (matched by label+type)
 *   addenda  — kept entirely (they're a historical record, not re-derived)
 * Requirements keep their fresh source-referenced form but retain any
 * manual owner/status where the requirement still exists (matched by id).
 */
export function mergeManualWork(fresh: TenderBlueprint, prev: TenderBlueprint): TenderBlueprint {
  const prevModules = new Map(prev.modules.map((m) => [m.key, m]));
  const modules = fresh.modules.map((m) => {
    const old = prevModules.get(m.key);
    if (!old) return m;
    return {
      ...m,
      draft: old.draft || m.draft,
      draftStatus: old.draft ? old.draftStatus : m.draftStatus,
      ownerId: old.ownerId ?? m.ownerId,
      dueDate: old.dueDate ?? m.dueDate,
      comments: old.comments?.length ? old.comments : m.comments,
      active: old.manuallyToggled ? old.active : m.active,
      manuallyToggled: old.manuallyToggled || m.manuallyToggled,
      // Section notes, manual-edit flag and first-pass meta are user work
      // — carried forward untouched.
      sectionNotes: old.sectionNotes ?? m.sectionNotes,
      manuallyEdited: old.manuallyEdited,
      firstPass: old.firstPass ?? m.firstPass,
    };
  });

  const prevReviews = new Map(prev.reviews.map((r) => [`${r.moduleKey ?? '—'}::${r.discipline}`, r]));
  const reviews = fresh.reviews.map((r) => {
    const old = prevReviews.get(`${r.moduleKey ?? '—'}::${r.discipline}`);
    if (!old) return r;
    return { ...r, status: old.status, comments: old.comments, requiredChanges: old.requiredChanges, reviewerId: old.reviewerId ?? r.reviewerId };
  });

  const prevEvidence = new Map(prev.evidence.filter((e) => e.resolution).map((e) => [`${e.label}::${e.type}`, e]));
  const evidence = fresh.evidence.map((e) => {
    const old = prevEvidence.get(`${e.label}::${e.type}`);
    if (!old) return e;
    return { ...e, resolution: old.resolution, notes: old.notes ?? e.notes, status: old.resolution === 'not-required' ? e.status : old.status };
  });

  const prevReqs = new Map(prev.requirements.map((r) => [r.id, r]));
  const requirements = fresh.requirements.map((r) => {
    const old = prevReqs.get(r.id);
    if (!old) return r;
    return { ...r, ownerId: old.ownerId ?? r.ownerId, status: old.status !== 'Not started' ? old.status : r.status };
  });

  return {
    ...fresh,
    modules,
    reviews,
    evidence,
    requirements,
    // Commercial register: keep the team's register (their acknowledged/
    // approved positions and manual items) rather than the fresh seed.
    commercial: prev.commercial?.length ? prev.commercial : fresh.commercial,
    // Proposal Run Through state is entirely user work — always kept.
    proposalNotes: prev.proposalNotes ?? fresh.proposalNotes,
    claimRegister: prev.claimRegister ?? fresh.claimRegister,
    proposalVersions: prev.proposalVersions ?? fresh.proposalVersions,
    // Addenda are a historical record — never re-derived, always kept.
    addenda: prev.addenda.length ? prev.addenda : fresh.addenda,
    addendaCount: Math.max(fresh.addendaCount, prev.addendaCount),
    inputs: prev.inputs ?? fresh.inputs,
    editedAt: prev.editedAt,
  };
}

/**
 * Applies an addendum impact to the blueprint: flags affected
 * requirements, creates the review task and (where relevant) the risk,
 * and records their ids ON the impact so the linkage survives
 * persistence — after a refresh, the addendum still points at its
 * review task, its risk, its affected requirements and modules.
 */
export function applyAddendumImpact(bp: TenderBlueprint, impact: AddendumImpact): TenderBlueprint {
  const flag = `Flagged by ${impact.documentName}`;
  const requirements = bp.requirements.map((r) =>
    impact.affectedRequirementIds.includes(r.id) ? { ...r, addendumFlag: flag, status: r.status === 'Complete' ? 'In review' as const : r.status } : r,
  );
  const reviewTask: ReviewTask = {
    id: uid('rev'), title: `Addendum review — ${impact.documentName}`, moduleKey: null,
    discipline: 'Bid Manager', reviewerId: bp.meta.bidManagerId, dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString().split('T')[0],
    status: 'Not started', comments: impact.summary, requiredChanges: '',
  };
  const reviews: ReviewTask[] = [reviewTask, ...bp.reviews];
  const risk: RiskItem | null = impact.riskImpact
    ? {
        id: uid('risk'), title: `Unassessed addendum impact: ${impact.documentName}`,
        detail: impact.summary, rating: 'Medium', source: 'Addendum', requirementId: null,
        mitigation: 'Complete the addendum review task and update affected drafts and pricing.',
        ownerId: bp.meta.bidManagerId, status: 'Open',
      }
    : null;
  const risks: RiskItem[] = risk ? [risk, ...bp.risks] : bp.risks;
  const linked: AddendumImpact = { ...impact, reviewTaskId: reviewTask.id, riskId: risk?.id };
  return { ...bp, requirements, reviews, risks, addenda: [linked, ...bp.addenda], addendaCount: bp.addendaCount + 1 };
}
