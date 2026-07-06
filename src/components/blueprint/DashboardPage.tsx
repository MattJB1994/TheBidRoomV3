/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dashboard — the bid manager's command centre. Bid health at a glance
 * (readiness, compliance, mandatory gaps, evidence, risks, reviews,
 * addenda, overdue, word limits, export status), the tender portfolio,
 * and a quick-start path: drop the tender documents right here and go
 * straight into Analyse Tender.
 */
import React from 'react';
import {
  Plus, ArrowRight, Sparkles, Upload, ListChecks, FileSearch, Layers,
  Database, ShieldAlert, MessageSquare, Clock, Type, Package, AlertTriangle, Briefcase, PlayCircle, CheckCircle2,
} from 'lucide-react';
import { Card, Pill, PrimaryButton, ScoreRing, EmptyState } from '../ui';
import { NextBestActionPanel } from '../WorkflowUI';
import { computeNextBestAction } from '../../blueprint/workflow';
import { TenderBlueprint } from '../../blueprint/types';
import { computeScores } from '../../blueprint/engine';
import { Tender } from '../../types';
import FileDropzone from '../FileDropzone';

interface DashboardProps {
  tenders: Tender[];
  blueprints: Record<string, TenderBlueprint>;
  activeTenderId: string;
  onSelectTender: (id: string) => void;
  onNavigate: (page: string) => void;
  onCreateTender: () => void;
  onQuickStart: (files: File[]) => void;
  onLoadSample?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', IN_INTAKE: 'In intake', SOURCING_MATCHED: 'Evidence matched',
  DRAFTING: 'Drafting', UNDER_REVIEW: 'Under review', APPROVED: 'Approved',
  EXPORTED: 'Exported', SUBMITTED: 'Submitted',
};

export default function Dashboard({ tenders, blueprints, activeTenderId, onSelectTender, onNavigate, onCreateTender, onQuickStart, onLoadSample }: DashboardProps) {
  const active = tenders.find((t) => t.id === activeTenderId) ?? tenders[0];
  const bp = active ? blueprints[active.id] ?? null : null;
  const scores = bp ? computeScores(bp) : null;
  const daysLeft = active ? Math.ceil((new Date(active.closingDate).getTime() - Date.now()) / 86_400_000) : null;

  /* ── First-time empty state ─────────────────────────────────── */
  if (tenders.length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 pt-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-slate-950 tracking-tight">Start your first tender</h1>
          <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
            Upload the tender documents and The Bid Room reads them, extracts every requirement,
            activates the right proposal modules, maps your evidence and builds the submission plan.
          </p>
        </div>
        <Card className="p-6 space-y-4">
          <FileDropzone size="large" multiple label="Drop the tender documents here to begin"
            hint="RFT, RFP, scope, schedules, pricing — everything at once" onFiles={onQuickStart} />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-2.5">
            <PrimaryButton onClick={onCreateTender}><Plus className="w-4 h-4" /> Create new tender</PrimaryButton>
            {onLoadSample && (
              <button onClick={onLoadSample} className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                <PlayCircle className="w-4 h-4" /> Open worked example
              </button>
            )}
          </div>
          {onLoadSample && <p className="text-center text-xs text-slate-400">Explore a realistic tender midway through the workflow — no upload, no AI, no wait.</p>}
        </Card>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { icon: <Upload className="w-4 h-4" />, t: '1 · Upload', d: 'Drop the tender documents into a new project.' },
            { icon: <Sparkles className="w-4 h-4" />, t: '2 · Analyse', d: 'The Tender Blueprint extracts every requirement.' },
            { icon: <Layers className="w-4 h-4" />, t: '3 · Build', d: 'Modules activate; evidence and gaps are mapped.' },
            { icon: <Package className="w-4 h-4" />, t: '4 · Submit', d: 'Draft, review, and export the required packs.' },
          ].map((s) => (
            <div key={s.t} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mb-2.5">{s.icon}</div>
              <div className="text-sm font-semibold text-slate-900">{s.t}</div>
              <div className="text-xs text-slate-500 mt-1 leading-relaxed">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Command centre ─────────────────────────────────────────── */

  const healthTiles = scores ? [
    { icon: <ListChecks className="w-4 h-4" />, label: 'Mandatory requirements', value: `${scores.mandatoryTotal - scores.mandatoryUnanswered} / ${scores.mandatoryTotal}`, sub: scores.mandatoryUnanswered ? `${scores.mandatoryUnanswered} unanswered` : 'all in hand', warn: scores.mandatoryUnanswered > 0, count: scores.mandatoryUnanswered, page: 'requirements' },
    { icon: <Database className="w-4 h-4" />, label: 'Evidence gaps', value: String(scores.evidenceGaps), sub: scores.evidenceChecks ? `+ ${scores.evidenceChecks} to check` : 'red items', warn: scores.evidenceGaps > 0, count: scores.evidenceGaps, page: 'evidence' },
    { icon: <ShieldAlert className="w-4 h-4" />, label: 'High risks', value: String(scores.highRisks), sub: 'open', warn: scores.highRisks > 0, count: scores.highRisks, page: 'risks' },
    { icon: <AlertTriangle className="w-4 h-4" />, label: 'Commercial items', value: String(scores.commercialIssues), sub: 'open to resolve', warn: scores.commercialIssues > 0, count: scores.commercialIssues, page: 'commercial' },
    { icon: <FileSearch className="w-4 h-4" />, label: 'Addenda to review', value: String(scores.addendaPending), sub: 'pending', warn: scores.addendaPending > 0, count: scores.addendaPending, page: 'documents' },
    { icon: <MessageSquare className="w-4 h-4" />, label: 'Awaiting review', value: String(scores.awaitingReview), sub: 'sections in gates', warn: false, count: scores.awaitingReview, page: 'reviews' },
    { icon: <Clock className="w-4 h-4" />, label: 'Overdue tasks', value: String(scores.overdueTasks), sub: 'past due date', warn: scores.overdueTasks > 0, count: scores.overdueTasks, page: 'reviews' },
    { icon: <Type className="w-4 h-4" />, label: 'Word limit issues', value: String(scores.wordLimitIssues), sub: 'modules over', warn: scores.wordLimitIssues > 0, count: scores.wordLimitIssues, page: 'drafts' },
    { icon: <AlertTriangle className="w-4 h-4" />, label: 'Flagged claims', value: String((bp?.claimRegister ?? []).filter((c) => c.status === 'unsupported' || c.repeated).length), sub: 'unsupported or repeated', warn: (bp?.claimRegister ?? []).some((c) => c.status === 'unsupported'), count: (bp?.claimRegister ?? []).filter((c) => c.status === 'unsupported' || c.repeated).length, page: 'drafts' },
  ] : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-950 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5 truncate">
            {active ? <>Command centre for <span className="font-medium text-slate-700">{active.name}</span></> : 'Your tender portfolio.'}
          </p>
        </div>
        <PrimaryButton onClick={onCreateTender}><Plus className="w-4 h-4" /> Create new tender</PrimaryButton>
      </div>

      {active && (
        <>
          {/* The single most useful thing to do next */}
          {bp && scores && (
            <NextBestActionPanel nba={computeNextBestAction(bp, scores, true)} onNavigate={onNavigate} />
          )}

          {/* Bid health hero — one readiness ring, tender facts, no
              duplicate action row (those live in the pipeline). */}
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row gap-6 sm:items-center">
              <ScoreRing value={scores?.readiness ?? 0} label="Submission readiness" />
              <div className="flex-1 min-w-0 sm:border-l sm:border-slate-100 sm:pl-6">
                <div className="text-lg font-semibold text-slate-900 truncate">{active.name}</div>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="text-xs text-slate-500">{active.number}</span>
                  <Pill tone="slate">{STATUS_LABEL[active.status] ?? active.status}</Pill>
                  {daysLeft !== null && (
                    <span className={`text-sm font-semibold ${daysLeft <= 15 && daysLeft > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                      {daysLeft > 0 ? `${daysLeft} days to close` : 'Closed'}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-600 mt-1.5">{active.client} · {active.estimatedValue} · due {active.closingDate}</div>
                {!bp && (
                  <div className="mt-4">
                    <PrimaryButton onClick={() => onNavigate('add-tender')}><Sparkles className="w-4 h-4" /> Analyse tender</PrimaryButton>
                    <span className="ml-3 text-sm text-slate-400">Not analysed yet — the blueprint unlocks everything else.</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Attention stats — only what's non-zero, max 4; everything
              clear collapses into a single line. */}
          {scores && (() => {
            const flagged = healthTiles.filter((t) => t.count > 0).slice(0, 4);
            const clear = healthTiles.filter((t) => t.count === 0);
            return (
              <>
                {flagged.length > 0 && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {flagged.map((t) => (
                      <Card key={t.label} onClick={() => onNavigate(t.page)} className="p-6">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className={t.warn ? 'text-amber-600' : 'text-slate-400'}>{t.icon}</span>
                          {t.label}
                        </div>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className={`text-2xl font-bold ${t.warn ? 'text-amber-700' : 'text-slate-900'}`}>{t.value}</span>
                          <span className="text-xs text-slate-400">{t.sub}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
                {clear.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 px-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    All clear: {clear.map((t) => t.label.toLowerCase()).join(', ')}.
                  </div>
                )}
              </>
            );
          })()}

        </>
      )}

      {/* Portfolio */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recent projects</h2>
          {onLoadSample && (
            <button onClick={onLoadSample} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors">
              <PlayCircle className="w-3.5 h-3.5" /> Open worked example
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {tenders.map((t) => {
            const tbp = blueprints[t.id];
            const s = tbp ? computeScores(tbp) : null;
            const days = Math.ceil((new Date(t.closingDate).getTime() - Date.now()) / 86_400_000);
            return (
              <Card key={t.id} onClick={() => { onSelectTender(t.id); onNavigate(tbp ? 'blueprint' : 'add-tender'); }} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">{t.name}</span>
                  {tbp?.closeout?.outcome === 'Won'
                    ? <Pill tone="green">Won</Pill>
                    : tbp?.closeout?.outcome === 'Lost'
                      ? <Pill tone="slate">Lost</Pill>
                      : <Pill tone={t.id === activeTenderId ? 'indigo' : 'slate'}>{t.id === activeTenderId ? 'Active' : STATUS_LABEL[t.status] ?? t.status}</Pill>}
                </div>
                <div className="text-xs text-slate-500 truncate">{t.client}</div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                  <span className={`font-semibold ${days <= 15 && days > 0 ? 'text-red-600' : 'text-slate-500'}`}>{days > 0 ? `${days}d left` : 'Closed'}</span>
                  {s
                    ? <span className="text-slate-500">Readiness <span className="font-bold text-slate-800">{s.readiness}%</span></span>
                    : <span className="inline-flex items-center gap-1 font-semibold text-indigo-700">Analyse <Sparkles className="w-3 h-3" /></span>}
                </div>
              </Card>
            );
          })}

          {/* Quick-start card */}
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col justify-center hover:border-slate-300 transition-colors">
            <FileDropzone size="compact" label="Drop tender documents to start a new project" hint="browse" onFiles={onQuickStart} />
          </div>
        </div>
      </div>

      {!active && (
        <EmptyState icon={<Briefcase className="w-5 h-5" />} title="Select a tender" body="Choose a project above or create a new one to see its command centre." />
      )}
    </div>
  );
}
