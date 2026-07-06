/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Real, client-side CSV export generation — no dependency on the (heavy)
 * `docx` package, so this stays in the main bundle for free. See
 * exportDocx.ts for the Word-document exports, which are lazy-loaded.
 */
import type { ProposalSection, ComplianceItem, Tender } from '../types';
import { saveBlob, safeFilename } from './format';

function csvEscape(v: string): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: string[][], filename: string) {
  const body = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  saveBlob(new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' }), filename);
}

/** Real CSV of the compliance matrix — opens directly in Excel/Sheets. */
export function exportComplianceCsv(tender: Partial<Tender>, items: ComplianceItem[]) {
  const rows: string[][] = [
    ['Requirement', 'Tender reference', 'Mandatory', 'Response section', 'Status', 'Gap', 'Source files'],
    ...items.map((i) => [
      i.requirement, i.tenderReference, i.isMandatory ? 'Yes' : 'No', i.responseSection,
      i.status.replace(/_/g, ' '), i.gap ?? '', i.sourceFiles.join('; '),
    ]),
  ];
  downloadCsv(rows, `${safeFilename(tender.name)}_Compliance_Trace_Matrix.csv`);
}

/** Real CSV log of every claim and the source file/page/confidence it traces to. */
export function exportClaimsLogCsv(tender: Partial<Tender>, sections: ProposalSection[]) {
  const rows: string[][] = [
    ['Section', 'Claim', 'Source file', 'Source page', 'Confidence %', 'Last verified', 'Stale?'],
  ];
  sections.forEach((s) => {
    s.claims.forEach((c) => {
      rows.push([s.title, c.text, c.sourceFile, c.sourcePage, String(c.confidenceScore), c.lastUpdatedDate, c.isStale ? 'STALE' : 'Current']);
    });
  });
  downloadCsv(rows, `${safeFilename(tender.name)}_Claims_Source_Log.csv`);
}
