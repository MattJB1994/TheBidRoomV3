/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Upload validation — the single source of truth for what files the app
 * accepts and how their names become safe storage paths. Used by both
 * the UI (FileDropzone, before a file is ever read) and the data layer
 * (db.addTenderDocument / KB uploads, before anything is written to
 * Storage), so a rejected file is never extracted and never uploaded.
 */

/** Extensions we can actually text-extract and analyse (see docText.ts). */
export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.md'] as const;

/** Max size for an uploaded tender document / evidence file. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

const extOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
};

export function isSupportedFileName(name: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extOf(name));
}

/**
 * Turns a display filename into a safe storage slug:
 *   "Tender Addendum #1 (Final).PDF" → "tender-addendum-1-final.pdf"
 *
 * Guarantees: lowercase; no slashes, backslashes, whitespace, quotes or
 * other unsafe characters; no path-traversal (".." collapses to a dash);
 * a preserved lowercase extension; never empty (falls back to "file").
 * The original name is kept separately as display metadata by callers.
 */
export function sanitizeFileName(name: string): string {
  const ext = extOf(name);
  const base = ext ? name.slice(0, name.length - ext.length) : name;

  const slug = base
    .normalize('NFKD')                     // strip accents/diacritics
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')           // any run of unsafe chars → single dash
    .replace(/^-+|-+$/g, '')               // trim leading/trailing dashes
    .slice(0, 120);                        // keep paths sane

  const safeBase = slug || 'file';
  // Only preserve an extension that's on the allowlist; otherwise drop it
  // so a disguised name can't smuggle an unexpected type into the path.
  const safeExt = (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext) ? ext : '';
  return `${safeBase}${safeExt}`;
}

export interface UploadValidationResult {
  ok: boolean;
  /** User-facing reason when ok is false. Safe to show directly. */
  reason?: string;
}

/** Validates a single file's type and size. UI and db layer both call this. */
export function validateUpload(file: File, opts: { maxBytes?: number } = {}): UploadValidationResult {
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES;
  if (!isSupportedFileName(file.name)) {
    return { ok: false, reason: `${file.name}: unsupported file type. Use PDF, DOCX, XLSX, CSV, TXT or MD.` };
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, reason: `${file.name}: too large (max ${mb} MB).` };
  }
  return { ok: true };
}

/** Splits a batch into accepted files and human-readable rejection reasons. */
export function partitionUploads(files: File[], opts: { maxBytes?: number } = {}): { accepted: File[]; rejected: string[] } {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    const r = validateUpload(f, opts);
    if (r.ok) accepted.push(f);
    else rejected.push(r.reason!);
  }
  return { accepted, rejected };
}
