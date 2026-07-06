/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Create tender — the project creation and analysis flow:
 *
 *   Step 1  Project details (name, client, submission type, due date &
 *           time, sector, bid manager, internal ref, portal, notes)
 *   Step 2  Upload tender documents (auto type detection, re-taggable)
 *           → Analyse Tender
 *   Analyse Progress states while the documents are processed
 *   Preview The generated blueprint at a glance → Open Tender Blueprint
 *
 * Real uploads go through the AI extraction endpoint (src/lib/ai.ts),
 * falling back to the representative sample in demo mode. What the user
 * typed always overrides what extraction guessed.
 */
import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, AlertTriangle, FileText,
  Loader2, ListChecks, Database, Layers, X, Sparkles, ShieldAlert,
} from 'lucide-react';
import { ExtractedTenderMetadata, Tender, TenderStatus, KBFile, PersonnelProfile, TeamMember } from '../types';
import { extractTenderFromDocuments, sampleExtraction } from '../lib/ai';
import { generateBlueprint } from '../blueprint/engine';
import { TenderBlueprint, ProjectMeta } from '../blueprint/types';
import FileDropzone from './FileDropzone';
import { Pill, PrimaryButton, GhostButton, Card } from './ui';
import { detectTag } from './blueprint/DocumentsPage';

interface TenderIntakeProps {
  onCreate: (tender: Tender, extracted: ExtractedTenderMetadata, blueprint: TenderBlueprint, files: File[]) => void;
  onNavigate: (page: string) => void;
  kbFiles: KBFile[];
  personnel: PersonnelProfile[];
  team: TeamMember[];
  /** Files dropped on the dashboard quick-start land here pre-loaded. */
  initialFiles?: File[];
}

type Phase = 'details' | 'documents' | 'analysing' | 'preview';

const ANALYSE_STEPS = [
  'Uploading files',
  'Extracting requirements',
  'Matching evidence',
  'Finding gaps',
  'Preparing workspace',
];

const SUBMISSION_TYPES = ['RFT', 'RFP', 'RFQ', 'EOI', 'ITT', 'Panel refresh'];
const SECTORS = ['Rail', 'Roads', 'Water', 'Energy', 'Buildings', 'Defence', 'Other infrastructure'];

export default function TenderIntake({ onCreate, onNavigate, kbFiles, personnel, team, initialFiles = [] }: TenderIntakeProps) {
  const [phase, setPhase] = useState<Phase>('details');
  const [form, setForm] = useState({
    name: '', client: '', submissionType: 'RFT', dueDate: '', dueTime: '14:00',
    sector: 'Rail', bidManagerId: team.find((m) => m.role === 'BID_MANAGER')?.id ?? team[0]?.id ?? '',
    internalRef: '', portal: '', notes: '', value: '',
  });
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [useSample, setUseSample] = useState(false);
  const [analyseStep, setAnalyseStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tender: Tender; extracted: ExtractedTenderMetadata; blueprint: TenderBlueprint } | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const detailsValid = form.name.trim() && form.client.trim() && form.dueDate.trim();
  const canAnalyse = files.length > 0 || useSample;

  const tags = useMemo(() => files.map((f) => detectTag(f.name)), [files]);

  const runAnalysis = async () => {
    setPhase('analysing');
    setError(null);
    setAnalyseStep(0);
    const ticker = setInterval(() => setAnalyseStep((s) => Math.min(s + 1, ANALYSE_STEPS.length - 1)), 1100);

    try {
      // Every uploaded document goes into the analysis — the pipeline
      // text-extracts each file (PDF text layer, DOCX, XLSX, CSV/TXT)
      // and the AI receives all of them as named chunks. The explicit
      // sample toggle uses the built-in sample in any mode.
      let raw: ExtractedTenderMetadata;
      if (files.length > 0) {
        raw = await extractTenderFromDocuments(files);
      } else {
        await new Promise((r) => setTimeout(r, 2000));
        raw = {
          ...sampleExtraction,
          sourceDocuments: ['Sample_RFT.pdf'],
          extractionNotes: ['Sample analysis — upload real tender documents for a live extraction.'],
        };
      }
      // User-entered details always win over extraction.
      const extracted: ExtractedTenderMetadata = {
        ...raw,
        tenderName: form.name.trim() || raw.tenderName,
        client: form.client.trim() || raw.client,
        closingDate: form.dueDate.trim() || raw.closingDate,
        submissionPortal: form.portal.trim() || raw.submissionPortal,
        tenderNumber: form.internalRef.trim() || raw.tenderNumber,
      };
      const tender: Tender = {
        id: 't_' + Date.now(),
        name: extracted.tenderName, number: extracted.tenderNumber, client: extracted.client,
        closingDate: extracted.closingDate, portal: extracted.submissionPortal,
        status: TenderStatus.Drafting, estimatedValue: form.value.trim() || '$1,850,000',
        probabilityOfWin: 70, ownerId: form.bidManagerId || 'u2',
      };
      const meta: Partial<ProjectMeta> = {
        submissionType: form.submissionType, sector: form.sector,
        bidManagerId: form.bidManagerId || null, internalRef: form.internalRef,
        portal: extracted.submissionPortal, notes: form.notes,
        dueTime: form.dueTime,
      };
      const blueprint = generateBlueprint({
        tender, extracted, kbFiles, personnel, team,
        documentNames: files.length ? files.map((f) => f.name) : ['Sample_RFT.pdf'],
        meta,
      });
      setResult({ tender, extracted, blueprint });
      clearInterval(ticker);
      setAnalyseStep(ANALYSE_STEPS.length - 1);
      setTimeout(() => setPhase('preview'), 500);
    } catch (err) {
      clearInterval(ticker);
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
      setPhase('documents');
    }
  };

  const label = (text: string, required = false) => (
    <label className="block text-sm font-medium text-slate-700 mb-1">{text}{required && <span className="text-red-500"> *</span>}</label>
  );
  const inputCls = 'w-full text-sm p-2.5 border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-slate-900 outline-none';

  const stepBadge = (n: number, text: string, active: boolean, done: boolean) => (
    <div className={`flex items-center gap-2 ${active ? 'text-slate-900' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
        done ? 'bg-emerald-600 border-emerald-600 text-white' : active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300'
      }`}>{done ? <Check className="w-3.5 h-3.5" /> : n}</span>
      <span className="text-sm font-semibold">{text}</span>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-950 tracking-tight">Create new tender</h1>
          <p className="text-sm text-slate-500 mt-0.5">Set up the project, upload the documents, and analyse to build the Tender Blueprint.</p>
        </div>
        <button onClick={() => onNavigate('dashboard')} aria-label="Close" className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      {(phase === 'details' || phase === 'documents') && (
        <div className="flex items-center gap-4">
          {stepBadge(1, 'Project details', phase === 'details', phase === 'documents')}
          <div className="flex-1 h-px bg-slate-200" />
          {stepBadge(2, 'Documents & analysis', phase === 'documents', false)}
        </div>
      )}

      {/* ── Step 1: project details ─────────────────────────────── */}
      {phase === 'details' && (
        <Card className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              {label('Tender name', true)}
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls}
                placeholder="e.g. Eastern Loop Level Crossing Assurance Package" />
            </div>
            <div>
              {label('Client', true)}
              <input value={form.client} onChange={(e) => set('client', e.target.value)} className={inputCls}
                placeholder="e.g. Metropolitan Transit Authority" />
            </div>
            <div>
              {label('Submission type')}
              <select value={form.submissionType} onChange={(e) => set('submissionType', e.target.value)} className={inputCls}>
                {SUBMISSION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              {label('Due date', true)}
              <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              {label('Due time')}
              <input type="time" value={form.dueTime} onChange={(e) => set('dueTime', e.target.value)} className={inputCls} />
            </div>
            <div>
              {label('Sector')}
              <select value={form.sector} onChange={(e) => set('sector', e.target.value)} className={inputCls}>
                {SECTORS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              {label('Bid manager')}
              <select value={form.bidManagerId} onChange={(e) => set('bidManagerId', e.target.value)} className={inputCls}>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              {label('Internal reference')}
              <input value={form.internalRef} onChange={(e) => set('internalRef', e.target.value)} className={inputCls}
                placeholder="e.g. BID-2026-041" />
            </div>
            <div>
              {label('Submission portal or method')}
              <input value={form.portal} onChange={(e) => set('portal', e.target.value)} className={inputCls}
                placeholder="e.g. Client procurement portal / email" />
            </div>
            <div>
              {label('Estimated value')}
              <input value={form.value} onChange={(e) => set('value', e.target.value)} className={inputCls}
                placeholder="e.g. $1,850,000" />
            </div>
            <div className="sm:col-span-2">
              {label('Notes (optional)')}
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
                className={`${inputCls} resize-none`} placeholder="Anything the team should know going in…" />
            </div>
          </div>
          <div className="flex items-center justify-end pt-3 border-t border-slate-100">
            <PrimaryButton disabled={!detailsValid} onClick={() => setPhase('documents')}>
              Next: documents <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
          </div>
        </Card>
      )}

      {/* ── Step 2: documents + Analyse ─────────────────────────── */}
      {phase === 'documents' && (
        <Card className="p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Tender documents</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Drop everything the client issued — RFT, scope, schedules, pricing, addenda. Types are detected automatically and can be changed later on the Documents page.
            </p>
          </div>

          <FileDropzone size="large" multiple label="Drag and drop the tender documents here"
            files={files}
            onFiles={(incoming) => { setFiles((prev) => [...prev, ...incoming]); setUseSample(false); }}
            onRemoveFile={(idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))}
          />

          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => <Pill key={`${f.name}-${i}`} tone={tags[i] === 'Addendum' ? 'amber' : 'slate'}>{tags[i]}: {f.name.length > 32 ? f.name.slice(0, 29) + '…' : f.name}</Pill>)}
            </div>
          )}

          {files.length === 0 && (
            <button onClick={() => setUseSample((s) => !s)}
              className={`w-full flex items-center gap-2.5 text-sm p-3 rounded-lg border transition-colors text-left ${
                useSample ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
              }`}>
              {useSample ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <FileText className="w-4 h-4 text-slate-400 shrink-0" />}
              <span><span className="font-semibold">No documents handy?</span> Use the sample RFT to see how analysis works.</span>
            </button>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <GhostButton onClick={() => setPhase('details')}><ArrowLeft className="w-4 h-4" /> Back</GhostButton>
            <PrimaryButton disabled={!canAnalyse} onClick={runAnalysis} className="!px-6 !py-2.5">
              <Sparkles className="w-4 h-4" /> Analyse Tender
            </PrimaryButton>
          </div>
        </Card>
      )}

      {/* ── Analysing ───────────────────────────────────────────── */}
      {phase === 'analysing' && (
        <Card className="p-8">
          <div className="max-w-sm mx-auto space-y-5">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
              <h2 className="text-sm font-semibold text-slate-900">Analysing {form.name || 'your tender'}</h2>
              <p className="text-sm text-slate-500 mt-0.5">Building the Tender Blueprint — usually under a minute.</p>
            </div>
            <ul className="space-y-2.5">
              {ANALYSE_STEPS.map((step, idx) => {
                const done = idx < analyseStep;
                const activeStep = idx === analyseStep;
                return (
                  <li key={step} className={`flex items-center gap-2.5 text-sm ${done ? 'text-emerald-700' : activeStep ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                    {done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      : activeStep ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      : <span className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />}
                    {step}
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      )}

      {/* ── Blueprint preview ───────────────────────────────────── */}
      {phase === 'preview' && result && (() => {
        const bpv = result.blueprint;
        const activeModules = bpv.modules.filter((m) => m.active);
        const gaps = bpv.evidence.filter((e) => e.status === 'missing').length;
        const found = bpv.evidence.filter((e) => e.status === 'found').length;
        return (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-sm text-emerald-900"><span className="font-semibold">Tender Blueprint generated.</span> Here's the plan — open it to start working.</div>
            </div>

            {(result.extracted.extractionNotes?.length || result.extracted.sourceDocuments?.length) && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
                {result.extracted.sourceDocuments && result.extracted.sourceDocuments.length > 0 && (
                  <div className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-600">Analysed:</span> {result.extracted.sourceDocuments.join(' · ')}
                  </div>
                )}
                {(result.extracted.extractionNotes ?? []).map((n, i) => (
                  <div key={i} className="text-xs text-amber-800 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{n}</div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { icon: <ListChecks className="w-4 h-4 text-slate-400" />, l: 'Requirements', v: bpv.requirements.length, s: `${bpv.requirements.filter((r) => r.mandatory).length} mandatory` },
                { icon: <Layers className="w-4 h-4 text-indigo-500" />, l: 'Modules activated', v: activeModules.length, s: 'of 20 in the library' },
                { icon: <Database className="w-4 h-4 text-emerald-600" />, l: 'Evidence matched', v: found, s: `${gaps} missing`, warn: gaps > 0 },
                { icon: <ShieldAlert className="w-4 h-4 text-amber-600" />, l: 'Risks identified', v: bpv.risks.length, s: `${bpv.risks.filter((r) => r.rating === 'High').length} high` },
              ].map((c) => (
                <Card key={c.l} className={`p-3.5 ${c.warn ? 'border-amber-300' : ''}`}>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">{c.icon} {c.l}</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{c.v}</div>
                  <div className="text-xs text-slate-400">{c.s}</div>
                </Card>
              ))}
            </div>

            <Card title={`Activated modules (${activeModules.length})`}>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeModules.map((m) => (
                  <div key={m.key} className="flex items-start gap-2 text-sm">
                    <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-medium text-slate-900">{m.name}</span>
                      <div className="text-xs text-slate-400 leading-snug">{m.activationReason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="sticky bottom-0 -mx-1 px-1 pb-1 pt-2 bg-gradient-to-t from-[#FAFAF8] via-[#FAFAF8] to-transparent">
              <Card className="px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
                <GhostButton onClick={() => setPhase('documents')}><ArrowLeft className="w-4 h-4" /> Back</GhostButton>
                <PrimaryButton className="!px-6 !py-2.5" onClick={() => onCreate(result.tender, result.extracted, result.blueprint, files)}>
                  Open Tender Blueprint <ArrowRight className="w-4 h-4" />
                </PrimaryButton>
              </Card>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
