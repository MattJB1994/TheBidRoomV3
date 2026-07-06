/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Document pipeline tests — multi-document analysis input: every
 * supported file is extracted into a named chunk, unsupported files
 * produce honest notes (never silent drops), and the spreadsheet path
 * runs on exceljs (the vulnerable `xlsx` package was removed).
 */
import { describe, it, expect } from 'vitest';
import { extractFileText, buildTenderContext } from '../src/lib/docText';
import { Document, Packer, Paragraph } from 'docx';

async function makeDocx(name: string, lines: string[]): Promise<File> {
  const doc = new Document({ sections: [{ children: lines.map((l) => new Paragraph(l)) }] });
  return new File([new Uint8Array(await Packer.toBuffer(doc))], name);
}

async function makeXlsx(name: string): Promise<File> {
  const mod: any = await import('exceljs');
  const Workbook = mod.Workbook ?? mod.default?.Workbook;
  const wb = new Workbook();
  const ws = wb.addWorksheet('Pricing Schedule');
  ws.addRow(['Item', 'Rate']);
  ws.addRow(['RVTM maintenance', '$150/hr']);
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], name);
}

describe('extractFileText', () => {
  it('extracts DOCX text', async () => {
    const f = await makeDocx('Conditions.docx', ['Clause 9.3: PI insurance of $20m is mandatory.']);
    const d = await extractFileText(f);
    expect(d.kind).toBe('docx');
    expect(d.text).toContain('PI insurance of $20m');
  });

  it('extracts XLSX with sheet markers via exceljs', async () => {
    const f = await makeXlsx('Pricing_B.xlsx');
    const d = await extractFileText(f);
    expect(d.kind).toBe('sheet');
    expect(d.text).toContain('[Sheet: Pricing Schedule]');
    expect(d.text).toContain('RVTM maintenance');
  });

  it('refuses legacy .xls honestly instead of half-parsing', async () => {
    const d = await extractFileText(new File([new Uint8Array([1, 2])], 'old.xls'));
    expect(d.text).toBeNull();
    expect(d.note).toMatch(/legacy \.xls/);
  });

  it('reports unsupported types with a note, never a fake result', async () => {
    const d = await extractFileText(new File([new Uint8Array([1, 2, 3])], 'drawings.zip'));
    expect(d.kind).toBe('unsupported');
    expect(d.text).toBeNull();
    expect(d.note).toMatch(/skipped in analysis/);
  });
});

describe('buildTenderContext — multi-document analysis input', () => {
  it('includes EVERY extractable document as a named chunk', async () => {
    const docx = await makeDocx('Scope.docx', ['The works comprise signalling renewal.']);
    const csv = new File(['requirement,clause\nInsurance,9.3'], 'returnables.csv');
    const xlsx = await makeXlsx('Pricing.xlsx');
    const { documents, notes } = await buildTenderContext([docx, csv, xlsx]);
    expect(documents.map((d) => d.name)).toEqual(['Scope.docx', 'returnables.csv', 'Pricing.xlsx']);
    expect(notes).toEqual([]);
  });

  it('carries honest notes for files that could not be included', async () => {
    const docx = await makeDocx('Scope.docx', ['Scope text.']);
    const zip = new File([new Uint8Array([1])], 'drawings.zip');
    const { documents, notes } = await buildTenderContext([docx, zip]);
    expect(documents.length).toBe(1);
    expect(notes.some((n) => n.includes('drawings.zip'))).toBe(true);
  });

  it('truncates long documents against the per-document budget and says so', async () => {
    const long = new File(['word '.repeat(10000)], 'huge.txt');
    const { documents, notes } = await buildTenderContext([long], { perDocChars: 500, totalChars: 5000 });
    expect(documents[0].text.length).toBeLessThan(600);
    expect(documents[0].text).toContain('truncated for analysis');
    expect(notes.some((n) => n.includes('huge.txt'))).toBe(true);
  });
});
