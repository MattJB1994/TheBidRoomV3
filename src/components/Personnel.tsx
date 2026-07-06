/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CV / Personnel library. Each person's real profile (credentials,
 * project history, linked CV file) plus, live from the Opportunity page,
 * which current tenders are shaping their CV and how. This is the
 * dedicated home for "the proposal shapes the CVs" — Opportunity shows
 * the tailoring note in context; this page shows the person's whole
 * picture and every opportunity currently tailoring them.
 *
 * Profiles are editable: headline, years of experience, credentials,
 * and project history all persist via db.ts when a backend is connected
 * (optimistic local update, same pattern as the rest of the app).
 */
import React, { useState } from 'react';
import { TeamMember, PersonnelProfile, InfoRequest, ProjectHistoryEntry } from '../types';
import { mockTeam, mockPersonnel, mockInfoRequests } from '../data/mockData';
import { isDemoMode } from '../lib/supabase';
import * as db from '../lib/db';
import { toast, toastError } from '../lib/toast';
import {
  Award, Briefcase, FileText, UserCog, ChevronDown, ChevronUp, GraduationCap, Search,
  Pencil, Check, X, Plus, Trash2,
} from 'lucide-react';

interface PersonnelProps {
  team?: TeamMember[];
  profiles?: PersonnelProfile[];
  setProfiles?: React.Dispatch<React.SetStateAction<PersonnelProfile[]>>;
  requests?: InfoRequest[];
  activeTenderName?: string;
}

const emptyProfile = (id: string): PersonnelProfile => ({ id, headline: '', yearsExperience: 0, credentials: [], projectHistory: [] });

export default function Personnel({
  team = mockTeam, profiles = mockPersonnel, setProfiles, requests = mockInfoRequests, activeTenderName,
}: PersonnelProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(profiles[0]?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const filtered = team.filter((m) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    const p = profileById.get(m.id);
    return m.name.toLowerCase().includes(q) || (p?.headline ?? '').toLowerCase().includes(q) || (p?.credentials ?? []).some((c) => c.toLowerCase().includes(q));
  });

  const tailoringFor = (cvFile?: string) =>
    cvFile ? requests.filter((r) => r.category === 'CV' && r.matchedFile === cvFile && r.tailoringNote) : [];

  const updateProfile = (id: string, patch: Partial<PersonnelProfile>) => {
    if (!setProfiles) return;
    setProfiles((prev) => {
      const exists = prev.some((p) => p.id === id);
      return exists ? prev.map((p) => (p.id === id ? { ...p, ...patch } : p)) : [...prev, { ...emptyProfile(id), ...patch }];
    });
  };

  const saveProfileFields = (id: string, patch: { headline?: string; yearsExperience?: number; credentials?: string[] }) => {
    updateProfile(id, patch);
    if (!isDemoMode()) {
      db.savePersonnelProfile(id, patch).catch((e) => toastError(e instanceof Error ? e.message : 'Could not save profile.'));
      db.logAuditQuick('PERSONNEL_PROFILE_UPDATED', patch.headline || id);
    }
  };

  const addHistory = (id: string, entry: ProjectHistoryEntry) => {
    const current = profileById.get(id) ?? emptyProfile(id);
    updateProfile(id, { projectHistory: [...current.projectHistory, entry] });
    if (!isDemoMode()) {
      db.addProjectHistoryEntry(id, entry).catch((e) => toastError(e instanceof Error ? e.message : 'Could not save.'));
      db.logAuditQuick('PROJECT_HISTORY_ADDED', entry.project);
    }
  };

  const removeHistory = (id: string, index: number, entryId?: string) => {
    const current = profileById.get(id);
    if (!current) return;
    updateProfile(id, { projectHistory: current.projectHistory.filter((_, i) => i !== index) });
    if (!isDemoMode() && entryId) db.removeProjectHistoryEntry(entryId).catch((e) => toastError(e instanceof Error ? e.message : 'Could not remove.'));
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight">CV & Personnel Library</h1>
          <p className="text-xs text-slate-600 mt-1">
            Credentials and project history for the bid team. Tailoring notes below come live from
            the <span className="font-semibold text-slate-800">Opportunity</span> page.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, credential…"
            className="w-full text-xs pl-8 pr-2 py-2 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((m) => {
          const p = profileById.get(m.id);
          const isOpen = expanded === m.id;
          const isEditing = editingId === m.id;
          const tailoring = tailoringFor(p?.cvFile);
          return (
            <div key={m.id} className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : m.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60"
              >
                <div className="w-9 h-9 rounded-full bg-indigo-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {m.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-sans font-bold text-slate-900">{m.name}</span>
                    {tailoring.length > 0 && (
                      <span className="text-[9px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100">
                        Being tailored
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">{p?.headline || m.role.replace(/_/g, ' ')} · {p?.yearsExperience ?? '—'} yrs experience</div>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-4">
                  {/* Tailoring notes (live from Opportunity) */}
                  {tailoring.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Current tailoring</div>
                      {tailoring.map((r) => (
                        <div key={r.id} className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-100 rounded px-2.5 py-1.5">
                          <UserCog className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            {activeTenderName && <span className="font-semibold">{activeTenderName}: </span>}
                            {r.tailoringNote}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {setProfiles && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => setEditingId(isEditing ? null : m.id)}
                        className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
                      >
                        {isEditing ? <><X className="w-3.5 h-3.5" /> Close editor</> : <><Pencil className="w-3.5 h-3.5" /> Edit profile</>}
                      </button>
                    </div>
                  )}

                  {isEditing ? (
                    <ProfileEditor
                      profile={p ?? emptyProfile(m.id)}
                      onSaveFields={(patch) => saveProfileFields(m.id, patch)}
                      onAddHistory={(entry) => addHistory(m.id, entry)}
                      onRemoveHistory={(idx, entryId) => removeHistory(m.id, idx, entryId)}
                    />
                  ) : (
                    <>
                      {/* Credentials */}
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-1.5 flex items-center gap-1"><Award className="w-3 h-3" /> Credentials</div>
                        {p?.credentials.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {p.credentials.map((c) => (
                              <span key={c} className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">{c}</span>
                            ))}
                          </div>
                        ) : <span className="text-[11px] text-slate-400 italic">No credentials on file.</span>}
                      </div>

                      {/* Project history */}
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-1.5 flex items-center gap-1"><Briefcase className="w-3 h-3" /> Project history</div>
                        <div className="space-y-2">
                          {(p?.projectHistory ?? []).map((h) => (
                            <div key={h.project + h.period} className="text-[11px] border-l-2 border-slate-200 pl-2.5">
                              <div className="font-semibold text-slate-800">{h.project} <span className="font-normal text-slate-400">· {h.period}</span></div>
                              <div className="text-slate-500">{h.role}</div>
                              <div className="text-slate-500 mt-0.5 leading-relaxed">{h.summary}</div>
                            </div>
                          ))}
                          {!p?.projectHistory.length && <span className="text-[11px] text-slate-400 italic">No project history on file.</span>}
                        </div>
                      </div>

                      {/* CV file link */}
                      {p?.cvFile && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded px-2.5 py-1.5">
                          <FileText className="w-3.5 h-3.5 shrink-0" /> <span className="font-mono truncate">{p.cvFile}</span> <span className="text-slate-300">· Knowledge Base</span>
                        </div>
                      )}
                      {!p?.cvFile && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 italic bg-slate-50 border border-dashed border-slate-200 rounded px-2.5 py-1.5">
                          <GraduationCap className="w-3.5 h-3.5 shrink-0" /> No CV uploaded to the Knowledge Base yet.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="bg-white border border-dashed border-slate-200 rounded p-8 text-center text-xs text-slate-500">No one matches "{query}".</div>
        )}
      </div>
    </div>
  );
}

/* ── Inline profile editor ───────────────────────────────────────── */
function ProfileEditor({
  profile, onSaveFields, onAddHistory, onRemoveHistory,
}: {
  profile: PersonnelProfile;
  onSaveFields: (patch: { headline?: string; yearsExperience?: number; credentials?: string[] }) => void;
  onAddHistory: (entry: ProjectHistoryEntry) => void;
  onRemoveHistory: (index: number, entryId?: string) => void;
}) {
  const [headline, setHeadline] = useState(profile.headline);
  const [years, setYears] = useState(String(profile.yearsExperience || ''));
  const [credentialsText, setCredentialsText] = useState(profile.credentials.join(', '));
  const [newProject, setNewProject] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newPeriod, setNewPeriod] = useState('');
  const [newSummary, setNewSummary] = useState('');

  const saveFields = () => {
    onSaveFields({
      headline: headline.trim(),
      yearsExperience: Number(years) || 0,
      credentials: credentialsText.split(',').map((c) => c.trim()).filter(Boolean),
    });
    toast('Profile saved.');
  };

  const addEntry = () => {
    if (!newProject.trim() || !newRole.trim()) {
      toast('Project and role are required.', 'error');
      return;
    }
    onAddHistory({ project: newProject.trim(), role: newRole.trim(), period: newPeriod.trim(), summary: newSummary.trim() });
    setNewProject(''); setNewRole(''); setNewPeriod(''); setNewSummary('');
  };

  return (
    <div className="space-y-4 bg-slate-50/60 border border-slate-150 rounded p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-600 mb-1">Headline</label>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Systems Assurance Lead, CSE"
            className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-600 mb-1">Years of experience</label>
          <input type="number" min={0} value={years} onChange={(e) => setYears(e.target.value)}
            className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-slate-600 mb-1">Credentials (comma-separated)</label>
        <input value={credentialsText} onChange={(e) => setCredentialsText(e.target.value)} placeholder="Chartered Systems Engineer (CSE), ..."
          className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>
      <button onClick={saveFields} className="text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 rounded inline-flex items-center gap-1">
        <Check className="w-3.5 h-3.5" /> Save
      </button>

      <div className="pt-2 border-t border-slate-200 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">Project history</div>
        {profile.projectHistory.map((h, idx) => (
          <div key={h.project + idx} className="flex items-start justify-between gap-2 text-[11px] bg-white border border-slate-150 rounded px-2 py-1.5">
            <span><span className="font-semibold">{h.project}</span> · {h.role} · {h.period}</span>
            <button onClick={() => onRemoveHistory(idx)} aria-label={`Remove ${h.project}`} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="Project name"
            className="text-xs p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500" />
          <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Role on the project"
            className="text-xs p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500" />
          <input value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} placeholder="Period (e.g. 2023–2025)"
            className="text-xs p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500" />
          <input value={newSummary} onChange={(e) => setNewSummary(e.target.value)} placeholder="One-line summary"
            className="text-xs p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <button onClick={addEntry} className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add project
        </button>
      </div>
    </div>
  );
}
