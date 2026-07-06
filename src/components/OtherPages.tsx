/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { toast } from '../lib/toast';
import { isDemoMode } from '../lib/supabase';
import { formatBytes } from '../lib/format';
import * as db from '../lib/db';
import { motion, AnimatePresence } from 'motion/react';
import { KBFile, TeamMember, LessonsLearnedItem, AuditLog, Tender } from '../types';
import { 
  FileText, Shield, Trash2, Check, RefreshCw, Key, ShieldCheck, Mail, CreditCard, 
  Layers, Plus, TrendingUp, AlertTriangle, HelpCircle, Briefcase, User, Award, 
  DollarSign, Search, UploadCloud, X, FileSpreadsheet, CheckCircle2, ShieldAlert,
  CheckCircle
} from 'lucide-react';
import { mockTeam, mockKBFiles, mockLessonsLearned, mockAuditLogs } from '../data/mockData';
import FileDropzone from './FileDropzone';
import AiModelSettings from './AiModelSettings';

interface OtherPagesProps {
  currentPage: string;
  tenders: Tender[];
  kbFiles: KBFile[];
  onAddKBFile: (file: KBFile, rawFile?: File) => void;
  onRemoveKBFile: (id: string) => void;
  onVerifyKBFile: (id: string) => void;
  hasMoreKbFiles?: boolean;
  loadingMoreKb?: boolean;
  onLoadMoreKbFiles?: () => void;
  onNavigate?: (page: string) => void;
  onOpenTender?: (id?: string) => void;
  /** Rough "AI runs this month" figure shown in the AI model panel. */
  aiUsageCount?: number;
}

export default function OtherPages({ currentPage, tenders, kbFiles, onAddKBFile, onRemoveKBFile, onVerifyKBFile, hasMoreKbFiles, loadingMoreKb, onLoadMoreKbFiles, onNavigate, onOpenTender, aiUsageCount = 0 }: OtherPagesProps) {
  
  // Knowledge Base State Managers
  const [kbActiveCategory, setKbActiveCategory] = useState<string>('ALL');
  const [kbSearchText, setKbSearchText] = useState<string>('');
  const [kbStaleFilter, setKbStaleFilter] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  // Real full-text search (name + category + extracted document text —
  // see supabase/schema.sql's search_vector column) against a connected
  // backend, debounced. Falls back to the existing client-side
  // filename/category/uploader substring match in demo mode or while a
  // query is short/empty — see filteredFiles below. Declared here,
  // unconditionally, because it's a hook: it can't live inside one of
  // the `if (currentPage === ...)` branches further down.
  const [ftsResults, setFtsResults] = useState<KBFile[] | null>(null);
  const [ftsLoading, setFtsLoading] = useState(false);
  useEffect(() => {
    if (isDemoMode() || currentPage !== 'knowledge-base' || kbSearchText.trim().length < 2) {
      setFtsResults(null);
      return;
    }
    let cancelled = false;
    setFtsLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const profile = await db.getMyProfile();
        if (cancelled || !profile?.orgId) return;
        const results = await db.searchKbFiles(profile.orgId, kbSearchText.trim());
        if (!cancelled) setFtsResults(results);
      } catch {
        if (!cancelled) setFtsResults(null); // fall back to client-side filter silently
      } finally {
        if (!cancelled) setFtsLoading(false);
      }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [kbSearchText, currentPage]);
  
  // Import Drawer Form State
  const [newDocCategory, setNewDocCategory] = useState<'CV' | 'PROJECT_EVIDENCE' | 'CAPABILITY' | 'CREDENTIAL' | 'BENCHMARK' | 'POLICY'>('CV');
  const [newDocName, setNewDocName] = useState<string>('');
  const [newDocSize, setNewDocSize] = useState<string>('2.5 MB');
  const [newDocBy, setNewDocBy] = useState<string>('Priya Raman');
  
  // Specific category metadata state
  const [metaCandidateName, setMetaCandidateName] = useState<string>('');
  const [metaExperience, setMetaExperience] = useState<string>('');
  const [metaRole, setMetaRole] = useState<string>('');
  const [metaChartered, setMetaChartered] = useState<boolean>(false);
  
  const [metaProjectName, setMetaProjectName] = useState<string>('');
  const [metaClient, setMetaClient] = useState<string>('');
  const [metaValue, setMetaValue] = useState<string>('');
  
  const [metaCompList, setMetaCompList] = useState<string>('');
  const [metaCredentialBody, setMetaCredentialBody] = useState<string>('');
  const [metaExpiry, setMetaExpiry] = useState<string>('');
  
  const [metaRateRange, setMetaRateRange] = useState<string>('');
  const [metaLocation, setMetaLocation] = useState<string>('');

  // Drag over simulator state
  const [isFormDragging, setIsFormDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. PIPELINE PAGE (Kanban style)
  if (currentPage === 'pipeline') {
    const statuses = ['DRAFT', 'DRAFTING', 'UNDER_REVIEW', 'APPROVED', 'SUBMITTED'];
    return (
      <div className="space-y-6">
        <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight">Tenders</h1>
            <p className="text-sm text-slate-500 mt-1">Every tender by stage — click one to open its workspace.</p>
          </div>
          <button
            onClick={() => onNavigate?.('add-tender')}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-md shadow-sm shrink-0 self-start"
          >
            <Plus className="w-4 h-4" /> Add tender
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
          {statuses.map(status => {
            const statusBids = tenders.filter(t => t.status === status);
            return (
              <div key={status} className="bg-slate-50 border border-slate-200 rounded p-3 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-[10px] font-mono font-semibold uppercase text-slate-600">{status.replace('_', ' ')}</span>
                  <span className="bg-slate-200 text-slate-800 text-[10px] font-mono px-1.5 py-0.5 rounded font-bold">{statusBids.length}</span>
                </div>
                
                <div className="space-y-2">
                  {statusBids.map(bid => (
                    <button
                      key={bid.id}
                      onClick={() => onOpenTender?.(bid.id)}
                      className="w-full text-left bg-white p-3 border border-slate-150 rounded shadow-xs space-y-2 text-xs hover:border-indigo-300 transition-colors"
                    >
                      <div className="font-semibold text-slate-900 leading-tight">{bid.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                        <span>{bid.number}</span>
                        <span>{bid.closingDate}</span>
                      </div>
                      <div className="border-t border-slate-100 pt-2 flex justify-between text-[10px]">
                        <span className="text-slate-600">Value:</span>
                        <span className="font-mono text-slate-900 font-semibold">{bid.estimatedValue}</span>
                      </div>
                    </button>
                  ))}
                  {statusBids.length === 0 && (
                    <div className="text-center py-6 text-[11px] text-slate-400 italic">No bids in stage</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 2. KNOWLEDGE BASE
  if (currentPage === 'knowledge-base') {
    // Category mapping config for icons, labels, colors
    const categoryConfigs: Record<string, { label: string; icon: any; textClass: string; bgClass: string; borderClass: string }> = {
      CV: { label: 'Personnel & CV', icon: User, textClass: 'text-slate-700', bgClass: 'bg-slate-50', borderClass: 'border-slate-200' },
      PROJECT_EVIDENCE: { label: 'Past Project Evidence', icon: Briefcase, textClass: 'text-slate-700', bgClass: 'bg-slate-50', borderClass: 'border-slate-200' },
      CAPABILITY: { label: 'Capability Statement', icon: Layers, textClass: 'text-slate-700', bgClass: 'bg-slate-50', borderClass: 'border-slate-200' },
      CREDENTIAL: { label: 'Credential & Cert', icon: Award, textClass: 'text-slate-700', bgClass: 'bg-slate-50', borderClass: 'border-slate-200' },
      BENCHMARK: { label: 'Pricing Benchmark', icon: CreditCard, textClass: 'text-slate-700', bgClass: 'bg-slate-50', borderClass: 'border-slate-200' },
      POLICY: { label: 'Policy & Regulatory', icon: Shield, textClass: 'text-slate-700', bgClass: 'bg-slate-50', borderClass: 'border-slate-200' },
      UNSORTED: { label: 'Unsorted Document', icon: FileText, textClass: 'text-slate-500', bgClass: 'bg-slate-100', borderClass: 'border-slate-200' },
    };

    // Calculate metadata tags for each file (both initial mock data and newly uploaded ones)
    const renderFileMetaTags = (file: KBFile) => {
      // Check if file is one of our default mocks or has been newly created with some hints in name
      const lowercaseName = file.name.toLowerCase();
      
      switch (file.category) {
        case 'CV': {
          let nameLabel = 'Vetted Profile';
          let expLabel = '8+ Years Exp';
          let certLabel = '';
          
          if (lowercaseName.includes('marcus') || lowercaseName.includes('chen')) {
            nameLabel = 'Ada Whitlock';
            expLabel = '15+ Years Exp';
            certLabel = 'CSE Lead';
          } else if (lowercaseName.includes('dave') || lowercaseName.includes('miller')) {
            nameLabel = 'Mei Lin Zhao';
            expLabel = '10 Years Exp';
            certLabel = 'Civil Specialist';
          } else if (lowercaseName.includes('sarah') || lowercaseName.includes('vance')) {
            nameLabel = 'Tom Castellano';
            expLabel = '12 Years Exp';
            certLabel = 'Bid Director';
          } else if (metaCandidateName) {
            nameLabel = metaCandidateName;
            expLabel = metaExperience ? `${metaExperience} Exp` : 'Vetted Profile';
            certLabel = metaRole;
          }

          return (
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[9px] text-slate-500 font-sans font-medium flex items-center gap-1 bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded">
                <User className="w-2.5 h-2.5 text-slate-400" /> {nameLabel}
              </span>
              <span className="text-[9px] text-slate-500 font-mono bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded">
                {expLabel}
              </span>
              {certLabel && (
                <span className="text-[9px] text-emerald-700 font-mono font-semibold bg-emerald-50 border border-emerald-150 px-1.5 py-0.25 rounded">
                  {certLabel}
                </span>
              )}
            </div>
          );
        }
        
        case 'PROJECT_EVIDENCE': {
          let clientLabel = 'Corporate Reference';
          let valueLabel = '';
          let sectorLabel = 'Infrastructure';

          if (lowercaseName.includes('sydney') || lowercaseName.includes('metropolitan')) {
            clientLabel = 'Client: TMTA';
            valueLabel = 'Value: $5.6M AUD';
            sectorLabel = 'Sector: Rail Signalling';
          } else if (lowercaseName.includes('parramatta')) {
            clientLabel = 'Client: Tarnwick Metro';
            valueLabel = 'Value: $8.1M AUD';
            sectorLabel = 'Sector: Light Rail Civil';
          } else if (metaProjectName) {
            clientLabel = metaClient ? `Client: ${metaClient}` : 'Corporate Reference';
            valueLabel = metaValue ? `Value: ${metaValue}` : '';
            sectorLabel = 'Sector: Infrastructure';
          }

          return (
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[9px] text-slate-500 font-sans font-medium flex items-center gap-1 bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded">
                {clientLabel}
              </span>
              {valueLabel && (
                <span className="text-[9px] text-slate-500 font-sans bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded font-medium">
                  {valueLabel}
                </span>
              )}
              <span className="text-[9px] text-indigo-700 font-sans font-semibold bg-indigo-50 border border-indigo-150 px-1.5 py-0.25 rounded">
                {sectorLabel}
              </span>
            </div>
          );
        }

        case 'CAPABILITY': {
          let mainSectors = 'Signalling Assurance, RAMS & Safety Audit';
          if (metaCompList) {
            mainSectors = metaCompList;
          }
          return (
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[9px] text-purple-700 font-sans font-semibold bg-purple-50 border border-purple-150 px-1.5 py-0.25 rounded">
                Core Competency Statement
              </span>
              <span className="text-[9px] text-slate-500 font-sans bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded">
                {mainSectors}
              </span>
            </div>
          );
        }

        case 'CREDENTIAL': {
          let credBody = 'TMTA Sourcing Panel';
          let certTitle = 'Class A1 Registration';
          let expiryStr = 'No Expiry';

          if (lowercaseName.includes('tfnsw') || lowercaseName.includes('pre-qualification')) {
            credBody = 'Accreditation Body: TMTA';
            certTitle = 'Class A1 Contractor Pre-qual';
          } else if (metaCredentialBody) {
            credBody = `Body: ${metaCredentialBody}`;
            certTitle = 'Vetted Certification';
            expiryStr = metaExpiry ? `Expires: ${metaExpiry}` : 'No Expiry';
          }

          return (
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[9px] text-slate-500 font-sans font-medium flex items-center gap-1 bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded">
                {credBody}
              </span>
              <span className="text-[9px] text-emerald-700 font-mono font-semibold bg-emerald-50 border border-emerald-150 px-1.5 py-0.25 rounded">
                {certTitle}
              </span>
              {expiryStr && expiryStr !== 'No Expiry' && (
                <span className="text-[9px] text-slate-500 font-sans bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded font-medium">
                  {expiryStr}
                </span>
              )}
            </div>
          );
        }

        case 'BENCHMARK': {
          let rangeLabel = '$1,350 - $1,900 / day';
          let locationLabel = 'Australia-wide';

          if (lowercaseName.includes('civil') || lowercaseName.includes('works')) {
            rangeLabel = '$1,100 - $1,450 / day';
            locationLabel = 'Region: Tarnwick';
          } else if (metaRateRange) {
            rangeLabel = metaRateRange;
            locationLabel = metaLocation ? `Region: ${metaLocation}` : 'Vetted Pricing';
          }

          return (
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[9px] text-slate-500 font-sans font-medium flex items-center gap-1 bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded">
                Rates Matrix
              </span>
              <span className="text-[9px] text-slate-500 font-mono bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded font-semibold">
                {rangeLabel}
              </span>
              <span className="text-[9px] text-slate-500 font-sans bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded">
                {locationLabel}
              </span>
            </div>
          );
        }

        case 'POLICY':
          return (
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[9px] text-slate-500 font-sans font-medium flex items-center gap-1 bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded">
                WHS Regulatory ISO 45001 Policy
              </span>
              <span className="text-[9px] text-emerald-700 font-mono font-semibold bg-emerald-50 border border-emerald-150 px-1.5 py-0.25 rounded">
                Corporate Audit Passed
              </span>
            </div>
          );

        default:
          return (
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[9px] text-slate-400 font-sans bg-slate-50 border border-slate-150 px-1.5 py-0.25 rounded">
                Standard Knowledge Asset
              </span>
            </div>
          );
      }
    };

    // Calculate Counts for Bento & Sidebar Tabs
    const totalCount = kbFiles.length;
    const cvCount = kbFiles.filter(f => f.category === 'CV').length;
    const projectCount = kbFiles.filter(f => f.category === 'PROJECT_EVIDENCE').length;
    const capabilityCount = kbFiles.filter(f => f.category === 'CAPABILITY').length;
    const credentialCount = kbFiles.filter(f => f.category === 'CREDENTIAL').length;
    const benchmarkCount = kbFiles.filter(f => f.category === 'BENCHMARK').length;
    const policyCount = kbFiles.filter(f => f.category === 'POLICY').length;
    const staleCount = kbFiles.filter(f => f.isStale).length;
    const verifiedCount = totalCount - staleCount;
    const readinessIndex = Math.round((verifiedCount / (totalCount || 1)) * 100);

    // Apply filters and search
    const filteredFiles = (ftsResults ?? kbFiles).filter(file => {
      // 1. Category tab filter
      if (kbActiveCategory !== 'ALL' && file.category !== kbActiveCategory) {
        return false;
      }
      // 2. Search keyword filter — skipped when the backend already did a
      // real full-text match (ftsResults set); otherwise falls back to a
      // simple substring match on name/category/uploader.
      if (!ftsResults && kbSearchText.trim() !== '') {
        const query = kbSearchText.toLowerCase();
        const matchesName = file.name.toLowerCase().includes(query);
        const matchesCategory = file.category.toLowerCase().includes(query);
        const matchesAuthor = file.uploadedBy.toLowerCase().includes(query);
        if (!matchesName && !matchesCategory && !matchesAuthor) {
          return false;
        }
      }
      // 3. Staleness status filter
      if (kbStaleFilter === 'STALE' && !file.isStale) return false;
      if (kbStaleFilter === 'VERIFIED' && file.isStale) return false;

      return true;
    });

    // Simulate Drop File & Auto-Generate Name Based on Category Selected
    const handleCategorySelectionForNewDoc = (category: typeof newDocCategory) => {
      setNewDocCategory(category);
      // Auto-populate a plausible name template if they haven't typed one
      if (!newDocName || newDocName.startsWith('CV_') || newDocName.startsWith('Project_') || newDocName.startsWith('Capability_') || newDocName.startsWith('CRSA_') || newDocName.startsWith('Rates_')) {
        switch (category) {
          case 'CV':
            setNewDocName('CV_Liam_Ferreira_Civil_Superintendent.pdf');
            break;
          case 'PROJECT_EVIDENCE':
            setNewDocName('Project_Evidence_Melbourne_Metro_Tunnel_Systems.docx');
            break;
          case 'CAPABILITY':
            setNewDocName('CRSA_Civil_Logistics_Capability_Statement_2026.pdf');
            break;
          case 'CREDENTIAL':
            setNewDocName('CRSA_Quality_Management_ISO_9001_Certificate.pdf');
            break;
          case 'BENCHMARK':
            setNewDocName('Commercial_Rates_Matrix_Technical_Consultants_VIC.xlsx');
            break;
          case 'POLICY':
            setNewDocName('CRSA_Environmental_Sustainability_Framework_2026.pdf');
            break;
        }
      }
    };

    // Form Submit Action — uses the real selected File if one was
    // attached (name/size come from the actual bytes), falls back to the
    // manually-typed fields for a metadata-only record otherwise. With
    // multiple files attached, each becomes its own KB record — same
    // category, each file's own real name/size — rather than only the
    // first one mattering.
    const handleSubmitNewDoc = (e: React.FormEvent) => {
      e.preventDefault();

      if (selectedFiles.length > 0) {
        selectedFiles.forEach((file, idx) => {
          const newFile: KBFile = {
            id: `f_user_${Date.now()}_${idx}`,
            name: file.name,
            category: newDocCategory,
            size: formatBytes(file.size),
            uploadedAt: new Date().toISOString().split('T')[0],
            uploadedBy: newDocBy || 'Tom Castellano',
            lastVerifiedAt: new Date().toISOString().split('T')[0],
            isStale: false,
            objectUrl: URL.createObjectURL(file),
          };
          onAddKBFile(newFile, file);
        });
        toast(`${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} uploaded.`);
      } else {
        const fileId = 'f_user_' + Date.now();
        const finalName = newDocName.trim() || `unnamed_knowledge_asset_${Date.now()}`;
        const newFile: KBFile = {
          id: fileId,
          name: finalName,
          category: newDocCategory,
          size: newDocSize || '1.8 MB',
          uploadedAt: new Date().toISOString().split('T')[0],
          uploadedBy: newDocBy || 'Tom Castellano',
          lastVerifiedAt: new Date().toISOString().split('T')[0],
          isStale: false,
        };
        onAddKBFile(newFile);
        toast(`${finalName} added (metadata only — no file attached).`);
      }
      
      // Reset form variables
      setNewDocName('');
      setMetaCandidateName('');
      setMetaExperience('');
      setMetaRole('');
      setMetaChartered(false);
      setMetaProjectName('');
      setMetaClient('');
      setMetaValue('');
      setMetaCompList('');
      setMetaCredentialBody('');
      setMetaExpiry('');
      setMetaRateRange('');
      setMetaLocation('');
      setUploadProgress(0);
      setSelectedFiles([]);
      setIsAddModalOpen(false);
    };


    // Accepts one or more real Files (from the picker or a drop) — these
    // are the actual attachments, not simulated ones. A brief progress
    // animation is kept for the UX polish of "ingesting", but every
    // file's name and size are real from this point on. New files are
    // appended to any already selected, and duplicates (same name+size)
    // are skipped.
    const acceptFiles = (files: FileList | File[]) => {
      const incoming = Array.from(files);
      setSelectedFiles((prev) => {
        const existingKeys = new Set(prev.map((f) => `${f.name}:${f.size}`));
        const merged = [...prev];
        incoming.forEach((f) => {
          const key = `${f.name}:${f.size}`;
          if (!existingKeys.has(key)) { merged.push(f); existingKeys.add(key); }
        });
        return merged;
      });
      // First file's name still seeds the metadata-only fallback fields
      // (used only if the person removes every file before submitting).
      if (incoming[0] && (!newDocName || newDocName.startsWith('CV_') || newDocName.startsWith('Project_') || newDocName.startsWith('Capability_') || newDocName.startsWith('CRSA_') || newDocName.startsWith('Rates_'))) {
        setNewDocName(incoming[0].name);
        setNewDocSize(formatBytes(incoming[0].size));
      }
      setUploadProgress(1);
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 100) { clearInterval(interval); return 100; }
          return prev + 20;
        });
      }, 80);
    };

    const removeSelectedFile = (idx: number) => {
      setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) acceptFiles(e.target.files);
      e.target.value = ''; // allow re-selecting the same file(s) later
    };

    return (
      <div className="space-y-6 relative">
        {/* Title and Intro */}
        <div className="border-b border-slate-200 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight flex items-center gap-2">
              <span>Company Corporate Knowledge Base</span>
              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full uppercase">Enterprise</span>
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Centralized repository for verified CVs, past projects, capability statements, credentials, and pricing benchmarks used to seed bid drafts.
            </p>
          </div>
          
          <button 
            onClick={() => {
              setIsAddModalOpen(true);
              handleCategorySelectionForNewDoc('CV');
            }}
            className="text-xs font-semibold py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow-sm flex items-center justify-center gap-1.5 self-start transition-all"
            id="import-asset-button"
          >
            <Plus className="w-4 h-4" /> Add evidence
          </button>
        </div>

        {/* Bento Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Personnel */}
          <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold uppercase text-slate-500">Personnel & CVs</span>
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold font-mono text-slate-900 leading-tight">{cvCount}</div>
              <p className="text-[10px] text-slate-500 mt-1">Verified CV profiles in database</p>
            </div>
            <div className="absolute bottom-0 left-0 h-1 bg-blue-500 w-full opacity-60"></div>
          </div>

          {/* Card 2: Past Projects */}
          <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold uppercase text-slate-500">Project References</span>
              <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold font-mono text-slate-900 leading-tight">{projectCount}</div>
              <p className="text-[10px] text-slate-500 mt-1">Case study records indexed</p>
            </div>
            <div className="absolute bottom-0 left-0 h-1 bg-indigo-500 w-full opacity-60"></div>
          </div>

          {/* Card 3: Statements, Creds & Rates */}
          <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold uppercase text-slate-500">Credentials & Rates</span>
              <div className="w-7 h-7 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold font-mono text-slate-900 leading-tight">
                {capabilityCount + credentialCount + benchmarkCount}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Statements, Certs, and Benchmarks</p>
            </div>
            <div className="absolute bottom-0 left-0 h-1 bg-purple-500 w-full opacity-60"></div>
          </div>

          {/* Card 4: Sourcing Readiness */}
          <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold uppercase text-slate-500">Sourcing Trust Score</span>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${readinessIndex > 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold font-mono text-slate-900 leading-tight flex items-baseline gap-1">
                <span>{readinessIndex}%</span>
                <span className="text-[10px] font-sans font-medium text-slate-500">vetted</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${readinessIndex > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                  style={{ width: `${readinessIndex}%` }}
                ></div>
              </div>
            </div>
            <div className={`absolute bottom-0 left-0 h-1 w-full opacity-60 ${readinessIndex > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
          </div>
        </div>

        {/* Filtering & Controls Panel */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
          {/* Main Category Filter Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
            {[
              { id: 'ALL', label: 'All Documents', count: totalCount, icon: FileText },
              { id: 'CV', label: 'Personnel & CVs', count: cvCount, icon: User },
              { id: 'PROJECT_EVIDENCE', label: 'Past Projects', count: projectCount, icon: Briefcase },
              { id: 'CAPABILITY', label: 'Capability Statements', count: capabilityCount, icon: Layers },
              { id: 'CREDENTIAL', label: 'Credentials & Certs', count: credentialCount, icon: Award },
              { id: 'BENCHMARK', label: 'Pricing Benchmarks', count: benchmarkCount, icon: CreditCard },
              { id: 'POLICY', label: 'Policies', count: policyCount, icon: Shield },
            ].map(tab => {
              const TabIcon = tab.icon;
              const isActive = kbActiveCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setKbActiveCategory(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    isActive 
                      ? 'bg-slate-900 text-white shadow-xs' 
                      : 'text-slate-600 hover:bg-slate-200/65 hover:text-slate-900'
                  }`}
                >
                  <TabIcon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  <span className={`text-[9px] font-mono px-1 rounded-sm ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search, Verification Status Select, and Quick Filter Actions */}
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={kbSearchText}
                onChange={e => setKbSearchText(e.target.value)}
                placeholder="Search by asset title, metadata keyword, or author..."
                className="w-full text-xs pl-9 pr-8 py-2 border border-slate-250 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
              />
              {kbSearchText && (
                <button 
                  onClick={() => setKbSearchText('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {!isDemoMode() && kbSearchText.trim().length >= 2 && (
                <div className="absolute -bottom-4 left-0 text-[9px] font-mono text-slate-400">
                  {ftsLoading ? 'Searching document text…' : ftsResults ? `Full-text search · ${ftsResults.length} match${ftsResults.length === 1 ? '' : 'es'}` : ''}
                </div>
              )}
            </div>

            {/* Quick Filter Controls */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500 font-mono font-medium uppercase">Trust Filter:</span>
                <div className="flex bg-white border border-slate-200 rounded p-0.5">
                  {[
                    { id: 'ALL', label: 'All Status' },
                    { id: 'VERIFIED', label: 'Verified Only' },
                    { id: 'STALE', label: 'Stale (Awaiting Audit)' }
                  ].map(stat => (
                    <button
                      key={stat.id}
                      onClick={() => setKbStaleFilter(stat.id)}
                      className={`px-2 py-1 text-[10px] rounded-xs font-semibold transition-all ${
                        kbStaleFilter === stat.id 
                          ? 'bg-slate-200 text-slate-900 shadow-3xs' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {stat.label}
                    </button>
                  ))}
                </div>
              </div>

              {staleCount > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-55 text-amber-900 text-[10px] px-2.5 py-1.5 rounded-md border border-amber-200 font-semibold shadow-3xs animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>{staleCount} documents require verification auditing</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Documents Table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 w-1/2">Document details & Extracted metadata tags</th>
                <th className="py-3 px-4">Classification</th>
                <th className="py-3 px-4">Author & Size</th>
                <th className="py-3 px-4">Last Audited</th>
                <th className="py-3 px-4 text-right">Audit & Trust Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredFiles.map(file => {
                const config = categoryConfigs[file.category] || categoryConfigs.UNSORTED;
                const FileIcon = config.icon;
                
                return (
                  <tr key={file.id} className="hover:bg-slate-50/40 transition-colors group">
                    {/* Details Column */}
                    <td className="py-3.5 px-4 font-sans font-medium text-slate-900">
                      <div className="flex gap-3 items-start">
                        <div className={`w-8 h-8 rounded border flex items-center justify-center shrink-0 mt-0.5 ${config.bgClass} ${config.borderClass}`}>
                          <FileIcon className={`w-4 h-4 ${config.textClass}`} />
                        </div>
                        <div className="min-w-0">
                          <span className="text-slate-900 font-semibold group-hover:text-indigo-600 transition-colors block truncate max-w-lg" title={file.name}>
                            {file.name}
                          </span>
                          {/* Rich Metadata Section */}
                          {renderFileMetaTags(file)}
                        </div>
                      </div>
                    </td>

                    {/* Category Column */}
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.75 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider ${config.bgClass} ${config.borderClass} ${config.textClass}`}>
                        <FileIcon className="w-3 h-3 shrink-0" />
                        {config.label}
                      </span>
                    </td>

                    {/* Metadata Upload Column */}
                    <td className="py-3.5 px-4 text-slate-600 font-sans">
                      <div className="font-semibold text-slate-800 text-[11px]">{file.uploadedBy}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{file.size}</div>
                    </td>

                    {/* Upload Date Column */}
                    <td className="py-3.5 px-4 text-slate-500 font-mono">
                      <div>Uploaded: {file.uploadedAt}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Verified: {file.lastVerifiedAt}</div>
                    </td>

                    {/* Verification Actions Column */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {file.isStale ? (
                          <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.75 rounded-md flex items-center gap-1 shadow-3xs">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Awaiting Audit
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.75 rounded-md flex items-center gap-1 shadow-3xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Vetted & Approved
                          </span>
                        )}
                        
                        {file.objectUrl && (
                          <a
                            href={file.objectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-mono px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded font-semibold text-indigo-700 border border-indigo-100 transition-all"
                            title="Open the actual uploaded file"
                          >
                            View
                          </a>
                        )}

                        <button 
                          onClick={() => onVerifyKBFile(file.id)}
                          className="text-[10px] font-mono px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-300 transition-all flex items-center gap-1"
                          title="Mark document verified for 12 months"
                        >
                          <RefreshCw className="w-3 h-3 text-slate-500 animate-spin-hover" />
                          Re-audit
                        </button>

                        <button 
                          onClick={() => onRemoveKBFile(file.id)}
                          className="p-1 hover:text-red-600 text-slate-400 hover:bg-red-50 rounded transition-all"
                          title="Delete file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredFiles.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <div className="max-w-xs mx-auto space-y-2">
                      <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                      <div className="text-xs font-semibold text-slate-700">No knowledge assets found</div>
                      <p className="text-[11px] text-slate-500">
                        No files matched the active filters: <b>Category: {kbActiveCategory}</b> {kbSearchText && <>, Search: "{kbSearchText}"</>}.
                      </p>
                      <button
                        onClick={() => {
                          setKbActiveCategory('ALL');
                          setKbSearchText('');
                          setKbStaleFilter('ALL');
                        }}
                        className="text-[10px] font-mono font-semibold bg-slate-100 hover:bg-slate-250 text-slate-800 border border-slate-200 rounded px-2.5 py-1.5 transition-all inline-block mt-2"
                      >
                        Reset Filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {hasMoreKbFiles && !kbSearchText.trim() && kbActiveCategory === 'ALL' && kbStaleFilter === 'ALL' && (
          <div className="flex justify-center py-4">
            <button
              onClick={onLoadMoreKbFiles}
              disabled={loadingMoreKb}
              className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 px-4 py-2 rounded shadow-2xs inline-flex items-center gap-1.5"
            >
              {loadingMoreKb ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              {loadingMoreKb ? 'Loading…' : 'Load more files'}
            </button>
          </div>
        )}

        {/* Dynamic Slide-over Import Drawer */}
        <AnimatePresence>
          {isAddModalOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAddModalOpen(false)}
                className="fixed inset-0 bg-slate-900 z-40 cursor-pointer"
              />

              {/* Drawer Container */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-white border-l border-slate-250 shadow-2xl z-50 overflow-y-auto flex flex-col"
              >
                {/* Header */}
                <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-950 font-sans tracking-tight flex items-center gap-1.5">
                      <UploadCloud className="w-4 h-4 text-indigo-600" />
                      <span>Add evidence</span>
                    </h3>
                    <p className="text-[11px] text-slate-600 mt-0.5">Add a file to the knowledge base, classify it, and tag it for reuse in bids.</p>
                  </div>
                  <button 
                    onClick={() => setIsAddModalOpen(false)}
                    className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmitNewDoc} className="p-5 flex-1 space-y-5">
                  
                  {/* Select Asset Classification */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-600">
                      Asset Classification Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'CV', label: 'Personnel & CV', icon: User, desc: 'Candidate profiles' },
                        { id: 'PROJECT_EVIDENCE', label: 'Past Projects', icon: Briefcase, desc: 'Reference case studies' },
                        { id: 'CAPABILITY', label: 'Capability Stmt', icon: Layers, desc: 'Competency statements' },
                        { id: 'CREDENTIAL', label: 'Credentials', icon: Award, desc: 'Certifications & pre-quals' },
                        { id: 'BENCHMARK', label: 'Benchmarks', icon: CreditCard, desc: 'Commercial rate cards' },
                        { id: 'POLICY', label: 'Policy Stmt', icon: Shield, desc: 'EHS & Quality plans' }
                      ].map(opt => {
                        const OptIcon = opt.icon;
                        const isSelected = newDocCategory === opt.id;
                        return (
                          <button
                            type="button"
                            key={opt.id}
                            onClick={() => handleCategorySelectionForNewDoc(opt.id as any)}
                            className={`flex flex-col items-start p-2.5 rounded border text-left transition-all ${
                              isSelected 
                                ? 'bg-indigo-50/50 border-indigo-500 ring-1 ring-indigo-500/20' 
                                : 'bg-white border-slate-200 hover:bg-slate-50/60 hover:border-slate-300'
                            }`}
                          >
                            <span className="flex items-center gap-1 text-[11px] font-sans font-semibold text-slate-900 leading-none">
                              <OptIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                              <span>{opt.label}</span>
                            </span>
                            <span className="text-[9px] text-slate-400 mt-1 line-clamp-1">{opt.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Drag-and-drop file attachment — shared FileDropzone */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Files
                    </label>
                    <FileDropzone
                      size="large"
                      multiple
                      label="Drag and drop files here"
                      hint="or click to browse. PDF, DOC, DOCX, XLS, XLSX, CSV, PPT, PPTX — multiple files at once."
                      files={selectedFiles}
                      onFiles={(incoming) => acceptFiles(incoming)}
                      onRemoveFile={removeSelectedFile}
                    />
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="max-w-xs space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Attaching…</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-150 h-1 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Core Document Form Fields */}
                  <div className="space-y-3.5 bg-slate-50/60 p-4 rounded-lg border border-slate-150">
                    <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-150 flex justify-between">
                      <span>Document Properties & Metadata tags</span>
                      <span className="text-[9px] text-indigo-700 italic">Auto-extraction simulated</span>
                    </h4>

                    {/* Generic Filename field */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-sans font-medium text-slate-600">
                        Vetted Filename *
                      </label>
                      <input
                        type="text"
                        required
                        value={newDocName}
                        onChange={e => setNewDocName(e.target.value)}
                        placeholder="e.g. CV_Liam_Ferreira_Civil_Superintendent.pdf"
                        className="w-full text-xs px-2.5 py-1.5 border border-slate-250 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-sans font-medium text-slate-600">
                          Document Size
                        </label>
                        <input
                          type="text"
                          value={newDocSize}
                          onChange={e => setNewDocSize(e.target.value)}
                          placeholder="e.g. 1.8 MB"
                          className="w-full text-xs px-2.5 py-1.5 border border-slate-250 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-sans font-medium text-slate-600">
                          Audited By
                        </label>
                        <input
                          type="text"
                          value={newDocBy}
                          onChange={e => setNewDocBy(e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 border border-slate-250 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* DYNAMIC METADATA INPUTS depending on Category selection */}
                    {newDocCategory === 'CV' && (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-sans font-medium text-slate-600">
                              Candidate Name
                            </label>
                            <input
                              type="text"
                              value={metaCandidateName}
                              onChange={e => setMetaCandidateName(e.target.value)}
                              placeholder="e.g. Mei Lin Zhao"
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-sans font-medium text-slate-600">
                              Years Experience
                            </label>
                            <input
                              type="text"
                              value={metaExperience}
                              onChange={e => setMetaExperience(e.target.value)}
                              placeholder="e.g. 10 Years"
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-sans font-medium text-slate-600">
                            Core Role Classification
                          </label>
                          <input
                            type="text"
                            value={metaRole}
                            onChange={e => setMetaRole(e.target.value)}
                            placeholder="e.g. Civil Superintendent / Track Specialist"
                            className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            id="charteredCheck"
                            checked={metaChartered}
                            onChange={e => setMetaChartered(e.target.checked)}
                            className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                          />
                          <label htmlFor="charteredCheck" className="text-[10px] font-sans font-medium text-slate-600 cursor-pointer select-none">
                            Holds Chartered Professional Registration (CSE)
                          </label>
                        </div>
                      </div>
                    )}

                    {newDocCategory === 'PROJECT_EVIDENCE' && (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-sans font-medium text-slate-600">
                            Project Case Study Title
                          </label>
                          <input
                            type="text"
                            value={metaProjectName}
                            onChange={e => setMetaProjectName(e.target.value)}
                            placeholder="e.g. Northgate Light Rail Stage 1 Civil Upgrades"
                            className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-sans font-medium text-slate-600">
                              Government Client
                            </label>
                            <input
                              type="text"
                              value={metaClient}
                              onChange={e => setMetaClient(e.target.value)}
                              placeholder="e.g. Tarnwick Metropolitan Transit Authority (TMTA)"
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-sans font-medium text-slate-600">
                              Contract Value
                            </label>
                            <input
                              type="text"
                              value={metaValue}
                              onChange={e => setMetaValue(e.target.value)}
                              placeholder="e.g. $8.1M AUD"
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {newDocCategory === 'CAPABILITY' && (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-sans font-medium text-slate-600">
                            Sourced Competencies (Comma-separated)
                          </label>
                          <input
                            type="text"
                            value={metaCompList}
                            onChange={e => setMetaCompList(e.target.value)}
                            placeholder="e.g. Signaling Systems, System Integration Audit"
                            className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    )}

                    {newDocCategory === 'CREDENTIAL' && (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-sans font-medium text-slate-600">
                              Accreditation Body
                            </label>
                            <input
                              type="text"
                              value={metaCredentialBody}
                              onChange={e => setMetaCredentialBody(e.target.value)}
                              placeholder="e.g. National Accreditation Board / TMTA"
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-sans font-medium text-slate-600">
                              Certification Expiry
                            </label>
                            <input
                              type="date"
                              value={metaExpiry}
                              onChange={e => setMetaExpiry(e.target.value)}
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {newDocCategory === 'BENCHMARK' && (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-sans font-medium text-slate-600">
                              Daily Rate Benchmark Range
                            </label>
                            <input
                              type="text"
                              value={metaRateRange}
                              onChange={e => setMetaRateRange(e.target.value)}
                              placeholder="e.g. $1,250 - $1,600 / day"
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-sans font-medium text-slate-600">
                              State Region
                            </label>
                            <input
                              type="text"
                              value={metaLocation}
                              onChange={e => setMetaLocation(e.target.value)}
                              placeholder="e.g. Tarnwick / Eastmere"
                              className="w-full text-xs px-2.5 py-1 border border-slate-200 bg-white rounded focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Submission and Ingestion Action buttons */}
                  <div className="pt-3 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={uploadProgress > 0 && uploadProgress < 100}
                      className="flex-1 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded shadow-xs transition-all flex items-center justify-center gap-1"
                    >
                      <Check className="w-4 h-4" /> Ingest & Classify Asset
                    </button>
                  </div>
                </form>

              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // 3. TEAM PAGE
  if (currentPage === 'team') {
    return (
      <div className="space-y-6">
        <div className="border-b border-slate-200 pb-5">
          <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight">Bid Team Registry</h1>
          <p className="text-xs text-slate-600 mt-1">Manage project members, access controls, and submission sign-off authorities.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockTeam.map(member => (
            <div key={member.id} className="bg-white border border-slate-200 rounded p-4 flex gap-4 items-center">
              <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {member.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h3 className="font-sans font-semibold text-sm text-slate-900 leading-tight">{member.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{member.email}</p>
                <span className="inline-block mt-2 bg-slate-100 text-slate-800 text-[9px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded">
                  {member.role}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 4. LESSONS LEARNED
  if (currentPage === 'lessons-learned') {
    return (
      <div className="space-y-6">
        <div className="border-b border-slate-200 pb-5">
          <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight">Outcome Lessons Learned Database</h1>
          <p className="text-xs text-slate-600 mt-1">Log final tender award decisions and gather insights to refine future bid compliance runs.</p>
        </div>

        <div className="space-y-4">
          {mockLessonsLearned.map(item => (
            <div key={item.id} className="bg-white border border-slate-200 rounded p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${item.outcome === 'WON' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                  <h3 className="font-sans font-semibold text-sm text-slate-900">{item.tenderName}</h3>
                </div>
                <span className="text-[11px] font-mono text-slate-500">{item.date}</span>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">Key Bid Evaluation Insights:</div>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 leading-relaxed">
                  {item.keyInsights.map((insight, idx) => (
                    <li key={idx}>{insight}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 5. BILLING PAGE
  if (currentPage === 'billing') {
    return (
      <div className="space-y-6">
        <div className="border-b border-slate-200 pb-5">
          <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight">Corporate Subscription & Billing</h1>
          <p className="text-xs text-slate-600 mt-1">Review your corporate plan, active monthly runs quotas, and historical invoices.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active plan details */}
          <div className="lg:col-span-2 bg-slate-900 text-white p-6 rounded border border-slate-800 space-y-6 flex flex-col justify-between">
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-widest text-slate-400">Current Plan</span>
              <h3 className="text-xl font-sans font-bold">Pro Bidding Workspace</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Licensed for 30 tender runs per month with section-level claims sourcing, priority advisory support, and multi-user collaboration assets.
              </p>
              
              <div className="flex items-baseline gap-1 pt-2">
                <span className="text-2xl font-bold font-mono">$199</span>
                <span className="text-xs text-slate-400">/ month, billed annually</span>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="text-[11px] font-mono text-slate-400">Next renewal date: July 28, 2026</span>
              <button 
                onClick={() => toast('Contacting Buckland Consulting Group Scale Advisory...')}
                className="text-xs font-semibold py-2 px-4 bg-white text-slate-950 rounded hover:bg-slate-100 transition-colors self-start sm:self-center"
              >
                Upgrade to Scale Plan
              </button>
            </div>
          </div>

          {/* Plan Limits summary */}
          <div className="bg-white p-5 border border-slate-200 rounded space-y-4">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">Active Run Allocation</h4>
            
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">Active Bids used:</span>
                  <span className="font-semibold text-slate-950">3 / 3 Projects</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded overflow-hidden">
                  <div className="bg-slate-900 h-full rounded" style={{ width: '100%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">Model runs used:</span>
                  <span className="font-semibold text-slate-950">14 / 30 runs</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded overflow-hidden">
                  <div className="bg-slate-900 h-full rounded" style={{ width: '46%' }}></div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 text-[10px] text-slate-500 font-mono leading-normal">
              *Document hosting, storage, and database isolation are fully covered. Billing is clean with zero metered surcharge variables.
            </div>
          </div>
        </div>

        {/* Invoice List */}
        <div className="bg-white border border-slate-200 rounded p-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2 mb-3">Invoice History</h3>
          <div className="divide-y divide-slate-100 text-xs text-slate-800">
            <div className="py-2.5 flex justify-between">
              <span className="font-mono text-slate-600">INV-2026-003 &bull; June 01, 2026</span>
              <span className="font-semibold text-slate-950">$199.00 USD</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="font-mono text-slate-600">INV-2026-002 &bull; May 01, 2026</span>
              <span className="font-semibold text-slate-950">$199.00 USD</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="font-mono text-slate-600">INV-2026-001 &bull; April 01, 2026</span>
              <span className="font-semibold text-slate-950">$199.00 USD</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 6. SETTINGS PAGE
  if (currentPage === 'settings') {
    return (
      <div className="space-y-6">
        <div className="border-b border-slate-200 pb-5">
          <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">AI model configuration, workspace security, and the audit trail.</p>
        </div>

        <AiModelSettings usageCount={aiUsageCount} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Isolation & Cryptography card */}
          <div className="bg-white p-5 border border-slate-200 rounded shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <ShieldCheck className="w-5 h-5 text-slate-900" />
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">Tenant Cryptography</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your workspace data is isolated by Postgres Row Level Security (RLS): every query is scoped to your organization at the database layer, not just in application code — the same tables serve every tenant, but a policy engine enforces that you can only ever see rows where <code className="font-mono text-[10px] bg-slate-100 p-0.5 rounded text-slate-950">org_id</code> matches yours.
            </p>
            <div className="text-[11px] font-mono text-slate-500">
              Transport encryption: TLS 1.3 in-transit (Supabase-managed). At-rest encryption per your Supabase project's configuration.
            </div>
          </div>

          {/* AI Settings */}
          <div className="bg-white p-5 border border-slate-200 rounded shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Layers className="w-5 h-5 text-slate-900" />
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">AI Privacy Control</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              All AI sourcing, extraction, and drafting tasks are routed via secure, non-training model endpoints. 
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-slate-800 font-medium">Model data training: STRICTLY DISABLED</span>
            </div>
          </div>

          {/* Security backup */}
          <div className="bg-white p-5 border border-slate-200 rounded shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <RefreshCw className="w-5 h-5 text-slate-900" />
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">Workspace Backups</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Encrypted snapshots are compiled every 12 hours. Retained for 30 rolling calendar days.
            </p>
            <button 
              onClick={() => toast('Compiling manual workspace backup... snapshot generated.')}
              className="text-[10px] font-mono px-2.5 py-1.5 bg-slate-150 text-slate-900 font-semibold rounded hover:bg-slate-200"
            >
              Export Secure Backup
            </button>
          </div>
        </div>

        {/* Audit Logs */}
        <div className="bg-white border border-slate-200 rounded p-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2 mb-3">Workspace Audit Trail</h3>
          <div className="font-mono text-[11px] space-y-2">
            {mockAuditLogs.map(log => (
              <div key={log.id} className="flex flex-col sm:flex-row justify-between text-slate-600 border-b border-slate-50/50 pb-2">
                <div>
                  <span className="text-slate-400">[{log.timestamp}]</span>{' '}
                  <span className="text-slate-900 font-semibold">{log.userName}</span>{' '}
                  <span className="text-slate-500">({log.action}):</span>{' '}
                  <span className="text-slate-800">{log.details}</span>
                </div>
                <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded self-start sm:self-center">Verified</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
