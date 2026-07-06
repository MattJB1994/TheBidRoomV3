/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Commercial Assumptions Register — first-class commercial control. The
 * qualifications, exclusions, pricing assumptions, provisional/optional
 * items, client dependencies and contract concerns the bid is taking a
 * position on. Seeded from the tender's commercial signals; the team
 * acknowledges, approves and adds items. Unacknowledged Open items gate
 * the commercial export packs (see exportReadiness.ts).
 */
import React, { useState } from 'react';
import { Scale, Plus, CheckCircle2, Wand2, Copy } from 'lucide-react';
import { PageHeader, Card, Pill, GhostButton, PrimaryButton, Drawer, DefRow, EmptyState, Segmented } from '../ui';
import { BlueprintPageProps, NoBlueprint, teamName } from './shared';
import { CommercialItem, CommercialItemType, CommercialItemStatus } from '../../blueprint/types';
import { generateClarifications, ClarificationItem } from '../../blueprint/clarificationBuilder';
import { toast } from '../../lib/toast';

type Filter = 'open' | 'all';

const TYPES: CommercialItemType[] = [
  'Pricing assumption', 'Scope exclusion', 'Clarification', 'Departure',
  'Provisional item', 'Optional item', 'Client dependency',
  'Information gap', 'Commercial risk', 'Contract concern',
];

const STATUS_TONE: Record<CommercialItemStatus, 'slate' | 'amber' | 'green' | 'red'> = {
  Open: 'amber', Acknowledged: 'slate', Approved: 'green', Withdrawn: 'red',
};

const uid = () => `com_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export default function CommercialPage({ tender, bp, update, team, onNavigate }: BlueprintPageProps) {
  const [filter, setFilter] = useState<Filter>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [clarifications, setClarifications] = useState<ClarificationItem[] | null>(null);
  const [draft, setDraft] = useState<{ type: CommercialItemType; text: string; clauseRef: string }>({ type: 'Pricing assumption', text: '', clauseRef: '' });

  if (!tender || !bp) {
    return <div className="space-y-5"><PageHeader title="Commercial" subtitle="The Commercial Assumptions Register." /><NoBlueprint onNavigate={onNavigate} hasTender={!!tender} /></div>;
  }

  const register = bp.commercial ?? [];
  const openItems = register.filter((c) => c.status === 'Open');
  const visible = filter === 'open' ? openItems : register;
  const open = register.find((c) => c.id === openId) ?? null;

  const patch = (id: string, p: Partial<CommercialItem>) =>
    update((b) => ({ ...b, commercial: (b.commercial ?? []).map((c) => (c.id === id ? { ...c, ...p } : c)) }));

  const add = () => {
    if (!draft.text.trim()) return;
    const item: CommercialItem = {
      id: uid(), type: draft.type, text: draft.text.trim(),
      clauseRef: draft.clauseRef.trim() || undefined,
      status: 'Open', exportReady: false, source: 'Manual', createdAt: new Date().toISOString(),
      linkedModuleKey: null, reviewerId: null,
    };
    update((b) => ({ ...b, commercial: [item, ...(b.commercial ?? [])] }));
    setDraft({ type: 'Pricing assumption', text: '', clauseRef: '' });
    setAdding(false);
    toast('Commercial item added to the register.');
  };

  const genClarifications = () => {
    const items = generateClarifications(bp);
    setClarifications(items);
    toast(items.length ? `Generated ${items.length} clarification/departure item(s).` : 'No clarifications or departures suggested from the current blueprint.', items.length ? 'info' : 'success');
  };

  // Adds a generated clarification/departure into the register as a
  // tracked commercial item so it survives and gates export where relevant.
  const acceptClarification = (item: ClarificationItem) => {
    const typeMap: Record<string, CommercialItemType> = {
      'Clarification': 'Clarification', 'Assumption': 'Pricing assumption', 'Exclusion': 'Scope exclusion',
      'Qualification': 'Departure', 'Departure': 'Departure', 'Provisional item': 'Provisional item', 'Client dependency': 'Client dependency',
    };
    update((b) => ({
      ...b,
      commercial: [{
        id: uid(), type: typeMap[item.type] ?? 'Clarification', text: item.proposedWording,
        clauseRef: item.sourceClause ?? undefined, status: 'Open', exportReady: false,
        source: 'Manual', createdAt: new Date().toISOString(), linkedModuleKey: null, reviewerId: null,
      }, ...(b.commercial ?? [])],
    }));
    setClarifications((prev) => prev?.filter((c) => c.id !== item.id) ?? null);
    toast('Added to the register.');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Commercial"
        subtitle={`${openItems.length} open · ${register.filter((c) => c.exportReady).length} cleared for export.`}
        actions={
          <>
            <Segmented<Filter> value={filter} onChange={setFilter} options={[
              { id: 'open', label: 'Open', count: openItems.length },
              { id: 'all', label: 'All', count: register.length },
            ]} />
            <GhostButton onClick={genClarifications}><Wand2 className="w-4 h-4" /> Generate clarifications &amp; departures</GhostButton>
            <PrimaryButton onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add item</PrimaryButton>
          </>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 text-xs text-slate-500">
          The register keeps qualifications, exclusions and pricing assumptions visible. Open items block the commercial export packs until they are acknowledged or approved.
        </div>
        {visible.length === 0 ? (
          <EmptyState icon={<Scale className="w-5 h-5" />} title={filter === 'open' ? 'No open commercial items' : 'The register is empty'}
            body={filter === 'open' ? 'Every commercial position has been acknowledged or approved.' : 'Add pricing assumptions, exclusions, departures and dependencies as you build the bid.'} />
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((c) => (
              <button key={c.id} onClick={() => setOpenId(c.id)}
                className="w-full text-left px-5 py-3.5 hover:bg-slate-50/70 transition-colors flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Pill tone="slate">{c.type}</Pill>
                    {c.clauseRef && <span className="text-xs text-slate-400">{c.clauseRef}</span>}
                    {c.source === 'Addendum' && <Pill tone="amber">From addendum</Pill>}
                  </div>
                  <div className="text-sm text-slate-800 truncate">{c.text}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.exportReady && <Pill tone="green">Export ready</Pill>}
                  <Pill tone={STATUS_TONE[c.status]} dot>{c.status}</Pill>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Detail drawer */}
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open?.type ?? 'Commercial item'}>
        {open && (
          <div className="space-y-5">
            <p className="text-sm text-slate-800 leading-relaxed">{open.text}</p>
            <div className="space-y-1">
              <DefRow label="Type"><Pill tone="slate">{open.type}</Pill></DefRow>
              <DefRow label="Status"><Pill tone={STATUS_TONE[open.status]} dot>{open.status}</Pill></DefRow>
              {open.clauseRef && <DefRow label="Tender clause">{open.clauseRef}</DefRow>}
              {open.linkedSchedule && <DefRow label="Pricing schedule">{open.linkedSchedule}</DefRow>}
              <DefRow label="Reviewer">{open.reviewerId ? teamName(team, open.reviewerId) : 'Unassigned'}</DefRow>
              <DefRow label="Source">{open.source}</DefRow>
              <DefRow label="Export">{open.exportReady ? 'Cleared for export' : 'Not yet cleared'}</DefRow>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</div>
              <div className="flex flex-wrap gap-2">
                {(['Open', 'Acknowledged', 'Approved', 'Withdrawn'] as CommercialItemStatus[]).map((st) => (
                  <GhostButton key={st} onClick={() => patch(open.id, { status: st })}>
                    {open.status === st ? '✓ ' : ''}{st}
                  </GhostButton>
                ))}
              </div>
            </div>

            <GhostButton onClick={() => patch(open.id, { exportReady: !open.exportReady })}>
              <CheckCircle2 className="w-4 h-4" /> {open.exportReady ? 'Mark not export-ready' : 'Clear for export'}
            </GhostButton>
          </div>
        )}
      </Drawer>

      {/* Add drawer */}
      <Drawer open={adding} onClose={() => setAdding(false)} title="Add commercial item">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CommercialItemType })}
              className="w-full text-sm p-2.5 border border-slate-200 rounded-lg bg-white">
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Commercial position</label>
            <textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={3}
              placeholder="e.g. Rates assume client-provided track access during possessions."
              className="w-full text-sm p-2.5 border border-slate-200 rounded-lg bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tender clause (optional)</label>
            <input value={draft.clauseRef} onChange={(e) => setDraft({ ...draft, clauseRef: e.target.value })}
              placeholder="e.g. Conditions §12.3" className="w-full text-sm p-2.5 border border-slate-200 rounded-lg bg-white" />
          </div>
          <PrimaryButton onClick={add}><Plus className="w-4 h-4" /> Add to register</PrimaryButton>
        </div>
      </Drawer>

      <Drawer open={!!clarifications} onClose={() => setClarifications(null)} title="Generated clarifications & departures">
        {clarifications && (clarifications.length === 0 ? (
          <EmptyState icon={<Wand2 className="w-5 h-5" />} title="Nothing to suggest" body="No ambiguous clauses, client-data reliance or unmet mandatory requirements were found to convert." />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Draft wording from requirement gaps, commercial risks and ambiguous clauses. Copy, or add to the register to track it.</p>
            {clarifications.map((c) => (
              <div key={c.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Pill tone="slate">{c.type}</Pill>
                  {c.sourceClause && <span className="text-xs text-slate-400">{c.sourceClause}</span>}
                  {c.affectsExport && <Pill tone="amber">Affects export</Pill>}
                </div>
                <div className="text-xs text-slate-500">{c.reason}</div>
                <div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2.5">{c.proposedWording}</div>
                <div className="flex gap-2">
                  <GhostButton onClick={() => { navigator.clipboard?.writeText(c.proposedWording); toast('Wording copied.'); }}><Copy className="w-3.5 h-3.5" /> Copy</GhostButton>
                  <GhostButton onClick={() => acceptClarification(c)}><Plus className="w-3.5 h-3.5" /> Add to register</GhostButton>
                </div>
              </div>
            ))}
          </div>
        ))}
      </Drawer>

    </div>
  );
}
