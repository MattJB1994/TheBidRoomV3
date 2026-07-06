/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modules — the modular proposal engine. Only tender-relevant modules
 * are active; each shows why it was activated, its linked requirements,
 * evidence coverage, draft status, owner/reviewer and due date. Users
 * can add or remove modules manually; the Final Submission Checklist
 * cannot be removed.
 */
import React, { useState } from 'react';
import { Layers, Plus, Minus, ArrowRight, Edit3, Calculator, Calendar, MessageSquare, Send } from 'lucide-react';
import { PageHeader, Card, Pill, Drawer, DefRow, GhostButton, PrimaryButton, Segmented } from '../ui';
import { BlueprintPageProps, NoBlueprint, DRAFT_TONE, EVIDENCE_TONE, teamName } from './shared';
import { ProposalModule, ModuleKey } from '../../blueprint/types';
import { toast } from '../../lib/toast';

interface Props extends BlueprintPageProps {
  onOpenDraft: (key: ModuleKey) => void;
  onOpenTool: (page: string) => void;  // pricing-tool / schedule-tool routes
}

export default function ModulesPage({ tender, bp, update, team, onNavigate, onOpenDraft, onOpenTool }: Props) {
  const [view, setView] = useState<'active' | 'library'>('active');
  const [openKey, setOpenKey] = useState<ModuleKey | null>(null);

  if (!tender || !bp) return <div className="space-y-5"><PageHeader title="Modules" subtitle="The proposal, module by module." /><NoBlueprint onNavigate={onNavigate} hasTender={!!tender} /></div>;

  const active = bp.modules.filter((m) => m.active);
  const inactive = bp.modules.filter((m) => !m.active);
  const open = bp.modules.find((m) => m.key === openKey) ?? null;

  const setActive = (key: ModuleKey, on: boolean) => {
    if (key === 'submission-checklist' && !on) { toast('The Final Submission Checklist is always active.', 'info'); return; }
    update((b) => ({
      ...b,
      modules: b.modules.map((m) => (m.key === key ? { ...m, active: on, manuallyToggled: true, activationReason: on ? (m.activationReason ?? 'Added manually by the bid team.') : m.activationReason } : m)),
      reviews: on && !b.reviews.some((t) => t.moduleKey === key)
        ? [...b.reviews, {
            id: `rev_${key}_${Date.now()}`, title: `${b.modules.find((m) => m.key === key)!.reviewerDiscipline} review — ${b.modules.find((m) => m.key === key)!.name}`,
            moduleKey: key, discipline: b.modules.find((m) => m.key === key)!.reviewerDiscipline,
            reviewerId: null, dueDate: b.modules.find((m) => m.key === key)!.dueDate,
            status: 'Not started' as const, comments: '', requiredChanges: '',
          }]
        : b.reviews,
    }));
    toast(on ? 'Module activated.' : 'Module removed from this proposal.');
  };

  const evidenceSummary = (m: ProposalModule) => {
    const ev = bp.evidence.filter((e) => e.moduleKey === m.key);
    return {
      total: ev.length,
      found: ev.filter((e) => e.status === 'found').length,
      missing: ev.filter((e) => e.status === 'missing').length,
      check: ev.filter((e) => e.status === 'check').length,
    };
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Modules"
        subtitle={`${active.length} modules activated for this tender · ${inactive.length} available in the library.`}
        actions={
          <Segmented<'active' | 'library'> value={view} onChange={setView} options={[
            { id: 'active', label: 'Active', count: active.length },
            { id: 'library', label: 'Library', count: inactive.length },
          ]} />
        }
      />

      {view === 'active' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {active.map((m) => {
            const ev = evidenceSummary(m);
            return (
              <Card key={m.key} onClick={() => setOpenKey(m.key)} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                      <Layers className="w-4 h-4 text-indigo-600" />
                    </span>
                    <span className="text-sm font-semibold text-slate-900 leading-tight">{m.name}</span>
                  </div>
                  <Pill tone={DRAFT_TONE[m.draftStatus]} dot>{m.draftStatus}</Pill>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{m.activationReason}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-auto pt-2 border-t border-slate-100">
                  <span>{m.requirementIds.length} req{m.requirementIds.length === 1 ? '' : 's'}</span>
                  {ev.total > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{ev.found}</span>
                      {ev.check > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{ev.check}</span>}
                      {ev.missing > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{ev.missing}</span>}
                    </span>
                  )}
                  <span className="ml-auto text-slate-400">{teamName(team, m.ownerId).split(' ')[0]} · due {m.dueDate ?? '—'}</span>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {inactive.length === 0 && <li className="p-5 text-sm text-slate-400">Every module in the library is active on this tender.</li>}
            {inactive.map((m) => (
              <li key={m.key} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{m.name}</div>
                  <div className="text-xs text-slate-400">Reviewer: {m.reviewerDiscipline}</div>
                </div>
                <GhostButton onClick={() => setActive(m.key, true)}><Plus className="w-4 h-4" /> Add to proposal</GhostButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Module detail drawer ─────────────────────────────────── */}
      <Drawer open={!!open} onClose={() => setOpenKey(null)} width="sm:w-[600px]"
        title={open?.name ?? ''} subtitle={open?.activationReason ?? undefined}>
        {open && (() => {
          const reqs = bp.requirements.filter((r) => open.requirementIds.includes(r.id));
          const ev = bp.evidence.filter((e) => e.moduleKey === open.key);
          const wordCount = open.draft.split(/\s+/).filter(Boolean).length;
          return (
            <div className="space-y-5">
              <div>
                <DefRow label="Draft status"><Pill tone={DRAFT_TONE[open.draftStatus]} dot>{open.draftStatus}</Pill></DefRow>
                <DefRow label="Owner">{teamName(team, open.ownerId)}</DefRow>
                <DefRow label="Review gate">{open.reviewerDiscipline} review</DefRow>
                <DefRow label="Due">{open.dueDate ?? '—'}</DefRow>
                <DefRow label="Word limit">{open.wordLimit ? `${wordCount} / ${open.wordLimit} words` : 'No limit set'}</DefRow>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Linked requirements ({reqs.length})</div>
                {reqs.length === 0 ? <p className="text-sm text-slate-400">None linked yet.</p> : (
                  <ul className="space-y-1.5">
                    {reqs.map((r) => (
                      <li key={r.id} className="text-sm text-slate-700 flex gap-2">
                        <span className="font-mono text-xs text-slate-400 shrink-0 mt-0.5">{r.id}</span>
                        <span className="leading-snug">{r.text.length > 110 ? r.text.slice(0, 107) + '…' : r.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Evidence ({ev.length})</div>
                {ev.length === 0 ? <p className="text-sm text-slate-400">No evidence requirements on this module.</p> : (
                  <ul className="space-y-1.5">
                    {ev.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-slate-700 truncate">{e.matchedFile ?? e.type}</span>
                        <Pill tone={EVIDENCE_TONE[e.status]}>{e.status === 'found' ? 'Found' : e.status === 'check' ? 'Check' : 'Missing'}</Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {open.draft && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Current draft</div>
                  <div className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {open.draft.slice(0, 700)}{open.draft.length > 700 ? '…' : ''}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Comments ({open.comments.length})</div>
                {open.comments.map((c) => (
                  <div key={c.id} className="text-sm text-slate-700 border-l-2 border-slate-200 pl-3 py-1 mb-2">
                    <span className="font-medium">{c.author}</span> <span className="text-xs text-slate-400">{c.date}</span>
                    <div>{c.text}</div>
                  </div>
                ))}
                <CommentBox onAdd={(text) => {
                  update((b) => ({ ...b, modules: b.modules.map((m) => m.key === open.key ? { ...m, comments: [...m.comments, { id: `c_${Date.now()}`, author: 'You', text, date: new Date().toISOString().split('T')[0] }] } : m) }));
                }} />
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                <PrimaryButton onClick={() => { onOpenDraft(open.key); setOpenKey(null); }}>
                  <Edit3 className="w-4 h-4" /> {open.draft ? 'Open draft' : 'Start draft'} <ArrowRight className="w-3.5 h-3.5" />
                </PrimaryButton>
                {(open.key === 'pricing-response' || open.key === 'commercial-assumptions') && (
                  <GhostButton onClick={() => { onOpenTool('pricing-tool'); setOpenKey(null); }}><Calculator className="w-4 h-4" /> Pricing workbook</GhostButton>
                )}
                {open.key === 'program-staging' && (
                  <GhostButton onClick={() => { onOpenTool('schedule-tool'); setOpenKey(null); }}><Calendar className="w-4 h-4" /> Schedule builder</GhostButton>
                )}
                <GhostButton onClick={() => {
                  update((b) => ({ ...b, modules: b.modules.map((m) => m.key === open.key ? { ...m, draftStatus: 'In review' } : m), reviews: b.reviews.map((t) => t.moduleKey === open.key ? { ...t, status: 'In review' as const } : t) }));
                  toast('Sent to the review gate.');
                }}><Send className="w-4 h-4" /> Send for review</GhostButton>
                {open.key !== 'submission-checklist' && (
                  <GhostButton onClick={() => { setActive(open.key, false); setOpenKey(null); }} className="text-red-600 hover:text-red-700">
                    <Minus className="w-4 h-4" /> Remove module
                  </GhostButton>
                )}
              </div>
            </div>
          );
        })()}
      </Drawer>
    </div>
  );
}

function CommentBox({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <div className="flex gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…"
        onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { onAdd(text.trim()); setText(''); } }}
        className="flex-1 text-sm p-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none" />
      <GhostButton onClick={() => { if (text.trim()) { onAdd(text.trim()); setText(''); } }}><MessageSquare className="w-4 h-4" /></GhostButton>
    </div>
  );
}
