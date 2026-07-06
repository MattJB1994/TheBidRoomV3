/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client & Sector Memory — a lightweight, honest memory layer.
 *
 * Groups reusable insights (common requirements, evidence, clarifications,
 * commercial assumptions, module patterns, terminology) across the
 * blueprints the team has actually built, keyed by client, sector and
 * tender type. It NEVER claims to "know" a client it has no data for —
 * every group is derived only from blueprints present in the workspace.
 */
import { TenderBlueprint, ModuleKey } from './types';

export type MemoryDimension = 'client' | 'sector' | 'tenderType';

export interface MemoryGroup {
  dimension: MemoryDimension;
  key: string;                      // e.g. the client name / sector / submission type
  tenderCount: number;
  commonRequirements: string[];
  commonEvidence: string[];
  commonClarifications: string[];
  commonCommercialAssumptions: string[];
  commonModules: ModuleKey[];
  commonTerminology: string[];
}

interface BlueprintWithContext {
  bp: TenderBlueprint;
  client: string;
  sector: string;
  tenderType: string;
}

const topN = <T>(items: T[], n: number, keyer: (t: T) => string): string[] => {
  const counts = new Map<string, number>();
  items.forEach((it) => { const k = keyer(it); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); });
  return [...counts.entries()]
    .filter(([, c]) => c >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
};

function buildGroup(dimension: MemoryDimension, key: string, entries: BlueprintWithContext[]): MemoryGroup {
  const bps = entries.map((e) => e.bp);
  const reqs = bps.flatMap((b) => b.requirements);
  const evidence = bps.flatMap((b) => b.evidence.filter((e) => e.matchedFile));
  const commercial = bps.flatMap((b) => b.commercial);
  const modules = bps.flatMap((b) => b.modules.filter((m) => m.active));

  // Common modules by activation frequency.
  const moduleCounts = new Map<ModuleKey, number>();
  modules.forEach((m) => moduleCounts.set(m.key, (moduleCounts.get(m.key) ?? 0) + 1));
  const commonModules = [...moduleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);

  return {
    dimension, key, tenderCount: entries.length,
    commonRequirements: topN(reqs, 5, (r) => r.type),
    commonEvidence: topN(evidence, 5, (e) => e.type),
    commonClarifications: topN(commercial.filter((c) => c.type === 'Clarification'), 4, (c) => c.text.slice(0, 60)),
    commonCommercialAssumptions: topN(commercial.filter((c) => c.type === 'Pricing assumption' || c.type === 'Scope exclusion'), 4, (c) => c.text.slice(0, 60)),
    commonModules,
    commonTerminology: topN(bps.flatMap((b) => b.inputs.preferredTerminology.map((t) => ({ t }))), 8, (x) => x.t),
  };
}

/**
 * Builds memory groups for one dimension. `context` maps each blueprint
 * to its client/sector/tender-type (the caller resolves these from the
 * tender record + blueprint meta). Groups with only one tender are still
 * returned — the UI can show "based on 1 tender" honestly.
 */
export function buildMemory(context: BlueprintWithContext[], dimension: MemoryDimension): MemoryGroup[] {
  const byKey = new Map<string, BlueprintWithContext[]>();
  for (const entry of context) {
    const key = (dimension === 'client' ? entry.client : dimension === 'sector' ? entry.sector : entry.tenderType) || 'Unspecified';
    const list = byKey.get(key) ?? [];
    list.push(entry);
    byKey.set(key, list);
  }
  return [...byKey.entries()]
    .map(([key, entries]) => buildGroup(dimension, key, entries))
    .sort((a, b) => b.tenderCount - a.tenderCount);
}

export type { BlueprintWithContext };
