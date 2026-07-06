/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Data-access layer. This is the bridge between the Supabase Postgres
 * schema (snake_case columns, UUID foreign keys) and the camelCase
 * front-end types in src/types.ts. Every database read/write the app
 * makes should go through here, so the mapping and org-scoping rules
 * live in exactly one place.
 *
 * RLS does the security; these functions assume the caller is an
 * authenticated member of the org whose data they're touching.
 */
import { getSupabase, isDemoMode } from './supabase';
import { formatBytes } from './format';
import { validateUpload, sanitizeFileName } from './uploadValidation';
import type {
  Tender, KBFile, ComplianceItem, ProposalSection, Claim,
  LessonsLearnedItem, TeamMember, AuditLog, ExtractedTenderMetadata,
  TenderStatus, ComplianceStatus, InfoRequest, IntelNote, Clarification,
  RateCardItem, PricingLine, PersonnelProfile, ProjectHistoryEntry, Invite,
} from '../types';

// ── helpers ─────────────────────────────────────────────────────────
const dateOnly = (s: unknown): string => (s ? String(s).slice(0, 10) : '');

// ── mappers (DB row → app type) ─────────────────────────────────────
function mapTender(r: any): Tender {
  return {
    id: r.id,
    name: r.name,
    number: r.number ?? '',
    client: r.client ?? '',
    closingDate: dateOnly(r.closing_date),
    portal: r.portal ?? '',
    status: r.status as TenderStatus,
    estimatedValue: r.estimated_value ?? '',
    probabilityOfWin: r.probability_of_win ?? 0,
    ownerId: r.owner_id ?? '',
  };
}

function mapKbFile(r: any): KBFile {
  // Staleness is derived here (not stored as a generated column, which
  // Postgres won't allow since it depends on the current date). A file
  // is stale if it hasn't been verified in the last 180 days.
  const lastVerified = r.last_verified_at ? new Date(r.last_verified_at).getTime() : 0;
  const isStale = r.is_stale === true
    || (lastVerified > 0 && Date.now() - lastVerified > 180 * 24 * 60 * 60 * 1000);
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    size: formatBytes(r.size_bytes),
    uploadedAt: dateOnly(r.uploaded_at),
    uploadedBy: r.uploader?.full_name ?? 'Unknown',
    lastVerifiedAt: dateOnly(r.last_verified_at),
    isStale,
    // For content-based evidence matching. 4k chars is plenty for
    // keyword overlap scoring and keeps the workspace payload small.
    contentText: typeof r.content_text === 'string' ? r.content_text.slice(0, 4000) : undefined,
  };
}

function mapComplianceItem(r: any, kbNameById: Map<string, string>): ComplianceItem {
  return {
    id: r.id,
    requirement: r.requirement,
    tenderReference: r.tender_reference ?? '',
    isMandatory: r.is_mandatory ?? true,
    responseSection: r.response_section ?? '',
    sourceFiles: (r.source_files ?? []).map((id: string) => kbNameById.get(id) ?? id),
    ownerId: r.owner_id ?? '',
    status: r.status as ComplianceStatus,
    gap: r.gap ?? null,
    reviewerId: r.reviewer_id ?? '',
  };
}

function mapClaim(r: any, kbNameById: Map<string, string>): Claim {
  return {
    id: r.id,
    text: r.text,
    sourceFile: r.source_file_id ? (kbNameById.get(r.source_file_id) ?? '') : '',
    sourcePage: r.source_page ?? '',
    extractedEvidence: r.extracted_evidence ?? '',
    confidenceScore: r.confidence_score ?? 0,
    lastUpdatedDate: dateOnly(r.last_updated_date),
    isStale: Boolean(r.is_stale),
  };
}

function mapSection(r: any, claims: Claim[]): ProposalSection {
  return {
    id: r.id,
    title: r.title,
    status: r.status as ComplianceStatus,
    content: r.content ?? '',
    claims,
    reviewerId: r.reviewer_id ?? '',
    lastSavedAt: r.last_saved_at ? String(r.last_saved_at).replace('T', ' ').slice(0, 16) : '',
    approved: Boolean(r.approved),
  };
}

function mapLesson(r: any): LessonsLearnedItem {
  return {
    id: r.id,
    tenderId: r.tender_id ?? '',
    tenderName: r.tender_name,
    outcome: r.outcome,
    keyInsights: r.key_insights ?? [],
    date: dateOnly(r.date),
  };
}

function mapTeamMember(r: any): TeamMember {
  return {
    id: r.id,
    name: r.full_name ?? r.email,
    email: r.email,
    role: r.role,
    avatarUrl: r.avatar_url ?? undefined,
  };
}

function mapAudit(r: any, nameById: Map<string, string>): AuditLog {
  return {
    id: r.id,
    timestamp: r.timestamp,
    userId: r.user_id ?? '',
    userName: nameById.get(r.user_id) ?? 'System',
    action: r.action,
    details: r.details ?? '',
  };
}

function mapInfoRequest(r: any, kbNameById: Map<string, string>): InfoRequest {
  return {
    id: r.id,
    label: r.label,
    detail: r.detail ?? '',
    category: r.category,
    status: r.status,
    matchedFile: r.matched_file_id ? kbNameById.get(r.matched_file_id) : undefined,
    response: r.response ?? undefined,
    tailoringNote: r.tailoring_note ?? undefined,
    assignedTo: r.assigned_to ?? undefined,
  };
}

function mapIntelNote(r: any, nameById: Map<string, string>): IntelNote {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    tag: r.tag,
    author: nameById.get(r.author_id) ?? 'Unknown',
    date: dateOnly(r.created_at),
  };
}

function mapClarification(r: any, nameById: Map<string, string>): Clarification {
  return {
    id: r.id,
    question: r.question,
    rationale: r.rationale ?? undefined,
    source: r.source,
    status: r.status,
    answer: r.answer ?? undefined,
    raisedBy: nameById.get(r.raised_by) ?? 'The Bid Room',
    date: dateOnly(r.created_at),
  };
}

function mapRateCardItem(r: any): RateCardItem {
  return { id: r.id, role: r.role, unit: r.unit, rate: Number(r.rate), source: r.source };
}

function mapPricingLine(r: any): PricingLine {
  return { id: r.id, description: r.description, rateId: r.rate_id, quantity: Number(r.quantity), markupPct: Number(r.markup_pct) };
}

function mapPersonnelProfile(r: any, kbNameById: Map<string, string>, history: ProjectHistoryEntry[]): PersonnelProfile {
  return {
    id: r.id,
    headline: r.headline ?? '',
    yearsExperience: r.years_experience ?? 0,
    credentials: r.credentials ?? [],
    cvFile: r.cv_file_id ? kbNameById.get(r.cv_file_id) : undefined,
    projectHistory: history,
  };
}

// ── session / org ───────────────────────────────────────────────────
export interface Profile { id: string; orgId: string | null; role: string; fullName: string; email: string; }

export async function getMyProfile(): Promise<Profile | null> {
  if (isDemoMode()) return null;
  const sb = getSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', auth.user.id).single();
  if (error || !data) return null;
  return { id: data.id, orgId: data.org_id, role: data.role, fullName: data.full_name, email: data.email };
}

/** Bootstrap the caller's first organization. Wraps the SQL RPC. */
export async function createOrgAndJoin(orgName: string, orgDomain?: string): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('create_org_and_join', { org_name: orgName, org_domain: orgDomain ?? null });
  if (error) throw new Error(error.message);
  return data as string;
}

// ── full workspace load ─────────────────────────────────────────────
/** First-page size for kb_files — see loadWorkspace and loadKbFilesPage. */
export const KB_PAGE_SIZE = 100;

export interface Workspace {
  tenders: Tender[];
  kbFiles: KBFile[];
  hasMoreKbFiles: boolean;
  complianceItems: ComplianceItem[];
  proposalSections: ProposalSection[];
  lessonsLearned: LessonsLearnedItem[];
  team: TeamMember[];
  auditLog: AuditLog[];
  infoRequests: InfoRequest[];
  intel: IntelNote[];
  clarifications: Clarification[];
  rateCard: RateCardItem[];
  pricingLines: PricingLine[];
  personnel: PersonnelProfile[];
}

export async function loadWorkspace(): Promise<Workspace> {
  const sb = getSupabase();
  const [
    tendersRes, kbRes, profilesRes, lessonsRes, complianceRes, sectionsRes, claimsRes, auditRes,
    infoReqRes, intelRes, clarRes, rateCardRes, pricingLinesRes, personnelRes, historyRes,
  ] = await Promise.all([
      sb.from('tenders').select('*').order('created_at', { ascending: false }).limit(200),
      // kb_files is the one collection most likely to genuinely grow large
      // in real use (CVs, project evidence, policies accumulate over
      // years) — capped here to a first page, with real "load more"
      // pagination in the Knowledge Base UI via loadKbFilesPage() below
      // rather than silently truncating with no way to see the rest.
      sb.from('kb_files').select('*, uploader:profiles!kb_files_uploaded_by_fkey(full_name)').order('uploaded_at', { ascending: false }).range(0, KB_PAGE_SIZE - 1),
      sb.from('profiles').select('id, full_name, email, role, avatar_url').limit(500),
      sb.from('lessons_learned').select('*').order('date', { ascending: false }).limit(200),
      sb.from('compliance_items').select('*').order('created_at', { ascending: true }).limit(500),
      sb.from('proposal_sections').select('*').order('sort_order', { ascending: true }).limit(500),
      sb.from('claims').select('*').limit(1000),
      sb.from('audit_log').select('*').order('timestamp', { ascending: false }).limit(200),
      sb.from('info_requests').select('*').order('created_at', { ascending: true }).limit(500),
      sb.from('intel_notes').select('*').order('created_at', { ascending: false }).limit(300),
      sb.from('clarifications').select('*').order('created_at', { ascending: false }).limit(300),
      sb.from('rate_card_items').select('*').order('role', { ascending: true }).limit(200),
      sb.from('pricing_lines').select('*').order('created_at', { ascending: true }).limit(500),
      sb.from('personnel_profiles').select('*').limit(500),
      sb.from('project_history_entries').select('*').limit(1000),
  ]);

  const firstError = [
    tendersRes, kbRes, profilesRes, lessonsRes, complianceRes, sectionsRes, claimsRes, auditRes,
    infoReqRes, intelRes, clarRes, rateCardRes, pricingLinesRes, personnelRes, historyRes,
  ].find((r) => r.error);
  if (firstError?.error) throw new Error(firstError.error.message);

  const kbFiles = (kbRes.data ?? []).map(mapKbFile);
  const kbNameById = new Map<string, string>((kbRes.data ?? []).map((r: any) => [r.id, r.name]));
  const nameById = new Map<string, string>((profilesRes.data ?? []).map((r: any) => [r.id, r.full_name ?? r.email]));

  const claimsBySection = new Map<string, Claim[]>();
  for (const c of claimsRes.data ?? []) {
    const list = claimsBySection.get(c.section_id) ?? [];
    list.push(mapClaim(c, kbNameById));
    claimsBySection.set(c.section_id, list);
  }

  const historyByProfile = new Map<string, ProjectHistoryEntry[]>();
  for (const h of historyRes.data ?? []) {
    const list = historyByProfile.get(h.profile_id) ?? [];
    list.push({ project: h.project, role: h.role, period: h.period ?? '', summary: h.summary ?? '' });
    historyByProfile.set(h.profile_id, list);
  }

  return {
    tenders: (tendersRes.data ?? []).map(mapTender),
    kbFiles,
    hasMoreKbFiles: kbFiles.length >= KB_PAGE_SIZE,
    complianceItems: (complianceRes.data ?? []).map((r: any) => mapComplianceItem(r, kbNameById)),
    proposalSections: (sectionsRes.data ?? []).map((r: any) => mapSection(r, claimsBySection.get(r.id) ?? [])),
    lessonsLearned: (lessonsRes.data ?? []).map(mapLesson),
    team: (profilesRes.data ?? []).map(mapTeamMember),
    auditLog: (auditRes.data ?? []).map((r: any) => mapAudit(r, nameById)),
    infoRequests: (infoReqRes.data ?? []).map((r: any) => mapInfoRequest(r, kbNameById)),
    intel: (intelRes.data ?? []).map((r: any) => mapIntelNote(r, nameById)),
    clarifications: (clarRes.data ?? []).map((r: any) => mapClarification(r, nameById)),
    rateCard: (rateCardRes.data ?? []).map(mapRateCardItem),
    pricingLines: (pricingLinesRes.data ?? []).map(mapPricingLine),
    personnel: (personnelRes.data ?? []).map((r: any) => mapPersonnelProfile(r, kbNameById, historyByProfile.get(r.id) ?? [])),
  };
}

// ── mutations ───────────────────────────────────────────────────────

/** Insert a tender and bootstrap its compliance items + draft sections. */
export async function createTenderRun(
  orgId: string,
  ownerId: string,
  extracted: ExtractedTenderMetadata,
  overrides: { estimatedValue?: string } = {},
): Promise<Tender> {
  const sb = getSupabase();
  const { data: tender, error } = await sb.from('tenders').insert({
    org_id: orgId,
    name: extracted.tenderName,
    number: extracted.tenderNumber,
    client: extracted.client,
    closing_date: extracted.closingDate || null,
    portal: extracted.submissionPortal,
    status: 'DRAFTING',
    owner_id: ownerId,
    estimated_value: overrides.estimatedValue ?? null,
    extracted_metadata: extracted,
  }).select().single();
  if (error || !tender) throw new Error(error?.message ?? 'Failed to create tender');

  const reqs = extracted.mandatoryRequirements ?? [];
  if (reqs.length) {
    const compliance = reqs.map((req, idx) => ({
      tender_id: tender.id,
      requirement: req,
      tender_reference: `Section ${idx + 2}.1.1 - RFT Specs`,
      is_mandatory: true,
      response_section: `1.${idx + 1} Sourced Methodology Output`,
      owner_id: ownerId,
      status: 'NOT_STARTED',
    }));
    const sections = reqs.map((req, idx) => ({
      tender_id: tender.id,
      title: `1.${idx + 1} Sourced Methodology Output`,
      status: 'NOT_STARTED',
      content: `### 1.${idx + 1}.1 Response Plan\n\nDraft content for requirement: ${req}`,
      sort_order: idx,
    }));
    const [cErr, sErr] = await Promise.all([
      sb.from('compliance_items').insert(compliance),
      sb.from('proposal_sections').insert(sections),
    ]);
    if (cErr.error) throw new Error(cErr.error.message);
    if (sErr.error) throw new Error(sErr.error.message);
  }
  return mapTender(tender);
}

export async function updateComplianceStatus(id: string, status: ComplianceStatus): Promise<void> {
  const { error } = await getSupabase().from('compliance_items').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateSectionContent(id: string, content: string): Promise<void> {
  const { error } = await getSupabase()
    .from('proposal_sections')
    .update({ content, last_saved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function approveSection(id: string, sectionTitle: string, tenderId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from('proposal_sections')
    .update({ approved: true, status: 'APPROVED' }).eq('id', id);
  if (error) throw new Error(error.message);
  // Cascade: approve the matching compliance item(s) within the same tender.
  await sb.from('compliance_items')
    .update({ status: 'APPROVED' })
    .eq('tender_id', tenderId)
    .eq('response_section', sectionTitle);
}

/** Real "load more" pagination for the Knowledge Base — see hasMoreKbFiles on Workspace. */
export async function loadKbFilesPage(orgId: string, offset: number, pageSize: number = KB_PAGE_SIZE): Promise<{ files: KBFile[]; hasMore: boolean }> {
  const { data, error } = await getSupabase()
    .from('kb_files')
    .select('*, uploader:profiles!kb_files_uploaded_by_fkey(full_name)')
    .eq('org_id', orgId)
    .order('uploaded_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) throw new Error(error.message);
  const files = (data ?? []).map(mapKbFile);
  return { files, hasMore: files.length >= pageSize };
}

/** Upload a KB file to Storage and record it. Path: kb-files/{org}/{uuid}/{name}. */
export async function addKbFile(
  orgId: string, uploadedBy: string, file: File, category: KBFile['category'],
): Promise<KBFile> {
  const sb = getSupabase();

  // Same rules as tender documents: reject unsupported/oversized files
  // before anything is uploaded (the storage layer is the last line —
  // the UI validates too).
  const check = validateUpload(file);
  if (!check.ok) throw new Error(check.reason);

  const id = crypto.randomUUID();
  // Storage path uses the sanitised slug (no spaces, slashes, unsafe
  // chars or path traversal); the original name is preserved in the
  // `name` column for display.
  const safeName = sanitizeFileName(file.name);
  const path = `${orgId}/${id}/${safeName}`;
  const { error: upErr } = await sb.storage.from('kb-files').upload(path, file, { upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await sb.from('kb_files').insert({
    id, org_id: orgId, name: file.name, category,
    storage_path: path, size_bytes: file.size, uploaded_by: uploadedBy,
  }).select('*, uploader:profiles!kb_files_uploaded_by_fkey(full_name)').single();
  if (error || !data) {
    // Don't leave an orphaned Storage object behind a failed insert.
    await sb.storage.from('kb-files').remove([path]).catch(() => {});
    throw new Error(error?.message ?? 'Failed to record file');
  }
  return mapKbFile(data);
}

/** Populates content_text for search indexing (see extractDocumentText in lib/ai.ts). Best-effort. */
export async function setKbFileContentText(id: string, contentText: string): Promise<void> {
  const { error } = await getSupabase().from('kb_files').update({ content_text: contentText }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removeKbFile(id: string, storagePath?: string): Promise<void> {
  const sb = getSupabase();
  if (storagePath) await sb.storage.from('kb-files').remove([storagePath]);
  const { error } = await sb.from('kb_files').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function verifyKbFile(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('kb_files').update({ last_verified_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function logAudit(orgId: string, userId: string, action: string, details: string): Promise<void> {
  // Best-effort; never block a user action on audit write failure.
  try {
    await getSupabase().from('audit_log').insert({ org_id: orgId, user_id: userId, action, details });
  } catch { /* swallow */ }
}

/**
 * Convenience wrapper: resolves the caller's org/user from their own
 * session before logging, so call sites don't need to thread orgId/
 * userId through just to log an action. Every mutation in the app
 * should call this — the audit_log table and its append-only RLS were
 * built early, but almost nothing actually wrote to it until this pass.
 * Best-effort and fire-and-forget by design: an audit-log failure must
 * never block or roll back the action it's describing.
 */
export async function logAuditQuick(action: string, details: string): Promise<void> {
  try {
    const profile = await getMyProfile();
    if (profile?.orgId) await logAudit(profile.orgId, profile.id, action, details);
  } catch { /* swallow */ }
}

// ── Opportunity: info requests, intel, clarifications ────────────────

/** Persists the InfoRequest[] generated client-side (see requirementMatching.ts) for a tender. */
export async function saveInfoRequests(tenderId: string, requests: InfoRequest[]): Promise<void> {
  if (!requests.length) return;
  const kbByName = await resolveKbFileIds(requests.map((r) => r.matchedFile).filter(Boolean) as string[]);
  const rows = requests.map((r) => ({
    tender_id: tenderId, label: r.label, detail: r.detail, category: r.category, status: r.status,
    matched_file_id: r.matchedFile ? kbByName.get(r.matchedFile) : null,
    tailoring_note: r.tailoringNote ?? null, assigned_to: r.assignedTo ?? null,
  }));
  const { error } = await getSupabase().from('info_requests').insert(rows);
  if (error) throw new Error(error.message);
}

async function resolveKbFileIds(names: string[]): Promise<Map<string, string>> {
  if (!names.length) return new Map();
  const { data, error } = await getSupabase().from('kb_files').select('id, name').in('name', names);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r: any) => [r.name, r.id]));
}

export async function updateInfoRequest(id: string, patch: Partial<{ status: InfoRequest['status']; response: string }>): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.status) body.status = patch.status;
  if (patch.response !== undefined) body.response = patch.response;
  const { error } = await getSupabase().from('info_requests').update(body).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addIntelNote(tenderId: string, authorId: string, note: Omit<IntelNote, 'id' | 'author' | 'date'>): Promise<void> {
  const { error } = await getSupabase().from('intel_notes').insert({
    tender_id: tenderId, title: note.title, body: note.body, tag: note.tag, author_id: authorId,
  });
  if (error) throw new Error(error.message);
}

export async function addClarification(tenderId: string, raisedBy: string, c: Pick<Clarification, 'question' | 'rationale' | 'source'>): Promise<void> {
  const { error } = await getSupabase().from('clarifications').insert({
    tender_id: tenderId, question: c.question, rationale: c.rationale ?? null, source: c.source, raised_by: raisedBy,
  });
  if (error) throw new Error(error.message);
}

/** Bulk-saves system-generated recommended clarifications (no human author). */
export async function saveRecommendedClarifications(tenderId: string, items: Clarification[]): Promise<void> {
  if (!items.length) return;
  const rows = items.map((c) => ({
    tender_id: tenderId, question: c.question, rationale: c.rationale ?? null, source: 'RECOMMENDED', status: 'DRAFT',
  }));
  const { error } = await getSupabase().from('clarifications').insert(rows);
  if (error) throw new Error(error.message);
}

export async function updateClarification(id: string, patch: Partial<{ status: Clarification['status']; answer: string; source: Clarification['source'] }>): Promise<void> {
  const { error } = await getSupabase().from('clarifications').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Pricing ────────────────────────────────────────────────────────

export async function addRateCardItem(orgId: string, item: Omit<RateCardItem, 'id'>): Promise<RateCardItem> {
  const { data, error } = await getSupabase().from('rate_card_items').insert({
    org_id: orgId, role: item.role, unit: item.unit, rate: item.rate, source: item.source,
  }).select().single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to add rate');
  return mapRateCardItem(data);
}

export async function updateRateCardItem(id: string, rate: number): Promise<void> {
  const { error } = await getSupabase().from('rate_card_items').update({ rate }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removeRateCardItem(id: string): Promise<void> {
  const { error } = await getSupabase().from('rate_card_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function savePricingLines(tenderId: string, lines: PricingLine[]): Promise<void> {
  await getSupabase().from('pricing_lines').delete().eq('tender_id', tenderId);
  if (!lines.length) return;
  const rows = lines.map((l) => ({
    tender_id: tenderId, description: l.description, rate_id: l.rateId, quantity: l.quantity, markup_pct: l.markupPct,
  }));
  const { error } = await getSupabase().from('pricing_lines').insert(rows);
  if (error) throw new Error(error.message);
}

// ── Teammate invites ───────────────────────────────────────────────

function mapInvite(r: any): Invite {
  return {
    id: r.id, email: r.email, role: r.role, token: r.token, status: r.status,
    createdAt: String(r.created_at).slice(0, 10), expiresAt: String(r.expires_at).slice(0, 10),
  };
}

export async function listInvites(orgId: string): Promise<Invite[]> {
  const { data, error } = await getSupabase().from('invites').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapInvite);
}

export async function createInvite(orgId: string, invitedBy: string, email: string, role: TeamMember['role']): Promise<Invite> {
  const { data, error } = await getSupabase().from('invites').insert({
    org_id: orgId, email, role, invited_by: invitedBy,
  }).select().single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create invite');
  return mapInvite(data);
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await getSupabase().from('invites').update({ status: 'REVOKED' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Called by the invitee after signing up. Returns the org id they just joined. */
export async function acceptInvite(token: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('accept_invite', { invite_token: token });
  if (error) throw new Error(error.message);
  return data as string;
}

// ── Personnel profile editing ───────────────────────────────────────

export async function savePersonnelProfile(
  profileId: string,
  patch: { headline?: string; yearsExperience?: number; credentials?: string[]; cvFileId?: string | null },
): Promise<void> {
  const body: Record<string, unknown> = { id: profileId };
  if (patch.headline !== undefined) body.headline = patch.headline;
  if (patch.yearsExperience !== undefined) body.years_experience = patch.yearsExperience;
  if (patch.credentials !== undefined) body.credentials = patch.credentials;
  if (patch.cvFileId !== undefined) body.cv_file_id = patch.cvFileId;
  const { error } = await getSupabase().from('personnel_profiles').upsert(body);
  if (error) throw new Error(error.message);
}

export async function addProjectHistoryEntry(profileId: string, entry: ProjectHistoryEntry): Promise<string> {
  const sb = getSupabase();
  // project_history_entries.profile_id has a foreign key to
  // personnel_profiles(id) — so a profile row must exist first, or this
  // insert fails with a foreign-key violation. "Add project" is reachable
  // before "Save profile" ever runs (they're separate buttons in
  // Personnel.tsx), so this can't be left to callers to remember: ensure
  // the row exists here, unconditionally. Safe no-op if it already does
  // — only `id` is provided, so on conflict this touches nothing else.
  const { error: ensureErr } = await sb.from('personnel_profiles').upsert({ id: profileId });
  if (ensureErr) throw new Error(ensureErr.message);
  const { data, error } = await sb.from('project_history_entries').insert({
    profile_id: profileId, project: entry.project, role: entry.role, period: entry.period, summary: entry.summary,
  }).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to add project history');
  return data.id as string;
}

export async function removeProjectHistoryEntry(id: string): Promise<void> {
  const { error } = await getSupabase().from('project_history_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Full-text knowledge-base search ─────────────────────────────────
// Searches name + category + content_text (see schema.sql for the
// trigger-maintained search_vector column). content_text is only
// populated once a text-extraction step is wired at upload time — until
// then this still works, just scoped to filename/category.

export async function searchKbFiles(orgId: string, query: string): Promise<KBFile[]> {
  if (!query.trim()) return [];
  const { data, error } = await getSupabase()
    .from('kb_files')
    .select('*, uploader:profiles!kb_files_uploaded_by_fkey(full_name)')
    .eq('org_id', orgId)
    .textSearch('search_vector', query, { type: 'websearch' });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapKbFile);
}

// ── Platform admin console (vendor-only, read-only) ──────────────────
// See schema.sql's platform_admins table: an explicit allowlist the app
// can check but never write to. Granting admin only happens via a
// direct SQL insert in the Supabase dashboard.

export async function amIPlatformAdmin(): Promise<boolean> {
  try {
    const { data: auth } = await getSupabase().auth.getUser();
    if (!auth.user) return false;
    const { data, error } = await getSupabase().from('platform_admins').select('id').eq('id', auth.user.id).maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

export interface AdminOrgSummary {
  id: string;
  name: string;
  domain: string | null;
  createdAt: string;
  memberCount: number;
  tenderCount: number;
}

/** Cross-org overview for the platform admin console. Read-only by construction (see RLS). */
export async function loadAdminOverview(): Promise<AdminOrgSummary[]> {
  const sb = getSupabase();
  const [orgsRes, profilesRes, tendersRes] = await Promise.all([
    sb.from('organizations').select('id, name, domain, created_at').order('created_at', { ascending: false }).limit(500),
    sb.from('profiles').select('id, org_id'),
    sb.from('tenders').select('id, org_id'),
  ]);
  if (orgsRes.error) throw new Error(orgsRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (tendersRes.error) throw new Error(tendersRes.error.message);

  const memberCounts = new Map<string, number>();
  (profilesRes.data ?? []).forEach((p: any) => {
    if (p.org_id) memberCounts.set(p.org_id, (memberCounts.get(p.org_id) ?? 0) + 1);
  });
  const tenderCounts = new Map<string, number>();
  (tendersRes.data ?? []).forEach((t: any) => {
    if (t.org_id) tenderCounts.set(t.org_id, (tenderCounts.get(t.org_id) ?? 0) + 1);
  });

  return (orgsRes.data ?? []).map((o: any) => ({
    id: o.id,
    name: o.name,
    domain: o.domain,
    createdAt: String(o.created_at).slice(0, 10),
    memberCount: memberCounts.get(o.id) ?? 0,
    tenderCount: tenderCounts.get(o.id) ?? 0,
  }));
}

/* ============================================================
   TENDER BLUEPRINT persistence (see supabase/migrations/
   2026-07-04_tender_blueprint.sql). One core row per tender plus one
   row per entity in the child tables; each child row stores the full
   typed entity as jsonb `data` (the TypeScript types are the source of
   truth) with a few columns pulled out for querying. Saves replace the
   tender's rows wholesale — blueprints are edited by a small bid team,
   whole-document replace keeps client and server trivially consistent,
   and Supabase realtime still notifies other sessions to reload.
   ============================================================ */

const BLUEPRINT_CHILD_TABLES = [
  'blueprint_requirements', 'blueprint_modules', 'blueprint_evidence',
  'blueprint_reviews', 'blueprint_risks', 'blueprint_addenda', 'blueprint_exports',
  'blueprint_commercial', 'blueprint_claims', 'blueprint_versions',
] as const;

/**
 * Optimistic-concurrency baselines: the blueprints.updated_at we last
 * saw per tender (set on load and after our own saves). If the server
 * row has moved past this, someone else saved since we loaded — we
 * refuse the write instead of silently overwriting their work.
 */
const blueprintBaselines = new Map<string, string>();

export class BlueprintConflictError extends Error {
  constructor() {
    super('This blueprint was updated by someone else since you loaded it.');
    this.name = 'BlueprintConflictError';
  }
}

/** Persists the full blueprint for a tender (upsert core row, replace children). */
export async function saveBlueprint(orgId: string, bp: import('../blueprint/types').TenderBlueprint): Promise<void> {
  const sb = getSupabase();

  // Conflict check: compare the server's updated_at with our baseline.
  const { data: existing } = await sb.from('blueprints').select('updated_at').eq('tender_id', bp.tenderId).maybeSingle();
  const baseline = blueprintBaselines.get(bp.tenderId);
  if (existing?.updated_at && baseline && existing.updated_at !== baseline) {
    throw new BlueprintConflictError();
  }

  const savedAt = new Date().toISOString();
  const { error: coreErr } = await sb.from('blueprints').upsert({
    tender_id: bp.tenderId,
    org_id: orgId,
    generated_at: bp.generatedAt,
    summary: bp.summary,
    submission_type: bp.submissionType,
    page_limits: bp.pageLimits,
    word_limits: bp.wordLimits,
    addenda_count: bp.addendaCount,
    returnables: bp.returnables,
    evaluation_criteria: bp.evaluationCriteria,
    required_templates: bp.requiredTemplates,
    required_accreditations: bp.requiredAccreditations,
    required_insurances: bp.requiredInsurances,
    win_themes: bp.inputs.winThemes,
    inputs: bp.inputs,
    meta: bp.meta,
    proposal_notes: bp.proposalNotes ?? {},
    closeout: bp.closeout ?? null,
    updated_at: savedAt,
  });
  if (coreErr) throw new Error(`Could not save the blueprint: ${coreErr.message}`);
  blueprintBaselines.set(bp.tenderId, savedAt);

  const rows = {
    blueprint_requirements: bp.requirements.map((r) => ({ id: r.id, tender_id: bp.tenderId, org_id: orgId, data: r })),
    blueprint_modules: bp.modules.map((m) => ({ id: m.key, tender_id: bp.tenderId, org_id: orgId, active: m.active, draft: m.draft, draft_status: m.draftStatus, data: m })),
    blueprint_evidence: bp.evidence.map((e) => ({ id: e.id, tender_id: bp.tenderId, org_id: orgId, status: e.status, data: e })),
    blueprint_reviews: bp.reviews.map((t) => ({ id: t.id, tender_id: bp.tenderId, org_id: orgId, status: t.status, data: t })),
    blueprint_risks: bp.risks.map((r) => ({ id: r.id, tender_id: bp.tenderId, org_id: orgId, rating: r.rating, status: r.status, data: r })),
    blueprint_addenda: bp.addenda.map((a) => ({ id: a.id, tender_id: bp.tenderId, org_id: orgId, reviewed: a.reviewed, data: a })),
    blueprint_exports: bp.exports.map((e) => ({ id: e.key, tender_id: bp.tenderId, org_id: orgId, level: e.level, last_exported_at: e.lastExportedAt, data: e })),
    blueprint_commercial: (bp.commercial ?? []).map((c) => ({ id: c.id, tender_id: bp.tenderId, org_id: orgId, status: c.status, data: c })),
    blueprint_claims: (bp.claimRegister ?? []).map((c) => ({ id: c.id, tender_id: bp.tenderId, org_id: orgId, data: c })),
    blueprint_versions: (bp.proposalVersions ?? []).map((v) => ({ id: v.id, tender_id: bp.tenderId, org_id: orgId, data: v })),
  } as const;

  for (const table of BLUEPRINT_CHILD_TABLES) {
    const { error: delErr } = await sb.from(table).delete().eq('tender_id', bp.tenderId);
    if (delErr) throw new Error(`Could not save the blueprint (${table}): ${delErr.message}`);
    const payload = rows[table];
    if (payload.length) {
      const { error: insErr } = await sb.from(table).insert(payload as any[]);
      if (insErr) throw new Error(`Could not save the blueprint (${table}): ${insErr.message}`);
    }
  }
}

/** Loads every blueprint in the org, assembled back into TenderBlueprint aggregates. */
export async function loadBlueprints(orgId: string): Promise<Record<string, import('../blueprint/types').TenderBlueprint>> {
  const sb = getSupabase();
  const [core, ...children] = await Promise.all([
    sb.from('blueprints').select('*').eq('org_id', orgId),
    ...BLUEPRINT_CHILD_TABLES.map((t) => sb.from(t).select('tender_id, data').eq('org_id', orgId)),
  ]);
  if (core.error) throw new Error(`Could not load blueprints: ${core.error.message}`);

  const group = (idx: number) => {
    const map = new Map<string, any[]>();
    (children[idx].data ?? []).forEach((r: any) => {
      const list = map.get(r.tender_id) ?? [];
      list.push(r.data);
      map.set(r.tender_id, list);
    });
    return map;
  };
  const [reqs, mods, evid, revs, risks, adds, exps, coms, claims, versions] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(group);

  const out: Record<string, import('../blueprint/types').TenderBlueprint> = {};
  (core.data ?? []).forEach((row: any) => {
    if (row.updated_at) blueprintBaselines.set(row.tender_id, row.updated_at);
    out[row.tender_id] = {
      tenderId: row.tender_id,
      generatedAt: row.generated_at,
      summary: row.summary,
      submissionType: row.submission_type,
      pageLimits: row.page_limits,
      wordLimits: row.word_limits,
      addendaCount: row.addenda_count,
      returnables: row.returnables ?? [],
      evaluationCriteria: row.evaluation_criteria ?? [],
      requiredTemplates: row.required_templates ?? [],
      requiredAccreditations: row.required_accreditations ?? [],
      requiredInsurances: row.required_insurances ?? [],
      requirements: reqs.get(row.tender_id) ?? [],
      modules: mods.get(row.tender_id) ?? [],
      evidence: evid.get(row.tender_id) ?? [],
      reviews: revs.get(row.tender_id) ?? [],
      risks: risks.get(row.tender_id) ?? [],
      addenda: adds.get(row.tender_id) ?? [],
      exports: exps.get(row.tender_id) ?? [],
      commercial: coms.get(row.tender_id) ?? [],
      proposalNotes: row.proposal_notes ?? {},
      closeout: row.closeout ?? undefined,
      claimRegister: claims.get(row.tender_id) ?? [],
      proposalVersions: versions.get(row.tender_id) ?? [],
      inputs: row.inputs ?? {},
      meta: row.meta ?? {},
    };
  });
  return out;
}

/* ============================================================
   TENDER DOCUMENTS (see supabase/migrations/2026-07-04_tender_documents.sql)
   Storage: `tender-documents` bucket, path {org_id}/{tender_id}/{doc_id}/{filename}.
   org_id is derived HERE from the authenticated profile — callers never
   supply it, so a compromised client can't write into another org's
   prefix (the bucket policy would reject it anyway; defence in depth).
   Extraction results ride along so analysis, addendum review and
   evidence work can use stored text after refresh / on teammates'
   sessions without re-downloading and re-parsing the file.
   ============================================================ */

export interface TenderDocumentExtraction {
  text: string | null;
  status: 'pending' | 'extracted' | 'scanned' | 'unsupported' | 'failed';
  note?: string;
}

export interface TenderDocumentRecord {
  id: string;
  tenderId: string;
  name: string;
  size: string;
  mimeType: string;
  tag: string;
  status: 'Uploaded' | 'Analysed';
  storagePath: string;
  uploadedAt: string;
  extractionStatus: TenderDocumentExtraction['status'];
  extractionNote?: string;
  /** Truncated stored text — analysis input, not a document store. */
  extractedText?: string;
}

const EXTRACTED_TEXT_CAP = 24000;

function mapTenderDocument(r: any): TenderDocumentRecord {
  return {
    id: r.id,
    tenderId: r.tender_id,
    name: r.name,
    size: formatBytes(r.size_bytes),
    mimeType: r.mime_type ?? '',
    tag: r.document_tag ?? 'Other',
    status: r.status ?? 'Uploaded',
    storagePath: r.storage_path,
    uploadedAt: r.uploaded_at ? String(r.uploaded_at).split('T')[0] : '',
    extractionStatus: r.extraction_status ?? 'pending',
    extractionNote: r.extraction_note ?? undefined,
    extractedText: typeof r.extracted_text === 'string' ? r.extracted_text : undefined,
  };
}

/** Uploads one tender document to Storage and records it. */
export async function addTenderDocument(
  tenderId: string,
  file: File,
  tag: string,
  extraction: TenderDocumentExtraction,
  status: 'Uploaded' | 'Analysed' = 'Uploaded',
): Promise<TenderDocumentRecord> {
  const sb = getSupabase();
  const profile = await getMyProfile();
  if (!profile?.orgId) throw new Error('No organisation on your profile — complete onboarding first.');

  // Defence in depth: the UI validates too, but the storage layer is the
  // last line — never upload an unsupported or oversized file.
  const check = validateUpload(file);
  if (!check.ok) throw new Error(check.reason);

  const id = crypto.randomUUID();
  // The stored filename is a sanitised slug (no spaces, slashes, unsafe
  // chars or path traversal); the original name is preserved in the
  // `name` column for display. Path derives org_id from the
  // AUTHENTICATED profile, never from a caller argument.
  const safeName = sanitizeFileName(file.name);
  const path = `${profile.orgId}/${tenderId}/${id}/${safeName}`;
  const { error: upErr } = await sb.storage.from('tender-documents').upload(path, file, { upsert: false });
  if (upErr) throw new Error(`Could not upload ${file.name}: ${upErr.message}`);

  const { data, error } = await sb.from('tender_documents').insert({
    id,
    org_id: profile.orgId,
    tender_id: tenderId,
    name: file.name,
    storage_path: path,
    size_bytes: file.size,
    mime_type: file.type || null,
    document_tag: tag,
    status,
    extracted_text: extraction.text ? extraction.text.slice(0, EXTRACTED_TEXT_CAP) : null,
    extraction_status: extraction.status,
    extraction_note: extraction.note ?? null,
    uploaded_by: profile.id,
  }).select().single();
  if (error || !data) {
    // Don't leave an orphaned Storage object behind a failed insert.
    await sb.storage.from('tender-documents').remove([path]).catch(() => {});
    throw new Error(`Could not record ${file.name}: ${error?.message ?? 'unknown error'}`);
  }
  return mapTenderDocument(data);
}

/** Loads every tender document in the org, grouped by tender. */
export async function loadTenderDocuments(orgId: string): Promise<Record<string, TenderDocumentRecord[]>> {
  const { data, error } = await getSupabase()
    .from('tender_documents')
    .select('*')
    .eq('org_id', orgId)
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(`Could not load tender documents: ${error.message}`);
  const out: Record<string, TenderDocumentRecord[]> = {};
  (data ?? []).forEach((r: any) => {
    const doc = mapTenderDocument(r);
    (out[doc.tenderId] ??= []).push(doc);
  });
  return out;
}

export async function updateTenderDocumentTag(id: string, tag: string): Promise<void> {
  const { error } = await getSupabase()
    .from('tender_documents')
    .update({ document_tag: tag, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Could not update the document tag: ${error.message}`);
}
