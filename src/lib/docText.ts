/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Document text extraction — the pipeline that runs BEFORE any AI call.
 * The AI endpoint receives structured text chunks with document names
 * and page/sheet references; it never receives raw PDF bytes (and never
 * pretends a PDF is an image).
 *
 * Supported here, all extracted in the browser:
 *   PDF  — pdfjs-dist text layer, per-page markers. Scanned PDFs (no
 *          text layer) are detected and reported honestly: `scanned:
 *          true`, no text. OCR is a future hook, not faked.
 *   DOCX — mammoth raw text.
 *   XLSX / XLS — SheetJS, per-sheet CSV with sheet markers.
 *   CSV / TXT / MD — read directly.
 *
 * The parsers are heavy, so each is lazy-imported: they land in their
 * own build chunks and cost nothing until a file of that type appears.
 */

export interface ExtractedDoc {
  name: string;
  /** Extracted text with [Page N] / [Sheet: name] markers, or null. */
  text: string | null;
  kind: 'pdf' | 'docx' | 'sheet' | 'text' | 'unsupported';
  pages?: number;
  /** True when a PDF has no usable text layer (scan/image-only). */
  scanned?: boolean;
  /** Honest human-readable note about how extraction went. */
  note?: string;
}

const ext = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

export async function extractFileText(file: File): Promise<ExtractedDoc> {
  const e = ext(file.name);
  try {
    if (e === 'txt' || e === 'csv' || e === 'md') {
      const text = await file.text();
      return { name: file.name, text: text.trim() || null, kind: 'text' };
    }

    if (e === 'docx') {
      const mammoth = await import('mammoth');
      const buf = await file.arrayBuffer();
      // Browser build takes {arrayBuffer}; the Node build (tests/SSR)
      // wants {buffer}. Try the browser signature first.
      let value = '';
      try {
        ({ value } = await mammoth.extractRawText({ arrayBuffer: buf } as any));
      } catch {
        if (typeof Buffer !== 'undefined') {
          ({ value } = await (mammoth as any).extractRawText({ buffer: Buffer.from(buf) }));
        } else {
          throw new Error('DOCX parser unavailable in this environment');
        }
      }
      return { name: file.name, text: value.trim() || null, kind: 'docx' };
    }

    if (e === 'xlsx') {
      // exceljs (maintained, no outstanding advisories with the uuid
      // override in package.json) replaced the `xlsx` package, which
      // carried an unpatched high-severity prototype-pollution/ReDoS
      // advisory — unacceptable for parsing client-supplied pricing
      // schedules.
      const mod: any = await import('exceljs');
      const Workbook = mod.Workbook ?? mod.default?.Workbook;
      const wb = new Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const parts: string[] = [];
      wb.eachSheet((ws: any) => {
        const rows: string[] = [];
        ws.eachRow((row: any) => {
          const vals = (Array.isArray(row.values) ? row.values.slice(1) : []).map((v: any) => {
            if (v == null) return '';
            if (typeof v === 'object') {
              if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('');
              return String(v.text ?? v.result ?? v.formula ?? '');
            }
            return String(v);
          });
          rows.push(vals.join(','));
        });
        parts.push(`[Sheet: ${ws.name}]\n${rows.join('\n')}`);
      });
      const text = parts.join('\n\n').trim();
      return { name: file.name, text: text || null, kind: 'sheet' };
    }

    if (e === 'xls') {
      // Legacy binary .xls is not supported by the maintained parser —
      // say so rather than half-parsing it.
      return { name: file.name, text: null, kind: 'unsupported', note: `${file.name}: legacy .xls format is not supported — re-save it as .xlsx and re-upload.` };
    }

    if (e === 'pdf' || file.type === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const buf = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      const parts: string[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const pageText = content.items.map((it: any) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim();
        if (pageText) parts.push(`[Page ${p}]\n${pageText}`);
      }
      const text = parts.join('\n\n');
      // A multi-page PDF yielding almost no text is a scan, not a
      // document with a text layer. Say so instead of sending garbage.
      if (text.length < Math.max(80, doc.numPages * 15)) {
        return {
          name: file.name, text: null, kind: 'pdf', pages: doc.numPages, scanned: true,
          note: `${file.name} appears to be a scanned/image-only PDF — no text layer found. OCR is not yet implemented, so this document was skipped in analysis.`,
        };
      }
      return { name: file.name, text, kind: 'pdf', pages: doc.numPages };
    }

    return { name: file.name, text: null, kind: 'unsupported', note: `${file.name}: .${e} files can't be text-extracted yet and were skipped in analysis.` };
  } catch (err) {
    return {
      name: file.name, text: null, kind: 'unsupported',
      note: `${file.name}: extraction failed (${err instanceof Error ? err.message : 'unknown error'}) — skipped in analysis.`,
    };
  }
}

/**
 * Extracts every file and assembles the combined tender context the AI
 * receives: per-document chunks, each capped, with an overall budget so
 * a 400-page tender doesn't blow the model's context. Returns honest
 * notes for anything that couldn't be included.
 */
export async function buildTenderContext(
  files: File[],
  opts: { perDocChars?: number; totalChars?: number } = {},
): Promise<{ documents: { name: string; text: string }[]; notes: string[] }> {
  const perDoc = opts.perDocChars ?? 16000;
  const total = opts.totalChars ?? 60000;

  const extracted = await Promise.all(files.map(extractFileText));
  const notes: string[] = [];
  const documents: { name: string; text: string }[] = [];
  let used = 0;

  for (const doc of extracted) {
    if (!doc.text) {
      if (doc.note) notes.push(doc.note);
      continue;
    }
    if (used >= total) {
      notes.push(`${doc.name}: skipped — combined document budget reached.`);
      continue;
    }
    let text = doc.text.slice(0, Math.min(perDoc, total - used));
    if (text.length < doc.text.length) {
      text += '\n[…truncated for analysis…]';
      notes.push(`${doc.name}: long document — first ${Math.round(text.length / 1000)}k characters analysed.`);
    }
    used += text.length;
    documents.push({ name: doc.name, text });
  }
  return { documents, notes };
}
