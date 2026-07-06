/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Documents — everything uploaded for this tender. Drag-and-drop with
 * automatic type detection from the filename, manual re-tagging, and
 * addendum handling: tag (or auto-detect) a file as an Addendum and its
 * impact is assessed against the blueprint immediately — affected
 * requirements are flagged, a review task is created and a risk raised.
 */
import React, { useState } from 'react';
import { Files, FileText, AlertTriangle, Tag, CheckCircle2 } from 'lucide-react';
import { PageHeader, Card, Pill, EmptyState, GhostButton } from '../ui';
import { BlueprintPageProps, NoBlueprint } from './shared';
import { MODULE_NAME } from '../../blueprint/engine';
import FileDropzone from '../FileDropzone';
import { toast } from '../../lib/toast';

export const DOC_TAGS = [
  'RFP', 'Scope', 'Returnable schedule', 'Pricing schedule', 'Addendum', 'Contract',
  'Template', 'CV', 'Case study', 'Evidence', 'Policy', 'Insurance', 'Accreditation', 'Other',
] as const;
export type DocTag = typeof DOC_TAGS[number];

export interface ProjectDoc {
  id: string;
  name: string;
  size: string;
  addedAt: string;
  tag: DocTag;
  status: 'Uploaded' | 'Analysed';
  /** Honest state of the text-extraction pipeline for this document. */
  extractionStatus?: 'pending' | 'extracted' | 'scanned' | 'unsupported' | 'failed';
  extractionNote?: string;
  /** Stored extracted text (truncated) — reused for addendum analysis
      and evidence review without re-parsing the file. */
  extractedText?: string;
}

/** Best-effort file type detection from the name. */
export function detectTag(name: string): DocTag {
  const n = name.toLowerCase();
  if (/(addend|adden_|_add\d)/.test(n)) return 'Addendum';
  if (/(rft|rfp|rfq|eoi|request.for)/.test(n)) return 'RFP';
  if (/(pricing|rates|commercial.sched|boq)/.test(n)) return 'Pricing schedule';
  if (/(returnable|schedule[_ ]?[a-f]\b|form[_ ]?\d)/.test(n)) return 'Returnable schedule';
  if (/(scope|specification|spec\b)/.test(n)) return 'Scope';
  if (/(contract|conditions|agreement)/.test(n)) return 'Contract';
  if (/(template)/.test(n)) return 'Template';
  if (/(cv|resume)/.test(n)) return 'CV';
  if (/(case.stud|project.sheet|capability)/.test(n)) return 'Case study';
  if (/(policy|whs|ohs|slavery|conduct)/.test(n)) return 'Policy';
  if (/(insurance|indemnity|certificate.of.currency)/.test(n)) return 'Insurance';
  if (/(accredit|iso|certification)/.test(n)) return 'Accreditation';
  if (/(evidence)/.test(n)) return 'Evidence';
  return 'Other';
}

const TAG_TONE = (tag: DocTag) =>
  tag === 'Addendum' ? 'amber' as const : tag === 'RFP' ? 'indigo' as const : 'slate' as const;

interface Props extends BlueprintPageProps {
  documents: ProjectDoc[];
  onAddDocuments: (files: File[], tag?: DocTag) => void;
  onRetag: (docId: string, tag: DocTag) => void;
}

export default function DocumentsPage({ tender, bp, update, onNavigate, documents, onAddDocuments, onRetag }: Props) {
  const [tagPicker, setTagPicker] = useState<string | null>(null);

  if (!tender) return <div className="space-y-5"><PageHeader title="Documents" subtitle="Everything uploaded for this tender." /><NoBlueprint onNavigate={onNavigate} hasTender={false} /></div>;

  // Re-tagging (including to Addendum, which triggers impact analysis
  // and persistence) is handled by the app shell — one owner for the
  // whole flow, whether the doc was just uploaded or loaded after a
  // refresh.
  const handleRetag = (doc: ProjectDoc, tag: DocTag) => {
    onRetag(doc.id, tag);
    setTagPicker(null);
  };

  const addenda = bp?.addenda ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="Documents" subtitle={`${documents.length} document${documents.length === 1 ? '' : 's'} on this tender.`} />

      {/* Upload */}
      <Card className="p-5">
        <FileDropzone
          size="large" multiple
          label="Drag and drop tender documents, addenda or evidence"
          hint="or click to browse — addenda are detected automatically and their impact assessed"
          onFiles={(files) => onAddDocuments(files)}
        />
      </Card>

      {/* Addendum impacts */}
      {addenda.length > 0 && (
        <Card title={`Addendum impacts (${addenda.length})`}>
          <ul className="divide-y divide-slate-100">
            {addenda.map((a) => (
              <li key={a.id} className="px-4 py-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="truncate">{a.documentName}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.provisional && <Pill tone="amber">Provisional — confirm against document</Pill>}
                    <Pill tone={a.reviewed ? 'green' : 'amber'} dot>{a.reviewed ? 'Reviewed' : 'Review pending'}</Pill>
                    {!a.reviewed && (
                      <GhostButton onClick={() => {
                        update((b) => ({ ...b, addenda: b.addenda.map((x) => (x.id === a.id ? { ...x, reviewed: true } : x)) }));
                        toast('Addendum marked reviewed.');
                      }}><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Mark reviewed</GhostButton>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{a.summary}</p>
                <ul className="space-y-1">
                  {a.changes.map((c, i) => (
                    <li key={i} className="text-xs text-slate-500 flex gap-2"><span className="text-slate-300 shrink-0">•</span>{c}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-600">{a.affectedRequirementIds.length} requirements flagged</span>
                  {a.affectedModuleKeys.map((k) => <Pill key={k} tone="slate">{MODULE_NAME[k]}</Pill>)}
                  {a.pricingImpact && <Pill tone="amber">Pricing impact</Pill>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Document table */}
      {documents.length === 0 ? (
        <EmptyState icon={<Files className="w-5 h-5" />} title="No documents yet"
          body="Documents you uploaded while creating the tender, plus anything dropped above, appear here with automatic type detection." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium w-full">Document</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Size</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Added</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-300 shrink-0" />
                      <span className="text-slate-900 font-medium truncate">{d.name}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap relative">
                    <button onClick={() => setTagPicker(tagPicker === d.id ? null : d.id)} className="inline-flex items-center gap-1">
                      <Pill tone={TAG_TONE(d.tag)}>{d.tag}</Pill>
                      <Tag className="w-3 h-3 text-slate-300" />
                    </button>
                    {tagPicker === d.id && (
                      <div className="absolute z-20 mt-1 w-48 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                        {DOC_TAGS.map((t) => (
                          <button key={t} onClick={() => handleRetag(d, t)}
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${d.tag === t ? 'font-semibold text-indigo-700' : 'text-slate-700'}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-500 whitespace-nowrap">{d.size}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-500 whitespace-nowrap">{d.addedAt}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Pill tone={d.status === 'Analysed' ? 'green' : 'slate'} dot>{d.status}</Pill>
                      {d.extractionStatus === 'pending' && <Pill tone="slate">Extracting…</Pill>}
                      {d.extractionStatus === 'extracted' && <Pill tone="green">Text extracted</Pill>}
                      {d.extractionStatus === 'scanned' && <span title={d.extractionNote || 'Scanned/image-only PDF — no text layer. OCR is not yet available, so this file was not analysed. It is stored and can still be used as evidence; upload a text-based version for analysis.'}><Pill tone="amber">Scanned — not analysed (no OCR)</Pill></span>}
                      {(d.extractionStatus === 'unsupported' || d.extractionStatus === 'failed') && <span title={d.extractionNote}><Pill tone="red">No text</Pill></span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
