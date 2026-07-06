/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared bits for the blueprint pages: the common props contract,
 * status→tone maps, and the "no tender yet" empty state.
 */
import React from 'react';
import { FileSearch, Plus } from 'lucide-react';
import { TenderBlueprint, RequirementStatus, ComplianceState, RiskRating, EvidenceStatus, ReviewStatus, DraftStatus } from '../../blueprint/types';
import { TeamMember, Tender, KBFile } from '../../types';
import { EmptyState, PrimaryButton, PillTone } from '../ui';

/** Updater the pages use to mutate the active tender's blueprint. */
export type BlueprintUpdater = (fn: (bp: TenderBlueprint) => TenderBlueprint) => void;

export interface BlueprintPageProps {
  tender: Tender | undefined;
  bp: TenderBlueprint | null;
  update: BlueprintUpdater;
  team: TeamMember[];
  kbFiles: KBFile[];
  onAddKBFile: (file: KBFile, rawFile?: File) => void;
  onNavigate: (page: string) => void;
}

export const teamName = (team: TeamMember[], id: string | null | undefined): string =>
  team.find((m) => m.id === id)?.name ?? 'Unassigned';

export const REQ_STATUS_TONE: Record<RequirementStatus, PillTone> = {
  'Not started': 'slate', 'In progress': 'blue', 'Drafted': 'indigo', 'In review': 'amber', 'Complete': 'green',
};
export const COMPLIANCE_TONE: Record<ComplianceState, PillTone> = {
  'Compliant': 'green', 'Partial': 'amber', 'Non-compliant': 'red', 'Not assessed': 'slate',
};
export const RISK_TONE: Record<RiskRating, PillTone> = {
  'High': 'red', 'Medium': 'amber', 'Low': 'slate', 'None': 'slate',
};
export const EVIDENCE_TONE: Record<EvidenceStatus, PillTone> = {
  found: 'green', check: 'amber', missing: 'red',
};
export const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  found: 'Evidence found', check: 'Needs checking', missing: 'Missing',
};
export const REVIEW_TONE: Record<ReviewStatus, PillTone> = {
  'Not started': 'slate', 'In review': 'amber', 'Changes requested': 'red', 'Approved': 'green',
};
export const DRAFT_TONE: Record<DraftStatus, PillTone> = {
  'Not started': 'slate', 'Drafting': 'blue', 'Drafted': 'indigo', 'In review': 'amber', 'Approved': 'green',
};

/** Rendered by every blueprint page when there's no analysed tender yet. */
export function NoBlueprint({ onNavigate, hasTender }: { onNavigate: (p: string) => void; hasTender: boolean }) {
  return (
    <EmptyState
      icon={<FileSearch className="w-5 h-5" />}
      title={hasTender ? 'This tender has not been analysed yet' : 'No tender project yet'}
      body={hasTender
        ? 'Run Analyse Tender to generate the Tender Blueprint — requirements, modules, evidence map, review gates and export plan are all built from the analysis.'
        : 'Create a tender project and upload the tender documents. Analysing them generates the Tender Blueprint that drives everything here.'}
      action={
        <PrimaryButton onClick={() => onNavigate('add-tender')}>
          <Plus className="w-4 h-4" /> {hasTender ? 'Analyse tender' : 'Create new tender'}
        </PrimaryButton>
      }
    />
  );
}
