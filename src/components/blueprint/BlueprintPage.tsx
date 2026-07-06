/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tender Blueprint — the live proposal plan generated from the tender
 * documents: summary, returnables, evaluation criteria, requirement
 * counts by type, limits, accreditations & insurances, key risks,
 * addenda impacts, and the activated modules with the reason each one
 * switched on. Strategy inputs (win themes etc.) live here too, since
 * they steer everything the blueprint generates downstream.
 */
import React, { useState } from 'react';
import {
  Sparkles, Target, ListChecks, Scale, FileText, ShieldCheck, AlertTriangle,
  Layers, ArrowRight, Plus, X, RefreshCw,
} from 'lucide-react';
import { PageHeader, Card, Pill, ScoreRing, GhostButton, PrimaryButton, Drawer, DefRow } from '../ui';
import { BlueprintPageProps, NoBlueprint, RISK_TONE, teamName } from './shared';
import { computeScores, MODULE_NAME } from '../../blueprint/engine';
import { ProjectInputs } from '../../blueprint/types';
import { toast } from '../../lib/toast';

interface Props extends BlueprintPageProps {
  onReanalyse: () => void;
}

export default function BlueprintPage({ tender, bp, update, team, onNavigate, onReanalyse }: Props) {
  const [strategyOpen, setStrategyOpen] = useState(false);
  if (!tender || !bp) return <div className="space-y-5"><PageHeader title="Tender Blueprint" subtitle="The live proposal plan built from the tender documents." /><NoBlueprint onNavigate={onNavigate} hasTender={!!tender} /></div>;

  const scores = computeScores(bp);
  const activeModules = bp.modules.filter((m) => m.active);
  const byType = bp.requirements.reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc; }, {});
  const openRisks = bp.risks.filter((r) => r.status === 'Open');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tender Blueprint"
        subtitle={`Generated ${new Date(bp.generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} from the tender documents.`}
        actions={
          <>
            <GhostButton onClick={() => setStrategyOpen(true)}><Target className="w-4 h-4" /> Strategy & win themes</GhostButton>
            <GhostButton onClick={onReanalyse}><RefreshCw className="w-4 h-4" /> Re-analyse</GhostButton>
          </>
        }
      />

      {/* Summary + health */}
      <Card className="p-5">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tender summary</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{bp.summary}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-2 mt-4 text-sm">
              <div><div className="text-slate-400 text-xs">Client</div><div className="font-medium text-slate-900 truncate">{tender.client}</div></div>
              <div><div className="text-slate-400 text-xs">Due</div><div className="font-medium text-red-600">{tender.closingDate}{bp.meta.dueTime ? ` · ${bp.meta.dueTime}` : ''}</div></div>
              <div><div className="text-slate-400 text-xs">Submission type</div><div className="font-medium text-slate-900">{bp.submissionType}</div></div>
              <div><div className="text-slate-400 text-xs">Portal</div><div className="font-medium text-slate-900 truncate">{tender.portal}</div></div>
              <div><div className="text-slate-400 text-xs">Sector</div><div className="font-medium text-slate-900">{bp.meta.sector || '—'}</div></div>
              <div><div className="text-slate-400 text-xs">Internal ref</div><div className="font-medium text-slate-900 truncate">{bp.meta.internalRef || '—'}</div></div>
            </div>
          </div>
          <div className="flex items-center gap-6 lg:border-l lg:border-slate-100 lg:pl-6 shrink-0">
            <ScoreRing value={scores.readiness} label="Submission readiness" />
            <ScoreRing value={scores.compliance} label="Compliance" />
          </div>
        </div>
      </Card>

      {/* Requirement + structure row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Requirements detected" headerRight={
          <button onClick={() => onNavigate('requirements')} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1">Open register <ArrowRight className="w-3 h-3" /></button>
        }>
          <div className="p-4 space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{bp.requirements.length}</span>
              <span className="text-sm text-slate-500">total · {scores.mandatoryTotal} mandatory · {bp.requirements.filter((r) => r.scored).length} scored</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => (
                <Pill key={t} tone="slate">{t} <span className="font-mono text-slate-400">{n}</span></Pill>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Returnables" headerRight={<ListChecks className="w-4 h-4 text-slate-300" />}>
          <ul className="p-4 pt-3 space-y-2">
            {bp.returnables.length === 0 && <li className="text-sm text-slate-400">No returnable schedules detected.</li>}
            {bp.returnables.map((r) => (
              <li key={r} className="text-sm text-slate-700 flex gap-2"><FileText className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" /><span>{r}</span></li>
            ))}
          </ul>
        </Card>

        <Card title="Evaluation criteria" headerRight={<Scale className="w-4 h-4 text-slate-300" />}>
          <ul className="p-4 pt-3 space-y-2">
            {bp.evaluationCriteria.map((c) => (
              <li key={c} className="text-sm text-slate-700 flex gap-2"><span className="w-1 h-1 rounded-full bg-indigo-400 shrink-0 mt-2" /><span>{c}</span></li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Limits / accreditations / insurances */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Limits & formatting">
          <div className="p-4 pt-2">
            <DefRow label="Page limits">{bp.pageLimits || '—'}</DefRow>
            <DefRow label="Word limits">{bp.wordLimits || '—'}</DefRow>
            <DefRow label="Templates">{bp.requiredTemplates.length ? `${bp.requiredTemplates.length} client templates` : 'None detected'}</DefRow>
            <DefRow label="Addenda issued">{bp.addendaCount}</DefRow>
          </div>
        </Card>
        <Card title="Required accreditations" headerRight={<ShieldCheck className="w-4 h-4 text-slate-300" />}>
          <ul className="p-4 pt-3 space-y-2">
            {bp.requiredAccreditations.length === 0 && <li className="text-sm text-slate-400">None detected.</li>}
            {bp.requiredAccreditations.map((a) => <li key={a} className="text-sm text-slate-700">{a}</li>)}
          </ul>
        </Card>
        <Card title="Required insurances">
          <ul className="p-4 pt-3 space-y-2">
            {bp.requiredInsurances.map((a) => <li key={a} className="text-sm text-slate-700">{a}</li>)}
          </ul>
        </Card>
      </div>

      {/* Activated modules */}
      <Card title={`Activated proposal modules (${activeModules.length})`} headerRight={
        <button onClick={() => onNavigate('modules')} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1">Manage modules <ArrowRight className="w-3 h-3" /></button>
      }>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {activeModules.map((m) => (
            <div key={m.key} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50/40">
              <Layers className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{m.name}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{m.activationReason ?? 'Added manually.'}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Risks + addenda */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`Key risks (${openRisks.length} open)`} headerRight={
          <button onClick={() => onNavigate('risks')} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1">Risk register <ArrowRight className="w-3 h-3" /></button>
        }>
          <ul className="divide-y divide-slate-100">
            {openRisks.length === 0 && <li className="p-4 text-sm text-slate-400">No open risks.</li>}
            {openRisks.slice(0, 4).map((r) => (
              <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{r.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{r.detail}</div>
                </div>
                <Pill tone={RISK_TONE[r.rating]}>{r.rating}</Pill>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Addenda impacts (${bp.addenda.length})`} headerRight={<AlertTriangle className="w-4 h-4 text-slate-300" />}>
          <ul className="divide-y divide-slate-100">
            {bp.addenda.length === 0 && <li className="p-4 text-sm text-slate-400">No addenda uploaded yet. Upload one on the Documents page and its impact is assessed automatically.</li>}
            {bp.addenda.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900 truncate">{a.documentName}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {a.provisional && <Pill tone="amber">Provisional</Pill>}
                    <Pill tone={a.reviewed ? 'green' : 'amber'} dot>{a.reviewed ? 'Reviewed' : 'Review pending'}</Pill>
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {a.affectedRequirementIds.length} requirements · {a.affectedModuleKeys.map((k) => MODULE_NAME[k]).join(', ') || 'no modules'} affected
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Compliance / readiness footer strip */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-slate-500">Owner: <span className="font-medium text-slate-900">{teamName(team, bp.meta.bidManagerId)}</span></span>
          <span className="text-slate-500">Mandatory unanswered: <span className={`font-semibold ${scores.mandatoryUnanswered ? 'text-amber-700' : 'text-emerald-700'}`}>{scores.mandatoryUnanswered}</span></span>
          <span className="text-slate-500">Evidence gaps: <span className={`font-semibold ${scores.evidenceGaps ? 'text-red-600' : 'text-emerald-700'}`}>{scores.evidenceGaps}</span></span>
          <span className="text-slate-500">Exports ready: <span className="font-semibold text-slate-900">{scores.exportsReady} / {scores.exportsRequired} required</span></span>
        </div>
      </Card>

      {/* Strategy drawer */}
      <StrategyDrawer open={strategyOpen} onClose={() => setStrategyOpen(false)} inputs={bp.inputs}
        onSave={(inputs) => { update((b) => ({ ...b, inputs })); toast('Strategy inputs saved — drafting will use them.'); setStrategyOpen(false); }} />
    </div>
  );
}

/* ── Strategy / win themes drawer ─────────────────────────────────── */

function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (!v) return; onChange([...items, v]); setDraft(''); };
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          className="flex-1 text-sm p-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none" />
        <GhostButton onClick={add}><Plus className="w-4 h-4" /></GhostButton>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.map((it, i) => (
            <span key={`${it}-${i}`} className="inline-flex items-center gap-1 text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded-md">
              {it}
              <button onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${it}`} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StrategyDrawer({ open, onClose, inputs, onSave }: { open: boolean; onClose: () => void; inputs: ProjectInputs; onSave: (v: ProjectInputs) => void }) {
  const [v, setV] = useState<ProjectInputs>(inputs);
  React.useEffect(() => { if (open) setV(inputs); }, [open, inputs]);
  const set = <K extends keyof ProjectInputs>(k: K, val: ProjectInputs[K]) => setV((p) => ({ ...p, [k]: val }));

  return (
    <Drawer open={open} onClose={onClose} title="Strategy & win themes" subtitle="These inputs steer every generated draft.">
      <div className="space-y-5">
        <ListEditor label="Win themes" items={v.winThemes} onChange={(x) => set('winThemes', x)} placeholder="e.g. Proven delivery on the client's own network" />
        <ListEditor label="Client hot buttons" items={v.clientHotButtons} onChange={(x) => set('clientHotButtons', x)} placeholder="e.g. Possession efficiency" />
        <ListEditor label="Preferred terminology" items={v.preferredTerminology} onChange={(x) => set('preferredTerminology', x)} placeholder="e.g. assurance package" />
        <ListEditor label="Terms to avoid" items={v.termsToAvoid} onChange={(x) => set('termsToAvoid', x)} placeholder="e.g. best efforts" />
        <ListEditor label="Key assumptions" items={v.keyAssumptions} onChange={(x) => set('keyAssumptions', x)} placeholder="e.g. Client provides track access" />
        <ListEditor label="Key exclusions" items={v.keyExclusions} onChange={(x) => set('keyExclusions', x)} placeholder="e.g. Utility relocations excluded" />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">Proposal tone</label>
          <div className="flex gap-2">
            {(['Executive', 'Technical', 'Balanced'] as const).map((t) => (
              <button key={t} onClick={() => set('proposalTone', t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${v.proposalTone === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">Commercial position</label>
          <textarea value={v.commercialPosition} onChange={(e) => set('commercialPosition', e.target.value)} rows={2}
            placeholder="e.g. Competitive on rates, hold margin on risk allocation"
            className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none resize-none" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">Competitor notes</label>
          <textarea value={v.competitorNotes} onChange={(e) => set('competitorNotes', e.target.value)} rows={2}
            className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none resize-none" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">Strategic notes</label>
          <textarea value={v.strategicNotes} onChange={(e) => set('strategicNotes', e.target.value)} rows={3}
            className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none resize-none" />
        </div>
        <div className="pt-2 flex justify-end">
          <PrimaryButton onClick={() => onSave(v)}>Save strategy</PrimaryButton>
        </div>
      </div>
    </Drawer>
  );
}
