/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Risks — the bid risk register. Populated by the analysis (runway,
 * evidence gaps, commercial reconciliation), addendum impacts, and
 * anything the team adds manually.
 */
import React, { useState } from 'react';
import { ShieldAlert, Plus, CheckCircle2, Radar } from 'lucide-react';
import { PageHeader, Card, Pill, GhostButton, PrimaryButton, Drawer, DefRow, EmptyState, Segmented } from '../ui';
import { BlueprintPageProps, NoBlueprint, RISK_TONE, teamName } from './shared';
import { RiskItem, RiskRating } from '../../blueprint/types';
import { runRiskRadar } from '../../blueprint/riskRadar';
import { toast } from '../../lib/toast';

type Filter = 'open' | 'all';

export default function RisksPage({ tender, bp, update, team, onNavigate }: BlueprintPageProps) {
  const [filter, setFilter] = useState<Filter>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!tender || !bp) return <div className="space-y-5"><PageHeader title="Risks" subtitle="The bid risk register." /><NoBlueprint onNavigate={onNavigate} hasTender={!!tender} /></div>;

  const runRadar = () => {
    const radar = runRiskRadar(bp);
    // Merge, de-duping against existing risks by title so re-running is safe.
    update((b) => {
      const existingTitles = new Set(b.risks.map((r) => r.title));
      const additions = radar.filter((r) => !existingTitles.has(r.title));
      return { ...b, risks: [...additions, ...b.risks] };
    });
    const added = radar.filter((r) => !bp.risks.some((x) => x.title === r.title)).length;
    toast(added ? `Risk Radar flagged ${added} new tender risk${added === 1 ? '' : 's'}.` : 'Risk Radar found no new risks — the register is up to date.', added ? 'info' : 'success');
  };

  const visible = (filter === 'open' ? bp.risks.filter((r) => r.status === 'Open') : bp.risks)
    .slice()
    .sort((a, b) => ({ High: 0, Medium: 1, Low: 2, None: 3 }[a.rating] - { High: 0, Medium: 1, Low: 2, None: 3 }[b.rating]));
  const open = bp.risks.find((r) => r.id === openId) ?? null;

  const patch = (id: string, p: Partial<RiskItem>) =>
    update((b) => ({ ...b, risks: b.risks.map((r) => (r.id === id ? { ...r, ...p } : r)) }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Risks"
        subtitle={`${bp.risks.filter((r) => r.status === 'Open').length} open · ${bp.risks.filter((r) => r.rating === 'High' && r.status === 'Open').length} high.`}
        actions={
          <>
            <Segmented<Filter> value={filter} onChange={setFilter} options={[
              { id: 'open', label: 'Open', count: bp.risks.filter((r) => r.status === 'Open').length },
              { id: 'all', label: 'All', count: bp.risks.length },
            ]} />
            <GhostButton onClick={runRadar}><Radar className="w-4 h-4" /> Run Risk Radar</GhostButton>
            <PrimaryButton onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add risk</PrimaryButton>
          </>
        }
      />

      {visible.length === 0 ? (
        <EmptyState icon={<ShieldAlert className="w-5 h-5" />} title="No risks here"
          body={filter === 'open' ? 'Nothing open — evidence gaps, addenda and analysis findings land here automatically.' : 'The register is empty.'} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">Rating</th>
                <th className="px-4 py-2.5 font-medium w-full">Risk</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Source</th>
                <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Owner</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="hover:bg-slate-50/70 cursor-pointer transition-colors">
                  <td className="px-4 py-3 align-top"><Pill tone={RISK_TONE[r.rating]}>{r.rating}</Pill></td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-slate-900">{r.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{r.detail}</div>
                  </td>
                  <td className="px-4 py-3 align-top hidden md:table-cell text-slate-600 whitespace-nowrap">{r.source}</td>
                  <td className="px-4 py-3 align-top hidden lg:table-cell text-slate-600 whitespace-nowrap">{teamName(team, r.ownerId)}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap"><Pill tone={r.status === 'Open' ? 'amber' : r.status === 'Closed' || r.status === 'Mitigated' ? 'green' : 'slate'} dot>{r.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Detail drawer */}
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open?.title ?? ''} subtitle={open ? `Source: ${open.source}${open.requirementId ? ` · ${open.requirementId}` : ''}` : ''}>
        {open && (
          <div className="space-y-5">
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-100 rounded-lg p-3">{open.detail}</p>
            <div>
              <DefRow label="Rating">
                <span className="inline-flex gap-1">
                  {(['High', 'Medium', 'Low'] as RiskRating[]).map((rt) => (
                    <button key={rt} onClick={() => patch(open.id, { rating: rt })}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border ${open.rating === rt ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}>{rt}</button>
                  ))}
                </span>
              </DefRow>
              <DefRow label="Owner">{teamName(team, open.ownerId)}</DefRow>
              <DefRow label="Status">{open.status}</DefRow>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Mitigation</label>
              <textarea value={open.mitigation} onChange={(e) => patch(open.id, { mitigation: e.target.value })} rows={3}
                placeholder="How this risk will be reduced or managed…"
                className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none resize-none" />
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <GhostButton onClick={() => { patch(open.id, { status: 'Accepted' }); toast('Risk accepted.'); }}>Accept</GhostButton>
              <GhostButton onClick={() => { patch(open.id, { status: 'Mitigated' }); toast('Risk marked mitigated.'); setOpenId(null); }}>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Mark mitigated
              </GhostButton>
              <GhostButton onClick={() => { patch(open.id, { status: 'Closed' }); toast('Risk closed.'); setOpenId(null); }}>Close</GhostButton>
            </div>
          </div>
        )}
      </Drawer>

      {/* Add drawer */}
      <AddRiskDrawer open={adding} onClose={() => setAdding(false)} onAdd={(risk) => {
        update((b) => ({ ...b, risks: [risk, ...b.risks] }));
        setAdding(false);
        toast('Risk added to the register.');
      }} defaultOwner={bp.meta.bidManagerId} />
    </div>
  );
}

function AddRiskDrawer({ open, onClose, onAdd, defaultOwner }: { open: boolean; onClose: () => void; onAdd: (r: RiskItem) => void; defaultOwner: string | null }) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [rating, setRating] = useState<RiskRating>('Medium');
  React.useEffect(() => { if (open) { setTitle(''); setDetail(''); setRating('Medium'); } }, [open]);
  return (
    <Drawer open={open} onClose={onClose} title="Add risk">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">Risk title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Interface access not confirmed"
            className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">Detail</label>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3}
            className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none resize-none" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">Rating</label>
          <div className="flex gap-2">
            {(['High', 'Medium', 'Low'] as RiskRating[]).map((rt) => (
              <button key={rt} onClick={() => setRating(rt)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${rating === rt ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>{rt}</button>
            ))}
          </div>
        </div>
        <div className="pt-2 flex justify-end">
          <PrimaryButton disabled={!title.trim()} onClick={() => onAdd({
            id: `risk_m_${Date.now()}`, title: title.trim(), detail: detail.trim(), rating,
            source: 'Manual', requirementId: null, mitigation: '', ownerId: defaultOwner, status: 'Open',
          })}>Add to register</PrimaryButton>
        </div>
      </div>
    </Drawer>
  );
}
