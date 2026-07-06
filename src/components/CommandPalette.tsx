/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Global command palette. Opens with Cmd/Ctrl+K (or the search button in
 * the header) and searches across pages, tenders, knowledge-base files,
 * compliance requirements, and team members in one place — then jumps
 * straight there. Keeps the desktop UI uncluttered: nothing is on-screen
 * until invoked.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, LayoutDashboard, GitBranch, ArrowUpFromLine, Layers, Edit3, ShieldAlert,
  FolderHeart, Users, HelpCircle, CreditCard, Settings, Cpu, Calendar, Briefcase,
  Calculator, FileText, CornerDownLeft, X,
} from 'lucide-react';
import type { Tender, KBFile, ComplianceItem, TeamMember } from '../types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: string) => void;
  onSelectTender: (id: string) => void;
  tenders: Tender[];
  kbFiles: KBFile[];
  complianceItems: ComplianceItem[];
  team: TeamMember[];
}

interface Item {
  id: string;
  group: 'Pages' | 'Tenders' | 'Knowledge base' | 'Compliance' | 'Team';
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  action: () => void;
}

const PAGES: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Overview (Dashboard)', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'add-tender', label: 'Create new tender', icon: <ArrowUpFromLine className="w-4 h-4" /> },
  { id: 'blueprint', label: 'Blueprint (Tender Blueprint)', icon: <Briefcase className="w-4 h-4" /> },
  { id: 'documents', label: 'Intake (Documents)', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'requirements', label: 'Requirements', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'modules', label: 'Modules', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'evidence', label: 'Gaps (Evidence)', icon: <FolderHeart className="w-4 h-4" /> },
  { id: 'drafts', label: 'Draft (Drafts)', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'reviews', label: 'Review (Reviews)', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'risks', label: 'Risks', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'commercial', label: 'Commercial', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'exports', label: 'Submit (Submission Pack)', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'closeout', label: 'Closeout & Memory', icon: <GitBranch className="w-4 h-4" /> },
  { id: 'knowledge-base', label: 'Knowledge Base', icon: <FolderHeart className="w-4 h-4" /> },
  { id: 'personnel', label: 'People & CVs', icon: <Users className="w-4 h-4" /> },
  { id: 'team', label: 'Team', icon: <Users className="w-4 h-4" /> },
  { id: 'lessons-learned', label: 'Lessons Learned', icon: <HelpCircle className="w-4 h-4" /> },
  { id: 'billing', label: 'Plans & Billing', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  { id: 'admin-prompts', label: 'Master Prompts', icon: <Cpu className="w-4 h-4" /> },
];

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 100;
  if (t.includes(q)) return 60;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++;
  return qi === q.length ? 20 : 0;
}

export default function CommandPalette({
  open, onClose, onNavigate, onSelectTender, tenders, kbFiles, complianceItems, team,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQuery(''); setActiveIndex(0); setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  const allItems: Item[] = useMemo(() => {
    const pageItems: Item[] = PAGES.map((p) => ({
      id: `page:${p.id}`, group: 'Pages', label: p.label, icon: p.icon,
      action: () => onNavigate(p.id),
    }));
    const tenderItems: Item[] = tenders.map((t) => ({
      id: `tender:${t.id}`, group: 'Tenders', label: t.name, sublabel: `${t.number} · ${t.client}`,
      icon: <Briefcase className="w-4 h-4" />,
      action: () => { onSelectTender(t.id); },
    }));
    const kbItems: Item[] = kbFiles.map((f) => ({
      id: `kb:${f.id}`, group: 'Knowledge base', label: f.name, sublabel: `${f.category} · ${f.size}${f.isStale ? ' · stale' : ''}`,
      icon: <FileText className="w-4 h-4" />,
      action: () => onNavigate('knowledge-base'),
    }));
    const complianceIdx: Item[] = complianceItems.map((c) => ({
      id: `compliance:${c.id}`, group: 'Compliance', label: c.requirement, sublabel: c.status.replace(/_/g, ' '),
      icon: <Layers className="w-4 h-4" />,
      action: () => onNavigate('tender'),
    }));
    const teamItems: Item[] = team.map((m) => ({
      id: `team:${m.id}`, group: 'Team', label: m.name, sublabel: m.role.replace(/_/g, ' '),
      icon: <Users className="w-4 h-4" />,
      action: () => onNavigate('team'),
    }));
    return [...pageItems, ...tenderItems, ...kbItems, ...complianceIdx, ...teamItems];
  }, [tenders, kbFiles, complianceItems, team, onNavigate, onSelectTender]);

  const results = useMemo(() => {
    if (!query.trim()) return allItems.filter((i) => i.group === 'Pages');
    const scored = allItems
      .map((i) => ({ item: i, score: Math.max(fuzzyScore(query, i.label), fuzzyScore(query, i.sublabel || '')) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);
    return scored.map((s) => s.item);
  }, [query, allItems]);

  const grouped = useMemo(() => {
    const g: Record<string, Item[]> = {};
    results.forEach((r) => { (g[r.group] ??= []).push(r); });
    return g;
  }, [results]);

  const runAt = (idx: number) => {
    const item = results[idx];
    if (item) { item.action(); onClose(); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(activeIndex); }
    else if (e.key === 'Escape') { onClose(); }
  };

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, tenders, files, requirements, people…"
            className="flex-1 text-sm outline-none placeholder:text-slate-400 rounded focus:ring-2 focus:ring-indigo-200"
            aria-label="Search"
          />
          <button onClick={onClose} aria-label="Close" className="text-slate-300 hover:text-slate-600 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto py-2">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">No matches for "{query}"</div>
          )}
          {(Object.keys(grouped) as Item['group'][]).map((group) => (
            <div key={group} className="mb-1">
              <div className="px-4 py-1 text-[9px] font-mono uppercase tracking-wider text-slate-400 font-semibold">{group}</div>
              {grouped[group].map((item) => {
                runningIndex++;
                const idx = runningIndex;
                const active = idx === activeIndex;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => runAt(idx)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className={active ? 'text-indigo-600' : 'text-slate-400'}>{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-800 truncate">{item.label}</span>
                      {item.sublabel && <span className="block text-[10px] text-slate-400 truncate">{item.sublabel}</span>}
                    </span>
                    {active && <CornerDownLeft className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center gap-3 text-[10px] text-slate-400 font-mono">
          <span>↑↓ navigate</span><span>↵ select</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
