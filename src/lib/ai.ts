/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client-side AI helpers. These call the server-side /api/ai endpoint
 * (which holds the provider key) — the browser never sees the key. In demo
 * mode (no backend) they resolve to representative sample output so the
 * UI is fully reviewable without infrastructure.
 */
import { isDemoMode, authHeaders } from './supabase';
import { buildTenderContext, extractFileText } from './docText';
import type { ExtractedTenderMetadata } from '../types';

/** Representative extraction used as the demo-mode fallback. Fictional. */
export const sampleExtraction: ExtractedTenderMetadata = {
  client: 'Tarnwick Metropolitan Transit Authority (TMTA)',
  tenderName: 'Eastern Loop Level Crossing Assurance Package',
  tenderNumber: 'TMTA-2026-ELX-021',
  closingDate: '2026-08-19',
  submissionPortal: 'Tarnwick Procure Portal (https://procure.tarnwick.example)',
  mandatoryRequirements: [
    'Evidence of delivering at least three level-crossing assurance packages on the TMTA network in the past 5 years.',
    'Nominated Systems Assurance Lead with Chartered Systems Engineer (CSE) registration.',
    'Risk management alignment with the TMTA Systems Safety Framework (SSF-7).',
    'Audited financial statements for the past 3 fiscal years.',
  ],
  evaluationCriteria: [
    'Technical Capability & Sourced Project Evidence: 45%',
    'Key Personnel Credentials & Validation: 30%',
    'Commercial Price & Performance Security Bond: 25%',
  ],
  requiredSchedules: [
    'Schedule A: Technical Methodology',
    'Schedule B: Key Resource Qualifications & CSE proof',
    'Schedule C: Past Project Case Histories',
    'Schedule F: Commercial Pricing & Conflict-of-Interest Declarations',
  ],
  pageLimits: '40 pages total across technical submissions',
  wordLimits: 'No strict limit, structured paragraphs preferred',
  attachmentsCount: 4,
  pricingFormsCount: 2,
  requiredCVsCount: 3,
  requiredProjectExamplesCount: 3,
  mandatoryInsurances: [
    'Professional Indemnity insurance of $20,000,000 per occurrence.',
    'Public Liability insurance of $50,000,000.',
  ],
  requiredPolicies: [
    'Workplace Health and Safety (WHS) Policy (TMTA SMS-12 aligned)',
    'Modern Slavery Statement',
    'Supplier Code of Conduct Declaration',
  ],
  addendaCount: 1,
};

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Extract structured metadata from an uploaded RFT/RFQ. In demo mode,
 * returns the sample after a short simulated delay so the dropzone UX is
 * unchanged. With a real backend, POSTs the document to /api/ai.
 */
export async function extractTenderFromDocuments(files: File[]): Promise<ExtractedTenderMetadata> {
  if (isDemoMode()) {
    await new Promise((r) => setTimeout(r, 1500));
    return {
      ...sampleExtraction,
      sourceDocuments: files.length ? files.map((f) => f.name) : ['Sample_RFT.pdf'],
      extractionNotes: ['Demo mode — this is the built-in sample analysis, not a live extraction of your files.'],
    };
  }

  // Extraction pipeline first: every uploaded document is text-extracted
  // in the browser (PDF text layer, DOCX, XLSX, CSV/TXT — see docText.ts)
  // and the AI receives structured, named text chunks. It never receives
  // raw PDF bytes.
  const { documents, notes } = await buildTenderContext(files);
  if (documents.length === 0) {
    throw new Error(
      notes[0] ??
      'None of the uploaded files could be text-extracted. If these are scanned PDFs, OCR is not yet supported — upload a text-based copy.',
    );
  }

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ task: 'extract', documents }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Extraction failed (${res.status})`);
  }
  const { result } = await res.json();
  if (!result) throw new Error('Extraction returned no result');
  const extracted = result as ExtractedTenderMetadata;
  extracted.sourceDocuments = documents.map((d) => d.name);
  extracted.extractionNotes = [...notes, ...(extracted.extractionNotes ?? [])];
  return extracted;
}

/** Back-compat single-file entry point. Prefer extractTenderFromDocuments. */
export async function extractTender(file: File): Promise<ExtractedTenderMetadata> {
  return extractTenderFromDocuments([file]);
}

/**
 * Draft proposal prose for a requirement, optionally grounded in
 * verified evidence text. Demo mode returns a templated placeholder.
 */
export async function draftSection(
  requirement: string,
  opts: { evidence?: string; sectionTitle?: string } = {},
): Promise<string> {
  if (isDemoMode()) {
    await new Promise((r) => setTimeout(r, 1200));
    return `### ${opts.sectionTitle || 'Response'}\n\nDraft response addressing: ${requirement}\n\n*(Demo mode — configure an AI provider (AI_API_KEY) for live drafting.)*`;
  }
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ task: 'draft', requirement, ...opts }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Drafting failed (${res.status})`);
  }
  const { result } = await res.json();
  return (result as string) || '';
}

/**
 * Live addendum impact analysis: the addendum's extracted text plus the
 * current requirement register go to the AI, which reports what changed
 * and which requirements/modules are affected. Throws when unavailable —
 * callers fall back to the clearly-labelled provisional heuristic.
 */
export interface AddendumAnalysisResult {
  summary: string;
  changes: string[];
  affectedRequirementIds: string[];
  affectedModuleKeys: string[];
  pricingImpact: boolean;
  riskImpact: boolean;
}

export async function analyzeAddendumViaAi(
  addendumName: string,
  addendumText: string,
  requirements: { id: string; text: string }[],
  moduleKeys: string[],
): Promise<AddendumAnalysisResult> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ task: 'addendum', addendumName, addendumText: addendumText.slice(0, 24000), requirements, moduleKeys }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Addendum analysis failed (${res.status})`);
  }
  const { result } = await res.json();
  if (!result?.summary) throw new Error('Addendum analysis returned no result');
  return result as AddendumAnalysisResult;
}

/** What the Settings → AI model panel shows. Never contains secrets. */
export interface AiStatus {
  demo: boolean;
  configured: boolean;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  keyConfigured: boolean;
  baseUrlConfigured: boolean;
  modelConfigured: boolean;
}

/**
 * Reports whether the server-side AI provider is configured (key, base
 * URL, model) without ever exposing the key itself. In demo mode this
 * resolves locally — there is no backend to ask.
 */
export async function getAiStatus(): Promise<AiStatus> {
  if (isDemoMode()) {
    return {
      demo: true, configured: true, provider: 'Demo model',
      baseUrl: null, model: 'demo-local', keyConfigured: false,
      baseUrlConfigured: false, modelConfigured: false,
    };
  }
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ task: 'status' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Could not reach the AI endpoint (${res.status})`);
  }
  const { result } = await res.json();
  return { demo: false, provider: 'OpenAI-compatible endpoint', ...result } as AiStatus;
}

/**
 * Transcribes a document's visible text for KB full-text search
 * indexing (populates kb_files.content_text — see schema.sql). Demo
 * mode returns null (nothing to index against). Best-effort by design:
 * callers should treat a failure here as non-fatal — the file is still
 * uploaded and searchable by name, it just won't have content-level
 * search until this succeeds.
 */
export async function extractDocumentText(file: File): Promise<string | null> {
  // Local pipeline first — real parser-based extraction (PDF text layer,
  // DOCX, XLSX, CSV/TXT), free and private. Works in demo mode too.
  try {
    const doc = await extractFileText(file);
    if (doc.text) return doc.text.slice(0, 20000);
    if (doc.scanned) return null; // scanned PDF: OCR not implemented — don't fake it
  } catch { /* fall through to the vision path below */ }

  // Vision-model fallback is only meaningful for actual images.
  if (isDemoMode() || !file.type.startsWith('image/')) return null;
  try {
    const data = await readAsBase64(file);
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ task: 'extract_text', data, mimeType: file.type }),
    });
    if (!res.ok) return null;
    const { result } = await res.json();
    return (result as string) || null;
  } catch {
    return null;
  }
}
