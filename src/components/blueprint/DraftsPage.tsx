/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Drafts — module drafting workbench AND the Proposal Run Through
 * (two-pass whole-proposal workflow).
 *
 * Per-module drafting is unchanged: pick a module, draft against its
 * linked requirements/evidence, run per-section actions.
 *
 * Layered on top is the proposal-wide toolbar:
 *   1. Generate First Pass Across All Sections
 *   2. Run Full Proposal Pass  (master prompt, whole-proposal aware)
 *   3. Check Repetition and Consistency
 *   4. Prepare Review Ready Draft
 * plus a per-section notes panel, global proposal notes, version
 * history, and a conflict dialog so a full run never silently
 * overwrites manual edits.
 */
import React, { useState } from 'react';
import {
  Edit3, Loader2, Sparkles, ChevronDown, CheckCircle2, Eye, PenLine, AlertTriangle,
  Layers, StickyNote, History, GitCompare, ListChecks, X,
} from 'lucide-react';
import { PageHeader, Card, Pill, GhostButton, PrimaryButton, EmptyState, Drawer } from '../ui';
import { BlueprintPageProps, NoBlueprint, DRAFT_TONE } from './shared';
import { ModuleKey, DraftStatus, SectionNotes, ProposalNotes, TenderBlueprint } from '../../blueprint/types';
import { runDraftAction, DraftAction, DRAFT_ACTION_LABEL } from '../../blueprint/aiService';
import {
  generateFirstPass, runFullProposal, checkRepetitionAndConsistency,
  buildClaimRegister, prepareReviewReady, makeVersion, ConsistencyIssue, FullRunSection,
} from '../../blueprint/proposalRun';
import { runSectionLoop, buildLoopReport, LoopReport } from '../../blueprint/proposalLoops';
import { generationSummary, composePrompt, GenerationSummaryItem } from '../../blueprint/promptComposer';
import { starterText } from '../../blueprint/responsePatterns';
import { toastError, toast } from '../../lib/toast';

interface Props extends BlueprintPageProps {
  focusModule: ModuleKey | null;
  onFocusModule: (key: ModuleKey | null) => void;
}

// All AI drafting actions live under "Improve with AI" — never shown as
// separate visible buttons. Rewrites first, then the check actions.
const IMPROVE_ACTIONS: DraftAction[] = ['strengthen', 'add-evidence', 'more-technical', 'more-executive', 'shorten', 'expand', 'rewrite-for-evaluator', 'add-case-study', 'add-risks', 'check-compliance', 'check-source', 'check-claims', 'evaluator-lens', 'prepare-review'];

type ProposalOp = 'first-pass' | 'full-run' | 'consistency' | 'review-ready' | null;

export default function DraftsPage({ tender, bp, update, onNavigate, focusModule, onFocusModule }: Props) {
  const [running, setRunning] = useState<DraftAction | null>(null);
  const [findings, setFindings] = useState<string[] | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  // Proposal Run Through state
  const [proposalOp, setProposalOp] = useState<ProposalOp>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [globalNotesOpen, setGlobalNotesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [issues, setIssues] = useState<ConsistencyIssue[] | null>(null);
  const [reviewSummary, setReviewSummary] = useState<string[] | null>(null);
  // Pending full-run result awaiting the user's overwrite decision.
  const [pendingRun, setPendingRun] = useState<FullRunSection[] | null>(null);
  const [loopReport, setLoopReport] = useState<LoopReport | null>(null);
  const [proposalMenuOpen, setProposalMenuOpen] = useState(false);

  if (!tender || !bp) return <div className="space-y-5"><PageHeader title="Drafts" subtitle="Module-based drafting, grounded in the blueprint." /><NoBlueprint onNavigate={onNavigate} hasTender={!!tender} /></div>;

  const active = bp.modules.filter((m) => m.active);
  const current = active.find((m) => m.key === focusModule) ?? active[0] ?? null;

  if (!current) {
    return (
      <div className="space-y-5">
        <PageHeader title="Drafts" subtitle="Module-based drafting, grounded in the blueprint." />
        <EmptyState icon={<Edit3 className="w-5 h-5" />} title="No active modules" body="Activate proposal modules first — drafting is always per module." />
      </div>
    );
  }

  const reqs = bp.requirements.filter((r) => current.requirementIds.includes(r.id));
  const evidence = bp.evidence.filter((e) => e.moduleKey === current.key);
  const wordCount = current.draft.split(/\s+/).filter(Boolean).length;
  const overLimit = current.wordLimit !== null && wordCount > current.wordLimit;
  const claimsForCurrent = (bp.claimRegister ?? []).filter((c) => c.sections.includes(current.key));
  const genSummary: GenerationSummaryItem[] = generationSummary(bp, current, true);

  const setDraft = (key: ModuleKey, draft: string, status?: DraftStatus, manuallyEdited?: boolean) =>
    update((b) => ({ ...b, modules: b.modules.map((m) => (m.key === key ? { ...m, draft, draftStatus: status ?? (draft ? (m.draftStatus === 'Not started' ? 'Drafting' : m.draftStatus) : m.draftStatus), ...(manuallyEdited !== undefined ? { manuallyEdited } : {}) } : m)) }));

  const run = async (action: DraftAction) => {
    if (running) return;
    setRunning(action);
    setFindings(null);
    setMoreOpen(false);
    try {
      // All drafting actions share the Prompt Composer's layered prompt
      // (blueprint, module pattern, requirements, evidence + gaps, section
      // + global notes, commercial assumptions, addenda, claim register,
      // terminology). The user never sees the raw prompt — only the
      // generation summary in the right rail.
      const composed = composePrompt({ bp, module: current, task: DRAFT_ACTION_LABEL[action], includeSiblings: action === 'rewrite-for-evaluator' });
      const result = await runDraftAction({
        module: current, requirements: reqs, evidence, inputs: bp.inputs,
        tenderName: tender.name, clientName: tender.client, action, currentDraft: current.draft,
        composedPrompt: composed.prompt,
      });
      if (result.findings) {
        setFindings(result.findings);
      } else {
        // AI-applied change resets the manual-edit flag (it's now AI content).
        setDraft(current.key, result.content, action === 'generate' ? 'Drafted' : undefined, false);
        toast(`${DRAFT_ACTION_LABEL[action]} applied.`);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Drafting failed. Please try again.');
    } finally {
      setRunning(null);
    }
  };

  /* ── Proposal Run Through operations ──────────────────────────── */

  const doFirstPass = async () => {
    setProposalOp('first-pass');
    try {
      const sections = await generateFirstPass(bp);
      update((b) => ({
        ...b,
        modules: b.modules.map((m) => {
          const s = sections.find((x) => x.key === m.key);
          return s ? { ...m, draft: s.draft, draftStatus: m.draftStatus === 'Not started' ? 'Drafting' : m.draftStatus, firstPass: s.meta, manuallyEdited: false } : m;
        }),
        proposalVersions: [makeVersion('first-pass', b.modules.filter((m) => m.active), null, `First pass generated across ${sections.length} sections.`, false), ...(b.proposalVersions ?? [])],
      }));
      toast(`First pass generated across ${sections.length} sections. Add section notes, then run the full proposal pass.`, 'success', 6000);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'First pass failed. Please try again.');
    } finally {
      setProposalOp(null);
    }
  };

  const doFullRun = async () => {
    setProposalOp('full-run');
    try {
      const sections = await runFullProposal(bp);
      const anyManual = sections.some((s) => s.hadManualEdits);
      if (anyManual) {
        // Don't silently overwrite — hold the result and ask the user.
        setPendingRun(sections);
      } else {
        applyFullRun(sections, 'replace');
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Full proposal pass failed. Please try again.');
    } finally {
      setProposalOp(null);
    }
  };

  /** Applies a full-run result under the chosen manual-edit strategy. */
  const applyFullRun = (sections: FullRunSection[], strategy: 'replace' | 'preserve' | 'blend') => {
    update((b) => {
      const modules = b.modules.map((m) => {
        const s = sections.find((x) => x.key === m.key);
        if (!s) return m;
        if (m.manuallyEdited && strategy === 'preserve') return m; // keep manual edit
        const draft = m.manuallyEdited && strategy === 'blend'
          ? `${m.draft}\n\n---\n\n*Run-through suggestion (blend in as needed):*\n\n${s.draft}`
          : s.draft;
        return { ...m, draft, manuallyEdited: false };
      });
      const claimRegister = buildClaimRegister({ ...b, modules });
      return {
        ...b,
        modules,
        claimRegister,
        proposalVersions: [makeVersion('full-run', b.modules.filter((m) => m.active), null, `Full proposal run-through (${strategy}). Claim register refreshed: ${claimRegister.length} claims tracked.`, hasNotes(b)), ...(b.proposalVersions ?? [])],
      };
    });
    setPendingRun(null);
    toast('Full proposal run-through applied — sections refined together, claim register refreshed.', 'success', 6000);
  };

  const doConsistency = () => {
    setProposalOp('consistency');
    const found = checkRepetitionAndConsistency(bp);
    const claimRegister = buildClaimRegister(bp);
    update((b) => ({ ...b, claimRegister }));
    setIssues(found);
    setProposalOp(null);
    toast(found.length ? `${found.length} consistency issue${found.length === 1 ? '' : 's'} found.` : 'No repetition or consistency issues found.', found.length ? 'info' : 'success');
  };

  const doReviewReady = () => {
    setProposalOp('review-ready');
    const result = prepareReviewReady(bp, null);
    update((b) => ({
      ...b,
      claimRegister: result.claimRegister,
      proposalVersions: [result.version, ...(b.proposalVersions ?? [])],
    }));
    setIssues(result.issues);
    setReviewSummary(result.reviewSummary);
    setProposalOp(null);
    toast('Review-ready draft prepared — flagged for human review, not approved.', 'success', 6000);
  };

  const runLoops = () => {
    // Compute loop status for every active section, then build the report.
    update((b) => ({
      ...b,
      modules: b.modules.map((m) => (m.active ? { ...m, loop: runSectionLoop(b, m) } : m)),
    }));
    const updated = { ...bp, modules: bp.modules.map((m) => (m.active ? { ...m, loop: runSectionLoop(bp, m) } : m)) };
    setLoopReport(buildLoopReport(updated));
    toast('Controlled loop checks run across all sections.');
  };

  const prefillAll = () => {
    update((b) => ({
      ...b,
      modules: b.modules.map((m) => (m.active && !m.draft.trim()
        ? { ...m, draft: starterText(m.key, m.name), draftStatus: m.draftStatus === 'Not started' ? 'Drafting' : m.draftStatus, manuallyEdited: false }
        : m)),
    }));
    toast('Activated modules prefilled with starter structure (working drafts, not final).', 'success', 6000);
  };

  const applyStarter = () => {
    setDraft(current.key, starterText(current.key, current.name), 'Drafting', false);
    toast('Section template inserted — replace the bracketed prompts with evidence-backed content.');
  };

  const sendForReview = () => {
    update((b) => ({ ...b, modules: b.modules.map((m) => (m.key === current.key ? { ...m, draftStatus: 'In review' } : m)), reviews: b.reviews.map((t) => (t.moduleKey === current.key ? { ...t, status: 'In review' as const } : t)) }));
    toast('Sent to the review gate.');
  };

  const restoreVersion = (versionId: string) => {
    const version = (bp.proposalVersions ?? []).find((v) => v.id === versionId);
    if (!version) return;
    update((b) => ({
      ...b,
      modules: b.modules.map((m) => {
        const snap = version.snapshots.find((s) => s.key === m.key);
        return snap ? { ...m, draft: snap.draft, manuallyEdited: false } : m;
      }),
    }));
    setHistoryOpen(false);
    toast(`Restored the draft snapshot from ${new Date(version.createdAt).toLocaleString()}.`);
  };

  const proposalBusy = proposalOp !== null;

  // Guided drafting flow — one primary action based on where the whole
  // proposal is: draft everything → run the full pass → prepare for
  // review. Everything else lives in the More actions menu.
  const anyDrafted = active.some((m) => m.draft);
  const allDrafted = active.length > 0 && active.every((m) => m.draft);
  const hasRun = (bp.proposalVersions ?? []).some((v) => v.action === 'full-run');
  const reviewReadyDone = (bp.proposalVersions ?? []).some((v) => v.action === 'review-ready');
  const guidedStep: { label: string; run: () => void; op: ProposalOp; hint: string } = !anyDrafted
    ? { label: 'Generate first pass', run: doFirstPass, op: 'first-pass', hint: 'Draft every activated section at once.' }
    : !allDrafted
      ? { label: 'Draft remaining sections', run: doFirstPass, op: 'first-pass', hint: 'Some sections are still empty.' }
      : !hasRun
        ? { label: 'Run full proposal pass', run: doFullRun, op: 'full-run', hint: 'Refine all sections together as one submission.' }
        : !reviewReadyDone
          ? { label: 'Prepare for review', run: doReviewReady, op: 'review-ready', hint: 'Check the proposal and flag remaining items for humans.' }
          : { label: 'Re-prepare review draft', run: doReviewReady, op: 'review-ready', hint: 'Refresh the review-ready draft.' };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Drafts"
        subtitle="Draft per module, or run the whole proposal together so sections stay connected and non-repetitive."
        actions={
          <>
            <GhostButton onClick={() => setGlobalNotesOpen(true)}><StickyNote className="w-4 h-4" /> Proposal notes</GhostButton>
            <GhostButton onClick={() => setHistoryOpen(true)}><History className="w-4 h-4" /> Versions{(bp.proposalVersions?.length ?? 0) > 0 ? ` (${bp.proposalVersions!.length})` : ''}</GhostButton>
          </>
        }
      />

      {/* Proposal-wide guided flow — one primary action; the rest live in
          a More actions menu so Draft reads as a writing flow, not a
          toolbar of AI buttons. */}
      <Card className="p-3.5 border-indigo-100 bg-indigo-50/30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">Proposal Run Through</div>
              <div className="text-xs text-slate-500 truncate">{guidedStep.hint}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ProposalButton primary busy={proposalOp === guidedStep.op} disabled={proposalBusy} onClick={guidedStep.run} icon={<Sparkles className="w-3.5 h-3.5" />}>{guidedStep.label}</ProposalButton>
            <div className="relative">
              <button onClick={() => setProposalMenuOpen((v) => !v)} disabled={proposalBusy}
                className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                More actions <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {proposalMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProposalMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                    <MenuItem onClick={() => { setProposalMenuOpen(false); doFirstPass(); }} disabled={proposalBusy}>Generate first pass across all sections</MenuItem>
                    <MenuItem onClick={() => { setProposalMenuOpen(false); doFullRun(); }} disabled={proposalBusy}>Run full proposal pass</MenuItem>
                    <MenuItem onClick={() => { setProposalMenuOpen(false); doConsistency(); }} disabled={proposalBusy}>Check repetition &amp; consistency</MenuItem>
                    <MenuItem onClick={() => { setProposalMenuOpen(false); doReviewReady(); }} disabled={proposalBusy}>Prepare review-ready draft</MenuItem>
                    <div className="my-1 border-t border-slate-100" />
                    <MenuItem onClick={() => { setProposalMenuOpen(false); prefillAll(); }} disabled={proposalBusy}>Prefill all activated modules</MenuItem>
                    <MenuItem onClick={() => { setProposalMenuOpen(false); runLoops(); }} disabled={proposalBusy}>Run proposal checks</MenuItem>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Controlled loop report */}
      {loopReport && (
        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2"><GitCompare className="w-4 h-4 text-slate-500" /><span className="text-sm font-semibold text-slate-900">Controlled Proposal Loop Report</span></div>
            <button onClick={() => setLoopReport(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <LoopStat label="Sections ready" value={loopReport.ready.length} good />
            <LoopStat label="Blocked" value={loopReport.blocked.length} warn={loopReport.blocked.length > 0} />
            <LoopStat label="Missing evidence" value={loopReport.missingEvidence} warn={loopReport.missingEvidence > 0} />
            <LoopStat label="Unsupported claims" value={loopReport.unsupportedClaims} warn={loopReport.unsupportedClaims > 0} />
            <LoopStat label="Repeated claims" value={loopReport.repeatedClaims} warn={loopReport.repeatedClaims > 0} />
            <LoopStat label="Commercial issues" value={loopReport.commercialIssues} warn={loopReport.commercialIssues > 0} />
            <LoopStat label="Addendum impacts" value={loopReport.addendumImpacts} warn={loopReport.addendumImpacts > 0} />
            <LoopStat label="Reviews outstanding" value={loopReport.reviewsOutstanding} warn={loopReport.reviewsOutstanding > 0} />
          </div>
          {loopReport.blocked.length > 0 && (
            <div className="text-xs text-slate-600 mb-2">
              <span className="font-semibold">Blocked:</span> {loopReport.blocked.map((b) => `${bp.modules.find((m) => m.key === b.key)?.name ?? b.key} (${b.reason})`).join('; ')}
            </div>
          )}
          <div className="text-xs text-slate-700"><span className="font-semibold">Next:</span> {loopReport.nextActions.join(' · ')}</div>
        </Card>
      )}

      {/* Review summary (Stage 5 output) */}
      {reviewSummary && (
        <Card className="p-4 border-indigo-200 bg-indigo-50/40">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-indigo-600" /><span className="text-sm font-semibold text-slate-900">Review-ready — still needs human review</span></div>
            <button onClick={() => setReviewSummary(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <ul className="space-y-1">
            {reviewSummary.map((s, i) => <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-indigo-400">•</span>{s}</li>)}
          </ul>
          <p className="text-xs text-slate-500 mt-2">This prepares the best version for a reviewer — it does not approve anything.</p>
        </Card>
      )}

      {/* Consistency / repetition report (Stage 4 output) */}
      {issues && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2"><GitCompare className="w-4 h-4 text-slate-500" /><span className="text-sm font-semibold text-slate-900">Repetition &amp; Consistency Report</span></div>
            <button onClick={() => setIssues(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          {issues.length === 0 ? (
            <div className="px-4 py-6 text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> No repetition or consistency issues found.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {issues.map((iss) => (
                <li key={iss.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Pill tone={iss.severity === 'High' ? 'red' : iss.severity === 'Medium' ? 'amber' : 'slate'}>{iss.severity}</Pill>
                        <Pill tone="slate">{iss.kind}</Pill>
                      </div>
                      <div className="text-sm text-slate-800">{iss.issue}</div>
                      <div className="text-xs text-slate-500 mt-1">Fix: {iss.suggestedFix}</div>
                      <div className="text-xs text-slate-400 mt-0.5">Sections: {iss.affectedSections.map((k) => bp.modules.find((m) => m.key === k)?.name ?? k).join(', ')}</div>
                    </div>
                    <GhostButton onClick={() => { const first = iss.affectedSections[0]; if (first) onFocusModule(first); }}>Open</GhostButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_240px] gap-4 items-start">
        {/* Module rail */}
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {active.map((m) => (
              <li key={m.key}>
                <button onClick={() => { onFocusModule(m.key); setFindings(null); }}
                  className={`w-full text-left px-4 py-3 transition-colors ${current.key === m.key ? 'bg-indigo-50/60 border-l-2 border-indigo-500' : 'hover:bg-slate-50 border-l-2 border-transparent'}`}>
                  <div className="text-sm font-medium text-slate-900 leading-tight flex items-center gap-1.5">
                    {m.name}
                    {m.manuallyEdited && <span title="Manually edited" className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <Pill tone={DRAFT_TONE[m.draftStatus]} dot>{m.draftStatus}</Pill>
                    {m.loop && m.loop.status !== 'Not started' && m.loop.status !== 'Draft created' && (
                      <Pill tone={m.loop.status === 'Export ready' ? 'green' : m.loop.status === 'Blocked' ? 'red' : 'amber'}>{m.loop.status}</Pill>
                    )}
                    {m.sectionNotes && Object.values(m.sectionNotes).some((v) => typeof v === 'string' && v.trim()) && <StickyNote className="w-3 h-3 text-slate-400" />}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* Editor */}
        <div className="space-y-3 min-w-0">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{current.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {reqs.length} linked requirement{reqs.length === 1 ? '' : 's'} · {evidence.filter((e) => e.status === 'found').length}/{evidence.length || 0} evidence found
                  {current.wordLimit && (
                    <span className={`ml-2 font-semibold ${overLimit ? 'text-red-600' : 'text-slate-600'}`}>
                      {wordCount} / {current.wordLimit} words{overLimit ? ' — over limit' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {!current.draft.trim() && <GhostButton onClick={applyStarter}><Layers className="w-3.5 h-3.5" /> Start with template</GhostButton>}
                <GhostButton onClick={() => setNotesOpen(true)}><StickyNote className="w-3.5 h-3.5" /> Section notes</GhostButton>
                <GhostButton onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
                  {mode === 'edit' ? <><Eye className="w-3.5 h-3.5" /> Preview</> : <><PenLine className="w-3.5 h-3.5" /> Edit</>}
                </GhostButton>
              </div>
            </div>

            {/* One primary action by state, plus Improve with AI. Keeps
                Draft a writing flow, not a wall of AI buttons. */}
            <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
              {(() => {
                const hasDraft = !!current.draft.trim();
                const hasNotesForModule = !!current.sectionNotes && Object.values(current.sectionNotes).some((v) => typeof v === 'string' && v.trim());
                const failed = current.loop?.status === 'Blocked';
                const ready = current.loop?.status === 'Export ready' || current.draftStatus === 'Approved';
                // Primary action follows the module's state.
                const primary: { label: string; icon: React.ReactNode; act: () => void } =
                  !hasDraft ? { label: 'Start section', icon: <Sparkles className="w-3.5 h-3.5" />, act: () => run('generate') }
                  : failed ? { label: 'Resolve issues', icon: <AlertTriangle className="w-3.5 h-3.5" />, act: () => run('strengthen') }
                  : ready ? { label: 'Send for review', icon: <CheckCircle2 className="w-3.5 h-3.5" />, act: sendForReview }
                  : !hasNotesForModule ? { label: 'Add notes', icon: <StickyNote className="w-3.5 h-3.5" />, act: () => setNotesOpen(true) }
                  : { label: 'Improve section', icon: <PenLine className="w-3.5 h-3.5" />, act: () => run('strengthen') };
                return (
                  <button onClick={primary.act} disabled={!!running}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : primary.icon}
                    {primary.label}
                  </button>
                );
              })()}
              <div className="relative">
                <button onClick={() => setMoreOpen((o) => !o)} disabled={!!running || !current.draft}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border bg-white text-slate-700 border-slate-200 hover:border-slate-300 disabled:opacity-40">
                  <Sparkles className="w-3.5 h-3.5" /> Improve with AI <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                    <div className="absolute z-20 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                      {IMPROVE_ACTIONS.map((a) => (
                        <button key={a} onClick={() => { setMoreOpen(false); run(a); }} disabled={!current.draft && !a.startsWith('check') && a !== 'prepare-review'}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                          {DRAFT_ACTION_LABEL[a]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* Findings from check actions */}
          {findings && (
            <Card className="p-4 border-amber-200 bg-amber-50/40">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-slate-900">Check results</span>
              </div>
              <ul className="space-y-1">
                {findings.map((f, i) => (
                  <li key={i} className={`text-sm font-mono ${f.startsWith('✗') ? 'text-red-700' : f.startsWith('✓') ? 'text-emerald-700' : 'text-slate-600'}`}>{f}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Editor / preview surface */}
          <Card className="overflow-hidden">
            {mode === 'edit' ? (
              <textarea
                value={current.draft}
                onChange={(e) => setDraft(current.key, e.target.value, undefined, true)}
                placeholder={`Draft ${current.name} here, or use the Proposal Run Through above. Content is grounded in this module's ${reqs.length} linked requirement${reqs.length === 1 ? '' : 's'} and matched evidence.`}
                className="w-full min-h-[420px] p-5 text-sm text-slate-800 leading-relaxed font-mono outline-none resize-y"
                spellCheck={false}
              />
            ) : (
              <div className="p-6 min-h-[420px] text-sm text-slate-800 leading-relaxed space-y-3">
                {current.draft
                  ? current.draft.split('\n').map((line, i) => {
                      if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold text-slate-950 pt-1">{line.slice(3)}</h2>;
                      if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold text-slate-900 pt-1">{line.slice(4)}</h3>;
                      if (line.startsWith('> ')) return <blockquote key={i} className="border-l-2 border-indigo-200 pl-3 text-slate-600 italic">{line.slice(2)}</blockquote>;
                      if (line.startsWith('- ')) return <div key={i} className="flex gap-2"><span className="text-slate-300">•</span><span dangerouslySetInnerHTML={{ __html: emphasize(line.slice(2)) }} /></div>;
                      if (line.startsWith('|')) return <div key={i} className="font-mono text-xs text-slate-600">{line}</div>;
                      if (!line.trim()) return null;
                      return <p key={i} dangerouslySetInnerHTML={{ __html: emphasize(line) }} />;
                    })
                  : <p className="text-slate-400">Nothing drafted yet.</p>}
              </div>
            )}
          </Card>
        </div>

        {/* Right rail: section intel */}
        <div className="space-y-3">
          {current.loop && current.loop.status !== 'Not started' && (
            <Card className="p-3.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Loop status</div>
              <Pill tone={current.loop.status === 'Export ready' ? 'green' : current.loop.status === 'Blocked' ? 'red' : current.loop.status === 'Human review required' ? 'amber' : 'slate'}>{current.loop.status}</Pill>
              <ul className="mt-2 space-y-1">
                {Object.values(current.loop.stages).map((s) => s && (
                  <li key={s.stage} className={`text-xs flex items-start gap-1.5 ${s.passed ? 'text-emerald-700' : 'text-red-700'}`}>
                    <span>{s.passed ? '✓' : '✗'}</span>
                    <span className="text-slate-600">{s.stage}{s.blockedReason ? `: ${s.blockedReason}` : ''}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="p-3.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Generated using</div>
            <ul className="space-y-0.5">
              {genSummary.length ? genSummary.map((s, i) => (
                <li key={i} className="text-xs text-slate-600">• {s.count !== undefined ? `${s.count} ` : ''}{s.label}{s.detail && s.count === undefined ? `: ${s.detail}` : ''}</li>
              )) : <li className="text-xs text-slate-400">Blueprint context only.</li>}
            </ul>
          </Card>
          {current.firstPass && (
            <Card className="p-3.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">First-pass notes</div>
              <div className="text-xs text-slate-600 mb-1"><span className="font-semibold text-slate-700">Purpose:</span> {current.firstPass.purpose}</div>
              {current.firstPass.gaps.length > 0 && <div className="text-xs text-amber-700 mt-1">Gaps: {current.firstPass.gaps.slice(0, 3).join(', ')}</div>}
              {current.firstPass.unsupportedClaims.length > 0 && <div className="text-xs text-red-700 mt-1">{current.firstPass.unsupportedClaims.length} unsupported claim(s) flagged</div>}
            </Card>
          )}
          {claimsForCurrent.length > 0 && (
            <Card className="p-3.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Claims in this section</div>
              <ul className="space-y-1.5">
                {claimsForCurrent.map((c) => (
                  <li key={c.id} className="text-xs flex items-start gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${c.status === 'unsupported' ? 'bg-red-500' : c.repeated ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                    <span className="text-slate-700">{c.text}{c.repeated ? ' (repeated)' : ''}{c.status === 'unsupported' ? ' — unsupported' : ''}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="p-3.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Linked requirements</div>
            {reqs.length ? (
              <ul className="space-y-1">
                {reqs.slice(0, 6).map((r) => <li key={r.id} className="text-xs text-slate-600">{r.id} · {r.text.slice(0, 60)}{r.text.length > 60 ? '…' : ''}</li>)}
              </ul>
            ) : <div className="text-xs text-slate-400">None linked.</div>}
          </Card>
        </div>
      </div>

      {/* Section notes drawer */}
      <Drawer open={notesOpen} onClose={() => setNotesOpen(false)} title={`Section notes — ${current.name}`}>
        <SectionNotesEditor
          value={current.sectionNotes ?? {}}
          onSave={(notes) => {
            update((b) => ({ ...b, modules: b.modules.map((m) => (m.key === current.key ? { ...m, sectionNotes: { ...notes, updatedAt: new Date().toISOString() } } : m)) }));
            setNotesOpen(false);
            toast('Section notes saved — they\u2019ll be used in every later pass.');
          }}
        />
      </Drawer>

      {/* Global proposal notes drawer */}
      <Drawer open={globalNotesOpen} onClose={() => setGlobalNotesOpen(false)} title="Global proposal notes">
        <GlobalNotesEditor
          value={bp.proposalNotes ?? {}}
          onSave={(notes) => {
            update((b) => ({ ...b, proposalNotes: { ...notes, updatedAt: new Date().toISOString() } }));
            setGlobalNotesOpen(false);
            toast('Proposal notes saved — applied across the whole run-through.');
          }}
        />
      </Drawer>

      {/* Version history drawer */}
      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Version history">
        {(bp.proposalVersions?.length ?? 0) === 0 ? (
          <EmptyState icon={<History className="w-5 h-5" />} title="No versions yet" body="Run the first pass or a full proposal pass to create a version." />
        ) : (
          <ul className="space-y-2">
            {bp.proposalVersions!.map((v) => (
              <li key={v.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <Pill tone={v.action === 'review-ready' ? 'green' : v.action === 'full-run' ? 'indigo' : 'slate'}>{v.action}</Pill>
                  <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleString()}</span>
                </div>
                <div className="text-sm text-slate-700 mt-1.5">{v.summary}</div>
                <div className="text-xs text-slate-400 mt-1">{v.affectedModules.length} sections · prompt {v.masterPromptVersion}{v.notesUsed ? ' · notes applied' : ''}</div>
                <div className="mt-2"><GhostButton onClick={() => restoreVersion(v.id)}><History className="w-3.5 h-3.5" /> Restore snapshot</GhostButton></div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      {/* Manual-edit conflict dialog (full run) */}
      {pendingRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setPendingRun(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-semibold text-slate-900">Some sections have manual edits</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              The full proposal run-through produced refined drafts, but {pendingRun.filter((s) => s.hadManualEdits).length} section(s) were manually edited. How should those be handled? (Un-edited sections update either way.)
            </p>
            <div className="space-y-2">
              <button onClick={() => applyFullRun(pendingRun, 'preserve')} className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-sm"><span className="font-semibold text-slate-900">Preserve manual edits</span><span className="block text-xs text-slate-500">Keep your edited sections as they are.</span></button>
              <button onClick={() => applyFullRun(pendingRun, 'blend')} className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-sm"><span className="font-semibold text-slate-900">Blend</span><span className="block text-xs text-slate-500">Append the run-through version below your edit to merge by hand.</span></button>
              <button onClick={() => applyFullRun(pendingRun, 'replace')} className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-sm"><span className="font-semibold text-slate-900">Replace with run-through version</span><span className="block text-xs text-slate-500">Overwrite with the refined draft (your version stays in version history).</span></button>
            </div>
            <div className="mt-4 flex justify-end"><GhostButton onClick={() => setPendingRun(null)}>Cancel</GhostButton></div>
          </div>
        </div>
      )}
    </div>
  );
}

function hasNotes(bp: TenderBlueprint): boolean {
  const g = bp.proposalNotes ?? {};
  return !!(g.proposalStory || g.clientPriorities || g.keyDifferentiators) || bp.modules.some((m) => m.sectionNotes && Object.values(m.sectionNotes).some((v) => typeof v === 'string' && v.trim()));
}

function LoopStat({ label, value, good, warn }: { label: string; value: number; good?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${warn ? 'border-amber-200 bg-amber-50/50' : good && value > 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${warn ? 'text-amber-700' : good && value > 0 ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function MenuItem({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
      {children}
    </button>
  );
}

function ProposalButton({ children, onClick, busy, disabled, primary, icon }: { children: React.ReactNode; onClick: () => void; busy?: boolean; disabled?: boolean; primary?: boolean; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        primary ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

const NOTE_FIELDS: { key: keyof SectionNotes; label: string; placeholder: string }[] = [
  { key: 'notes', label: 'Section notes', placeholder: 'General direction for this section' },
  { key: 'includePoints', label: 'Points to include', placeholder: 'Specific things this section must cover' },
  { key: 'avoidPoints', label: 'Points to avoid', placeholder: 'Things not to say here' },
  { key: 'differentiators', label: 'Differentiators', placeholder: 'What sets us apart in this section' },
  { key: 'evidenceToUse', label: 'Evidence to use', placeholder: 'Preferred projects / CVs / documents' },
  { key: 'evidenceToAvoid', label: 'Evidence to avoid', placeholder: 'Anything not to reference' },
  { key: 'toneInstruction', label: 'Tone', placeholder: 'e.g. technical, executive' },
  { key: 'reviewerDirection', label: 'Reviewer / SME direction', placeholder: 'Final reviewer comments' },
];

function SectionNotesEditor({ value, onSave }: { value: SectionNotes; onSave: (n: SectionNotes) => void }) {
  const [draft, setDraft] = useState<SectionNotes>(value);
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Saved per section and fed into every later drafting pass. Never lost when a section is regenerated.</p>
      {NOTE_FIELDS.map((f) => (
        <div key={f.key}>
          <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
          <textarea value={(draft[f.key] as string) ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            rows={f.key === 'notes' ? 3 : 2} placeholder={f.placeholder}
            className="w-full text-sm p-2.5 border border-slate-200 rounded-lg bg-white resize-y" />
        </div>
      ))}
      <PrimaryButton onClick={() => onSave(draft)}><CheckCircle2 className="w-4 h-4" /> Save section notes</PrimaryButton>
    </div>
  );
}

const GLOBAL_FIELDS: { key: keyof ProposalNotes; label: string; placeholder: string }[] = [
  { key: 'proposalStory', label: 'Proposal story', placeholder: 'The through-line the whole proposal should tell' },
  { key: 'clientPriorities', label: 'Client priorities', placeholder: 'What matters most to this client' },
  { key: 'keyDifferentiators', label: 'Key differentiators', placeholder: 'What sets this bid apart' },
  { key: 'commercialPosition', label: 'Commercial position', placeholder: 'Overall commercial stance' },
  { key: 'termsToUse', label: 'Terms to use', placeholder: 'Client terminology to mirror' },
  { key: 'termsToAvoid', label: 'Terms to avoid', placeholder: 'Language to stay away from' },
  { key: 'toneOfVoice', label: 'Tone of voice', placeholder: 'e.g. practical, confident, specific' },
  { key: 'competitorAssumptions', label: 'Competitor assumptions', placeholder: 'What we assume competitors will do' },
  { key: 'bidStrategy', label: 'Final bid strategy', placeholder: 'The strategy to reinforce across sections' },
];

function GlobalNotesEditor({ value, onSave }: { value: ProposalNotes; onSave: (n: ProposalNotes) => void }) {
  const [draft, setDraft] = useState<ProposalNotes>(value);
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Applied across the whole proposal in the full run-through, so every section reinforces the same story.</p>
      {GLOBAL_FIELDS.map((f) => (
        <div key={f.key}>
          <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
          <textarea value={(draft[f.key] as string) ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            rows={f.key === 'proposalStory' ? 3 : 2} placeholder={f.placeholder}
            className="w-full text-sm p-2.5 border border-slate-200 rounded-lg bg-white resize-y" />
        </div>
      ))}
      <PrimaryButton onClick={() => onSave(draft)}><CheckCircle2 className="w-4 h-4" /> Save proposal notes</PrimaryButton>
    </div>
  );
}

/** Minimal, safe markdown bold/italic rendering for the preview. */
function emphasize(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}
