/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Requirements — the register of everything the client asked for, with
 * filters and a full detail drawer: source, classification, linked
 * module, suggested approach, evidence, draft link, owner/reviewer,
 * compliance, risk and the full action set.
 */
import React, { useMemo, useState } from 'react';
import {
  ListChecks, Search, FileText, Database, AlertTriangle, CheckCircle2,
  MessageCircleQuestion, Scale, ShieldAlert, Send, Edit3, Upload,
} from 'lucide-react';
import { PageHeader, Card, Pill, Drawer, DefRow, GhostButton, Segmented, EmptyState } from '../ui';
import { BlueprintPageProps, NoBlueprint, REQ_STATUS_TONE, COMPLIANCE_TONE, RISK_TONE, teamName } from './shared';
import { Requirement, RiskItem } from '../../blueprint/types';
import { MODULE_NAME } from '../../blueprint/engine';
import FileDropzone from '../FileDropzone';
import { KBFile } from '../../types';
import { formatBytes } from '../../lib/format';
import { toast } from '../../lib/toast';

type Filter = 'all' | 'mandatory' | 'scored' | 'gaps' | 'flagged';

export default function RequirementsPage(props: BlueprintPageProps) {
  const { tender, bp, update, team, onAddKBFile, onNavigate } = props;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  if (!tender || !bp) return <div className="space-y-5"><PageHeader title="Requirements" subtitle="Every requirement the tender documents contain." /><NoBlueprint onNavigate={onNavigate} hasTender={!!tender} /></div>;

  const gapsFor = (r: Requirement) => bp.evidence.filter((e) => e.requirementId === r.id && e.status !== 'found');

  const visible = useMemo(() => {
    let list = bp.requirements;
    if (filter === 'mandatory') list = list.filter((r) => r.mandatory);
    if (filter === 'scored') list = list.filter((r) => r.scored);
    if (filter === 'gaps') list = list.filter((r) => gapsFor(r).length > 0);
    if (filter === 'flagged') list = list.filter((r) => r.addendumFlag);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => (r.text + r.id + r.type + r.clauseRef).toLowerCase().includes(q));
    return list;
  }, [bp, filter, query]);

  const open = bp.requirements.find((r) => r.id === openId) ?? null;

  const patch = (id: string, p: Partial<Requirement>) =>
    update((b) => ({ ...b, requirements: b.requirements.map((r) => (r.id === id ? { ...r, ...p } : r)) }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Requirements"
        subtitle={`${bp.requirements.length} extracted from the tender documents · ${bp.requirements.filter((r) => r.mandatory).length} mandatory.`}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Segmented<Filter>
          value={filter} onChange={setFilter}
          options={[
            { id: 'all', label: 'All', count: bp.requirements.length },
            { id: 'mandatory', label: 'Mandatory', count: bp.requirements.filter((r) => r.mandatory).length },
            { id: 'scored', label: 'Scored', count: bp.requirements.filter((r) => r.scored).length },
            { id: 'gaps', label: 'Evidence gaps', count: bp.requirements.filter((r) => gapsFor(r).length > 0).length },
            { id: 'flagged', label: 'Addendum-flagged', count: bp.requirements.filter((r) => r.addendumFlag).length },
          ]}
        />
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-slate-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search requirements…"
            className="w-full text-sm pl-8 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-slate-900 outline-none" />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<ListChecks className="w-5 h-5" />} title="Nothing matches" body="Try another filter or search term." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">ID</th>
                <th className="px-4 py-2.5 font-medium w-full">Requirement</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Type</th>
                <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Module</th>
                <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Owner</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((r) => {
                const gaps = gapsFor(r);
                return (
                  <tr key={r.id} onClick={() => setOpenId(r.id)} className="hover:bg-slate-50/70 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap align-top">
                      {r.id}
                      {r.mandatory && <span className="block text-[11px] text-red-500 font-sans font-semibold mt-0.5">Mandatory</span>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-slate-900 leading-snug line-clamp-2">{r.text}</div>
                      <div className="text-xs text-slate-400 mt-1">{r.sourceDocument} · {r.clauseRef}{r.addendumFlag ? ` · ${r.addendumFlag}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 align-top hidden md:table-cell"><Pill tone="slate">{r.type}</Pill></td>
                    <td className="px-4 py-3 align-top hidden lg:table-cell text-slate-600 whitespace-nowrap">{r.moduleKey ? MODULE_NAME[r.moduleKey] : '—'}</td>
                    <td className="px-4 py-3 align-top hidden lg:table-cell text-slate-600 whitespace-nowrap">{teamName(team, r.ownerId)}</td>
                    <td className="px-4 py-3 align-top whitespace-nowrap"><Pill tone={REQ_STATUS_TONE[r.status]} dot>{r.status}</Pill></td>
                    <td className="px-4 py-3 align-top hidden md:table-cell whitespace-nowrap">
                      {!r.evidenceRequired ? <span className="text-xs text-slate-400">n/a</span>
                        : gaps.length ? <Pill tone={gaps.some((g) => g.status === 'missing') ? 'red' : 'amber'}>{gaps.length} gap{gaps.length === 1 ? '' : 's'}</Pill>
                        : <Pill tone="green">Covered</Pill>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <RequirementDrawer
        requirement={open}
        onClose={() => setOpenId(null)}
        {...props}
        patch={patch}
      />
    </div>
  );
}

/* ── Requirement detail drawer (shared actions) ───────────────────── */

export function RequirementDrawer({ requirement, onClose, bp, update, team, onAddKBFile, onNavigate, patch }: BlueprintPageProps & {
  requirement: Requirement | null;
  onClose: () => void;
  patch: (id: string, p: Partial<Requirement>) => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const r = requirement;
  if (!bp) return null;
  const evidence = r ? bp.evidence.filter((e) => e.requirementId === r.id) : [];
  const missing = evidence.filter((e) => e.status !== 'found');

  const uploadEvidence = (files: File[]) => {
    if (!r) return;
    files.forEach((file, idx) => {
      const kb: KBFile = {
        id: `f_req_${Date.now()}_${idx}`, name: file.name,
        category: r.type === 'Personnel' ? 'CV' : r.type === 'Legal' ? 'POLICY' : r.type === 'Insurance' || r.type === 'Accreditation' ? 'CREDENTIAL' : 'PROJECT_EVIDENCE',
        size: formatBytes(file.size), uploadedAt: new Date().toISOString().split('T')[0],
        uploadedBy: 'You', lastVerifiedAt: new Date().toISOString().split('T')[0], isStale: false,
        objectUrl: URL.createObjectURL(file),
      };
      onAddKBFile(kb, file);
    });
    update((b) => ({
      ...b,
      evidence: b.evidence.map((e) => (e.requirementId === r.id && e.status !== 'found'
        ? { ...e, status: 'found', matchedFile: files[0].name, resolution: 'uploaded', detail: `Uploaded: ${files.map((f) => f.name).join(', ')}` }
        : e)),
    }));
    patch(r.id, { compliance: 'Compliant', status: r.status === 'Not started' ? 'In progress' : r.status });
    setShowUpload(false);
    toast(`${files.length === 1 ? 'Evidence' : `${files.length} files`} added to the knowledge base and linked to ${r.id}.`);
  };

  const askSme = () => {
    if (!r) return;
    update((b) => ({
      ...b,
      reviews: [{
        id: `rev_sme_${Date.now()}`, title: `SME input — ${r.id}`, moduleKey: r.moduleKey,
        discipline: 'Technical', reviewerId: r.reviewerId, dueDate: r.dueDate,
        status: 'Not started', comments: `SME input requested: ${r.text}`, requiredChanges: '',
      }, ...b.reviews],
    }));
    toast('SME task created — track it on the Reviews page.');
  };

  const addToRisks = () => {
    if (!r) return;
    const risk: RiskItem = {
      id: `risk_req_${Date.now()}`, title: `Requirement risk: ${r.id}`, detail: r.text,
      rating: 'Medium', source: 'Manual', requirementId: r.id,
      mitigation: '', ownerId: r.ownerId, status: 'Open',
    };
    update((b) => ({ ...b, risks: [risk, ...b.risks] }));
    patch(r.id, { risk: r.risk === 'None' ? 'Medium' : r.risk });
    toast('Added to the risk register.');
  };

  const raiseClarification = () => {
    if (!r) return;
    patch(r.id, { notes: (r.notes ? r.notes + '\n' : '') + `Clarification raised with client: what is acceptable evidence / interpretation for this requirement?` });
    update((b) => ({
      ...b,
      reviews: [{
        id: `rev_clar_${Date.now()}`, title: `Clarification to client — ${r.id}`, moduleKey: null,
        discipline: 'Bid Manager', reviewerId: b.meta.bidManagerId, dueDate: r.dueDate,
        status: 'Not started', comments: r.text, requiredChanges: '',
      }, ...b.reviews],
    }));
    toast('Clarification drafted — a review task tracks its submission.');
  };

  const addToDepartures = () => {
    if (!r) return;
    update((b) => ({
      ...b,
      modules: b.modules.map((m) => (m.key === 'departures-clarifications'
        ? { ...m, active: true, activationReason: m.activationReason ?? 'Departure added from the requirements register.', requirementIds: m.requirementIds.includes(r.id) ? m.requirementIds : [...m.requirementIds, r.id] }
        : m)),
    }));
    patch(r.id, { moduleKey: 'departures-clarifications', type: 'Legal' });
    toast('Moved into Departures & Clarifications.');
  };

  return (
    <Drawer open={!!r} onClose={onClose} width="sm:w-[620px]"
      title={r ? <span className="flex items-center gap-2"><span className="font-mono text-xs text-slate-400">{r.id}</span>{r.mandatory && <Pill tone="red">Mandatory</Pill>}{r.scored && <Pill tone="indigo">Scored</Pill>}</span> : ''}
      subtitle={r ? `${r.sourceDocument} · ${r.clauseRef}` : ''}
    >
      {r && (
        <div className="space-y-5">
          {/* Original requirement */}
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Client requirement</div>
            <p className="text-sm text-slate-800 leading-relaxed">{r.text}</p>
            {r.addendumFlag && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800"><AlertTriangle className="w-3.5 h-3.5" /> {r.addendumFlag} — re-verify before relying on this.</div>
            )}
          </div>

          {/* Classification */}
          <div>
            <DefRow label="Type"><Pill tone="slate">{r.type}</Pill></DefRow>
            <DefRow label="Priority">{r.priority}</DefRow>
            <DefRow label="Linked module">{r.moduleKey ? MODULE_NAME[r.moduleKey] : '—'}</DefRow>
            <DefRow label="Response required">{r.responseRequired ? 'Yes' : 'No'}</DefRow>
            <DefRow label="Evidence required">{r.evidenceRequired ? 'Yes' : 'No'}</DefRow>
            <DefRow label="Owner">{teamName(team, r.ownerId)}</DefRow>
            <DefRow label="Reviewer">{teamName(team, r.reviewerId)}</DefRow>
            <DefRow label="Due">{r.dueDate ?? '—'}</DefRow>
            <DefRow label="Status"><Pill tone={REQ_STATUS_TONE[r.status]} dot>{r.status}</Pill></DefRow>
            <DefRow label="Compliance"><Pill tone={COMPLIANCE_TONE[r.compliance]}>{r.compliance}</Pill></DefRow>
            <DefRow label="Risk"><Pill tone={RISK_TONE[r.risk]}>{r.risk}</Pill></DefRow>
            {r.confidence && (
              <DefRow label="Extraction confidence">
                <Pill tone={r.confidence === 'high' ? 'green' : r.confidence === 'medium' ? 'amber' : 'red'}>{r.confidence}</Pill>
              </DefRow>
            )}
          </div>

          {/* Suggested approach */}
          {r.suggestedApproach && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Suggested response approach</div>
              <p className="text-sm text-slate-700 leading-relaxed">{r.suggestedApproach}</p>
            </div>
          )}

          {/* Evidence */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Evidence</div>
            {evidence.length === 0 ? (
              <p className="text-sm text-slate-400">No evidence tracked for this requirement.</p>
            ) : (
              <ul className="space-y-2">
                {evidence.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 text-sm p-2.5 rounded-lg border border-slate-100">
                    <div className="flex items-start gap-2 min-w-0">
                      {e.status === 'found' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <Database className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <div className="text-slate-800">{e.matchedFile ?? e.type}</div>
                        <div className="text-xs text-slate-400 truncate">{e.detail}</div>
                      </div>
                    </div>
                    <Pill tone={e.status === 'found' ? 'green' : e.status === 'check' ? 'amber' : 'red'}>{e.status === 'found' ? 'Found' : e.status === 'check' ? 'Check' : 'Missing'}</Pill>
                  </li>
                ))}
              </ul>
            )}
            {showUpload ? (
              <div className="mt-3">
                <FileDropzone size="compact" label="Drop evidence here" hint="browse files" onFiles={uploadEvidence} />
              </div>
            ) : missing.length > 0 && (
              <GhostButton className="mt-3" onClick={() => setShowUpload(true)}><Upload className="w-4 h-4" /> Upload evidence</GhostButton>
            )}
          </div>

          {/* Notes */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Notes & comments</div>
            <textarea value={r.notes} onChange={(e) => patch(r.id, { notes: e.target.value })} rows={3}
              placeholder="Notes visible to the bid team…"
              className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none resize-none" />
          </div>

          {/* Actions */}
          <div className="pt-1 border-t border-slate-100">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2 pt-3">Actions</div>
            <div className="grid grid-cols-2 gap-2">
              <GhostButton onClick={() => { onNavigate('drafts'); onClose(); }}><Edit3 className="w-4 h-4" /> Draft response</GhostButton>
              <GhostButton onClick={() => { onNavigate('evidence'); onClose(); }}><Database className="w-4 h-4" /> Find evidence</GhostButton>
              <GhostButton onClick={askSme}><MessageCircleQuestion className="w-4 h-4" /> Ask SME</GhostButton>
              <GhostButton onClick={() => { patch(r.id, { compliance: 'Compliant', status: 'Complete' }); toast(`${r.id} marked compliant.`); }}><CheckCircle2 className="w-4 h-4" /> Mark compliant</GhostButton>
              <GhostButton onClick={raiseClarification}><FileText className="w-4 h-4" /> Raise clarification</GhostButton>
              <GhostButton onClick={addToDepartures}><Scale className="w-4 h-4" /> Add to departures</GhostButton>
              <GhostButton onClick={addToRisks}><ShieldAlert className="w-4 h-4" /> Add to risk register</GhostButton>
              <GhostButton onClick={() => { patch(r.id, { status: 'In review' }); toast(`${r.id} sent for review.`); }}><Send className="w-4 h-4" /> Send for review</GhostButton>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
