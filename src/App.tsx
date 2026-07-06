/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Tender, KBFile, ComplianceItem, ProposalSection, TeamMember, LessonsLearnedItem, ComplianceStatus, ExtractedTenderMetadata,
  InfoRequest, Clarification, PersonnelProfile
} from './types';
import {
  mockTenders, mockKBFiles, mockComplianceItems, mockProposalSections, mockLessonsLearned, mockTeam,
  mockInfoRequests, mockClarifications, mockAuditLogs, mockPersonnel
} from './data/mockData';
import PublicPages from './components/PublicPages';
import TenderIntake from './components/TenderIntake';
import CommandPalette from './components/CommandPalette';
import NotificationCenter from './components/NotificationCenter';
import ErrorBoundary from './components/ErrorBoundary';
// Heavy secondary routes are code-split: each loads on first visit,
// keeping the main bundle to the shell + blueprint pages people use
// constantly. React.lazy → separate build chunks.
const OtherPages = React.lazy(() => import('./components/OtherPages'));
const AdminPromptConsole = React.lazy(() => import('./components/AdminPromptConsole').then((m) => ({ default: m.AdminPromptConsole })));
const Personnel = React.lazy(() => import('./components/Personnel'));
const TeamInvites = React.lazy(() => import('./components/TeamInvites'));
const AdminConsole = React.lazy(() => import('./components/AdminConsole'));
const Pricing = React.lazy(() => import('./components/Pricing'));
const ScheduleBuilder = React.lazy(() => import('./components/ScheduleBuilder'));
import DashboardPage from './components/blueprint/DashboardPage';
import BlueprintPage from './components/blueprint/BlueprintPage';
import DocumentsPage, { ProjectDoc, DocTag, DOC_TAGS, detectTag } from './components/blueprint/DocumentsPage';
import RequirementsPage from './components/blueprint/RequirementsPage';
import ModulesPage from './components/blueprint/ModulesPage';
import EvidencePage from './components/blueprint/EvidencePage';
import DraftsPage from './components/blueprint/DraftsPage';
import ReviewsPage from './components/blueprint/ReviewsPage';
import RisksPage from './components/blueprint/RisksPage';
import CommercialPage from './components/blueprint/CommercialPage';
import ExportsPage from './components/blueprint/ExportsPage';
import CloseoutPage from './components/blueprint/CloseoutPage';
import { BlueprintWithContext } from './blueprint/clientMemory';
import { StageStepper, StageTabs } from './components/WorkflowUI';
import { computeStageStatuses, pageToStage, STAGES, WORKFLOW_PAGES, computeNextBestAction } from './blueprint/workflow';
import { computeScores } from './blueprint/engine';
import { SAMPLE_TENDER_ID } from './demo/bluewaterSample';
import { loadAllSamples, PRIMARY_SAMPLE_ID } from './demo/sampleRegistry';

/** Pages that display the workflow stepper (stages + their sub-pages). */
const STAGE_PAGES = WORKFLOW_PAGES;
import { TenderBlueprint, ModuleKey } from './blueprint/types';
import { generateBlueprint, applyAddendumImpact, mergeManualWork } from './blueprint/engine';
import { extractFileText } from './lib/docText';
import { buildAddendumImpact } from './blueprint/addendumService';
import { getCurrentSession, onAuthStateChange, signOut } from './lib/auth';
import { isSupabaseConfigured, isDemoMode } from './lib/supabase';
import * as db from './lib/db';
import { subscribeToPresence, subscribeToTenderChanges, PresenceUser } from './lib/realtime';
import { extractDocumentText, sampleExtraction } from './lib/ai';
import { generateInfoRequests, generateRecommendedClarifications } from './lib/requirementMatching';
import { formatBytes } from './lib/format';
import { partitionUploads } from './lib/uploadValidation';
import { Toaster, toastError, toast } from './lib/toast';
import Onboarding from './components/Onboarding';
import type { Session } from '@supabase/supabase-js';

import {
  LayoutDashboard, Sparkles, Files, ListChecks, Layers, Database, Edit3,
  ShieldCheck, ShieldAlert, Package, Settings, LogOut, Users, UserCog, Scale, GraduationCap,
  HelpCircle, CreditCard, Cpu, Menu, X, Search, Plus, ArrowRight,
  PanelLeftClose, PanelLeftOpen, FolderHeart, MessageSquare,
} from 'lucide-react';

/** Demo seed: the sample tender arrives pre-analysed so every page is alive. */
function seedDemoBlueprint(): Record<string, TenderBlueprint> {
  if (!isDemoMode() || !mockTenders[0]) return {};
  const t = mockTenders[0];
  const extracted: ExtractedTenderMetadata = {
    ...sampleExtraction,
    tenderName: t.name, tenderNumber: t.number, client: t.client,
    closingDate: t.closingDate, submissionPortal: t.portal,
  };
  const bp = generateBlueprint({
    tender: t, extracted, kbFiles: mockKBFiles, personnel: mockPersonnel, team: mockTeam,
    documentNames: ['TMTA_VanguardLine_Signalling_RFT_v2.pdf'],
    meta: { submissionType: 'RFT', sector: 'Rail', internalRef: 'BID-2026-014' },
  });
  return { [t.id]: bp };
}

/** DB record → the client document shape the pages render. */
function recordToProjectDoc(r: db.TenderDocumentRecord): ProjectDoc {
  return {
    id: r.id, name: r.name, size: r.size, addedAt: r.uploadedAt,
    tag: (DOC_TAGS as readonly string[]).includes(r.tag) ? (r.tag as DocTag) : 'Other',
    status: r.status,
    extractionStatus: r.extractionStatus,
    extractionNote: r.extractionNote,
    extractedText: r.extractedText,
  };
}

export default function App() {
  // Session Router States
  const [currentPage, setCurrentPage] = useState<string>('home');
  const [selectedTenderId, setSelectedTenderId] = useState<string>('t1');

  // Real auth session. Null = signed out. In demo mode (no Supabase
  // credentials), this stays null but navigation is never blocked —
  // see isPublicRoute / route-guard logic below.
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  // The onAuthStateChange subscription below is set up once (empty deps)
  // and lives for the component's whole lifetime, so its callback closes
  // over whatever `session`/`currentPage` were AT SETUP TIME — these refs
  // are kept in sync via effects and give the callback current values.
  const sessionRef = useRef<Session | null>(null);
  const isPublicRouteRef = useRef(true);

  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profileName, setProfileName] = useState<string>('');
  const [inviteToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get('invite'));

  // Loads the signed-in user's profile, decides whether onboarding is
  // needed, and pulls the full workspace from Supabase into state.
  // No-op in demo mode, where the mock data below is used instead.
  const loadBackendData = async () => {
    if (isDemoMode()) return;
    try {
      const profile = await db.getMyProfile();
      setProfileName(profile?.fullName ?? '');
      if (!profile || !profile.orgId) {
        setNeedsOnboarding(true);
        return;
      }
      setNeedsOnboarding(false);
      orgIdRef.current = profile.orgId;
      setWorkspaceLoading(true);
      const ws = await db.loadWorkspace();
      setTenders(ws.tenders);
      setKbFiles(ws.kbFiles);
      setHasMoreKbFiles(ws.hasMoreKbFiles);
      setComplianceItems(ws.complianceItems);
      setProposalSections(ws.proposalSections);
      setLessonsLearned(ws.lessonsLearned);
      setInfoRequests(ws.infoRequests);
      setClarifications(ws.clarifications);
      if (ws.personnel.length) setPersonnel(ws.personnel);
      if (ws.team.length) setTeam(ws.team);
      if (ws.tenders[0]) setSelectedTenderId((prev) => (ws.tenders.some((t) => t.id === prev) ? prev : ws.tenders[0].id));
      db.amIPlatformAdmin().then(setIsPlatformAdmin).catch(() => setIsPlatformAdmin(false));
      // Blueprints load alongside the workspace so every page is
      // populated after refresh / on another team member's session.
      db.loadBlueprints(profile.orgId)
        .then(setBlueprints)
        .catch((e) => toastError(e instanceof Error ? e.message : 'Could not load saved blueprints.'));
      // Tender documents too — Storage-backed, so they survive refresh
      // and appear for every team member.
      db.loadTenderDocuments(profile.orgId)
        .then((byTender) => {
          const mapped: Record<string, ProjectDoc[]> = {};
          Object.entries(byTender).forEach(([tid, docs]) => {
            mapped[tid] = docs.map(recordToProjectDoc);
          });
          setProjectDocs(mapped);
        })
        .catch((e) => toastError(e instanceof Error ? e.message : 'Could not load tender documents.'));
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not load your workspace.');
    } finally {
      setWorkspaceLoading(false);
    }
  };

  useEffect(() => {
    let unsubscribe = () => {};
    (async () => {
      const existing = await getCurrentSession();
      setSession(existing);
      setAuthChecked(true);
      if (existing) {
        await loadBackendData();
      } else if (inviteToken) {
        toast('You\u2019ve been invited to a workspace — sign up or log in to accept.', 'info', 6000);
        setCurrentPage('signup');
      }
      unsubscribe = onAuthStateChange((s) => {
        const wasSignedIn = !!sessionRef.current;
        const wasOnPrivateRoute = !isPublicRouteRef.current;
        setSession(s);
        if (!s && isSupabaseConfigured()) {
          if (!manualSignOutRef.current && wasSignedIn && wasOnPrivateRoute) {
            toastError('Your session has expired. Please sign in again.');
          }
          manualSignOutRef.current = false;
          setCurrentPage('login');
          setNeedsOnboarding(false);
        } else if (s) {
          loadBackendData();
          setCurrentPage((prev) => (publicPages.includes(prev) ? 'dashboard' : prev));
        }
      });
    })();
    return () => unsubscribe();
  }, []);

  // Distinguishes "the user clicked Sign Out" from "the session died on
  // its own" — both fire the same SIGNED_OUT event.
  const manualSignOutRef = useRef(false);

  /* ── Blueprint persistence (connected backends) ────────────────
     Blueprints live in React state as the working copy and are
     persisted to Supabase (see saveBlueprint/loadBlueprints in
     lib/db.ts + supabase/migrations/2026-07-04_tender_blueprint.sql).
     Every mutation schedules a debounced whole-blueprint save; loads
     happen with the rest of the workspace. Demo mode stays local. */
  const orgIdRef = useRef<string | null>(null);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const persistBlueprint = (bp: TenderBlueprint, immediate = false) => {
    if (isDemoMode() || !orgIdRef.current) return;
    const orgId = orgIdRef.current;
    const existing = saveTimersRef.current[bp.tenderId];
    if (existing) clearTimeout(existing);
    const run = () => {
      db.saveBlueprint(orgId, bp).catch((e) => {
        if (e instanceof db.BlueprintConflictError) {
          // Someone else saved since we loaded — don't overwrite their
          // work. Reload the server copy and tell the user plainly.
          toastError('A teammate updated this blueprint — reloading their changes. Re-apply your last edit if it\u2019s missing.');
          db.loadBlueprints(orgId).then(setBlueprints).catch(() => {});
          return;
        }
        toastError(e instanceof Error ? e.message : 'Could not save the blueprint — your changes are still on screen; retry by making another edit.');
      });
    };
    if (immediate) run();
    else saveTimersRef.current[bp.tenderId] = setTimeout(run, 1500);
  };

  const handleSignOut = async () => {
    manualSignOutRef.current = true;
    await signOut();
    setSession(null);
    setNeedsOnboarding(false);
    setCurrentPage('home');
  };

  // Reactive Workspace Engine States
  const [tenders, setTenders] = useState<Tender[]>(isDemoMode() ? mockTenders : []);
  const [kbFiles, setKbFiles] = useState<KBFile[]>(isDemoMode() ? mockKBFiles : []);
  const [hasMoreKbFiles, setHasMoreKbFiles] = useState(false);
  const [loadingMoreKb, setLoadingMoreKb] = useState(false);
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>(isDemoMode() ? mockComplianceItems : []);
  const [proposalSections, setProposalSections] = useState<ProposalSection[]>(isDemoMode() ? mockProposalSections : []);
  const [lessonsLearned, setLessonsLearned] = useState<LessonsLearnedItem[]>(isDemoMode() ? mockLessonsLearned : []);
  const [infoRequests, setInfoRequests] = useState<InfoRequest[]>(isDemoMode() ? mockInfoRequests : []);
  const [clarifications, setClarifications] = useState<Clarification[]>(isDemoMode() ? mockClarifications : []);
  const [personnel, setPersonnel] = useState<PersonnelProfile[]>(isDemoMode() ? mockPersonnel : []);
  const [team, setTeam] = useState<TeamMember[]>(isDemoMode() ? mockTeam : []);

  /* ── Blueprint state (the intelligence layer, keyed by tender) ──
     Client-side for now: the engine and pages are backend-agnostic, so
     persistence for these entities is a clean later step (see db.ts for
     the existing tender/compliance persistence, which is kept). */
  const [blueprints, setBlueprints] = useState<Record<string, TenderBlueprint>>(seedDemoBlueprint);
  const [projectDocs, setProjectDocs] = useState<Record<string, ProjectDoc[]>>(
    isDemoMode() && mockTenders[0]
      ? { [mockTenders[0].id]: [{ id: 'd_seed', name: 'TMTA_VanguardLine_Signalling_RFT_v2.pdf', size: '4.2 MB', addedAt: '2026-06-20', tag: 'RFP', status: 'Analysed' }] }
      : {},
  );
  const [quickStartFiles, setQuickStartFiles] = useState<File[]>([]);
  const [focusModule, setFocusModule] = useState<ModuleKey | null>(null);

  const blueprintsRef = useRef(blueprints);
  useEffect(() => { blueprintsRef.current = blueprints; }, [blueprints]);

  const activeBlueprint = blueprints[selectedTenderId] ?? null;
  const activeScores = activeBlueprint ? computeScores(activeBlueprint) : null;

  // Loads the worked samples into local state. Never calls AI or
  // Supabase; demo mode only. Re-running resets them to pristine state.
  // Loads BOTH samples so Client & Sector Memory has data to group and
  // the tender switcher feels real, then lands on the primary sample.
  const handleLoadSample = () => {
    const samples = loadAllSamples();
    const ids = new Set(samples.map((s) => s.tender.id));
    setTenders((prev) => [...samples.map((s) => s.tender), ...prev.filter((t) => !ids.has(t.id))]);
    setBlueprints((prev) => {
      const next = { ...prev };
      samples.forEach((s) => { next[s.tender.id] = s.blueprint; });
      return next;
    });
    setProjectDocs((prev) => {
      const next = { ...prev };
      samples.forEach((s) => {
        next[s.tender.id] = s.documents.map((d) => ({
          id: d.id, name: d.name, size: '—', addedAt: new Date().toISOString().slice(0, 10),
          tag: d.tag as DocTag, status: 'Analysed' as const,
          extractionStatus: d.extractionStatus, extractionNote: d.note,
        }));
      });
      return next;
    });
    setSelectedTenderId(PRIMARY_SAMPLE_ID);
    go('dashboard');
    toast('Loaded the worked samples — explore the Bluewater tender mid-workflow, and see the won Riverside tender in Closeout & Memory.', 'success', 6500);
  };

  // Context for Client & Sector Memory — every blueprint mapped to its
  // client / sector / tender type, derived only from data we actually have.
  const memoryContext: BlueprintWithContext[] = Object.entries(blueprints).map(([tid, b]) => {
    const t = tenders.find((x) => x.id === tid);
    return {
      bp: b,
      client: t?.client ?? 'Unspecified',
      sector: b.meta?.sector ?? 'Unspecified',
      tenderType: b.submissionType || 'Unspecified',
    };
  });
  const updateBlueprint = (fn: (bp: TenderBlueprint) => TenderBlueprint) => {
    setBlueprints((prev) => {
      const current = prev[selectedTenderId];
      if (!current) return prev;
      // Every edit through this path is a user action — stamp editedAt
      // so re-analysis knows there's manual work to protect.
      const next = { ...fn(current), editedAt: new Date().toISOString() };
      persistBlueprint(next);
      return { ...prev, [selectedTenderId]: next };
    });
  };

  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  // Global command palette (Cmd/Ctrl+K)
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const publicPages = ['home', 'pricing', 'how-it-works', 'security', 'use-cases', 'login', 'signup'];
  const isPublicRoute = publicPages.includes(currentPage);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { isPublicRouteRef.current = isPublicRoute; }, [isPublicRoute]);

  // Every private route with a real view; anything else falls back to
  // the dashboard so navigation can never dead-end.
  const knownPrivatePages = [
    'dashboard', 'add-tender', 'blueprint', 'documents', 'requirements', 'modules',
    'evidence', 'drafts', 'reviews', 'risks', 'commercial', 'exports', 'closeout', 'settings',
    'knowledge-base', 'personnel', 'team', 'lessons-learned', 'billing',
    'admin-prompts', 'admin-console', 'pricing-tool', 'schedule-tool',
  ];

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const go = (page: string) => { setCurrentPage(page); setSidebarOpen(false); };

  /* ── Navigation ─────────────────────────────────────────────── */
  type NavItem = { id: string; label: string; icon: React.ReactNode; badge?: string };
  // Simplified 7-stage workflow navigation. Each stage routes to the
  // existing page that owns that step; the intelligence is unchanged.
  const tenderNav: NavItem[] = [
    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4 shrink-0" /> },
    { id: 'documents', label: 'Intake', icon: <Files className="w-4 h-4 shrink-0" /> },
    { id: 'blueprint', label: 'Blueprint', icon: <Sparkles className="w-4 h-4 shrink-0" /> },
    { id: 'evidence', label: 'Gaps', icon: <Database className="w-4 h-4 shrink-0" /> },
    { id: 'drafts', label: 'Draft', icon: <Edit3 className="w-4 h-4 shrink-0" /> },
    { id: 'reviews', label: 'Review', icon: <ShieldCheck className="w-4 h-4 shrink-0" /> },
    { id: 'exports', label: 'Submit', icon: <Package className="w-4 h-4 shrink-0" /> },
    { id: 'closeout', label: 'Closeout', icon: <GraduationCap className="w-4 h-4 shrink-0" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4 shrink-0" /> },
  ];
  // Secondary pages remain reachable (from within stages / command
  // palette) but are no longer top-level workflow steps.
  const secondaryNav: NavItem[] = [
    { id: 'requirements', label: 'Requirements', icon: <ListChecks className="w-4 h-4 shrink-0" /> },
    { id: 'modules', label: 'Modules', icon: <Layers className="w-4 h-4 shrink-0" /> },
    { id: 'commercial', label: 'Commercial', icon: <Scale className="w-4 h-4 shrink-0" /> },
    { id: 'risks', label: 'Risks', icon: <ShieldAlert className="w-4 h-4 shrink-0" /> },
  ];
  const workspaceNav: NavItem[] = [
    { id: 'knowledge-base', label: 'Knowledge Base', icon: <FolderHeart className="w-4 h-4 shrink-0" /> },
    { id: 'personnel', label: 'People & CVs', icon: <UserCog className="w-4 h-4 shrink-0" /> },
    { id: 'team', label: 'Team', icon: <Users className="w-4 h-4 shrink-0" /> },
    { id: 'lessons-learned', label: 'Lessons Learned', icon: <HelpCircle className="w-4 h-4 shrink-0" /> },
    { id: 'billing', label: 'Plans & Billing', icon: <CreditCard className="w-4 h-4 shrink-0" /> },
    { id: 'admin-prompts', label: 'Master Prompts', icon: <Cpu className="w-4 h-4 shrink-0" />, badge: 'Admin' },
    ...(isPlatformAdmin ? [{ id: 'admin-console', label: 'Platform Admin', icon: <ShieldCheck className="w-4 h-4 shrink-0" />, badge: 'Vendor' }] : []),
  ];
  // Which nav id is active, accounting for hidden tool routes.
  const activeNavId = currentPage === 'pricing-tool' || currentPage === 'schedule-tool' ? 'modules' : currentPage === 'add-tender' ? 'dashboard' : currentPage;

  const renderNavButton = (item: NavItem) => {
    const active = activeNavId === item.id;
    return (
      <button
        key={item.id}
        onClick={() => go(item.id)}
        title={sidebarCollapsed ? item.label : undefined}
        className={`w-full flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all ${
          sidebarCollapsed ? 'justify-center px-0 py-2' : 'px-3 py-[7px]'
        } ${active ? 'bg-white text-indigo-700 shadow-xs border border-slate-200' : 'text-slate-600 hover:bg-slate-200/40 hover:text-slate-900'}`}
      >
        <span className={active ? 'text-indigo-600' : 'text-slate-400'}>{item.icon}</span>
        {!sidebarCollapsed && (
          <span className="flex items-center justify-between w-full min-w-0">
            <span className="truncate">{item.label}</span>
            {item.badge && <span className="text-[11px] font-semibold px-1.5 rounded bg-indigo-100 text-indigo-800 uppercase">{item.badge}</span>}
          </span>
        )}
      </button>
    );
  };

  // Route guard: private pages require a real session — UNLESS demo mode.
  useEffect(() => {
    if (!authChecked) return;
    if (!isDemoMode() && !session && !isPublicRoute) {
      setCurrentPage('login');
    }
  }, [authChecked, session, currentPage]);

  // Real-time collaboration (presence + change reload). No-op in demo.
  useEffect(() => {
    if (isDemoMode() || !session || !selectedTenderId) {
      setPresentUsers([]);
      return;
    }
    const me: PresenceUser = { id: session.user.id, name: profileName || session.user.email || 'Someone' };
    const unsubPresence = subscribeToPresence(selectedTenderId, me, setPresentUsers);
    const unsubChanges = subscribeToTenderChanges(selectedTenderId, () => { loadBackendData(); });
    return () => { unsubPresence(); unsubChanges(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenderId, session, profileName]);

  /* ── Knowledge base mutators (optimistic + Supabase persistence) ── */
  const handleAddKBFile = (newFile: KBFile, rawFile?: File) => {
    setKbFiles((prev) => [newFile, ...prev]);
    if (!isDemoMode() && rawFile) {
      (async () => {
        try {
          const profile = await db.getMyProfile();
          if (!profile?.orgId) return;
          const saved = await db.addKbFile(profile.orgId, profile.id, rawFile, newFile.category);
          setKbFiles((prev) => [saved, ...prev.filter((f) => f.id !== newFile.id)]);
          db.logAuditQuick('KB_FILE_UPLOADED', saved.name);
          extractDocumentText(rawFile).then((text) => {
            if (text) db.setKbFileContentText(saved.id, text).catch(() => {});
          });
        } catch (e) {
          toastError(e instanceof Error ? e.message : 'Could not upload the file to storage.');
        }
      })();
    } else if (!isDemoMode() && !rawFile) {
      toastError('No file was attached — metadata-only records are not saved to a connected backend.');
    }
  };

  const handleRemoveKBFile = (id: string) => {
    const removed = kbFiles.find((f) => f.id === id);
    if (removed?.objectUrl) URL.revokeObjectURL(removed.objectUrl);
    setKbFiles(kbFiles.filter(f => f.id !== id));
    if (!isDemoMode()) {
      db.removeKbFile(id).catch((e) => toastError(e.message));
      if (removed) db.logAuditQuick('KB_FILE_REMOVED', removed.name);
    }
  };

  const handleVerifyKBFile = (id: string) => {
    const file = kbFiles.find((f) => f.id === id);
    setKbFiles(kbFiles.map(f => (f.id === id ? { ...f, lastVerifiedAt: new Date().toISOString().split('T')[0], isStale: false } : f)));
    if (!isDemoMode()) {
      db.verifyKbFile(id).catch((e) => toastError(e.message));
      if (file) db.logAuditQuick('KB_FILE_VERIFIED', file.name);
    }
  };

  const loadMoreKbFiles = async () => {
    if (isDemoMode() || loadingMoreKb) return;
    setLoadingMoreKb(true);
    try {
      const profile = await db.getMyProfile();
      if (!profile?.orgId) return;
      const { files, hasMore } = await db.loadKbFilesPage(profile.orgId, kbFiles.length);
      setKbFiles((prev) => [...prev, ...files]);
      setHasMoreKbFiles(hasMore);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load more files.');
    } finally {
      setLoadingMoreKb(false);
    }
  };

  /* ── Project documents (per tender) ────────────────────────────
     Every uploaded document is text-extracted (status recorded
     honestly), then — on connected backends — uploaded to the
     tender-documents Storage bucket and recorded in tender_documents,
     so it survives refresh and appears for the whole team. Addenda are
     analysed with the extracted text and their impact stays linked to
     the stored document. Demo mode keeps everything local. */
  const handleAddProjectDocs = (files: File[], forcedTag?: DocTag, tenderId: string = selectedTenderId) => {
    if (!files.length || !tenderId) return;

    // Reject unsupported/oversized files up front — they're never
    // extracted and never uploaded. (The dropzone validates too; this
    // covers programmatic callers and keeps the rule in one place.)
    const { accepted, rejected } = partitionUploads(files);
    rejected.forEach((reason) => toastError(reason));
    if (!accepted.length) return;
    files = accepted;

    const today = new Date().toISOString().split('T')[0];

    // Optimistic rows appear immediately with a 'pending' extraction state.
    const tempDocs: ProjectDoc[] = files.map((f, i) => ({
      id: `d_tmp_${Date.now()}_${i}`, name: f.name, size: formatBytes(f.size), addedAt: today,
      tag: forcedTag ?? detectTag(f.name), status: 'Uploaded', extractionStatus: 'pending',
    }));
    setProjectDocs((prev) => ({ ...prev, [tenderId]: [...tempDocs, ...(prev[tenderId] ?? [])] }));

    (async () => {
      const finals: ProjectDoc[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const temp = tempDocs[i];
        const doc = await extractFileText(file);
        const extraction: db.TenderDocumentExtraction = {
          text: doc.text,
          status: doc.text ? 'extracted' : doc.scanned ? 'scanned' : 'unsupported',
          note: doc.note,
        };
        let final: ProjectDoc = { ...temp, extractionStatus: extraction.status, extractionNote: extraction.note, extractedText: doc.text ?? undefined };
        if (!isDemoMode()) {
          try {
            const saved = await db.addTenderDocument(tenderId, file, temp.tag, extraction);
            final = recordToProjectDoc(saved);
          } catch (e) {
            toastError(e instanceof Error ? e.message : `Could not persist ${file.name}.`);
          }
        }
        finals.push(final);
        setProjectDocs((prev) => ({
          ...prev,
          [tenderId]: (prev[tenderId] ?? []).map((d) => (d.id === temp.id ? final : d)),
        }));
      }

      // Addendum impact — after persistence, so the impact links to the
      // stored document id and can use the stored extracted text.
      const addenda = finals.filter((d) => d.tag === 'Addendum');
      if (addenda.length && blueprintsRef.current[tenderId]) {
        toast('Addendum detected — analysing impact…', 'info');
        for (const doc of addenda) {
          const { impact, note } = await buildAddendumImpact(doc.name, blueprintsRef.current[tenderId], {
            storedText: doc.extractedText, documentId: doc.id,
          });
          setBlueprints((prev) => {
            const bp = prev[tenderId];
            if (!bp) return prev;
            const next = applyAddendumImpact(bp, impact);
            persistBlueprint(next);
            return { ...prev, [tenderId]: next };
          });
          toast(note, impact.provisional ? 'info' : 'success', 6000);
        }
      } else {
        toast(`${files.length === 1 ? files[0].name : `${files.length} documents`} added to this tender.`);
      }
      if (!isDemoMode()) db.logAuditQuick('TENDER_DOCS_ADDED', `${files.length} file(s) → tender ${tenderId}`);
    })();
  };

  const handleRetagDoc = (docId: string, tag: DocTag) => {
    const doc = (projectDocs[selectedTenderId] ?? []).find((d) => d.id === docId);
    if (!doc) return;
    const wasAddendum = doc.tag === 'Addendum';
    setProjectDocs((prev) => ({
      ...prev,
      [selectedTenderId]: (prev[selectedTenderId] ?? []).map((d) => (d.id === docId ? { ...d, tag } : d)),
    }));
    if (!isDemoMode() && !docId.startsWith('d_tmp_') && !docId.startsWith('d_seed')) {
      db.updateTenderDocumentTag(docId, tag).catch((e) => toastError(e.message));
    }
    // Re-tagging TO Addendum triggers impact analysis using the stored
    // extracted text (real analysis even after refresh, where there is
    // no File handle) or a clearly provisional fallback.
    if (tag === 'Addendum' && !wasAddendum && blueprintsRef.current[selectedTenderId]) {
      const tenderId = selectedTenderId;
      (async () => {
        const { impact, note } = await buildAddendumImpact(doc.name, blueprintsRef.current[tenderId], {
          storedText: doc.extractedText, documentId: doc.id,
        });
        setBlueprints((prev) => {
          const bp = prev[tenderId];
          if (!bp) return prev;
          const next = applyAddendumImpact(bp, impact);
          persistBlueprint(next);
          return { ...prev, [tenderId]: next };
        });
        toast(note, impact.provisional ? 'info' : 'success', 6000);
      })();
    }
  };

  /* ── Tender creation (from the wizard) ──────────────────────────── */
  const handleCreateTender = (newTender: Tender, extracted: ExtractedTenderMetadata, blueprint: TenderBlueprint, files: File[]) => {
    setTenders([newTender, ...tenders]);
    setSelectedTenderId(newTender.id);
    setBlueprints((prev) => ({ ...prev, [newTender.id]: blueprint }));
    setQuickStartFiles([]);

    const today = new Date().toISOString().split('T')[0];
    const docs: ProjectDoc[] = files.map((f, i) => ({
      id: `d_${Date.now()}_${i}`, name: f.name, size: formatBytes(f.size), addedAt: today,
      tag: detectTag(f.name), status: 'Analysed', extractionStatus: 'pending',
    }));
    setProjectDocs((prev) => ({ ...prev, [newTender.id]: docs }));

    // Keep the existing opportunity feeds (notifications) + Supabase
    // persistence exactly as before: requirements matching, compliance
    // bootstrap, tender run creation.
    const generatedRequests = generateInfoRequests(extracted, kbFiles, personnel);
    setInfoRequests([...generatedRequests, ...infoRequests]);
    const generatedClarifications = generateRecommendedClarifications(extracted);
    if (generatedClarifications.length) setClarifications([...generatedClarifications, ...clarifications]);

    const bootstrappedCompliance: ComplianceItem[] = extracted.mandatoryRequirements.map((req, idx) => ({
      id: `c_boot_${Date.now()}_${idx}`, requirement: req, tenderReference: `Section ${idx + 2}.1.1 - RFT Specs`,
      isMandatory: true, responseSection: `1.${idx + 1} Sourced Methodology Output`, sourceFiles: [],
      ownerId: 'u2', status: ComplianceStatus.NotStarted, gap: null, reviewerId: 'u3',
    }));
    setComplianceItems([...bootstrappedCompliance, ...complianceItems]);

    if (!isDemoMode()) {
      (async () => {
        try {
          const profile = await db.getMyProfile();
          if (profile?.orgId) {
            const createdTender = await db.createTenderRun(profile.orgId, profile.id, extracted, { estimatedValue: newTender.estimatedValue });
            await db.saveInfoRequests(createdTender.id, generatedRequests);
            await db.saveRecommendedClarifications(createdTender.id, generatedClarifications);
            // Persist the blueprint under the BACKEND tender id (the
            // wizard used a temporary client id) so it survives refresh
            // and loads for every team member.
            const persisted: TenderBlueprint = { ...blueprint, tenderId: createdTender.id };
            await db.saveBlueprint(profile.orgId, persisted);
            setBlueprints((prev) => {
              const { [newTender.id]: _temp, ...rest } = prev;
              return { ...rest, [createdTender.id]: persisted };
            });
            // Persist the wizard's documents to Storage under the
            // backend tender id, with their extraction results.
            const persistedDocs: ProjectDoc[] = [];
            for (const f of files) {
              try {
                const doc = await extractFileText(f);
                const saved = await db.addTenderDocument(createdTender.id, f, detectTag(f.name), {
                  text: doc.text,
                  status: doc.text ? 'extracted' : doc.scanned ? 'scanned' : 'unsupported',
                  note: doc.note,
                }, 'Analysed');
                persistedDocs.push(recordToProjectDoc(saved));
              } catch (e) {
                toastError(e instanceof Error ? e.message : `Could not persist ${f.name}.`);
              }
            }
            setProjectDocs((prev) => {
              const { [newTender.id]: _tempDocs, ...rest } = prev;
              return { ...rest, [createdTender.id]: persistedDocs };
            });
            await db.logAudit(profile.orgId, profile.id, 'TENDER_CREATED', extracted.tenderName);
            await loadBackendData();
            setSelectedTenderId(createdTender.id);
          }
        } catch (e) {
          toastError(e instanceof Error ? e.message : 'Could not save the tender run.');
        }
      })();
    }

    const gaps = blueprint.evidence.filter((e) => e.status === 'missing').length;
    toast(`Workspace ready — ${blueprint.modules.filter((m) => m.active).length} modules activated${gaps ? `, ${gaps} evidence gap${gaps === 1 ? '' : 's'} to resolve` : ''}.`);
    go('blueprint');
  };

  const handleReanalyse = () => {
    const t = tenders.find((x) => x.id === selectedTenderId);
    if (!t) return;
    const prev = blueprints[t.id];

    // If the team has edited this blueprint, don't silently overwrite —
    // warn, and on confirm, merge their manual work onto the fresh
    // structure rather than discarding it.
    if (prev?.editedAt) {
      const proceed = window.confirm(
        'This blueprint has manual edits (drafts, review decisions, owners, resolved gaps).\n\n' +
        'Re-analysing refreshes the requirements, module activation and evidence matches from the tender documents, ' +
        'and preserves your drafts, review statuses, owners, resolved evidence and addenda where they still apply.\n\n' +
        'Continue?',
      );
      if (!proceed) return;
    }

    const extracted: ExtractedTenderMetadata = {
      ...sampleExtraction,
      tenderName: t.name, tenderNumber: t.number, client: t.client,
      closingDate: t.closingDate, submissionPortal: t.portal,
    };
    const fresh = generateBlueprint({
      tender: t, extracted, kbFiles, personnel, team,
      documentNames: (projectDocs[t.id] ?? []).map((d) => d.name),
      meta: prev?.meta,
    });
    // Merge manual work forward (Option C: regeneration never silently
    // discards team edits), then clear the edit marker for the fresh run.
    const merged = prev ? mergeManualWork({ ...fresh, inputs: prev.inputs ?? fresh.inputs }, prev) : fresh;
    const next = { ...merged, editedAt: undefined };
    setBlueprints((prevState) => ({ ...prevState, [t.id]: next }));
    persistBlueprint(next, true);
    toast(prev?.editedAt ? 'Blueprint re-analysed — your drafts, reviews and resolved gaps were preserved.' : 'Blueprint regenerated against the current knowledge base.');
  };

  const activeTender = tenders.find(t => t.id === selectedTenderId);
  const activeDaysLeft = activeTender ? Math.ceil((new Date(activeTender.closingDate).getTime() - Date.now()) / 86_400_000) : null;

  // Onboarding gate (connected backends only)
  if (needsOnboarding && session && !isDemoMode()) {
    return (
      <>
        <Onboarding
          defaultName={profileName}
          onComplete={() => { setNeedsOnboarding(false); setCurrentPage('dashboard'); loadBackendData(); }}
          onSignOut={handleSignOut}
          inviteToken={inviteToken}
        />
        <Toaster />
      </>
    );
  }

  if (workspaceLoading && session && !isDemoMode() && !isPublicRoute) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading your workspace…</span>
        </div>
      </div>
    );
  }

  if (isPublicRoute) {
    return (
      <>
        <PublicPages currentPage={currentPage} onNavigate={setCurrentPage} onOpenWorkedExample={isDemoMode() ? handleLoadSample : undefined} />
        <Toaster />
      </>
    );
  }

  const blueprintPageProps = {
    tender: activeTender,
    bp: activeBlueprint,
    update: updateBlueprint,
    team,
    kbFiles,
    onAddKBFile: handleAddKBFile,
    onNavigate: go,
  };

  return (
    <div className="flex h-screen bg-[#FAFAF8] font-sans text-slate-800">

      {/* Mobile drawer backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`${sidebarCollapsed ? 'md:w-16' : 'md:w-60'} w-64 bg-[#F3F3EF] border-r border-slate-200 flex flex-col justify-between text-slate-700 shrink-0
          fixed inset-y-0 left-0 z-40 transform transition-all duration-200 md:static md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="min-h-0 flex-1 flex flex-col">
          {/* Brand */}
          <div className={`p-3 border-b border-slate-200 flex items-center gap-3 bg-white shrink-0 ${sidebarCollapsed ? 'md:justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-base shrink-0">B</div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <div className="font-bold text-indigo-950 leading-tight text-sm truncate">The Bid Room</div>
                  <div className="text-xs text-slate-400 truncate">Proposal command centre</div>
                </div>
              )}
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-slate-700 shrink-0" aria-label="Close menu">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active tender card */}
          {!sidebarCollapsed && (
            <div className="p-3 border-b border-slate-200 bg-slate-50/50 shrink-0">
              {activeTender ? (
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-2">
                  <div className="text-xs text-slate-400 font-medium">Active tender</div>
                  <div className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">{activeTender.name}</div>
                  {activeDaysLeft !== null && (
                    <div className={`text-xs font-semibold ${activeDaysLeft <= 15 ? 'text-red-600' : 'text-slate-500'}`}>
                      {activeDaysLeft > 0 ? `${activeDaysLeft} days to close` : 'Closed'}
                    </div>
                  )}
                  {tenders.length > 1 && (
                    <select
                      value={selectedTenderId}
                      onChange={(e) => setSelectedTenderId(e.target.value)}
                      aria-label="Switch active tender"
                      className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {tenders.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
                    </select>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => go('add-tender')}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg py-2 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Create tender
                </button>
              )}
            </div>
          )}

          {/* Nav */}
          <nav className={`p-2.5 space-y-0.5 overflow-y-auto flex-1 ${sidebarCollapsed ? 'md:px-2' : ''}`}>
            {tenderNav.map(renderNavButton)}
            {!sidebarCollapsed && <div className="pt-3 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">More</div>}
            {sidebarCollapsed && <div className="pt-2 border-t border-slate-200 my-1.5" />}
            {secondaryNav.map(renderNavButton)}
            {!sidebarCollapsed && <div className="pt-3 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workspace</div>}
            {sidebarCollapsed && <div className="pt-2 border-t border-slate-200 my-1.5" />}
            {workspaceNav.map(renderNavButton)}
          </nav>
        </div>

        {/* Account */}
        <div className={`p-3 border-t border-slate-200 bg-slate-100/50 shrink-0 ${sidebarCollapsed ? 'md:px-2' : ''}`}>
          <div className={`flex items-center gap-2.5 mb-2.5 ${sidebarCollapsed ? 'md:justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-indigo-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
              {(profileName || session?.user?.email || 'DU').slice(0, 2).toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <div className="overflow-hidden">
                <div className="text-sm font-semibold text-slate-800 truncate">{profileName || session?.user?.email || 'Demo User'}</div>
                <div className="text-xs text-slate-400 truncate">{isDemoMode() ? 'Demo mode' : 'Workspace member'}</div>
              </div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            title={sidebarCollapsed ? 'Sign out' : undefined}
            className="w-full flex items-center justify-center gap-2 p-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 rounded-lg text-xs font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" /> {!sidebarCollapsed && 'Sign out'}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#FAFAF8]">

        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-3 md:px-5 shrink-0 gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-slate-500 hover:text-slate-900 shrink-0" aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="hidden md:inline-flex text-slate-400 hover:text-slate-700 shrink-0 p-1 rounded-lg hover:bg-slate-100"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-4.5 h-4.5" /> : <PanelLeftClose className="w-4.5 h-4.5" />}
            </button>
            {activeTender && (
              <button
                onClick={() => go('blueprint')}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 min-w-0"
                title="Open the Tender Blueprint"
              >
                <span className="font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded text-xs font-semibold shrink-0">
                  {activeTender.number}
                </span>
                <span className="hidden md:inline font-semibold text-slate-800 truncate">{activeTender.name}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {isDemoMode() && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md" title="No backend configured — sample data, nothing is persisted. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for the real product.">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Demo mode
              </span>
            )}
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#F3F3EF] border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 text-sm transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search…</span>
              <span className="text-xs font-mono bg-white border border-slate-200 rounded px-1 py-0.5 text-slate-400">⌘K</span>
            </button>
            <button onClick={() => setPaletteOpen(true)} aria-label="Search" className="sm:hidden text-slate-500 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100">
              <Search className="w-4.5 h-4.5" />
            </button>

            {presentUsers.filter((u) => u.id !== session?.user?.id).length > 0 && (
              <div className="hidden sm:flex items-center -space-x-2" title="Currently viewing this tender">
                {presentUsers.filter((u) => u.id !== session?.user?.id).slice(0, 4).map((u) => (
                  <div key={u.id} title={u.name}
                    className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
                    {u.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                ))}
              </div>
            )}

            <NotificationCenter
              kbFiles={kbFiles}
              auditLog={mockAuditLogs}
              infoRequests={infoRequests}
              setInfoRequests={setInfoRequests}
              clarifications={clarifications}
              setClarifications={setClarifications}
              onVerifyKBFile={handleVerifyKBFile}
              onNavigate={(page) => (page === 'opportunity' ? go('evidence') : go(page))}
            />
          </div>
        </header>

        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          <ErrorBoundary key={currentPage} section={currentPage} onReset={() => go('dashboard')}>
          <Suspense fallback={
            <div className="flex items-center justify-center py-24">
              <div className="w-7 h-7 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          }>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="min-h-full max-w-[1320px] mx-auto"
            >
              {/* Persistent workflow stepper — shown on the seven stage
                  pages when a tender is selected. Calm, one-line guide. */}
              {activeBlueprint && STAGE_PAGES.has(currentPage) && (
                <div className="mb-4 pb-3 border-b border-slate-100">
                  {isDemoMode() && (selectedTenderId === SAMPLE_TENDER_ID || selectedTenderId === 'demo-riverside') && (
                    <button onClick={handleLoadSample} title="Reset the worked example to its original state"
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 mb-2 hover:bg-amber-100 transition-colors">
                      Example project · reset
                    </button>
                  )}
                  <StageStepper
                    statuses={computeStageStatuses(activeBlueprint, activeScores, (projectDocs[selectedTenderId] ?? []).length > 0)}
                    active={pageToStage(currentPage)}
                    onNavigate={go}
                  />
                  {activeScores && currentPage !== 'dashboard' && (() => {
                    const nba = computeNextBestAction(activeBlueprint, activeScores, (projectDocs[selectedTenderId] ?? []).length > 0);
                    // Don't nag with a link to the page you're already on.
                    if (nba.page === currentPage) return null;
                    return (
                      <button onClick={() => go(nba.page)}
                        className="mt-2.5 w-full flex items-center justify-between gap-3 text-left rounded-lg border border-blue-100 bg-blue-50/50 hover:bg-blue-50 px-3 py-2 transition-colors">
                        <span className="min-w-0 flex items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 shrink-0">Next</span>
                          <span className="text-sm text-slate-700 truncate">{nba.action}</span>
                        </span>
                        <span className="text-xs font-semibold text-blue-700 shrink-0 flex items-center gap-1">{nba.buttonLabel} <ArrowRight className="w-3.5 h-3.5" /></span>
                      </button>
                    );
                  })()}
                  {(() => {
                    // In-stage tabs so Blueprint/Requirements/Modules and
                    // Gaps/Commercial/Risks read as one surface.
                    const stage = pageToStage(currentPage);
                    const bpv = activeBlueprint;
                    if (!bpv) return null;
                    const missingEv = bpv.evidence.filter((e) => e.status === 'missing' && !e.resolution).length;
                    const openCom = bpv.commercial.filter((c) => c.status === 'Open').length;
                    const openRisks = bpv.risks.filter((r) => r.status === 'Open').length;
                    if (stage === 'blueprint') return (
                      <StageTabs current={currentPage} onNavigate={go} tabs={[
                        { page: 'blueprint', label: 'Overview' },
                        { page: 'requirements', label: 'Requirements', count: bpv.requirements.length },
                        { page: 'modules', label: 'Modules', count: bpv.modules.filter((m) => m.active).length },
                      ]} />
                    );
                    if (stage === 'gaps') return (
                      <StageTabs current={currentPage} onNavigate={go} tabs={[
                        { page: 'evidence', label: 'Evidence gaps', count: missingEv },
                        { page: 'commercial', label: 'Commercial', count: openCom },
                        { page: 'risks', label: 'Risks', count: openRisks },
                      ]} />
                    );
                    return null;
                  })()}
                </div>
              )}
              {currentPage === 'dashboard' && (
                <DashboardPage
                  tenders={tenders}
                  blueprints={blueprints}
                  activeTenderId={selectedTenderId}
                  onSelectTender={setSelectedTenderId}
                  onNavigate={go}
                  onCreateTender={() => { setQuickStartFiles([]); go('add-tender'); }}
                  onQuickStart={(files) => { setQuickStartFiles(files); go('add-tender'); }}
                  onLoadSample={isDemoMode() ? handleLoadSample : undefined}
                />
              )}

              {currentPage === 'add-tender' && (
                <TenderIntake
                  onCreate={handleCreateTender}
                  onNavigate={go}
                  kbFiles={kbFiles}
                  personnel={personnel}
                  team={team}
                  initialFiles={quickStartFiles}
                />
              )}

              {currentPage === 'blueprint' && <BlueprintPage {...blueprintPageProps} onReanalyse={handleReanalyse} />}
              {currentPage === 'documents' && (
                <DocumentsPage
                  {...blueprintPageProps}
                  documents={projectDocs[selectedTenderId] ?? []}
                  onAddDocuments={handleAddProjectDocs}
                  onRetag={handleRetagDoc}
                />
              )}
              {currentPage === 'requirements' && <RequirementsPage {...blueprintPageProps} />}
              {currentPage === 'modules' && (
                <ModulesPage {...blueprintPageProps}
                  onOpenDraft={(key) => { setFocusModule(key); go('drafts'); }}
                  onOpenTool={go}
                />
              )}
              {currentPage === 'evidence' && <EvidencePage {...blueprintPageProps} />}
              {currentPage === 'drafts' && (
                <DraftsPage {...blueprintPageProps} focusModule={focusModule} onFocusModule={setFocusModule} />
              )}
              {currentPage === 'reviews' && <ReviewsPage {...blueprintPageProps} />}
              {currentPage === 'risks' && <RisksPage {...blueprintPageProps} />}
              {currentPage === 'commercial' && <CommercialPage {...blueprintPageProps} />}
              {currentPage === 'exports' && <ExportsPage {...blueprintPageProps} />}
              {currentPage === 'closeout' && <CloseoutPage {...blueprintPageProps} allBlueprintsContext={memoryContext} />}

              {/* Embedded tools, reachable from the relevant modules */}
              {currentPage === 'pricing-tool' && (
                <div className="space-y-4">
                  <button onClick={() => go('modules')} className="text-sm font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"><ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to modules</button>
                  <Pricing tenderName={activeTender?.name} tenderValue={activeTender?.estimatedValue} tenderId={activeTender?.id} />
                </div>
              )}
              {currentPage === 'schedule-tool' && (
                <div className="space-y-4">
                  <button onClick={() => go('modules')} className="text-sm font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"><ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to modules</button>
                  <ScheduleBuilder />
                </div>
              )}

              {currentPage === 'personnel' && (
                <Personnel requests={infoRequests} activeTenderName={activeTender?.name} profiles={personnel} setProfiles={setPersonnel} team={team} />
              )}
              {currentPage === 'admin-prompts' && <AdminPromptConsole />}
              {currentPage === 'team' && <TeamInvites team={team} />}
              {currentPage === 'admin-console' && isPlatformAdmin && <AdminConsole />}
              {currentPage === 'admin-console' && !isPlatformAdmin && (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-md mx-auto mt-12">
                  <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-slate-800">Not authorized</div>
                  <p className="text-sm text-slate-500 mt-1">This console is restricted to the platform's operators.</p>
                </div>
              )}

              {['knowledge-base', 'lessons-learned', 'billing', 'settings'].includes(currentPage) && (
                <OtherPages
                  currentPage={currentPage}
                  tenders={tenders}
                  kbFiles={kbFiles}
                  onAddKBFile={handleAddKBFile}
                  onRemoveKBFile={handleRemoveKBFile}
                  onVerifyKBFile={handleVerifyKBFile}
                  hasMoreKbFiles={hasMoreKbFiles}
                  loadingMoreKb={loadingMoreKb}
                  onLoadMoreKbFiles={loadMoreKbFiles}
                  onNavigate={go}
                  onOpenTender={(id) => { if (id) setSelectedTenderId(id); go('blueprint'); }}
                  aiUsageCount={tenders.length}
                />
              )}

              {/* Fallback so stray routes never dead-end */}
              {!knownPrivatePages.includes(currentPage) && (
                <DashboardPage
                  tenders={tenders}
                  blueprints={blueprints}
                  activeTenderId={selectedTenderId}
                  onSelectTender={setSelectedTenderId}
                  onNavigate={go}
                  onCreateTender={() => { setQuickStartFiles([]); go('add-tender'); }}
                  onQuickStart={(files) => { setQuickStartFiles(files); go('add-tender'); }}
                  onLoadSample={isDemoMode() ? handleLoadSample : undefined}
                />
              )}
            </motion.div>
          </AnimatePresence>
          </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={go}
        onSelectTender={(id) => { setSelectedTenderId(id); go('blueprint'); }}
        tenders={tenders}
        kbFiles={kbFiles}
        complianceItems={complianceItems}
        team={team}
      />

      <Toaster />
    </div>
  );
}
