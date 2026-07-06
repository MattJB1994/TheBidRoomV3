/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Real, client-side Word document generation via the `docx` package.
 * This module is intentionally lazy-loaded (dynamic import) from
 * ReviewGate — `docx` is a sizeable dependency and most page loads never
 * touch it, so keeping it out of the main bundle keeps initial load fast.
 */
import {
  Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType,
} from 'docx';
import type { ProposalSection, Tender } from '../types';
import { saveBlob, safeFilename } from './format';

// Markdown-ish content (the drafting studio stores headings as "### ..."
// and bracketed claim markers as "[claim text]") rendered into real Word
// paragraphs/headings rather than dumped as raw text.
function contentToParagraphs(content: string): Paragraph[] {
  const lines = content.split('\n');
  const out: Paragraph[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { out.push(new Paragraph({ text: '' })); continue; }
    if (line.startsWith('### ')) {
      out.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }));
      continue;
    }
    if (line.startsWith('## ')) {
      out.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }));
      continue;
    }
    // Render [bracketed claims] as normal text — the bracket markers are
    // an in-app authoring aid, not meant for the client-facing document.
    const clean = line.replace(/\[([^\]]+)\]/g, '$1').replace(/\*([^*]+)\*/g, '$1');
    out.push(new Paragraph({ children: [new TextRun(clean)], spacing: { after: 80 } }));
  }
  return out;
}

function cell(text: string, opts: { header?: boolean; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { type: ShadingType.SOLID, color: '0F172A', fill: '0F172A' } : undefined,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: opts.header, color: opts.header ? 'FFFFFF' : undefined, size: 18 })],
    })],
  });
}

const thinBorder = { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' };
const tableBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder, insideHorizontal: thinBorder, insideVertical: thinBorder };

/** Generates the real main response document from approved/drafted sections. */
export async function exportMainResponseDocx(tender: Partial<Tender>, sections: ProposalSection[]) {
  const ordered = [...sections];
  const children: Paragraph[] = [
    new Paragraph({ text: tender.name || 'Tender Response', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: `${tender.number || ''}  ·  ${tender.client || ''}`, italics: true, color: '475569' })],
    }),
  ];
  ordered.forEach((s) => {
    children.push(new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 } }));
    if (!s.approved) {
      children.push(new Paragraph({
        children: [new TextRun({ text: '⚠ Not yet approved at the review gate — included as latest draft.', italics: true, color: 'B45309', size: 18 })],
        spacing: { after: 120 },
      }));
    }
    children.push(...contentToParagraphs(s.content));
  });

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${safeFilename(tender.name, 'Tender_Response')}_Response.docx`);
}

/** Generates a real submission checklist / gate-status document. */
export async function exportChecklistDocx(
  tender: Partial<Tender>,
  gate: { assumptionsReviewed: boolean; pricingReviewed: boolean; finalComplianceChecked: boolean; sectionsApproved: number; totalSections: number; gapsOpen: number; passed: boolean },
) {
  const row = (label: string, done: boolean) => new TableRow({
    children: [cell(label), cell(done ? 'Yes' : 'No')],
  });
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({ children: [cell('Check', { header: true }), cell('Status', { header: true })] }),
      row('Commercial assumptions reviewed', gate.assumptionsReviewed),
      row('Pricing reviewed', gate.pricingReviewed),
      row('Final compliance checked', gate.finalComplianceChecked),
      row(`Sections approved (${gate.sectionsApproved}/${gate.totalSections})`, gate.sectionsApproved === gate.totalSections),
      row(`No unresolved compliance gaps (${gate.gapsOpen} open)`, gate.gapsOpen === 0),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: 'Submission Checklist', heading: HeadingLevel.TITLE }),
        new Paragraph({ text: `${tender.name || ''}  ·  ${tender.number || ''}`, spacing: { after: 300 } }),
        new Paragraph({
          spacing: { after: 300 },
          children: [new TextRun({
            text: gate.passed ? 'Review gate: PASSED — ready for submission.' : 'Review gate: NOT PASSED — resolve items below before submission.',
            bold: true, color: gate.passed ? '047857' : 'B91C1C',
          })],
        }),
        table,
        new Paragraph({ text: `Generated ${new Date().toLocaleString()}`, spacing: { before: 300 }, children: [new TextRun({ text: `Generated ${new Date().toLocaleString()}`, italics: true, size: 16, color: '94A3B8' })] }),
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${safeFilename(tender.name)}_Submission_Checklist.docx`);
}

