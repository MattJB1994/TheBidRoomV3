/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generic pack exporter for the Exports page. Produces a real .docx for
 * any blueprint export package — a titled document of headed sections,
 * each with paragraphs, bullets, or a two-column table. Lazy-loaded
 * like the other export modules so `docx` stays out of the main bundle.
 */
import {
  Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType,
} from 'docx';
import type { Tender } from '../types';
import { saveBlob, safeFilename } from './format';

export interface PackSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { headers: [string, string]; rows: [string, string][] };
}

const thin = { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' };
const borders = { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin };

const cell = (text: string, header = false) => new TableCell({
  shading: header ? { type: ShadingType.SOLID, color: '0F172A', fill: '0F172A' } : undefined,
  children: [new Paragraph({ children: [new TextRun({ text, bold: header, color: header ? 'FFFFFF' : undefined, size: 18 })] })],
});

export async function exportPackDocx(tender: Partial<Tender>, packTitle: string, sections: PackSection[]) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: packTitle, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: `${tender.name ?? ''}  ·  ${tender.number ?? ''}  ·  ${tender.client ?? ''}`, italics: true, color: '475569' })],
    }),
  ];

  for (const s of sections) {
    children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 } }));
    (s.paragraphs ?? []).forEach((p) => children.push(new Paragraph({ children: [new TextRun(p)], spacing: { after: 100 } })));
    (s.bullets ?? []).forEach((b) => children.push(new Paragraph({ text: b, bullet: { level: 0 }, spacing: { after: 60 } })));
    if (s.table) {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders,
        rows: [
          new TableRow({ children: [cell(s.table.headers[0], true), cell(s.table.headers[1], true)] }),
          ...s.table.rows.map(([a, b]) => new TableRow({ children: [cell(a), cell(b)] })),
        ],
      }));
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${safeFilename(tender.name, 'Tender')}_${packTitle.replace(/[^A-Za-z0-9]+/g, '_')}.docx`);
}
