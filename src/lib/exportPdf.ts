/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Real, client-side PDF generation via `pdf-lib`. Lazy-loaded from
 * ReviewGate (dynamic import), same reasoning as exportDocx.ts: this is
 * a sizeable dependency most page loads never touch.
 *
 * Scoped deliberately to the compliance matrix and submission checklist,
 * not the full prose response — pdf-lib has no flow-layout engine (no
 * automatic pagination/reflow the way Word documents get for free), so
 * hand-rolling that for an entire multi-section proposal would be a lot
 * of fragile layout code for something docx already does properly. A
 * structured table/checklist is a much better fit for what pdf-lib is
 * actually good at.
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import type { ComplianceItem, Tender } from '../types';
import { saveBlob as saveBlobShared, safeFilename } from './format';

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4, points
const MARGIN = 50;

const saveBlob = (bytes: Uint8Array, filename: string) => saveBlobShared(bytes, filename, 'application/pdf');

/** Greedy word-wrap using the font's actual measured width — not a fixed character count. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

class Layout {
  doc!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  y = 0;
  width = 0;
  height = 0;

  static async create(): Promise<Layout> {
    const l = new Layout();
    l.doc = await PDFDocument.create();
    l.font = await l.doc.embedFont(StandardFonts.Helvetica);
    l.bold = await l.doc.embedFont(StandardFonts.HelveticaBold);
    l.addPage();
    return l;
  }

  addPage() {
    this.page = this.doc.addPage(PAGE_SIZE);
    const { width, height } = this.page.getSize();
    this.width = width;
    this.height = height;
    this.y = height - MARGIN;
  }

  ensureSpace(needed: number) {
    if (this.y - needed < MARGIN) this.addPage();
  }

  text(str: string, opts: { size?: number; font?: PDFFont; color?: [number, number, number]; gap?: number; indent?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? this.font;
    const [r, g, b] = opts.color ?? [0.1, 0.12, 0.16];
    const x = MARGIN + (opts.indent ?? 0);
    const maxWidth = this.width - MARGIN * 2 - (opts.indent ?? 0);
    const lines = wrapText(str, font, size, maxWidth);
    lines.forEach((line) => {
      this.ensureSpace(size + 4);
      this.page.drawText(line, { x, y: this.y, size, font, color: rgb(r, g, b) });
      this.y -= size + 4;
    });
    this.y -= opts.gap ?? 0;
  }

  rule(gapBefore = 6, gapAfter = 10) {
    this.ensureSpace(gapBefore + 1 + gapAfter);
    this.y -= gapBefore;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: this.width - MARGIN, y: this.y }, thickness: 0.75, color: rgb(0.85, 0.87, 0.9) });
    this.y -= gapAfter;
  }

  async bytes(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

/** Real PDF: every compliance requirement, its status, sources, and any gap. */
export async function exportComplianceMatrixPdf(tender: Partial<Tender>, items: ComplianceItem[]) {
  const l = await Layout.create();
  l.text(tender.name || 'Compliance Matrix', { size: 18, font: l.bold, gap: 2 });
  l.text(`${tender.number || ''}  ${tender.client ? '·  ' + tender.client : ''}`, { size: 10, color: [0.4, 0.44, 0.5], gap: 4 });
  l.text(`Generated ${new Date().toLocaleDateString()}`, { size: 8, color: [0.6, 0.63, 0.68], gap: 10 });
  l.rule(0, 14);

  items.forEach((item, idx) => {
    l.ensureSpace(40);
    l.text(`${idx + 1}. ${item.requirement}`, { size: 10.5, font: l.bold, gap: 2 });
    l.text(`Reference: ${item.tenderReference || '—'}   ·   Status: ${item.status.replace(/_/g, ' ')}   ·   ${item.isMandatory ? 'Mandatory' : 'Optional'}`, {
      size: 8.5, color: [0.4, 0.44, 0.5], gap: 2,
    });
    if (item.sourceFiles.length) {
      l.text(`Sources: ${item.sourceFiles.join(', ')}`, { size: 8.5, color: [0.3, 0.5, 0.4], gap: 2 });
    }
    if (item.gap) {
      l.text(`Gap: ${item.gap}`, { size: 8.5, color: [0.7, 0.25, 0.2], gap: 2 });
    }
    l.rule(6, 10);
  });

  saveBlob(await l.bytes(), `${safeFilename(tender.name)}_Compliance_Matrix.pdf`);
}

/** Real PDF: gate status + sign-off summary. */
export async function exportChecklistPdf(
  tender: Partial<Tender>,
  gate: { assumptionsReviewed: boolean; pricingReviewed: boolean; finalComplianceChecked: boolean; sectionsApproved: number; totalSections: number; gapsOpen: number; passed: boolean },
) {
  const l = await Layout.create();
  l.text('Submission Checklist', { size: 18, font: l.bold, gap: 2 });
  l.text(`${tender.name || ''}  ·  ${tender.number || ''}`, { size: 10, color: [0.4, 0.44, 0.5], gap: 10 });

  l.text(
    gate.passed ? 'REVIEW GATE: PASSED — ready for submission.' : 'REVIEW GATE: NOT PASSED — resolve items below.',
    { size: 11, font: l.bold, color: gate.passed ? [0.02, 0.47, 0.34] : [0.72, 0.06, 0.06], gap: 12 },
  );

  const rows: [string, boolean][] = [
    ['Commercial assumptions reviewed', gate.assumptionsReviewed],
    ['Pricing reviewed', gate.pricingReviewed],
    ['Final compliance checked', gate.finalComplianceChecked],
    [`Sections approved (${gate.sectionsApproved}/${gate.totalSections})`, gate.sectionsApproved === gate.totalSections],
    [`No unresolved compliance gaps (${gate.gapsOpen} open)`, gate.gapsOpen === 0],
  ];
  rows.forEach(([label, done]) => {
    l.text(`${done ? '[x]' : '[ ]'}  ${label}`, { size: 10.5, gap: 6 });
  });

  l.rule(12, 6);
  l.text(`Generated ${new Date().toLocaleString()}`, { size: 8, color: [0.6, 0.63, 0.68] });

  saveBlob(await l.bytes(), `${safeFilename(tender.name)}_Submission_Checklist.pdf`);
}
