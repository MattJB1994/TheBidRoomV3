/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Notifications / activity center. Pulls together things that actually
 * need attention — pending info requests, unanswered clarifications,
 * stale knowledge-base files — plus a recent-activity feed from the
 * audit log, into one bell-icon dropdown instead of scattering them
 * across pages. Each item has a real inline action (mark provided,
 * answer, re-verify) using the same setters/persistence Opportunity.tsx
 * and the Knowledge Base page use — not just a link that sends you away
 * to go fix it elsewhere.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Bell, Clock, AlertTriangle, MessageCircleQuestion, FileWarning, Activity, ArrowRight,
  Check, Send, RefreshCw,
} from 'lucide-react';
import type { KBFile, AuditLog, InfoRequest, Clarification } from '../types';
import { useInfoRequestActions, useClarificationActions } from '../lib/useOpportunityActions';

interface NotificationCenterProps {
  kbFiles: KBFile[];
  auditLog: AuditLog[];
  infoRequests: InfoRequest[];
  setInfoRequests: React.Dispatch<React.SetStateAction<InfoRequest[]>>;
  clarifications: Clarification[];
  setClarifications: React.Dispatch<React.SetStateAction<Clarification[]>>;
  onVerifyKBFile: (id: string) => void;
  onNavigate: (page: string) => void;
}

export default function NotificationCenter({
  kbFiles, auditLog, infoRequests, setInfoRequests, clarifications, setClarifications, onVerifyKBFile, onNavigate,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Same mutation logic Opportunity.tsx's tabs use — see
  // useOpportunityActions.ts. This used to be a separate, drifting copy
  // maintained inline in this file.
  const { setRequestStatus } = useInfoRequestActions(infoRequests, setInfoRequests);
  const { promoteClarification, submitClarification, answerClarification } = useClarificationActions(clarifications, setClarifications);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const staleFiles = kbFiles.filter((f) => f.isStale);
  const pendingRequests = infoRequests.filter((r) => r.status === 'REQUESTED' || r.status === 'GAP');
  const openClarifications = clarifications.filter((c) => c.status !== 'ANSWERED');
  const recentActivity = [...auditLog].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5);

  const attentionCount = staleFiles.length + pendingRequests.length + openClarifications.length;

  const go = (page: string) => { onNavigate(page); setOpen(false); };

  const markProvided = (id: string) => setRequestStatus(id, 'PROVIDED');

  const saveAnswer = (id: string) => {
    const text = answerText.trim();
    if (!text) return;
    answerClarification(id, text);
    setAnsweringId(null);
    setAnswerText('');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${attentionCount ? `, ${attentionCount} need attention` : ''}`}
        className="relative text-slate-500 hover:text-slate-900 p-1.5 rounded hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-4.5 h-4.5" />
        {attentionCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {attentionCount > 9 ? '9+' : attentionCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <span className="text-xs font-sans font-bold text-slate-900">Needs your attention</span>
            {attentionCount > 0 && <span className="text-[10px] font-mono text-rose-600 font-semibold">{attentionCount} open</span>}
          </div>

          <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
            {attentionCount === 0 && (
              <div className="px-4 py-6 text-center text-xs text-slate-400">All caught up — nothing pending.</div>
            )}

            {pendingRequests.slice(0, 4).map((r) => (
              <div key={r.id} className="px-4 py-2.5 flex items-start gap-2.5">
                {r.status === 'GAP' ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" /> : <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
                <div className="min-w-0 flex-1">
                  <button onClick={() => go('opportunity')} className="block text-left text-[11px] font-semibold text-slate-800 hover:text-indigo-700 truncate w-full">{r.label}</button>
                  <span className="block text-[10px] text-slate-400">{r.status === 'GAP' ? 'Gap — needs information' : 'Requested — awaiting response'}</span>
                  <button onClick={() => markProvided(r.id)} className="mt-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" /> Mark provided
                  </button>
                </div>
              </div>
            ))}

            {openClarifications.slice(0, 3).map((c) => (
              <div key={c.id} className="px-4 py-2.5">
                <div className="flex items-start gap-2.5">
                  <MessageCircleQuestion className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <button onClick={() => go('opportunity')} className="block text-left text-[11px] font-semibold text-slate-800 hover:text-indigo-700 truncate w-full">{c.question}</button>
                    <span className="block text-[10px] text-slate-400">
                      {c.status === 'SUBMITTED' ? 'Submitted — awaiting client answer' : c.source === 'RECOMMENDED' ? 'Recommended clarification' : 'Draft — not yet submitted'}
                    </span>

                    {c.source === 'RECOMMENDED' && c.status === 'DRAFT' && (
                      <button onClick={() => promoteClarification(c.id)} className="mt-1 text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" /> Add to register
                      </button>
                    )}
                    {c.source !== 'RECOMMENDED' && c.status === 'DRAFT' && (
                      <button onClick={() => submitClarification(c.id)} className="mt-1 text-[10px] font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1">
                        <Send className="w-3 h-3" /> Mark submitted
                      </button>
                    )}
                    {c.status === 'SUBMITTED' && (
                      answeringId === c.id ? (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={answerText}
                            onChange={(e) => setAnswerText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveAnswer(c.id); if (e.key === 'Escape') setAnsweringId(null); }}
                            placeholder="Client's answer…"
                            className="flex-1 text-[10px] p-1 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button onClick={() => saveAnswer(c.id)} className="text-emerald-600 hover:text-emerald-800"><Check className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setAnsweringId(c.id); setAnswerText(''); }} className="mt-1 text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1">
                          <Check className="w-3 h-3" /> Record answer
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}

            {staleFiles.slice(0, 3).map((f) => (
              <div key={f.id} className="px-4 py-2.5 flex items-start gap-2.5">
                <FileWarning className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <button onClick={() => go('knowledge-base')} className="block text-left text-[11px] font-semibold text-slate-800 hover:text-indigo-700 truncate w-full">{f.name}</button>
                  <span className="block text-[10px] text-slate-400">Last verified {f.lastVerifiedAt}</span>
                  <button onClick={() => onVerifyKBFile(f.id)} className="mt-1 text-[10px] font-semibold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Re-verify now
                  </button>
                </div>
              </div>
            ))}

            {recentActivity.length > 0 && (
              <div className="px-4 py-2 bg-slate-50/40">
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-1.5 flex items-center gap-1"><Activity className="w-3 h-3" /> Recent activity</div>
                {recentActivity.map((a) => (
                  <div key={a.id} className="text-[10px] text-slate-500 py-0.5 truncate">
                    <span className="font-semibold text-slate-700">{a.userName}</span> · {a.details}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => go('opportunity')} className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 px-4 py-2.5 border-t border-slate-100 bg-white">
            Open Opportunity workspace <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
