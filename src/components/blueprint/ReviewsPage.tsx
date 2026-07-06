/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reviews — modular review gates. Each activated module has a gate
 * owned by the right discipline (technical, commercial, legal, safety,
 * assurance, bid manager, bid director), plus tender-level tasks such
 * as addendum reviews and SME requests. The final approval gate sits
 * at the top and unlocks only when everything under it is approved.
 */
import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, RotateCcw, MessageSquare, Lock, Unlock, ClipboardCheck } from 'lucide-react';
import { PageHeader, Card, Pill, GhostButton, Drawer, DefRow, PrimaryButton } from '../ui';
import { buildLoopReport } from '../../blueprint/proposalLoops';
import { checkRepetitionAndConsistency } from '../../blueprint/proposalRun';
import { BlueprintPageProps, NoBlueprint, REVIEW_TONE, teamName } from './shared';
import { ReviewTask, ReviewStatus, ReviewDiscipline } from '../../blueprint/types';
import { MODULE_NAME } from '../../blueprint/engine';
import { toast } from '../../lib/toast';

const DISCIPLINE_ORDER: ReviewDiscipline[] = [
  'Technical', 'Commercial', 'Legal / Contract', 'Safety', 'Assurance', 'Bid Manager', 'Bid Director', 'Final Approval',
];

export default function ReviewsPage({ tender, bp, update, team, onNavigate }: BlueprintPageProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!tender || !bp) return <div className="space-y-5"><PageHeader title="Reviews" subtitle="Modular review gates and approvals." /><NoBlueprint onNavigate={onNavigate} hasTender={!!tender} /></div>;

  const open = bp.reviews.find((t) => t.id === openId) ?? null;
  const finalGate = bp.reviews.find((t) => t.discipline === 'Final Approval') ?? null;
  const others = bp.reviews.filter((t) => t.discipline !== 'Final Approval');
  const othersApproved = others.every((t) => t.status === 'Approved');
  const approved = bp.reviews.filter((t) => t.status === 'Approved').length;

  const patch = (id: string, p: Partial<ReviewTask>) =>
    update((b) => ({
      ...b,
      reviews: b.reviews.map((t) => (t.id === id ? { ...t, ...p } : t)),
      // Keep the module's draft status in sync with its gate.
      modules: p.status
        ? b.modules.map((m) => {
            const task = b.reviews.find((t) => t.id === id);
            if (!task?.moduleKey || m.key !== task.moduleKey) return m;
            if (p.status === 'Approved') return { ...m, draftStatus: 'Approved' as const };
            if (p.status === 'Changes requested') return { ...m, draftStatus: 'Drafting' as const };
            if (p.status === 'In review') return { ...m, draftStatus: 'In review' as const };
            return m;
          })
        : b.modules,
    }));

  const setStatus = (task: ReviewTask, status: ReviewStatus) => {
    if (task.discipline === 'Final Approval' && status === 'Approved' && !othersApproved) {
      toast('Final approval is locked until every other gate is approved.', 'error');
      return;
    }
    patch(task.id, { status });
    toast(status === 'Approved' ? `${task.title} approved.` : `${task.title}: ${status.toLowerCase()}.`);
  };

  const grouped = DISCIPLINE_ORDER
    .map((d) => ({ discipline: d, tasks: others.filter((t) => t.discipline === d) }))
    .filter((g) => g.tasks.length > 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Review" subtitle={`${approved} of ${bp.reviews.length} gates approved.`} />

      {/* Proposal Checks — plain-language status across the whole proposal.
          The controlled-loop engine runs underneath; users see six checks,
          each Passed / Needs attention / Blocked. Detail sits in the
          drawer. */}
      {(() => {
        const report = buildLoopReport(bp);
        const activeDrafted = bp.modules.filter((m) => m.active && m.draft);
        type CheckState = 'Passed' | 'Needs attention' | 'Blocked';
        const reqMissing = bp.requirements.filter((r) => r.mandatory && r.status !== 'Complete').length;
        const repetition = checkRepetitionAndConsistency(bp).filter((i) => i.kind === 'repetition').length;
        const openCommercial = bp.commercial.filter((c) => c.status === 'Open').length;
        const pendingAddenda = bp.addenda.filter((a) => !a.reviewed).length;
        const reviewsOpen = bp.reviews.filter((r) => r.status !== 'Approved').length;
        const checks: { label: string; state: CheckState; detail: string; page?: string }[] = [
          { label: 'Requirement coverage', state: activeDrafted.length === 0 ? 'Needs attention' : reqMissing > 0 ? 'Blocked' : 'Passed', detail: reqMissing > 0 ? `${reqMissing} mandatory requirement(s) not complete.` : 'All mandatory requirements addressed.', page: 'requirements' },
          { label: 'Evidence support', state: report.missingEvidence > 0 || report.unsupportedClaims > 0 ? (report.missingEvidence > 0 ? 'Blocked' : 'Needs attention') : 'Passed', detail: `${report.missingEvidence} missing evidence, ${report.unsupportedClaims} unsupported claim(s).`, page: 'evidence' },
          { label: 'Repetition', state: repetition > 0 ? 'Needs attention' : 'Passed', detail: repetition > 0 ? `${repetition} repeated passage(s) across sections.` : 'No heavy repetition detected.', page: 'drafts' },
          { label: 'Commercial consistency', state: openCommercial > 0 ? 'Needs attention' : 'Passed', detail: openCommercial > 0 ? `${openCommercial} commercial item(s) still open.` : 'Commercial position resolved.', page: 'commercial' },
          { label: 'Addendum impact', state: pendingAddenda > 0 ? 'Blocked' : 'Passed', detail: pendingAddenda > 0 ? `${pendingAddenda} addendum impact(s) unreviewed.` : 'All addenda reviewed.', page: 'evidence' },
          { label: 'Human review', state: activeDrafted.length === 0 ? 'Needs attention' : reviewsOpen > 0 ? 'Blocked' : 'Passed', detail: reviewsOpen > 0 ? `${reviewsOpen} review gate(s) outstanding below.` : 'All gates approved.' },
        ];
        const tone = (s: CheckState) => s === 'Passed' ? 'green' : s === 'Blocked' ? 'red' : 'amber';
        return (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardCheck className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-semibold text-slate-900">Proposal Checks</span>
              <span className="text-xs text-slate-500">— what's ready and what's blocking submission</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {checks.map((c) => (
                <button key={c.label} onClick={() => c.page && onNavigate(c.page)} disabled={!c.page}
                  className={`text-left rounded-lg border p-3 transition-colors ${c.page ? 'hover:border-slate-300' : ''} ${c.state === 'Passed' ? 'border-emerald-100 bg-emerald-50/30' : c.state === 'Blocked' ? 'border-red-100 bg-red-50/30' : 'border-amber-100 bg-amber-50/30'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-800">{c.label}</span>
                    <Pill tone={tone(c.state)}>{c.state}</Pill>
                  </div>
                  <div className="text-xs text-slate-500">{c.detail}</div>
                </button>
              ))}
            </div>
          </Card>
        );
      })()}


      {/* Final approval gate */}
      {finalGate && (
        <Card className={`p-4 ${finalGate.status === 'Approved' ? 'border-emerald-300 bg-emerald-50/40' : othersApproved ? 'border-indigo-200' : ''}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              {othersApproved || finalGate.status === 'Approved'
                ? <Unlock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                : <Lock className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />}
              <div>
                <div className="text-sm font-semibold text-slate-900">Final approval — submission sign-off</div>
                <p className="text-sm text-slate-500 mt-0.5">
                  {finalGate.status === 'Approved'
                    ? 'Approved. The submission is cleared for export and lodgement.'
                    : othersApproved
                      ? 'All module gates are approved — final sign-off is unlocked.'
                      : `Locked: ${others.filter((t) => t.status !== 'Approved').length} gate${others.filter((t) => t.status !== 'Approved').length === 1 ? '' : 's'} still open below.`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Pill tone={REVIEW_TONE[finalGate.status]} dot>{finalGate.status}</Pill>
              {finalGate.status !== 'Approved' && (
                <PrimaryButton disabled={!othersApproved} onClick={() => setStatus(finalGate, 'Approved')}>
                  <ShieldCheck className="w-4 h-4" /> Approve submission
                </PrimaryButton>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Gates by discipline */}
      {grouped.map((g) => (
        <div key={g.discipline} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 px-1">{g.discipline} review</h2>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {g.tasks.map((t) => (
                <li key={t.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <button onClick={() => setOpenId(t.id)} className="text-left min-w-0 group">
                    <div className="text-sm font-medium text-slate-900 group-hover:text-indigo-700 transition-colors">{t.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {teamName(team, t.reviewerId)} · due {t.dueDate ?? '—'}{t.moduleKey ? ` · ${MODULE_NAME[t.moduleKey]}` : ''}
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Pill tone={REVIEW_TONE[t.status]} dot>{t.status}</Pill>
                    {t.status !== 'Approved' && (
                      <>
                        {t.status !== 'In review' && <GhostButton onClick={() => setStatus(t, 'In review')}>Start</GhostButton>}
                        <GhostButton onClick={() => setStatus(t, 'Changes requested')}><RotateCcw className="w-3.5 h-3.5" /></GhostButton>
                        <GhostButton onClick={() => setStatus(t, 'Approved')}><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /></GhostButton>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ))}

      {/* Task detail drawer */}
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open?.title ?? ''} subtitle={open?.moduleKey ? MODULE_NAME[open.moduleKey] : 'Tender-level task'}>
        {open && (
          <div className="space-y-5">
            <div>
              <DefRow label="Discipline">{open.discipline}</DefRow>
              <DefRow label="Reviewer">{teamName(team, open.reviewerId)}</DefRow>
              <DefRow label="Due">{open.dueDate ?? '—'}</DefRow>
              <DefRow label="Status"><Pill tone={REVIEW_TONE[open.status]} dot>{open.status}</Pill></DefRow>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5"><MessageSquare className="w-4 h-4 text-slate-400" /> Reviewer comments</label>
              <textarea value={open.comments} onChange={(e) => patch(open.id, { comments: e.target.value })} rows={4}
                className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none resize-none" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Required changes</label>
              <textarea value={open.requiredChanges} onChange={(e) => patch(open.id, { requiredChanges: e.target.value })} rows={3}
                placeholder="What must change before this gate can pass…"
                className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none resize-none" />
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <GhostButton onClick={() => { setStatus(open, 'Changes requested'); }}><RotateCcw className="w-4 h-4" /> Request changes</GhostButton>
              <PrimaryButton onClick={() => { setStatus(open, 'Approved'); setOpenId(null); }}><CheckCircle2 className="w-4 h-4" /> Approve</PrimaryButton>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
