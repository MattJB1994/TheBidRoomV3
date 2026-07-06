/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Addendum impact service. When a document tagged as an Addendum lands
 * on a tender, this builds the impact assessment:
 *
 *   Live path (backend + AI configured, text extractable):
 *     extract the addendum's text → send it with the current requirement
 *     register and active modules to /api/ai task "addendum" → a real,
 *     document-grounded assessment (provisional: false).
 *
 *   Fallback (demo mode, AI unavailable, scanned PDF, or any failure):
 *     the deterministic heuristic in engine.ts, ALWAYS labelled
 *     provisional and requiring human confirmation. No fake success.
 */
import { TenderBlueprint, AddendumImpact, ModuleKey } from './types';
import { analyzeAddendum } from './engine';
import { extractFileText } from '../lib/docText';
import { analyzeAddendumViaAi } from '../lib/ai';
import { isDemoMode } from '../lib/supabase';

const uid = () => `add_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export interface AddendumResult {
  impact: AddendumImpact;
  /** Human-readable note about how the assessment was produced. */
  note: string;
}

export interface AddendumSource {
  /** Fresh upload — text is extracted on the spot. */
  file?: File;
  /** Already-persisted document — its STORED extracted text (so a
      re-tag to Addendum after refresh still gets real analysis). */
  storedText?: string;
  /** The persisted tender document id, kept on the impact. */
  documentId?: string;
}

/** Builds the impact for an addendum from a fresh file or stored text. */
export async function buildAddendumImpact(
  documentName: string,
  bp: TenderBlueprint,
  source: AddendumSource = {},
): Promise<AddendumResult> {
  const provisional = (note: string): AddendumResult => ({
    impact: { ...analyzeAddendum(documentName, bp), documentId: source.documentId },
    note,
  });

  if (isDemoMode()) {
    return provisional('Demo mode — provisional heuristic assessment. Connect a backend and AI provider for document-grounded analysis.');
  }

  try {
    let text = source.storedText ?? null;
    if (!text && source.file) {
      const doc = await extractFileText(source.file);
      if (!doc.text) {
        return provisional(doc.note ?? `Could not extract text from ${documentName} — provisional assessment created; please review against the addendum.`);
      }
      text = doc.text;
    }
    if (!text) {
      return provisional('No document content available for this file — provisional assessment created; please review against the addendum.');
    }

    const activeModuleKeys = bp.modules.filter((m) => m.active).map((m) => m.key);
    const result = await analyzeAddendumViaAi(
      documentName,
      text,
      bp.requirements.map((r) => ({ id: r.id, text: r.text })),
      activeModuleKeys,
    );

    const validReqIds = new Set(bp.requirements.map((r) => r.id));
    const validModuleKeys = new Set(activeModuleKeys as string[]);
    return {
      impact: {
        id: uid(),
        documentName,
        receivedAt: new Date().toISOString().split('T')[0],
        summary: result.summary,
        changes: result.changes ?? [],
        affectedRequirementIds: (result.affectedRequirementIds ?? []).filter((id) => validReqIds.has(id)),
        affectedModuleKeys: (result.affectedModuleKeys ?? []).filter((k): k is ModuleKey => validModuleKeys.has(k)),
        pricingImpact: !!result.pricingImpact,
        riskImpact: !!result.riskImpact,
        reviewed: false,
        provisional: false,
        documentId: source.documentId,
      },
      note: 'Addendum analysed against its extracted text — review and confirm the assessment.',
    };
  } catch (err) {
    return provisional(`Live analysis unavailable (${err instanceof Error ? err.message : 'error'}) — provisional assessment created; please review against the addendum.`);
  }
}
