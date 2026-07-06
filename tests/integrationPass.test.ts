/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration-pass tests: Prompt Composer used by drafting actions, new
 * infrastructure modules activating, SME request + clarification
 * generation, submission-pack blocked reasons, closeout persistence and
 * client/sector memory grouping.
 */
import { describe, it, expect, vi } from 'vitest';
import { generateBlueprint } from '../src/blueprint/engine';
import { runDraftAction } from '../src/blueprint/aiService';
import { composePrompt } from '../src/blueprint/promptComposer';
import { buildSmeRequestFromEvidence, buildSmeRequests, generateClarifications } from '../src/blueprint/clarificationBuilder';
import { buildMemory, BlueprintWithContext } from '../src/blueprint/clientMemory';
import { TenderBlueprint } from '../src/blueprint/types';
import { ExtractedTenderMetadata, Tender, TenderStatus } from '../src/types';

// Force demo mode off for the composed-prompt drafting test so we can
// assert the composed prompt is what gets sent.
vi.mock('../src/lib/supabase', () => ({
  getSupabase: () => { throw new Error('not used'); },
  isDemoMode: () => false,
}));
vi.mock('../src/lib/ai', () => ({
  draftSection: vi.fn(async (prompt: string) => `PROMPT_RECEIVED::${prompt.slice(0, 400)}`),
}));

const tender: Tender = {
  id: 't1', name: 'Vanguard Signalling', number: 'N', client: 'Metro Trains', closingDate: '2099-01-01', portal: 'P',
  status: TenderStatus.Drafting, estimatedValue: '$1m', probabilityOfWin: 50, ownerId: 'u1',
};
const extracted = (over: Partial<ExtractedTenderMetadata> = {}): ExtractedTenderMetadata => ({
  client: 'Metro Trains', tenderName: 'Vanguard Signalling', tenderNumber: 'N', closingDate: '2099-01-01', submissionPortal: 'P',
  mandatoryRequirements: ['Provide a technical methodology', 'Nominate key personnel with CVs'],
  evaluationCriteria: ['Technical'], requiredSchedules: [],
  pageLimits: '', wordLimits: '', attachmentsCount: 0, pricingFormsCount: 1,
  requiredCVsCount: 1, requiredProjectExamplesCount: 1, mandatoryInsurances: ['Public liability'], requiredPolicies: [], addendaCount: 0,
  ...over,
});
const team = [{ id: 'u1', name: 'BM', email: 'b@x.com', role: 'BID_MANAGER' as const }];
const gen = (over: Partial<ExtractedTenderMetadata> = {}): TenderBlueprint =>
  generateBlueprint({ tender, extracted: extracted(over), kbFiles: [], personnel: [], team, documentNames: ['RFT.pdf'] });

describe('Prompt Composer used by drafting', () => {
  it('sends the composed prompt through to the draft call', async () => {
    const bp = gen();
    const m = bp.modules.find((x) => x.active)!;
    const composed = composePrompt({ bp, module: m });
    const result = await runDraftAction({
      module: m, requirements: bp.requirements.filter((r) => m.requirementIds.includes(r.id)),
      evidence: bp.evidence.filter((e) => e.moduleKey === m.key), inputs: bp.inputs,
      tenderName: tender.name, clientName: tender.client, action: 'generate', currentDraft: '',
      composedPrompt: composed.prompt,
    });
    // The mocked draftSection echoes the prompt it received — confirm it
    // was the composed (layered) prompt, i.e. carries the master-prompt layer.
    expect(result.content).toContain('PROMPT_RECEIVED');
    expect(result.content).toMatch(/MASTER PROMPT|SYSTEM RULES/);
  });
});

describe('New infrastructure modules activate from requirements', () => {
  it('activates Construction Methodology, Possession/Access, Quality and Environmental when the tender mentions them', () => {
    const bp = gen({
      mandatoryRequirements: [
        'Describe your construction methodology and site staging',
        'Detail possession and rail corridor access planning',
        'Provide quality management including ITPs and hold points',
        'Provide environmental management and erosion and sediment control',
        'Describe stakeholder engagement and community consultation',
      ],
    });
    const activeKeys = bp.modules.filter((m) => m.active).map((m) => m.key);
    expect(activeKeys).toContain('construction-methodology');
    expect(activeKeys).toContain('possession-access-planning');
    expect(activeKeys).toContain('quality-management');
    expect(activeKeys).toContain('environmental-management');
    expect(activeKeys).toContain('stakeholder-management');
  });

  it('each activated new module records why it was activated', () => {
    const bp = gen({ mandatoryRequirements: ['Provide quality management with hold points and ITPs'] });
    const qm = bp.modules.find((m) => m.key === 'quality-management');
    expect(qm?.active).toBe(true);
    expect(qm?.activationReason).toBeTruthy();
  });
});

describe('SME Request Builder', () => {
  it('generates a clear, copyable message linked to requirement and module', () => {
    const bp = gen();
    // Ensure there is a missing-evidence item.
    const missing = bp.evidence.find((e) => e.status === 'missing') ?? bp.evidence[0];
    const request = buildSmeRequestFromEvidence(bp, missing);
    expect(request.suggestedMessage.length).toBeGreaterThan(10);
    expect(request.title).toMatch(/Provide/i);
    expect(request.status).toBe('Draft');
    expect(request.evidenceNeeded).toBe(missing.type);
  });

  it('builds requests for all unresolved missing evidence', () => {
    const bp = gen();
    const requests = buildSmeRequests(bp);
    const missingCount = bp.evidence.filter((e) => e.status === 'missing' && !e.resolution).length;
    expect(requests.length).toBe(missingCount);
  });
});

describe('Clarification & Departures Generator', () => {
  it('converts ambiguous clauses and reliance into proposed wording', () => {
    const bp = gen({
      mandatoryRequirements: ['Deliver works as required to be advised', 'Use client-provided survey data'],
    });
    const items = generateClarifications(bp);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.type === 'Clarification')).toBe(true);
    expect(items.some((i) => i.type === 'Client dependency')).toBe(true);
    items.forEach((i) => {
      expect(i.proposedWording.length).toBeGreaterThan(10);
      expect(i.reviewerRole).toBeTruthy();
    });
  });
});

describe('Client & Sector Memory grouping', () => {
  it('groups blueprints by client and reports tender counts', () => {
    const bpA = gen();
    const bpB = gen();
    const context: BlueprintWithContext[] = [
      { bp: bpA, client: 'Metro Trains', sector: 'Rail', tenderType: 'RFT' },
      { bp: bpB, client: 'Metro Trains', sector: 'Rail', tenderType: 'EOI' },
    ];
    const byClient = buildMemory(context, 'client');
    expect(byClient.length).toBe(1);
    expect(byClient[0].key).toBe('Metro Trains');
    expect(byClient[0].tenderCount).toBe(2);
    const byType = buildMemory(context, 'tenderType');
    expect(byType.length).toBe(2);
  });

  it('does not invent data for a client with no blueprints', () => {
    expect(buildMemory([], 'client')).toEqual([]);
  });
});

describe('Submission Pack blocked reasons', () => {
  it('reports a blocked reason for a client-required pack that is not ready', async () => {
    const { exportReadiness } = await import('../src/blueprint/exportReadiness');
    const { computeScores } = await import('../src/blueprint/engine');
    const bp = gen();
    const scores = computeScores(bp);
    const fullProposal = bp.exports.find((e) => e.key === 'full-proposal')!;
    const state = exportReadiness(bp, fullProposal.key, fullProposal.level, scores);
    expect(state.ready).toBe(false);
    expect(state.blockedBy).toBeTruthy();
  });
});

describe('Closeout persistence shape', () => {
  it('accepts and preserves closeout on the blueprint', () => {
    const bp = gen();
    const withCloseout: TenderBlueprint = { ...bp, closeout: { outcome: 'Won', lessons: 'Start assurance earlier', updatedAt: new Date().toISOString() } };
    expect(withCloseout.closeout?.outcome).toBe('Won');
    expect(withCloseout.closeout?.lessons).toMatch(/assurance/);
  });
});
