/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workflow UI: the persistent stage stepper (Intake → … → Closeout) and
 * the Next Best Action panel that replaces scattered action buttons.
 * Calm, light, restrained — one primary action.
 */
import React from 'react';
import { Check, ArrowRight, AlertTriangle } from 'lucide-react';
import { STAGES, StageId, StageStatus, NextBestAction } from '../blueprint/workflow';

const DOT: Record<StageStatus, string> = {
  'done': 'bg-emerald-500 text-white border-emerald-500',
  'current': 'bg-blue-600 text-white border-blue-600',
  'blocked': 'bg-white text-red-600 border-red-400',
  'not-started': 'bg-white text-slate-400 border-slate-200',
};

export function StageStepper({ statuses, active, onNavigate }: {
  statuses: Record<StageId, StageStatus>;
  active: StageId | null;
  onNavigate: (page: string) => void;
}) {
  return (
    <nav aria-label="Workflow stages" className="w-full overflow-x-auto">
      <ol className="flex items-center gap-1 min-w-max py-1">
        {STAGES.map((stage, i) => {
          const status = statuses[stage.id];
          const isActive = active === stage.id;
          return (
            <li key={stage.id} className="flex items-center">
              <button
                onClick={() => onNavigate(stage.page)}
                className={`group flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border transition-colors ${
                  isActive ? 'border-blue-200 bg-blue-50/60' : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] font-semibold shrink-0 ${DOT[status]}`}>
                  {status === 'done' ? <Check className="w-3 h-3" /> : status === 'blocked' ? <AlertTriangle className="w-3 h-3" /> : i + 1}
                </span>
                <span className={`text-sm font-medium ${isActive ? 'text-blue-700' : status === 'blocked' ? 'text-red-600' : 'text-slate-600'}`}>{stage.label}</span>
              </button>
              {i < STAGES.length - 1 && <span className="text-slate-300 mx-0.5">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * In-stage tab strip so sibling pages within a workflow stage feel like
 * one surface (Blueprint ⇢ Requirements ⇢ Modules; Gaps ⇢ Commercial ⇢
 * Risks). Purely navigational — the pages themselves are unchanged.
 */
export function StageTabs({ tabs, current, onNavigate }: {
  tabs: { page: string; label: string; count?: number }[];
  current: string;
  onNavigate: (page: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-100 -mt-1 mb-4">
      {tabs.map((t) => {
        const active = t.page === current;
        return (
          <button key={t.page} onClick={() => onNavigate(t.page)}
            className={`relative px-3 py-2 text-sm font-medium transition-colors ${active ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>
            <span className="flex items-center gap-1.5">
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>
              )}
            </span>
            {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-blue-600 rounded-full" />}
          </button>
        );
      })}
    </div>
  );
}

export function NextBestActionPanel({ nba, onNavigate }: { nba: NextBestAction; onNavigate: (page: string) => void }) {
  return (
    <div className={`rounded-xl border p-4 ${nba.urgent ? 'border-amber-200 bg-amber-50/40' : 'border-blue-100 bg-blue-50/40'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Next best action</div>
          <div className="text-sm font-semibold text-slate-900">{nba.action}</div>
          <div className="text-xs text-slate-600 mt-1"><span className="font-medium">Why it matters:</span> {nba.why}</div>
          <div className="text-xs text-slate-600"><span className="font-medium">Unlocks:</span> {nba.unlocks}</div>
        </div>
        <button
          onClick={() => onNavigate(nba.page)}
          className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          {nba.buttonLabel} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
