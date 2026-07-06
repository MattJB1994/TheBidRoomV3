/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Closeout & Memory — post-submission learning capture plus a lightweight
 * Client & Sector Memory view. The memory is derived only from blueprints
 * the workspace actually has; it never claims to "know" a client without
 * data.
 */
import React, { useState } from 'react';
import { GraduationCap, Brain, Save, Trophy, Flag } from 'lucide-react';
import { PageHeader, Card, Pill, PrimaryButton, EmptyState, Segmented } from '../ui';
import { BlueprintPageProps, NoBlueprint } from './shared';
import { TenderCloseout, CloseoutOutcome } from '../../blueprint/types';
import { buildMemory, BlueprintWithContext, MemoryDimension } from '../../blueprint/clientMemory';
import { MODULE_NAME } from '../../blueprint/engine';
import { toast } from '../../lib/toast';

const OUTCOMES: CloseoutOutcome[] = ['Not submitted', 'Submitted', 'Won', 'Lost', 'Withdrawn', 'Pending'];

const FIELDS: { key: keyof TenderCloseout; label: string }[] = [
  { key: 'clientFeedback', label: 'Client feedback' },
  { key: 'whatWorked', label: 'What worked' },
  { key: 'whatSlowedUs', label: 'What slowed the team down' },
  { key: 'evidenceReused', label: 'Evidence reused' },
  { key: 'sectionsReused', label: 'Sections reused' },
  { key: 'gapsEncountered', label: 'Gaps encountered' },
  { key: 'lessons', label: 'Lessons for next bid' },
  { key: 'commercialLessons', label: 'Commercial lessons' },
  { key: 'addendaLessons', label: 'Addenda lessons' },
  { key: 'reusablePatterns', label: 'Reusable response patterns' },
];

export default function CloseoutPage(props: BlueprintPageProps & { allBlueprintsContext?: BlueprintWithContext[] }) {
  const { tender, bp, update, onNavigate, allBlueprintsContext } = props;
  const [dimension, setDimension] = useState<MemoryDimension>('client');

  if (!tender || !bp) return <div className="space-y-5"><PageHeader title="Closeout & Memory" subtitle="Capture lessons after submission." /><NoBlueprint onNavigate={onNavigate} hasTender={!!tender} /></div>;

  const closeout = bp.closeout ?? { outcome: 'Not submitted' as CloseoutOutcome };
  const [draft, setDraft] = useState<TenderCloseout>(closeout);

  const save = () => {
    update((b) => ({ ...b, closeout: { ...draft, updatedAt: new Date().toISOString() } }));
    toast('Closeout saved — lessons feed Client & Sector Memory.');
  };

  const memory = allBlueprintsContext && allBlueprintsContext.length
    ? buildMemory(allBlueprintsContext, dimension)
    : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Closeout & Memory" subtitle="Capture what happened after submission, and see reusable patterns across your tenders." />

      {/* Outcome banner for a finished tender */}
      {(draft.outcome === 'Won' || draft.outcome === 'Lost') && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${draft.outcome === 'Won' ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${draft.outcome === 'Won' ? 'bg-emerald-600 text-white' : 'bg-slate-400 text-white'}`}>
            {draft.outcome === 'Won' ? <Trophy className="w-4.5 h-4.5" /> : <Flag className="w-4.5 h-4.5" />}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Tender {draft.outcome.toLowerCase()}{draft.outcome === 'Won' ? ' 🎉' : ''}</div>
            {draft.clientFeedback && <div className="text-xs text-slate-600 mt-0.5">{draft.clientFeedback}</div>}
          </div>
        </div>
      )}

      {/* Closeout capture */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-indigo-600" /><span className="text-sm font-semibold text-slate-900">Tender closeout</span></div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Outcome</label>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOMES.map((o) => (
              <button key={o} onClick={() => setDraft({ ...draft, outcome: o })}
                className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${draft.outcome === o ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}>
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
              <textarea value={(draft[f.key] as string) ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                rows={2} className="w-full text-sm p-2.5 border border-slate-200 rounded-lg bg-white resize-y" />
            </div>
          ))}
        </div>
        <PrimaryButton onClick={save}><Save className="w-4 h-4" /> Save closeout</PrimaryButton>
      </Card>

      {/* Client & Sector Memory */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Brain className="w-4 h-4 text-indigo-600" /><span className="text-sm font-semibold text-slate-900">Client &amp; Sector Memory</span></div>
          <Segmented<MemoryDimension> value={dimension} onChange={setDimension} options={[
            { id: 'client', label: 'Client' }, { id: 'sector', label: 'Sector' }, { id: 'tenderType', label: 'Tender type' },
          ]} />
        </div>
        <p className="text-xs text-slate-500">Derived only from the tenders in this workspace — nothing is assumed about a client without data.</p>
        {memory.length === 0 ? (
          <EmptyState icon={<Brain className="w-5 h-5" />} title="Not enough data yet" body="Build and analyse more tenders to surface common requirements, evidence and patterns by client, sector and tender type." />
        ) : (
          <div className="space-y-3">
            {memory.map((g) => (
              <div key={g.key} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-slate-900">{g.key}</span>
                  <Pill tone="slate">{g.tenderCount} tender{g.tenderCount === 1 ? '' : 's'}</Pill>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600">
                  {g.commonModules.length > 0 && <div><span className="font-semibold text-slate-700">Common modules:</span> {g.commonModules.map((k) => MODULE_NAME[k]).join(', ')}</div>}
                  {g.commonEvidence.length > 0 && <div><span className="font-semibold text-slate-700">Common evidence:</span> {g.commonEvidence.join(', ')}</div>}
                  {g.commonRequirements.length > 0 && <div><span className="font-semibold text-slate-700">Common requirement types:</span> {g.commonRequirements.join(', ')}</div>}
                  {g.commonCommercialAssumptions.length > 0 && <div><span className="font-semibold text-slate-700">Common commercial:</span> {g.commonCommercialAssumptions.join('; ')}</div>}
                  {g.commonTerminology.length > 0 && <div><span className="font-semibold text-slate-700">Terminology:</span> {g.commonTerminology.join(', ')}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
