/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FileDropzone — the one shared drag-and-drop file input for the whole
 * app (tender intake, knowledge base uploads, missing-evidence cards,
 * addenda). Two visual modes:
 *
 *   size="large"   — big hero dropzone for the Add tender wizard
 *   size="compact" — small strip that fits inside a card
 *
 * Supports multiple files, click-to-browse, keyboard activation
 * (Enter/Space), drag-over highlight, extension validation with a clear
 * inline error, and an optional selected-file list with remove buttons.
 *
 * It also installs a window-level guard (once, ref-counted) that stops
 * the browser from navigating away when files are dropped OUTSIDE a
 * dropzone — the classic "I missed the target and now I'm looking at
 * the PDF instead of the app" failure.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, FileText, X, AlertCircle } from 'lucide-react';
import { formatBytes } from '../lib/format';
import { SUPPORTED_EXTENSIONS, MAX_UPLOAD_BYTES, validateUpload } from '../lib/uploadValidation';

export const DEFAULT_ACCEPT = [...SUPPORTED_EXTENSIONS];

interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  /** Accepted extensions, lowercase with leading dot. */
  accept?: string[];
  multiple?: boolean;
  size?: 'large' | 'compact';
  /** Main line of the empty state. */
  label?: string;
  /** Secondary line of the empty state. */
  hint?: string;
  disabled?: boolean;
  /** Max bytes per file (defaults to the shared MAX_UPLOAD_BYTES). */
  maxBytes?: number;
  /** When provided, the zone renders the selected-file list itself. */
  files?: File[];
  onRemoveFile?: (index: number) => void;
  className?: string;
  id?: string;
}

// Ref-counted so mounting several dropzones only installs one pair of
// listeners, and unmounting the last one removes them.
let dropGuardCount = 0;
const preventWindowDrop = (e: DragEvent) => { e.preventDefault(); };

export default function FileDropzone({
  onFiles,
  accept = DEFAULT_ACCEPT,
  multiple = true,
  size = 'large',
  label,
  hint,
  disabled = false,
  maxBytes,
  files,
  onRemoveFile,
  className = '',
  id,
}: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire enter/leave for every child node; counting keeps the
  // highlight stable while the cursor moves across inner elements.
  const dragDepth = useRef(0);

  useEffect(() => {
    dropGuardCount++;
    if (dropGuardCount === 1) {
      window.addEventListener('dragover', preventWindowDrop);
      window.addEventListener('drop', preventWindowDrop);
    }
    return () => {
      dropGuardCount--;
      if (dropGuardCount === 0) {
        window.removeEventListener('dragover', preventWindowDrop);
        window.removeEventListener('drop', preventWindowDrop);
      }
    };
  }, []);

  const validate = useCallback((incoming: File[]): { ok: File[]; rejected: string[] } => {
    const ok: File[] = [];
    const rejected: string[] = [];
    incoming.forEach((f) => {
      // Type AND size, from the shared rules the storage layer also uses,
      // so what the UI accepts is exactly what can be uploaded.
      const result = validateUpload(f, { maxBytes: maxBytes ?? MAX_UPLOAD_BYTES });
      if (result.ok && accept.includes('.' + (f.name.split('.').pop() || '').toLowerCase())) ok.push(f);
      else rejected.push(result.reason ?? `${f.name}: not supported here.`);
    });
    return { ok, rejected };
  }, [accept, maxBytes]);

  const handleIncoming = useCallback((list: FileList | File[]) => {
    if (disabled) return;
    const incoming = Array.from(list);
    const { ok, rejected } = validate(multiple ? incoming : incoming.slice(0, 1));
    if (rejected.length) {
      setError(rejected.slice(0, 3).join(' ') + (rejected.length > 3 ? ' …' : ''));
    } else {
      setError(null);
    }
    if (ok.length) onFiles(multiple ? ok : ok.slice(0, 1));
  }, [disabled, validate, multiple, onFiles]);

  const openPicker = () => { if (!disabled) inputRef.current?.click(); };

  const zoneBase = 'border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1';
  const zoneState = disabled
    ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
    : dragOver
      ? 'border-indigo-500 bg-indigo-50/50'
      : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/60';

  return (
    <div className={className}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        multiple={multiple}
        accept={accept.join(',')}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.length) handleIncoming(e.target.files);
          e.target.value = ''; // allow re-selecting the same file later
        }}
      />

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label || 'Drop files here or press Enter to browse'}
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
        }}
        onDragEnter={(e) => { e.preventDefault(); dragDepth.current++; if (!disabled) setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragOver(false);
          if (e.dataTransfer.files?.length) handleIncoming(e.dataTransfer.files);
        }}
        className={`${zoneBase} ${zoneState} ${size === 'large' ? 'p-8 sm:p-10' : 'p-3'}`}
      >
        {size === 'large' ? (
          <div className="flex flex-col items-center gap-2">
            <UploadCloud className={`w-10 h-10 ${dragOver ? 'text-indigo-600' : 'text-slate-400'}`} />
            <div className="text-sm font-semibold text-slate-900">
              {label || 'Drag and drop files here'}
            </div>
            <div className="text-xs text-slate-500 max-w-sm leading-relaxed">
              {hint || `or click to browse. Supports ${accept.map((a) => a.replace('.', '').toUpperCase()).join(', ')}.`}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
            <UploadCloud className={`w-4 h-4 shrink-0 ${dragOver ? 'text-indigo-600' : 'text-slate-400'}`} />
            <span className="font-medium">{label || 'Drop evidence here'}</span>
            <span className="text-slate-400">·</span>
            <span className="underline decoration-slate-300 underline-offset-2">{hint || 'browse files'}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      {files && files.length > 0 && (
        <ul className={`mt-2 space-y-1 ${size === 'compact' ? 'max-h-28' : 'max-h-48'} overflow-y-auto`}>
          {files.map((f, idx) => (
            <li key={`${f.name}-${f.size}-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded px-2 py-1.5">
              <span className="flex items-center gap-1.5 min-w-0">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate text-slate-700 font-medium">{f.name}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-slate-400">{formatBytes(f.size)}</span>
                {onRemoveFile && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveFile(idx); }}
                    aria-label={`Remove ${f.name}`}
                    className="text-slate-300 hover:text-red-500 p-0.5 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
