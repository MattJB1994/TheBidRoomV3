/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exports — the submission package plan. Each pack is classified as
 * required by the client, optional, internal only, or not required —
 * derived from the blueprint. Every export button produces a real file
 * (docx / pdf / csv via the existing export libraries), and packs stay
 * gated until their content genuinely exists.
 */
import React, { useState } from 'react';
import { Download, FileText, Loader2, Lock, Package } from 'lucide-react';
import { PageHeader, Card, Pill, PillTone, GhostButton } from '../ui';
import { BlueprintPageProps, NoBlueprint, teamName } from './shared';
import { ExportPackage, ExportKey, TenderBlueprint } from '../../blueprint/types';
import { exportReadiness } from '../../blueprint/exportReadiness';
import { computeScores, MODULE_NAME } from '../../blueprint/engine';
import { ComplianceItem, ComplianceStatus, ProposalSection, Tender } from '../../types';
import { toast, toastError } from '../../lib/toast';

const LEVEL_TONE: Record<ExportPackage['level'], PillTone> = {
  'Required by client': 'red', 'Optional': 'indigo', 'Internal only': 'slate', 'Not required': 'slate',
};

/* Map blueprint requirements → the ComplianceItem shape the existing
   PDF/CSV exporters take, so those real exporters keep doing the work. */
function toComplianceItems(bp: TenderBlueprint): ComplianceItem[] {
  return bp.requirements.map((r) => ({
    id: r.id, requirement: r.text, tenderReference: `${r.sourceDocument} · ${r.clauseRef}`,
    isMandatory: r.mandatory,
    responseSection: r.moduleKey ? MODULE_NAME[r.moduleKey] : '—',
    sourceFiles: bp.evidence.filter((e) => e.requirementId === r.id && e.matchedFile).map((e) => e.matchedFile!) ,
    ownerId: r.ownerId ?? '',
    status: r.compliance === 'Compliant' ? ComplianceStatus.Approved : r.compliance === 'Partial' ? ComplianceStatus.Drafted : ComplianceStatus.NotStarted,
    gap: bp.evidence.some((e) => e.requirementId === r.id && e.status === 'missing') ? 'Evidence missing' : null,
    reviewerId: r.reviewerId ?? '',
  }));
}

function toProposalSections(bp: TenderBlueprint): ProposalSection[] {
  return bp.modules.filter((m) => m.active && m.draft).map((m) => ({
    id: m.key, title: m.name, status: ComplianceStatus.Drafted, content: m.draft,
    claims: [], reviewerId: m.ownerId ?? '', lastSavedAt: new Date().toISOString(),
    approved: m.draftStatus === 'Approved',
  }));
}

export default function ExportsPage(props: BlueprintPageProps & { team: BlueprintPageProps['team'] }) {
  const { tender, bp, update, team, onNavigate } = props;
  const [busy, setBusy] = useState<ExportKey | null>(null);

  if (!tender || !bp) return <div className="space-y-5"><PageHeader title="Exports" subtitle="The submission package, pack by pack." /><NoBlueprint onNavigate={onNavigate} hasTender={!!tender} /></div>;

  const scores = computeScores(bp);

  // Readiness gating lives in src/blueprint/exportReadiness.ts (pure,
  // unit-tested); this wrapper just binds the current blueprint/scores.
  const readiness = (p: ExportPackage) => exportReadiness(bp, p.key, p.level, scores);

  const runExport = async (p: ExportPackage) => {
    setBusy(p.key);
    try {
      const t: Partial<Tender> = tender;
      switch (p.key) {
        case 'full-proposal': {
          const { exportMainResponseDocx } = await import('../../lib/exportDocx');
          await exportMainResponseDocx(t, toProposalSections(bp));
          break;
        }
        case 'compliance-matrix': {
          const { exportComplianceMatrixPdf } = await import('../../lib/exportPdf');
          const { exportComplianceCsv } = await import('../../lib/exportCsv');
          const items = toComplianceItems(bp);
          await exportComplianceMatrixPdf(t, items);
          exportComplianceCsv(t, items);
          break;
        }
        case 'submission-checklist': {
          const { exportChecklistDocx } = await import('../../lib/exportDocx');
          const activeMods = bp.modules.filter((m) => m.active);
          await exportChecklistDocx(t, {
            assumptionsReviewed: bp.reviews.filter((r) => r.discipline === 'Commercial').every((r) => r.status === 'Approved'),
            pricingReviewed: bp.reviews.filter((r) => r.moduleKey === 'pricing-response').every((r) => r.status === 'Approved'),
            finalComplianceChecked: scores.compliance === 100,
            sectionsApproved: activeMods.filter((m) => m.draftStatus === 'Approved').length,
            totalSections: activeMods.length,
            gapsOpen: scores.evidenceGaps,
            passed: bp.reviews.find((r) => r.discipline === 'Final Approval')?.status === 'Approved',
          });
          break;
        }
        case 'executive-summary': {
          const { exportPackDocx } = await import('../../lib/exportPack');
          const m = bp.modules.find((x) => x.key === 'executive-summary')!;
          await exportPackDocx(t, 'Executive Summary', [{ heading: 'Executive Summary', paragraphs: m.draft.split('\n').filter((l) => l.trim() && !l.startsWith('#')) }]);
          break;
        }
        case 'pricing-assumptions': {
          const { exportPackDocx } = await import('../../lib/exportPack');
          await exportPackDocx(t, 'Pricing Assumptions', [
            { heading: 'Commercial position', paragraphs: [bp.inputs.commercialPosition || 'Not stated.'] },
            { heading: 'Key assumptions', bullets: bp.inputs.keyAssumptions.length ? bp.inputs.keyAssumptions : ['None recorded.'] },
            { heading: 'Key exclusions', bullets: bp.inputs.keyExclusions.length ? bp.inputs.keyExclusions : ['None recorded.'] },
          ]);
          break;
        }
        case 'commercial-departures': {
          const { exportPackDocx } = await import('../../lib/exportPack');
          const dep = bp.requirements.filter((r) => r.moduleKey === 'departures-clarifications');
          await exportPackDocx(t, 'Commercial Departures', [{
            heading: 'Departures & clarifications',
            table: { headers: ['Reference', 'Departure / clarification'], rows: dep.length ? dep.map((r) => [`${r.id} · ${r.clauseRef}`, r.text] as [string, string]) : [['—', 'No departures recorded.']] },
          }]);
          break;
        }
        case 'risk-register': {
          const { exportPackDocx } = await import('../../lib/exportPack');
          await exportPackDocx(t, 'Risk Register', [{
            heading: 'Bid risks',
            table: { headers: ['Risk', 'Rating / mitigation'], rows: bp.risks.map((r) => [r.title, `${r.rating} · ${r.status}${r.mitigation ? ` — ${r.mitigation}` : ''}`] as [string, string]) },
          }]);
          break;
        }
        case 'cv-pack': {
          const { exportPackDocx } = await import('../../lib/exportPack');
          const cvs = bp.evidence.filter((e) => e.type === 'CV' && e.matchedFile);
          await exportPackDocx(t, 'CV Pack', [{ heading: 'Nominated personnel CVs', bullets: cvs.map((c) => `${c.matchedFile} — ${c.label}`) }]);
          break;
        }
        case 'case-study-pack': {
          const { exportPackDocx } = await import('../../lib/exportPack');
          const cs = bp.evidence.filter((e) => e.type === 'Case study' && e.matchedFile);
          await exportPackDocx(t, 'Case Study Pack', [{ heading: 'Selected case studies', bullets: cs.map((c) => `${c.matchedFile} — ${c.label}`) }]);
          break;
        }
        case 'returnable-schedules': {
          const { exportPackDocx } = await import('../../lib/exportPack');
          await exportPackDocx(t, 'Returnable Schedules', [{
            heading: 'Returnables in submission order',
            table: { headers: ['Schedule', 'Status'], rows: bp.requirements.filter((r) => r.type === 'Mandatory returnable').map((r) => [r.text.replace('Complete and submit: ', ''), r.status] as [string, string]) },
          }]);
          break;
        }
        case 'pitch-deck': {
          const { exportPackDocx } = await import('../../lib/exportPack');
          await exportPackDocx(t, 'Pitch Deck Outline', [
            { heading: 'Storyline', bullets: ['Why us — win themes', ...bp.inputs.winThemes, 'Team the client knows', 'Delivery approach & assurance', 'Commercial confidence'] },
          ]);
          break;
        }
        case 'internal-approval-pack': {
          const { exportPackDocx } = await import('../../lib/exportPack');
          await exportPackDocx(t, 'Internal Approval Pack', [
            { heading: 'Gate status', table: { headers: ['Gate', 'Status'], rows: bp.reviews.map((r) => [r.title, r.status] as [string, string]) } },
            { heading: 'Health', bullets: [
              `Submission readiness: ${scores.readiness}%`, `Compliance: ${scores.compliance}%`,
              `Evidence gaps: ${scores.evidenceGaps}`, `Open high risks: ${scores.highRisks}`,
              `Owner: ${teamName(team, bp.meta.bidManagerId)}`,
            ] },
          ]);
          break;
        }
      }
      update((b) => ({ ...b, exports: b.exports.map((e) => (e.key === p.key ? { ...e, lastExportedAt: new Date().toISOString() } : e)) }));
      toast(`${p.name} exported.`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  const groups: { label: string; level: ExportPackage['level'] }[] = [
    { label: 'Required by client', level: 'Required by client' },
    { label: 'Optional', level: 'Optional' },
    { label: 'Internal only', level: 'Internal only' },
    { label: 'Not required for this tender', level: 'Not required' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submission Pack"
        subtitle={`${scores.exportsReady} of ${scores.exportsRequired} client-required packs ready · derived from the Tender Blueprint.`}
      />

      {/* Submission-pack readiness summary — what's blocking the whole pack */}
      {(() => {
        const requiredPacks = bp.exports.filter((e) => e.level === 'Required by client');
        const readyPacks = requiredPacks.filter((p) => readiness(p).ready);
        const missingPacks = requiredPacks.filter((p) => !readiness(p).ready);
        const gatesBlocking = bp.reviews.filter((r) => r.status !== 'Approved').length;
        const addendaBlocking = bp.addenda.filter((a) => !a.reviewed).length;
        const commercialBlocking = bp.commercial.filter((c) => c.status === 'Open').length;
        const packReady = missingPacks.length === 0 && gatesBlocking === 0 && addendaBlocking === 0 && commercialBlocking === 0;
        return (
          <Card className={`p-4 ${packReady ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Package className={`w-4 h-4 ${packReady ? 'text-emerald-600' : 'text-amber-600'}`} />
              <span className="text-sm font-semibold text-slate-900">{packReady ? 'Submission pack is ready to assemble' : 'Submission pack is blocked'}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div><span className="font-semibold text-slate-900">{readyPacks.length}/{requiredPacks.length}</span> <span className="text-slate-500">required packs ready</span></div>
              <div><span className={`font-semibold ${gatesBlocking ? 'text-amber-700' : 'text-slate-900'}`}>{gatesBlocking}</span> <span className="text-slate-500">review gate(s) open</span></div>
              <div><span className={`font-semibold ${addendaBlocking ? 'text-amber-700' : 'text-slate-900'}`}>{addendaBlocking}</span> <span className="text-slate-500">addendum impact(s) unreviewed</span></div>
              <div><span className={`font-semibold ${commercialBlocking ? 'text-amber-700' : 'text-slate-900'}`}>{commercialBlocking}</span> <span className="text-slate-500">commercial item(s) open</span></div>
            </div>
            {missingPacks.length > 0 && (
              <div className="text-xs text-slate-600 mt-2">
                <span className="font-semibold">Missing / blocked:</span> {missingPacks.map((p) => `${p.name} (${readiness(p).blockedBy})`).join('; ')}
              </div>
            )}
          </Card>
        );
      })()}

      {groups.map((g) => {
        const packs = bp.exports.filter((e) => e.level === g.level);
        if (!packs.length) return null;
        return (
          <div key={g.level} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 px-1">{g.label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {packs.map((p) => {
                const state = readiness(p);
                const disabled = g.level === 'Not required' || !state.ready;
                return (
                  <Card key={p.key} className={`p-4 flex flex-col gap-3 ${g.level === 'Not required' ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-slate-500" />
                        </span>
                        <span className="text-sm font-semibold text-slate-900 leading-tight">{p.name}</span>
                      </div>
                      <Pill tone={LEVEL_TONE[p.level]}>{p.level}</Pill>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>
                    <div className="flex items-center justify-between gap-2 mt-auto pt-2.5 border-t border-slate-100">
                      <span className="text-xs text-slate-400">
                        {p.lastExportedAt
                          ? `Exported ${new Date(p.lastExportedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
                          : state.ready ? 'Not exported yet' : state.blockedBy}
                      </span>
                      <GhostButton disabled={disabled || busy === p.key} onClick={() => runExport(p)}>
                        {busy === p.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : state.ready ? <Download className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                        Export
                      </GhostButton>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      <Card className="p-4 flex items-center gap-2.5 text-sm text-slate-500">
        <FileText className="w-4 h-4 text-slate-300 shrink-0" />
        Compliance matrix exports as PDF + CSV; other packs export as Word documents built from the live blueprint data.
      </Card>
    </div>
  );
}
