/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { toast } from '../lib/toast';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, Layers, Settings, Sliders, Play, Save, RefreshCw, 
  HelpCircle, Eye, Edit3, ChevronRight, CheckCircle2, History, 
  Info, AlertTriangle, Cpu, Terminal, FileCode, Check
} from 'lucide-react';

interface RfqPromptConfig {
  id: string;
  name: string;
  sector: string;
  code: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  safetyFilters: {
    strictEvidenceOnly: boolean;
    hallucinationGuard: boolean;
    lessonsLearnedInjection: boolean;
    credentialsMatching: boolean;
  };
}

const defaultPrompts: Record<string, RfqPromptConfig> = {
  tfnsw: {
    id: 'tfnsw',
    name: 'Tarnwick Metropolitan Transit Authority (TMTA) Standard',
    sector: 'Infrastructure & Transport',
    code: 'TMTA-STD-v4.1',
    systemPrompt: `You are the Lead Sourcing Architect trained on the Tarnwick Metropolitan Transit Authority (TMTA) Procurement Framework.
Your goal is to parse and draft highly compliant technical responses for Tarnwick transit infrastructure tenders.

CORE CONSTRAINTS & COMPLIANCE CRITERIA:
1. Mandate strict compliance with TMTA Quality Management Specification Q71.
2. Cross-reference all Safety Management claims with WHS Accreditation Scheme or AS/NZS ISO 45001.
3. Every engineering or construction assertion MUST connect to an active, verified Knowledge Base file containing valid TMTA network project experience (e.g. Tarnwick Metro, Northgate Light Rail).
4. Do not use generic or placeholder credentials. If specific team member certs (like TMTA Rail Worker (TRW)) are missing, flag it as a critical commercial gap.
5. Emphasize sustainability, local community participation, and active risk mitigation in the local transport corridors.

VARIABLES AVAILABLE IN INTAKE RUNTIME:
- {{TENDER_NAME}} : Name of the specific Tarnwick transit project.
- {{TENDER_NUMBER}} : TMTA RFT Reference Code.
- {{COMPLIANCE_REQUIREMENTS}} : Structured clauses extracted from the tender package.
- {{KNOWLEDGE_BASE_CONTEXT}} : Matched past performance credentials and qualifications.`,
    temperature: 0.15,
    maxTokens: 2500,
    topP: 0.90,
    safetyFilters: {
      strictEvidenceOnly: true,
      hallucinationGuard: true,
      lessonsLearnedInjection: true,
      credentialsMatching: true
    }
  },
  commonwealth: {
    id: 'commonwealth',
    name: 'Commonwealth Procurement Rules (CPR)',
    sector: 'Federal Government',
    code: 'CW-CPR-v3.0',
    systemPrompt: `You are the Lead Bid Consultant specializing in Commonwealth Procurement Rules (CPRs) under the Department of Finance.
Your goal is to align draft proposals with division-level mandates and federal guidelines.

CORE CONSTRAINTS & COMPLIANCE CRITERIA:
1. Ensure full compliance with CPR Division 1 (General Rules) and Division 2 (Additional Rules for procurement over threshold).
2. Incorporate Indigenous Procurement Policy (IPP) targets and local industry participation requirements.
3. Emphasize value-for-money assessment frameworks, demonstrating cost-effectiveness combined with non-financial benefits.
4. Integrate strict climate risk assessments and modern slavery statement assertions.
5. Ensure formatting strictly matches the required Senate Order on Government Contracts templates.`,
    temperature: 0.20,
    maxTokens: 3000,
    topP: 0.95,
    safetyFilters: {
      strictEvidenceOnly: true,
      hallucinationGuard: true,
      lessonsLearnedInjection: false,
      credentialsMatching: true
    }
  },
  defence: {
    id: 'defence',
    name: 'Defence Infrastructure (ASDEFCON / DEHP)',
    sector: 'Defence & National Security',
    code: 'DEF-ASDEFCON-v5.5',
    systemPrompt: `You are the Principal Security Sourcing Specialist operating under ASDEFCON (Australian Defence Contracting) standards.
Your role is to draft high-clearance engineering and infrastructure responses for CASG and Defence Estate projects.

CORE CONSTRAINTS & COMPLIANCE CRITERIA:
1. Enforce rigorous alignment with the Defence Security Principles Framework (DSPF) and physical asset security protocols.
2. Every staff qualification must denote clearance status (e.g., Baseline, NV1, NV2) validated by DISP membership status.
3. Address Government Furnished Equipment (GFE) management, transition planning, and intellectual property (IP) registers.
4. Safety claims must conform to the Defence Work Health and Safety (WHS) strategy.
5. Strictly avoid public nomenclature. Mask all physical site identifiers behind official security codes.`,
    temperature: 0.05,
    maxTokens: 4000,
    topP: 0.85,
    safetyFilters: {
      strictEvidenceOnly: true,
      hallucinationGuard: true,
      lessonsLearnedInjection: true,
      credentialsMatching: true
    }
  },
  itpanels: {
    id: 'itpanels',
    name: 'IT & Digital Panels (DTA & Cloud)',
    sector: 'Technology & Cloud',
    code: 'DTA-DIGITAL-v2.2',
    systemPrompt: `You are the Lead Solutions Architect for federal and state digital panel responses under DTA (Digital Transformation Agency) guidelines.
Your objective is to frame technical architectures into agile, safe, and modern service delivery responses.

CORE CONSTRAINTS & COMPLIANCE CRITERIA:
1. Adhere strictly to the DTA Digital Service Standard, including agile delivery, accessibility (WCAG 2.1 AA), and user-centric design.
2. Cloud solutions must specify hosting locations (e.g., Canberra Data Centres) and outline sovereignty protection under the Hosting Certification Framework.
3. Align security parameters with the ASD Information Security Manual (ISM) and Essential Eight cyber mitigation controls.
4. Detail SLA levels, system metrics, disaster recovery time objectives (RTO), and recovery point objectives (RPO).
5. Leverage past software delivery benchmarks to demonstrate scalable sprint velocity.`,
    temperature: 0.35,
    maxTokens: 2000,
    topP: 0.95,
    safetyFilters: {
      strictEvidenceOnly: false,
      hallucinationGuard: true,
      lessonsLearnedInjection: true,
      credentialsMatching: true
    }
  }
};

const mockSandboxClauses: Record<string, { requirement: string; expectedDecomposition: string[]; mockDraft: string }> = {
  tfnsw: {
    requirement: "TMTA Specification Q71 Clause 4.2: The Contractor must provide a detailed Project Quality Plan (PQP) specifying independent audit scheduling and the credentials of the quality representative who possesses a minimum of 5 years in transport signaling rail works.",
    expectedDecomposition: [
      "Mandatory: Submit detailed Project Quality Plan (PQP).",
      "Mandatory: Audit scheduling must denote independent testing.",
      "Strict Qualification: Quality representative must hold 5+ years of verified rail signaling experience."
    ],
    mockDraft: `## Project Quality Plan & Independent Auditing
In alignment with the **TMTA Specification Q71 Clause 4.2** mandates, our Project Quality Plan (PQP) establishes a dual-tier independent audit regime. 

We have assigned **Priya Raman** as the Senior Quality & Assurance Representative for this contract. Priya possesses **7 years of continuous rail signaling experience** on Tarnwick transit corridors, including verified past performance on the *Northgate Light Rail Stage 1 signalling upgrades* (under matching QA-Q71 audits, logged in KB Reference: PLR-QA-2024).

Independent quality audits will be conducted by *Vanguard Rail Certifiers* on a bi-monthly cycle, satisfying TMTA Section Q71 quality gate constraints without reservation.`
  },
  commonwealth: {
    requirement: "Commonwealth CPR Section 10.15: The supplier must declare their percentage of indigenous business subcontractor engagement and show full compliance with the Indigenous Procurement Policy (IPP) targets of 3% contract value allocation.",
    expectedDecomposition: [
      "Mandatory: Quantified declaration of Indigenous subcontractor engagement.",
      "Regulatory: Conformity to federal IPP 3% financial allocation threshold."
    ],
    mockDraft: `## Indigenous Business Engagement & CPR Compliance
Our proposal complies fully with **Commonwealth Procurement Rule 10.15** and the **Indigenous Procurement Policy (IPP)**. 

Our active bidding consortium commits **3.8% of the total contract value** ($7.56M of the $199M estimated value) to certified Supply Nation subcontractors. Core logistics and civil operations are sub-contracted to *Yura Civil Logistics*, a Supply Nation registered joint venture. 

All metrics will be tracked and reported via the federal IPP Portal on a quarterly basis, in alignment with Senate Order reporting requirements.`
  },
  defence: {
    requirement: "ASDEFCON Security Annex D: All personnel accessing the secure zone must be cleared to Negative Vetting Level 1 (NV1) and registered in the DISP database under the contractor's cage code. Detail transit security of high-value systems.",
    expectedDecomposition: [
      "High Security: 100% personnel NV1 clearance requirement.",
      "Contractual: Supplier must provide valid Cage Code and DISP verification.",
      "Technical: Outline physical transit security policies for classified modules."
    ],
    mockDraft: `## National Security Annex & DISP Compliance
All engineering teams allocated to this contract hold active **Negative Vetting Level 1 (NV1)** clearances, as verified by our internal Security Officer. Personnel records are synced in real-time with our Defense Industry Security Program (**DISP Membership #418290**).

Classified components and sensitive software payloads will be securely packaged in heavy-gauge armored shipping trunks, equipped with dual-factor tamper-evident electronic trackers. Transit routes will be restricted to designated defense-approved corridors, maintaining continuous guard tracking from our secure assembly facility to site integration.`
  },
  itpanels: {
    requirement: "DTA Digital Service Standard Criterion 9: Ensure the service is accessible and compliant with WCAG 2.1 AA guidelines. The vendor must provide continuous hosting reliability metrics exceeding 99.95% uptime.",
    expectedDecomposition: [
      "Accessibility: Strict WCAG 2.1 Level AA front-end compliance.",
      "SLA Constraint: Continuous hosting reliability SLA > 99.95%."
    ],
    mockDraft: `## Accessibility (WCAG 2.1 AA) & Platform SLA Uptime
Our digital architecture is engineered to satisfy the **DTA Digital Service Standard Criterion 9**. The user interface has been audited and fully complies with **WCAG 2.1 Level AA accessibility criteria** (supported by our automated testing log and manual screen-reader evaluations).

The cloud application will be hosted on sovereign Canberra Data Centre nodes. Our High-Availability (HA) Kubernetes mesh achieves a documented **99.98% continuous availability uptime**, comfortably exceeding the requested 99.95% DTA panel SLA.`
  }
};

export function AdminPromptConsole() {
  const [rfqConfigs, setRfqConfigs] = useState<Record<string, RfqPromptConfig>>(defaultPrompts);
  const [activeTab, setActiveTab] = useState<string>('tfnsw');
  const [editMode, setEditMode] = useState<'PROMPT' | 'JSON'>('PROMPT');
  
  // Sandbox Simulator State
  const [sandboxInput, setSandboxInput] = useState<string>(mockSandboxClauses.tfnsw.requirement);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simResults, setSimResults] = useState<{
    decomposition: string[];
    draft: string;
    temperatureUsed: number;
    metrics: { confidence: number; tokenCount: number; timeMs: number };
  } | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([
    { id: '1', timestamp: '2026-06-30 08:12', user: 'Priya Raman', action: 'System Setup', details: 'Initialized standard templates for TMTA, Defence and Central Procurement panels.' },
    { id: '2', timestamp: '2026-06-30 11:45', user: 'Priya Raman', action: 'Prompt Optimize', details: 'Decreased TMTA drafting temperature from 0.2 to 0.15 for tighter QA compliance.' }
  ]);

  const activeConfig = rfqConfigs[activeTab];

  const handleUpdateConfig = (updates: Partial<RfqPromptConfig>) => {
    setRfqConfigs(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        ...updates
      }
    }));
  };

  const handleSafetyToggle = (key: keyof RfqPromptConfig['safetyFilters']) => {
    handleUpdateConfig({
      safetyFilters: {
        ...activeConfig.safetyFilters,
        [key]: !activeConfig.safetyFilters[key]
      }
    });
  };

  const handleSave = () => {
    const newLog = {
      id: String(Date.now()),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      user: 'Priya Raman',
      action: 'Prompt Update',
      details: `Saved new master instructions for ${activeConfig.name} (${activeConfig.code}).`
    };
    setAuditLogs(prev => [newLog, ...prev]);
    toast(`Configuration saved! Systems updated. All subsequent ${activeConfig.name} intake and drafting runs will utilize these master rules.`);
  };

  const handleReset = () => {
    if (confirm(`Are you sure you want to restore the factory default prompts for ${activeConfig.name}? This overrides custom system prompt instructions.`)) {
      setRfqConfigs(prev => ({
        ...prev,
        [activeTab]: { ...defaultPrompts[activeTab] }
      }));
    }
  };

  const triggerSimulation = () => {
    setIsSimulating(true);
    setSimResults(null);
    setTimeout(() => {
      const sandboxData = mockSandboxClauses[activeTab] || mockSandboxClauses.tfnsw;
      setSimResults({
        decomposition: sandboxData.expectedDecomposition,
        draft: sandboxData.mockDraft,
        temperatureUsed: activeConfig.temperature,
        metrics: {
          confidence: Math.round(92 + Math.random() * 6),
          tokenCount: Math.round(380 + Math.random() * 120),
          timeMs: Math.round(900 + Math.random() * 400)
        }
      });
      setIsSimulating(false);
    }, 1200);
  };

  // Keep sandbox input in sync when user switches RFQ tabs
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSandboxInput(mockSandboxClauses[tabId]?.requirement || '');
    setSimResults(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Panel */}
      <div className="border-b border-slate-200 pb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-sans font-bold text-slate-950 tracking-tight flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-700" />
            <span>Ultimate Master Prompt Console</span>
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 text-[10px] font-mono rounded border border-indigo-200">System Admin Mode</span>
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Configure system prompts, temperature parameters, and structural directives governing our autonomous intake, matrix mapping, and proposal drafting engines.
          </p>
        </div>
        
        <div className="flex gap-2 shrink-0">
          <button 
            onClick={handleReset}
            className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white hover:bg-slate-50 flex items-center gap-1 cursor-pointer transition-colors"
            title="Restore default factory templates"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset Defaults
          </button>
          
          <button 
            onClick={handleSave}
            className="px-4 py-1.5 bg-slate-950 text-white rounded text-xs font-bold hover:bg-slate-900 flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Apply Workspace Override
          </button>
        </div>
      </div>

      {/* Sector Tab Selector */}
      <div className="flex flex-wrap gap-2 border-b border-slate-150 pb-2">
        {(Object.values(rfqConfigs) as RfqPromptConfig[]).map(config => (
          <button
            key={config.id}
            onClick={() => handleTabChange(config.id)}
            className={`px-3 py-2 text-xs font-semibold rounded-t-md border-b-2 transition-all cursor-pointer ${
              activeTab === config.id
                ? 'border-indigo-700 text-indigo-900 bg-indigo-50/40 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/60'
            }`}
          >
            <div className="text-left">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">{config.sector}</span>
              <span className="text-xs leading-none">{config.name}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Console Panel: Parameter fine-tuning & Toggles (col-span-8) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded p-5 space-y-5 flex flex-col justify-between shadow-xs">
          
          <div className="space-y-4">
            
            {/* Sector metadata line */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-mono font-bold text-slate-900">SYSTEM INSTRUCTIONS CONFIG</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 font-semibold">Active Tag: {activeConfig.code}</span>
            </div>

            {/* Prompt Mode Selectors */}
            <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded border border-slate-150 h-9">
              <div className="text-[11px] text-slate-600 font-medium px-1">
                Editing Master Instruction Set for <strong className="text-slate-800">{activeConfig.name}</strong>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditMode('PROMPT')}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded-sm font-semibold transition-all ${
                    editMode === 'PROMPT' ? 'bg-white text-indigo-950 shadow-3xs border border-slate-200 font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Text Editor
                </button>
                <button
                  onClick={() => setEditMode('JSON')}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded-sm font-semibold transition-all ${
                    editMode === 'JSON' ? 'bg-white text-indigo-950 shadow-3xs border border-slate-200 font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Raw JSON
                </button>
              </div>
            </div>

            {/* Instruction editor field */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">System Master Prompt Core</label>
                <span className="text-[9px] text-slate-400 font-mono">Accepts dynamic mustache tokens</span>
              </div>
              {editMode === 'PROMPT' ? (
                <textarea
                  value={activeConfig.systemPrompt}
                  onChange={(e) => handleUpdateConfig({ systemPrompt: e.target.value })}
                  className="w-full h-80 font-mono text-xs p-3.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-950 bg-slate-50/50 leading-relaxed resize-none"
                  placeholder="Insert System Guidelines..."
                />
              ) : (
                <textarea
                  value={JSON.stringify(activeConfig, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      handleUpdateConfig(parsed);
                    } catch (err) {
                      // Silently catch json syntax errors while typing
                    }
                  }}
                  className="w-full h-80 font-mono text-[11px] p-3.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-950 bg-slate-900 text-emerald-400 leading-normal resize-none"
                />
              )}
            </div>

            {/* Sliders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              
              {/* Temperature slider */}
              <div className="space-y-1.5 p-3 bg-slate-50 rounded border border-slate-150">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-slate-500 font-bold uppercase">Temperature</span>
                  <span className="text-indigo-700 font-bold font-mono">{activeConfig.temperature}</span>
                </div>
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={activeConfig.temperature}
                  onChange={(e) => handleUpdateConfig({ temperature: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="text-[9px] text-slate-500">
                  Lower = tighter compliance adherence. Higher = creative drafting.
                </div>
              </div>

              {/* Top-P slider */}
              <div className="space-y-1.5 p-3 bg-slate-50 rounded border border-slate-150">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-slate-500 font-bold uppercase">Top P</span>
                  <span className="text-indigo-700 font-bold font-mono">{activeConfig.topP}</span>
                </div>
                <input 
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.05"
                  value={activeConfig.topP}
                  onChange={(e) => handleUpdateConfig({ topP: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="text-[9px] text-slate-500">
                  Nucleus sampling probability filter. Controls vocabulary breadth.
                </div>
              </div>

              {/* Max tokens */}
              <div className="space-y-1.5 p-3 bg-slate-50 rounded border border-slate-150">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-slate-500 font-bold uppercase">Draft Limit</span>
                  <span className="text-indigo-700 font-bold font-mono">{activeConfig.maxTokens} tokens</span>
                </div>
                <select
                  value={activeConfig.maxTokens}
                  onChange={(e) => handleUpdateConfig({ maxTokens: parseInt(e.target.value) })}
                  className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={1500}>1500 (Short, strict paragraphs)</option>
                  <option value={2000}>2000 (Standard proposal clause)</option>
                  <option value={3000}>3000 (Detailed response layout)</option>
                  <option value={4000}>4000 (Extensive defense format)</option>
                </select>
                <div className="text-[9px] text-slate-500">
                  Maximum dynamic token allocation per clause drafting block.
                </div>
              </div>

            </div>

          </div>

          {/* Prompt override notification */}
          <div className="p-3 bg-indigo-50 border border-indigo-150 rounded flex gap-2.5 mt-4">
            <Info className="w-4.5 h-4.5 text-indigo-700 shrink-0 mt-0.5" />
            <div className="text-[11px] text-indigo-900 leading-normal">
              <strong className="font-semibold">Dynamic Workspace Sync:</strong> Overriding the master prompt changes how text is matched and response frameworks are built. New sections loaded in the Drafting Studio will immediately absorb these updated instructions.
            </div>
          </div>

        </div>

        {/* Right Panel: Active Safety Toggles & Interactive Sandbox Tester (col-span-5) */}
        <div className="lg:col-span-5 space-y-6 flex flex-col justify-between">
          
          {/* Safety Toggles Box */}
          <div className="bg-white border border-slate-200 rounded p-5 space-y-4 shadow-xs">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2 font-bold">Safety Control Gates</h3>
            
            <div className="space-y-3.5">
              
              {/* Toggle 1: Strict Evidence */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    Strict Evidence Mapping
                    {activeConfig.safetyFilters.strictEvidenceOnly && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Reject or tag claims that do not connect to a Knowledge Base past-performance file.
                  </p>
                </div>
                <button
                  onClick={() => handleSafetyToggle('strictEvidenceOnly')}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 shrink-0 cursor-pointer ${
                    activeConfig.safetyFilters.strictEvidenceOnly ? 'bg-indigo-600' : 'bg-slate-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    activeConfig.safetyFilters.strictEvidenceOnly ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Toggle 2: Hallucination Guard */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    Hallucination Guard Engine
                    {activeConfig.safetyFilters.hallucinationGuard && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Check response text against verified document sentences. Prevents metric extrapolation.
                  </p>
                </div>
                <button
                  onClick={() => handleSafetyToggle('hallucinationGuard')}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 shrink-0 cursor-pointer ${
                    activeConfig.safetyFilters.hallucinationGuard ? 'bg-indigo-600' : 'bg-slate-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    activeConfig.safetyFilters.hallucinationGuard ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Toggle 3: Lessons learned integration */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    Lessons Learned Integration
                    {activeConfig.safetyFilters.lessonsLearnedInjection && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Extract historical bid review caveats to warn drafters of previous failure patterns.
                  </p>
                </div>
                <button
                  onClick={() => handleSafetyToggle('lessonsLearnedInjection')}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 shrink-0 cursor-pointer ${
                    activeConfig.safetyFilters.lessonsLearnedInjection ? 'bg-indigo-600' : 'bg-slate-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    activeConfig.safetyFilters.lessonsLearnedInjection ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Toggle 4: Credentials matching */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    Bid Team Qualification Filter
                    {activeConfig.safetyFilters.credentialsMatching && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Cross-examine staff registry resumes for qualification requirements matching RFT clauses.
                  </p>
                </div>
                <button
                  onClick={() => handleSafetyToggle('credentialsMatching')}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 shrink-0 cursor-pointer ${
                    activeConfig.safetyFilters.credentialsMatching ? 'bg-indigo-600' : 'bg-slate-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    activeConfig.safetyFilters.credentialsMatching ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

            </div>
          </div>

          {/* Dynamic Prompt Tester Sandbox */}
          <div className="bg-white border border-slate-200 rounded p-5 space-y-4 shadow-xs flex-1 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2 mb-3.5 font-bold flex items-center justify-between">
                <span>Active Sandbox Prompt Tester</span>
                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 text-[9px] rounded font-mono font-bold border border-amber-200">Simulation Mode</span>
              </h3>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-500 block font-bold">Input Clause / Tender Constraint</label>
                  <textarea
                    value={sandboxInput}
                    onChange={(e) => setSandboxInput(e.target.value)}
                    className="w-full h-20 text-xs p-2 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-950 resize-none font-sans outline-none bg-slate-50/30"
                    placeholder="Type an RFQ clause to test how your system instructions parse and structure proposal replies..."
                  />
                </div>

                <button
                  onClick={triggerSimulation}
                  disabled={isSimulating}
                  className="w-full py-2 bg-indigo-950 hover:bg-indigo-900 disabled:bg-slate-300 text-white font-semibold text-xs rounded shadow-3xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  {isSimulating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing under active Prompt rules...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-white" /> Simulate Parsing & Drafting Run
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-4 flex-1">
              <AnimatePresence mode="wait">
                {simResults ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-3 pt-3 border-t border-slate-100"
                  >
                    <div>
                      <span className="text-[9px] font-mono uppercase text-slate-400 font-bold tracking-wider">Simulated Compliance Extraction</span>
                      <div className="space-y-1.5 mt-1">
                        {simResults.decomposition.map((clause, idx) => (
                          <div key={idx} className="p-1.5 bg-slate-50 border border-slate-200 text-[10px] text-slate-700 rounded flex gap-1.5 leading-normal">
                            <span className="text-[10px] font-bold text-indigo-700 font-mono">[{idx + 1}]</span>
                            <span>{clause}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[9px] font-mono uppercase text-slate-400 font-bold tracking-wider">Simulated Model Output Draft</span>
                      <div className="p-3 bg-slate-950 text-slate-200 text-[10.5px] rounded mt-1 font-sans border border-slate-800 leading-relaxed max-h-40 overflow-y-auto italic">
                        {simResults.draft}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-[9px] font-mono text-slate-500 pt-1">
                      <div className="border-r border-slate-100">
                        <span className="block text-slate-400 font-bold">ACCURACY</span>
                        <span className="text-emerald-700 font-bold">{simResults.metrics.confidence}% Score</span>
                      </div>
                      <div className="border-r border-slate-100">
                        <span className="block text-slate-400 font-bold">LATENCY</span>
                        <span className="text-slate-800 font-bold">{simResults.metrics.timeMs}ms</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 font-bold">TEMP VALUE</span>
                        <span className="text-indigo-700 font-bold">{simResults.temperatureUsed}</span>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  !isSimulating && (
                    <div className="text-center py-8 border border-dashed border-slate-150 rounded bg-slate-50/50 flex flex-col justify-center items-center">
                      <FileCode className="w-8 h-8 text-slate-300 mb-2" />
                      <h4 className="text-xs font-semibold text-slate-900">Output Simulator Inactive</h4>
                      <p className="text-[10px] text-slate-400 max-w-xs mt-1 leading-normal">
                        Click the simulation button above to run our parser model sandbox and inspect the downstream compliance outputs immediately.
                      </p>
                    </div>
                  )
                )}
              </AnimatePresence>
            </div>

          </div>

        </div>

      </div>

      {/* Admin Log & Rollback */}
      <div className="bg-white border border-slate-200 rounded p-5 shadow-xs">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2.5 mb-4 font-bold flex items-center gap-1.5">
          <History className="w-4 h-4 text-slate-600" /> System Prompt Audit Logs & Version Lock
        </h3>

        <div className="space-y-3">
          {auditLogs.map((log) => (
            <div key={log.id} className="flex flex-col sm:flex-row justify-between text-xs border-b border-slate-100 pb-3 last:border-0 last:pb-0 gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-mono text-[10px]">[{log.timestamp}]</span>
                  <span className="font-semibold text-slate-900">{log.user}</span>
                  <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-800 text-[9px] font-mono rounded font-bold border border-indigo-200">
                    {log.action}
                  </span>
                </div>
                <div className="text-slate-600 text-[11px] leading-relaxed">{log.details}</div>
              </div>
              
              <div className="flex items-center gap-1.5 self-start sm:self-center">
                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-mono font-bold">
                  Active
                </span>
                <button 
                  onClick={() => toast('Rollback verification passed. System prompts reverted to selected configuration.')}
                  className="text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline bg-indigo-50/30 px-2 py-1 rounded border border-transparent hover:border-indigo-200 transition-all"
                >
                  Rollback Version
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
