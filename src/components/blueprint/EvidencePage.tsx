/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Evidence — the evidence map for the tender. Every requirement that
 * needs proof is tracked here with a clear status: green (found),
 * amber (needs checking), red (missing). Missing items are actionable:
 * upload straight into the project knowledge base, link an existing
 * file, ask an SME, mark not required, raise a clarification, or add
 * the gap to the risk register.
 */
import React, { useState } from 'react';
import { Database, CheckCircle2, AlertTriangle, XCircle, Link2, MessageCircleQuestion, MinusCircle, ShieldAlert, FileQuestion, Upload, Copy, MoreHorizontal } from 'lucide-react';
import { PageHeader, Card, Pill, GhostButton, PrimaryButton, Segmented, EmptyState, Drawer, DefRow } from '../ui';
import { BlueprintPageProps, NoBlueprint, EVIDENCE_TONE, EVIDENCE_LABEL } from './shared';
import { EvidenceItem, RiskItem } from '../../blueprint/types';
import { MODULE_NAME } from '../../blueprint/engine';
import { buildSmeRequestFromEvidence, SmeRequest } from '../../blueprint/clarificationBuilder';
import FileDropzone from '../FileDropzone';
import { KBFile } from '../../types';
import { formatBytes } from '../../lib/format';
import { toast } from '../../lib/toast';

type Filter = 'all' | 'missing' | 'check' | 'found';

const KB_CATEGORY_FOR: Record<string, KBFile['category']> = {
  'CV': 'CV', 'Case study': 'PROJECT_EVIDENCE', 'Project sheet': 'PROJECT_EVIDENCE',
  'Past tender response': 'PROJECT_EVIDENCE', 'Methodology': 'CAPABILITY', 'Policy': 'POLICY',
  'Insurance certificate': 'CREDENTIAL', 'Accreditation': 'CREDENTIAL', 'Program': 'PROJECT_EVIDENCE',
  'Pricing assumption': 'BENCHMARK', 'Commercial note': 'BENCHMARK', 'Client reference': 'PROJECT_EVIDENCE',
  'Technical standard': 'CAPABILITY', 'Design example': 'PROJECT_EVIDENCE', 'Safety document': 'POLICY',
  'Assurance document': 'CAPABILITY',
};

export default function EvidencePage(props: BlueprintPageProps) {
  const { tender, bp, update, kbFiles, onAddKBFile, onNavigate } = props;
  const [filter, setFilter] = useState<Filter>('all');
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [linkFor, setLinkFor] = useState<EvidenceItem | null>(null);
  const [smeRequest, setSmeRequest] = useState<SmeRequest | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  if (!tender || !bp) return <div className="space-y-5"><PageHeader title="Evidence" subtitle="What the tender needs proven, and whether you can prove it." /><NoBlueprint onNavigate={onNavigate} hasTender={!!tender} /></div>;

  const counts = {
    all: bp.evidence.length,
    missing: bp.evidence.filter((e) => e.status === 'missing').length,
    check: bp.evidence.filter((e) => e.status === 'check').length,
    found: bp.evidence.filter((e) => e.status === 'found').length,
  };
  const visible = filter === 'all' ? bp.evidence : bp.evidence.filter((e) => e.status === filter);
  const ordered = [...visible].sort((a, b) => {
    const rank = { missing: 0, check: 1, found: 2 } as const;
    return rank[a.status] - rank[b.status];
  });

  const patchItem = (id: string, p: Partial<EvidenceItem>) =>
    update((b) => ({ ...b, evidence: b.evidence.map((e) => (e.id === id ? { ...e, ...p } : e)) }));

  /* ── Actions ─────────────────────────────────────────────────── */

  const handleUpload = (item: EvidenceItem, files: File[]) => {
    files.forEach((file, idx) => {
      const kb: KBFile = {
        id: `f_ev_${Date.now()}_${idx}`, name: file.name,
        category: KB_CATEGORY_FOR[item.type] ?? 'UNSORTED',
        size: formatBytes(file.size), uploadedAt: new Date().toISOString().split('T')[0],
        uploadedBy: 'You', lastVerifiedAt: new Date().toISOString().split('T')[0], isStale: false,
        objectUrl: URL.createObjectURL(file),
      };
      onAddKBFile(kb, file);
    });
    patchItem(item.id, { status: 'found', matchedFile: files[0].name, resolution: 'uploaded', detail: `Uploaded: ${files.map((f) => f.name).join(', ')}` });
    markRequirementCovered(item);
    setUploadFor(null);
    toast(`${files.length === 1 ? 'Evidence' : `${files.length} files`} added to the project knowledge base and linked.`);
  };

  const handleLink = (item: EvidenceItem, file: KBFile) => {
    patchItem(item.id, { status: file.isStale ? 'check' : 'found', matchedFile: file.name, resolution: 'linked', detail: `Linked to ${file.name}${file.isStale ? ' — file is stale, re-verify before submission' : ''}.` });
    if (!file.isStale) markRequirementCovered(item);
    setLinkFor(null);
    toast(`Linked to ${file.name}.`);
  };

  const markRequirementCovered = (item: EvidenceItem) => {
    if (!item.requirementId) return;
    update((b) => {
      const stillOpen = b.evidence.some((e) => e.requirementId === item.requirementId && e.id !== item.id && e.status !== 'found');
      return stillOpen ? b : { ...b, requirements: b.requirements.map((r) => (r.id === item.requirementId ? { ...r, compliance: 'Compliant' as const, status: r.status === 'Not started' ? 'In progress' as const : r.status } : r)) };
    });
  };

  const askSme = (item: EvidenceItem) => {
    // Build a proper SME request (copyable message) and also raise the
    // review task so it's tracked.
    const request = buildSmeRequestFromEvidence(bp, item);
    setSmeRequest(request);
    update((b) => ({
      ...b,
      reviews: [{
        id: `rev_sme_${Date.now()}`, title: request.title, moduleKey: item.moduleKey,
        discipline: (request.suggestedRecipientRole === 'SME' ? 'Technical' : request.suggestedRecipientRole),
        reviewerId: null, dueDate: null, status: 'Not started',
        comments: request.suggestedMessage, requiredChanges: '',
      }, ...b.reviews],
    }));
    toast('SME request drafted — copy the message and track the task on Reviews.');
  };

  const notRequired = (item: EvidenceItem) => {
    patchItem(item.id, { status: 'found', resolution: 'not-required', matchedFile: null, detail: 'Marked not required by the bid team.' });
    toast('Marked not required.');
  };

  const clarify = (item: EvidenceItem) => {
    patchItem(item.id, { resolution: 'clarification', notes: 'Clarification raised with the client about acceptable evidence.' });
    update((b) => ({
      ...b,
      reviews: [{
        id: `rev_clar_${Date.now()}`, title: `Clarification to client — ${item.type}`, moduleKey: null,
        discipline: 'Bid Manager', reviewerId: b.meta.bidManagerId, dueDate: null, status: 'Not started',
        comments: `What is acceptable evidence for: ${item.label}`, requiredChanges: '',
      }, ...b.reviews],
    }));
    toast('Clarification drafted — a review task tracks its submission.');
  };

  const addRisk = (item: EvidenceItem) => {
    const risk: RiskItem = {
      id: `risk_ev_${Date.now()}`, title: `Evidence gap: ${item.type}`, detail: item.label,
      rating: 'Medium', source: 'Evidence gap', requirementId: item.requirementId,
      mitigation: '', ownerId: bp.meta.bidManagerId, status: 'Open',
    };
    update((b) => ({ ...b, risks: [risk, ...b.risks] }));
    patchItem(item.id, { resolution: 'risk' });
    toast('Added to the risk register.');
  };

  /* ── Render ──────────────────────────────────────────────────── */

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gaps"
        subtitle={`Everything outstanding before this tender can be submitted.`}
        actions={
          <Segmented<Filter> value={filter} onChange={setFilter} options={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'missing', label: 'Missing', count: counts.missing },
            { id: 'check', label: 'Check', count: counts.check },
            { id: 'found', label: 'Found', count: counts.found },
          ]} />
        }
      />

      {/* Consolidated gaps summary — evidence + mandatory requirements +
          commercial + addenda, so "Gaps" is the one place to see what's
          outstanding. */}
      {(() => {
        const openCommercial = bp.commercial.filter((c) => c.status === 'Open').length;
        const pendingAddenda = bp.addenda.filter((a) => !a.reviewed).length;
        const unansweredReqs = bp.requirements.filter((r) => r.mandatory && r.status !== 'Complete').length;
        const chip = (n: number, label: string, page: string, tone: 'red' | 'amber' | 'slate') => (
          <button onClick={() => onNavigate(page)} disabled={n === 0}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50 ${n > 0 ? (tone === 'red' ? 'border-red-200 bg-red-50/50 hover:bg-red-50' : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50') : 'border-slate-200 bg-white'}`}>
            <span className={`text-lg font-bold ${n > 0 ? (tone === 'red' ? 'text-red-700' : 'text-amber-700') : 'text-slate-400'}`}>{n}</span>
            <span className="text-xs text-slate-600">{label}</span>
          </button>
        );
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {chip(counts.missing, 'missing evidence', 'evidence', 'red')}
            {chip(unansweredReqs, 'mandatory requirements open', 'requirements', 'red')}
            {chip(openCommercial, 'commercial items open', 'commercial', 'amber')}
            {chip(pendingAddenda, 'addenda to review', 'documents', 'amber')}
          </div>
        );
      })()}

      {ordered.length === 0 ? (
        <EmptyState icon={<Database className="w-5 h-5" />} title="No evidence items"
          body={filter === 'all' ? 'The blueprint didn\u2019t identify evidence requirements for this tender.' : 'Nothing in this status.'} />
      ) : (
        <div className="space-y-3">
          {ordered.map((item) => {
            const Icon = item.status === 'found' ? CheckCircle2 : item.status === 'check' ? AlertTriangle : XCircle;
            const iconTone = item.status === 'found' ? 'text-emerald-600' : item.status === 'check' ? 'text-amber-600' : 'text-red-500';
            return (
              <Card key={item.id} className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className={`w-4.5 h-4.5 shrink-0 mt-0.5 ${iconTone}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 leading-snug">{item.label}</span>
                        <Pill tone={EVIDENCE_TONE[item.status]}>{EVIDENCE_LABEL[item.status]}</Pill>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{item.detail}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1.5">
                        <span>{item.type}</span>
                        {item.moduleKey && <span>· {MODULE_NAME[item.moduleKey]}</span>}
                        {item.requirementId && <span>· {item.requirementId}</span>}
                      </div>
                    </div>
                  </div>

                  {item.status !== 'found' && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <PrimaryButton onClick={() => setUploadFor(item.id)} className="!py-1.5"><Upload className="w-3.5 h-3.5" /> Upload</PrimaryButton>
                      <div className="relative">
                        <button onClick={() => setMenuFor(menuFor === item.id ? null : item.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors" title="More actions">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuFor === item.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                            <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                              <GapMenuItem onClick={() => { setMenuFor(null); setLinkFor(item); }} icon={<Link2 className="w-3.5 h-3.5" />}>Link existing</GapMenuItem>
                              <GapMenuItem onClick={() => { setMenuFor(null); askSme(item); }} icon={<MessageCircleQuestion className="w-3.5 h-3.5" />}>Ask SME</GapMenuItem>
                              <GapMenuItem onClick={() => { setMenuFor(null); clarify(item); }} icon={<FileQuestion className="w-3.5 h-3.5" />}>Clarify</GapMenuItem>
                              <GapMenuItem onClick={() => { setMenuFor(null); addRisk(item); }} icon={<ShieldAlert className="w-3.5 h-3.5" />}>Add risk</GapMenuItem>
                              <div className="my-1 border-t border-slate-100" />
                              <GapMenuItem onClick={() => { setMenuFor(null); notRequired(item); }} icon={<MinusCircle className="w-3.5 h-3.5" />}>Not required</GapMenuItem>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {uploadFor === item.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <FileDropzone size="compact" label="Drop evidence here" hint="browse files" onFiles={(files) => handleUpload(item, files)} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Link-existing drawer */}
      <Drawer open={!!linkFor} onClose={() => setLinkFor(null)} title="Link existing evidence"
        subtitle={linkFor ? `Choose a knowledge-base file for: ${linkFor.label.slice(0, 80)}` : ''}>
        {linkFor && (
          <div className="space-y-1.5">
            {kbFiles.length === 0 && <p className="text-sm text-slate-400">The knowledge base is empty — upload evidence instead.</p>}
            {kbFiles.map((f) => (
              <button key={f.id} onClick={() => handleLink(linkFor, f)}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 text-left transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{f.name}</div>
                  <div className="text-xs text-slate-400">{f.category.replace(/_/g, ' ')} · {f.size}{f.isStale ? ' · stale' : ''}</div>
                </div>
                <Link2 className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </Drawer>

      <Drawer open={!!smeRequest} onClose={() => setSmeRequest(null)} title="SME request">
        {smeRequest && (
          <div className="space-y-4">
            <div className="space-y-1">
              <DefRow label="Required input">{smeRequest.requiredInput}</DefRow>
              <DefRow label="Evidence needed">{smeRequest.evidenceNeeded}</DefRow>
              {smeRequest.linkedRequirementId && <DefRow label="Linked requirement">{smeRequest.linkedRequirementId}</DefRow>}
              {smeRequest.linkedModuleName && <DefRow label="Linked module">{smeRequest.linkedModuleName}</DefRow>}
              <DefRow label="Suggested recipient">{smeRequest.suggestedRecipientRole}</DefRow>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-600 mb-1">Suggested message</div>
              <div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed">{smeRequest.suggestedMessage}</div>
              <GhostButton onClick={() => { navigator.clipboard?.writeText(smeRequest.suggestedMessage); toast('Message copied.'); }} className="mt-2"><Copy className="w-3.5 h-3.5" /> Copy message</GhostButton>
            </div>
            <p className="text-xs text-slate-500">A review task has also been created — track it on the Reviews page.</p>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function GapMenuItem({ children, onClick, icon }: { children: React.ReactNode; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
      <span className="text-slate-400">{icon}</span>
      {children}
    </button>
  );
}
