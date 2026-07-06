/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Public site + authentication. Held to the same visual standard as the
 * internal command centre: calm light surfaces, hairline borders, one
 * indigo accent, no template gradients. Auth logic is unchanged —
 * email/password + Google/Microsoft OAuth via lib/auth, with demo mode
 * clearly labelled and one click away.
 */
import React, { useState } from 'react';
import {
  ArrowRight, Check, Sparkles, ListChecks, Layers, Database, ShieldCheck,
  Package, FileSearch, Loader2, AlertTriangle, Lock, Server, KeyRound, Scale,
  Building2, TrainFront, Droplets, Zap, HardHat, Eye, EyeOff, Menu, X,
} from 'lucide-react';
import { signInWithPassword, signUpWithPassword, signInWithGoogle, signInWithMicrosoft } from '../lib/auth';
import { isDemoMode } from '../lib/supabase';
import { toast } from '../lib/toast';

interface PublicPagesProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onOpenWorkedExample?: () => void;
}

/* ── Small shared pieces ──────────────────────────────────────────── */

const Wordmark = ({ onClick }: { onClick?: () => void }) => (
  <button onClick={onClick} className="flex items-center gap-2.5 shrink-0">
    <span className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-base">B</span>
    <span className="font-bold text-slate-950 tracking-tight text-[15px]">The Bid Room</span>
  </button>
);

const CTA = ({ children, onClick, ghost = false, large = false }: { children: React.ReactNode; onClick?: () => void; ghost?: boolean; large?: boolean }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all ${
      large ? 'text-[15px] px-6 py-3' : 'text-sm px-4 py-2'
    } ${ghost
      ? 'text-slate-700 border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      : 'text-white bg-slate-900 hover:bg-slate-800 shadow-sm'}`}
  >
    {children}
  </button>
);

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 mb-3">{children}</div>;
}

/* ── Stylised product frame for the hero (pure CSS, honest mock) ──── */

function ProductFrame() {
  const row = (label: string, pill: string, tone: string) => (
    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-[11px] text-slate-600 truncate">{label}</span>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tone}`}>{pill}</span>
    </div>
  );
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-indigo-100/40 blur-3xl rounded-full" aria-hidden="true" />
      <div className="relative bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-900/5 overflow-hidden">
        {/* window chrome */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
          <span className="ml-3 text-[11px] text-slate-400 font-medium">Tender Blueprint — Vanguard Line Signalling Renewal</span>
        </div>
        <div className="grid grid-cols-[130px_1fr] text-left">
          {/* mini nav */}
          <div className="border-r border-slate-100 py-3 px-2 space-y-0.5 bg-[#FAFAF8]">
            {['Dashboard', 'Blueprint', 'Requirements', 'Modules', 'Evidence', 'Drafts', 'Reviews', 'Exports'].map((n, i) => (
              <div key={n} className={`text-[11px] font-medium px-2 py-1 rounded ${i === 1 ? 'bg-white text-indigo-700 border border-slate-200 shadow-xs' : 'text-slate-500'}`}>{n}</div>
            ))}
          </div>
          {/* mini content */}
          <div className="p-3.5 space-y-3">
            <div className="flex items-center gap-4">
              <div className="relative w-14 h-14">
                <svg viewBox="0 0 40 40" className="-rotate-90 w-14 h-14">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#4f46e5" strokeWidth="4" strokeLinecap="round" strokeDasharray="100.5" strokeDashoffset="28" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-slate-900">72</span>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-900">Submission readiness</div>
                <div className="text-[10px] text-slate-500">18 requirements · 13 modules activated · 2 gaps to resolve</div>
              </div>
            </div>
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              {row('REQ-004 · Nominated signalling personnel with ASA registration', 'Evidence found', 'bg-emerald-50 text-emerald-700')}
              {row('REQ-007 · Certificate of currency — PI $20m', 'Missing', 'bg-red-50 text-red-700')}
              {row('REQ-011 · Systems assurance mapped to TS-20435', 'In review', 'bg-amber-50 text-amber-800')}
            </div>
            <div className="flex gap-1.5">
              {['Technical Methodology', 'Key Personnel', 'Systems Assurance'].map((m) => (
                <span key={m} className="text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md">{m}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Component ────────────────────────────────────────────────────── */

export default function PublicPages({ currentPage, onNavigate, onOpenWorkedExample }: PublicPagesProps) {
  const [mobileNav, setMobileNav] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Auth state — shared loading/error handling for login + signup
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState({ name: '', email: '', company: '', role: 'Bid Manager' });
  const [signupPassword, setSignupPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState<'password' | 'google' | 'microsoft' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const handlePasswordLogin = async () => {
    setAuthError(null);
    if (!loginForm.email || !loginForm.password) {
      setAuthError('Enter your email and password to continue.');
      return;
    }
    setAuthLoading('password');
    const result = await signInWithPassword(loginForm.email, loginForm.password);
    setAuthLoading(null);
    if (result.success) onNavigate('dashboard');
    else setAuthError(result.error || 'Sign in failed. Check your credentials and try again.');
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading('google');
    const result = await signInWithGoogle();
    // On real OAuth, the browser redirects away here, so this only
    // resolves directly in demo mode (no Supabase configured).
    setAuthLoading(null);
    if (result.success) onNavigate('dashboard');
    else setAuthError(result.error || 'Google sign-in failed.');
  };

  const handleMicrosoftLogin = async () => {
    setAuthError(null);
    setAuthLoading('microsoft');
    const result = await signInWithMicrosoft();
    setAuthLoading(null);
    if (result.success) onNavigate('dashboard');
    else setAuthError(result.error || 'Microsoft sign-in failed.');
  };

  const handleSignup = async () => {
    setAuthError(null);
    if (!signupForm.name || !signupForm.email || !signupForm.company || !signupPassword) {
      setAuthError('Fill in all fields, including a password, to continue.');
      return;
    }
    if (signupPassword.length < 8) {
      setAuthError('Password needs to be at least 8 characters.');
      return;
    }
    setAuthLoading('password');
    const result = await signUpWithPassword(signupForm.email, signupPassword, {
      fullName: signupForm.name,
      company: signupForm.company,
      role: signupForm.role,
    });
    setAuthLoading(null);
    if (result.success) setIsSubmitted(true);
    else setAuthError(result.error || 'Sign up failed. Please try again.');
  };

  /* ── Shared marketing chrome ──────────────────────────────────── */

  const NAV_LINKS = [
    { id: 'how-it-works', label: 'How it works' },
    { id: 'use-cases', label: 'Who it\u2019s for' },
    { id: 'security', label: 'Security' },
    { id: 'pricing', label: 'Pricing' },
  ];

  const Nav = () => (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-lg border-b border-slate-200/70">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
        <Wordmark onClick={() => onNavigate('home')} />
        <nav className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((l) => (
            <button key={l.id} onClick={() => onNavigate(l.id)}
              className={`text-sm font-medium transition-colors ${currentPage === l.id ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'}`}>
              {l.label}
            </button>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2.5">
          <button onClick={() => onNavigate('login')} className="text-sm font-semibold text-slate-700 hover:text-slate-950 px-3 py-2">Sign in</button>
          <CTA onClick={() => onNavigate('signup')}>Get started <ArrowRight className="w-3.5 h-3.5" /></CTA>
        </div>
        <button onClick={() => setMobileNav((v) => !v)} aria-label="Menu" className="md:hidden text-slate-600 p-1.5">
          {mobileNav ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {mobileNav && (
        <div className="md:hidden border-t border-slate-100 bg-white px-5 py-3 space-y-1">
          {NAV_LINKS.map((l) => (
            <button key={l.id} onClick={() => { onNavigate(l.id); setMobileNav(false); }} className="block w-full text-left text-sm font-medium text-slate-700 py-2">{l.label}</button>
          ))}
          <div className="flex gap-2 pt-2">
            <CTA ghost onClick={() => { onNavigate('login'); setMobileNav(false); }}>Sign in</CTA>
            <CTA onClick={() => { onNavigate('signup'); setMobileNav(false); }}>Get started</CTA>
          </div>
        </div>
      )}
    </header>
  );

  const Footer = () => (
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <Wordmark onClick={() => onNavigate('home')} />
          <p className="text-xs text-slate-400 max-w-xs">The proposal command centre for engineering, rail and infrastructure bid teams.</p>
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-2">
          {[...NAV_LINKS, { id: 'login', label: 'Sign in' }].map((l) => (
            <button key={l.id} onClick={() => onNavigate(l.id)} className="text-sm text-slate-500 hover:text-slate-900 transition-colors">{l.label}</button>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-5 py-4 text-xs text-slate-400">© {new Date().getFullYear()} The Bid Room. Built for teams who submit to win.</div>
      </div>
    </footer>
  );

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-[#FBFCFE] text-slate-800 font-sans antialiased">
      <Nav />
      {children}
      <Footer />
    </div>
  );

  /* ── HOME ─────────────────────────────────────────────────────── */
  if (currentPage === 'home') {
    return (
      <Shell>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_50%_at_50%_0%,#EEF2FF_0%,transparent_70%)]" aria-hidden="true" />
          <div className="relative max-w-6xl mx-auto px-5 pt-20 pb-16 grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 mb-5">
                <Sparkles className="w-3.5 h-3.5" /> A calm, guided way to run a tender
              </div>
              <h1 className="text-4xl sm:text-[44px] leading-[1.08] font-semibold tracking-tight text-slate-950">
                Run the whole tender,<br />one clear step at a time.
              </h1>
              <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-lg">
                Upload the tender pack and The Bid Room shows what the client asked for, what's missing, and the
                next best thing to do. Intake, blueprint, gaps, draft, review, submit — with the software always
                telling you where you are and what to do next.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <CTA large onClick={() => onNavigate('signup')}>Start a tender <ArrowRight className="w-4 h-4" /></CTA>
                <CTA large ghost onClick={() => (isDemoMode() && onOpenWorkedExample ? onOpenWorkedExample() : onNavigate(isDemoMode() ? 'dashboard' : 'how-it-works'))}>{isDemoMode() ? 'Open worked example' : 'See how it works'}</CTA>
              </div>
              <p className="mt-5 text-xs text-slate-400">For bid managers, project managers and commercial leads in rail, civil, water and engineering. Submit compliant, evidence-backed tenders without a large proposal department.</p>
            </div>
            <ProductFrame />
          </div>
        </section>

        {/* Workflow strip */}
        <section className="border-y border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto px-5 py-14">
            <div className="grid sm:grid-cols-4 gap-8">
              {[
                { n: '01', t: 'Upload', d: 'Drop everything the client issued — RFT, scope, schedules, pricing, addenda. All of it is analysed, not just the first file.' },
                { n: '02', t: 'Analyse', d: 'The Tender Blueprint extracts every requirement with source document and clause reference.' },
                { n: '03', t: 'Build', d: 'The right proposal modules activate automatically. Evidence is matched by content; gaps go red.' },
                { n: '04', t: 'Submit', d: 'Draft per module, pass discipline review gates, and export only the packs the client requires.' },
              ].map((s) => (
                <div key={s.n}>
                  <div className="text-xs font-mono font-semibold text-indigo-500 mb-2">{s.n}</div>
                  <div className="text-[15px] font-semibold text-slate-950 mb-1.5">{s.t}</div>
                  <p className="text-sm text-slate-500 leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="max-w-6xl mx-auto px-5 py-20">
          <div className="max-w-2xl mb-12">
            <SectionLabel>The command centre</SectionLabel>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Not a chatbot. Not a file drive.<br />A controlled path to submission.</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <ListChecks className="w-4.5 h-4.5" />, t: 'Tender Blueprint', d: 'Reads the tender pack and creates the bid plan. Every requirement carries its source document, clause reference and confidence — auditable back to the tender.' },
              { icon: <Layers className="w-4.5 h-4.5" />, t: 'Infrastructure Module Library', d: 'Technical methodology, design management, construction methodology, possessions, systems assurance, safety-in-design and more — only the modules this tender needs switch on, each explaining why.' },
              { icon: <Database className="w-4.5 h-4.5" />, t: 'Evidence Gap Engine', d: 'Shows what proof is missing before the proposal is submitted. Content-based matching against your library: found, needs checking, missing — with the reason for every match.' },
              { icon: <FileSearch className="w-4.5 h-4.5" />, t: 'Addendum Impact Engine', d: 'Tracks tender changes and flags affected responses, risks and pricing assumptions. A new addendum is analysed against the requirement register and raises review tasks.' },
              { icon: <Scale className="w-4.5 h-4.5" />, t: 'Commercial Assumptions Register', d: 'Keeps qualifications, exclusions, departures and pricing assumptions visible — and gates the commercial exports until they are acknowledged or approved.' },
              { icon: <ShieldCheck className="w-4.5 h-4.5" />, t: 'Review Gate Control & Readiness', d: 'Discipline review gates and a Submission Readiness Score that blocks final exports until compliance, evidence, reviews and addenda are under control.' },
            ].map((f) => (
              <div key={f.t} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition-all">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mb-3.5">{f.icon}</div>
                <div className="text-[15px] font-semibold text-slate-950 mb-1.5">{f.t}</div>
                <p className="text-sm text-slate-500 leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust band */}
        <section className="bg-slate-950 text-white">
          <div className="max-w-6xl mx-auto px-5 py-16 grid lg:grid-cols-[1fr_auto] gap-10 items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Honest by design.</h2>
              <p className="mt-3 text-slate-400 leading-relaxed max-w-2xl">
                Nothing pretends. Evidence matches explain themselves. Provisional analyses say so. Exports stay locked until reviews pass.
                Your AI provider key never reaches the browser, and every workspace is isolated with row-level security.
              </p>
            </div>
            <CTA large ghost onClick={() => onNavigate('security')}>Security details <ArrowRight className="w-4 h-4" /></CTA>
          </div>
        </section>

        {/* Final CTA */}
        <section className="max-w-6xl mx-auto px-5 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">The next tender lands tomorrow.</h2>
          <p className="mt-3 text-slate-500">Be ready before the kickoff call.</p>
          <div className="mt-7 flex justify-center gap-3">
            <CTA large onClick={() => onNavigate('signup')}>Get started <ArrowRight className="w-4 h-4" /></CTA>
            <CTA large ghost onClick={() => onNavigate('login')}>Sign in</CTA>
          </div>
        </section>
      </Shell>
    );
  }

  /* ── HOW IT WORKS ─────────────────────────────────────────────── */
  if (currentPage === 'how-it-works') {
    return (
      <Shell>
        <section className="max-w-4xl mx-auto px-5 py-20">
          <SectionLabel>How it works</SectionLabel>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 mb-12">From documents to submission,<br />one controlled pipeline.</h1>
          <div className="space-y-4">
            {[
              { t: 'Create the tender project', d: 'Name, client, submission type, due date and time, sector, bid manager, internal reference and portal — captured in one clean form.' },
              { t: 'Upload every document', d: 'RFT, scope, returnable schedules, pricing schedules, addenda, contract conditions, templates. Types are detected automatically; each file is text-extracted (PDF text layer, DOCX, XLSX, CSV) before any AI runs. Scanned PDFs are flagged honestly, not silently skipped.' },
              { t: 'Analyse Tender', d: 'All documents go to analysis together. The result is the Tender Blueprint: a requirements register where every entry cites its source document and clause, plus returnables, evaluation criteria, limits, insurances and risks.' },
              { t: 'Modules activate', d: 'The modular proposal engine turns on only what this tender needs — CVs when key people are requested, systems assurance when RVTM is mentioned, pricing when commercial schedules exist — and tells you why.' },
              { t: 'Evidence maps to your library', d: 'Requirements needing proof are matched against the knowledge base by document content, filename and category. Every match shows its confidence and reason. Gaps take one drag-and-drop to fix.' },
              { t: 'Draft per module', d: 'Never one giant generic draft. Each module drafts against its own linked requirements, matched evidence and your win themes — with word-limit tracking and compliance checks.' },
              { t: 'Review gates pass', d: 'Technical, commercial, legal, safety, assurance, bid manager and bid director gates per module. Final approval stays locked until everything under it is approved.' },
              { t: 'Export what the client requires', d: 'Twelve packs, each classified and gated by real readiness: mandatory requirements answered, evidence found or waived, gates approved, addenda reviewed.' },
            ].map((s, i) => (
              <div key={s.t} className="flex gap-5 bg-white border border-slate-200 rounded-xl p-5">
                <span className="w-8 h-8 rounded-full bg-slate-900 text-white text-sm font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <div>
                  <div className="text-[15px] font-semibold text-slate-950 mb-1">{s.t}</div>
                  <p className="text-sm text-slate-500 leading-relaxed">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <CTA large onClick={() => onNavigate('signup')}>Start your first tender <ArrowRight className="w-4 h-4" /></CTA>
          </div>
        </section>
      </Shell>
    );
  }

  /* ── USE CASES ────────────────────────────────────────────────── */
  if (currentPage === 'use-cases') {
    return (
      <Shell>
        <section className="max-w-5xl mx-auto px-5 py-20">
          <SectionLabel>Who it&rsquo;s for</SectionLabel>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 mb-12">Built where tenders are hard.</h1>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: <TrainFront className="w-5 h-5" />, t: 'Rail & transit', d: 'Signalling renewals, systems assurance packages, possession-constrained delivery. RVTM, TAO and safety-in-design requirements detected and routed to the right modules.' },
              { icon: <HardHat className="w-5 h-5" />, t: 'Civil & infrastructure', d: 'Design and construct, ECI and panel submissions with heavy returnable schedules and compliance matrices — tracked requirement by requirement.' },
              { icon: <Droplets className="w-5 h-5" />, t: 'Water & utilities', d: 'Framework refreshes and capital program tenders where accreditations, insurances and policy evidence decide conformance.' },
              { icon: <Zap className="w-5 h-5" />, t: 'Energy & defence', d: 'Multi-discipline responses with strict formatting limits, weighted evaluation criteria and staged shortlist presentations.' },
              { icon: <Building2 className="w-5 h-5" />, t: 'Professional advisory', d: 'Engineering consultancies juggling CV packs, case studies and past-performance evidence across concurrent bids.' },
              { icon: <ShieldCheck className="w-5 h-5" />, t: 'Bid & proposal teams', d: 'Bid managers who need one screen showing readiness, gaps, gates and overdue tasks — and directors who need an honest approval trail.' },
            ].map((u) => (
              <div key={u.t} className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mb-4">{u.icon}</div>
                <div className="text-[15px] font-semibold text-slate-950 mb-1.5">{u.t}</div>
                <p className="text-sm text-slate-500 leading-relaxed">{u.d}</p>
              </div>
            ))}
          </div>
        </section>
      </Shell>
    );
  }

  /* ── SECURITY ─────────────────────────────────────────────────── */
  if (currentPage === 'security') {
    return (
      <Shell>
        <section className="max-w-4xl mx-auto px-5 py-20">
          <SectionLabel>Security</SectionLabel>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 mb-4">Your tenders are commercially sensitive.<br />We treat them that way.</h1>
          <p className="text-slate-500 mb-12 max-w-2xl">The architecture assumes your bid content must never leak — between organisations, to the browser, or to anyone who finds an endpoint URL.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: <Lock className="w-4.5 h-4.5" />, t: 'Row-level security on every table', d: 'Every workspace table — tenders, requirements, evidence, blueprints, drafts, reviews — is isolated per organisation with Postgres RLS. Cross-org reads are impossible at the database layer, not just the app layer.' },
              { icon: <KeyRound className="w-4.5 h-4.5" />, t: 'AI keys never reach the browser', d: 'The AI provider key lives only in the server environment. The client calls an authenticated endpoint; unauthenticated calls are rejected and per-user rate limits stop runaway spend.' },
              { icon: <Server className="w-4.5 h-4.5" />, t: 'Documents processed, not hoarded', d: 'Tender documents are text-extracted in your browser before analysis. What leaves your machine is structured text for the analysis you asked for — never silently more.' },
              { icon: <ShieldCheck className="w-4.5 h-4.5" />, t: 'Auditable by default', d: 'Uploads, tender creation, verifications and approvals write to an audit log. Requirements cite their source clauses, evidence matches explain themselves, and provisional analyses are labelled.' },
            ].map((f) => (
              <div key={f.t} className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="w-9 h-9 rounded-lg bg-slate-950 text-white flex items-center justify-center mb-4">{f.icon}</div>
                <div className="text-[15px] font-semibold text-slate-950 mb-1.5">{f.t}</div>
                <p className="text-sm text-slate-500 leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </section>
      </Shell>
    );
  }

  /* ── PRICING ──────────────────────────────────────────────────── */
  if (currentPage === 'pricing') {
    const tiers = [
      {
        name: 'Team', price: '$390', per: 'per month', highlight: false,
        blurb: 'For a single bid team running concurrent tenders.',
        features: ['Unlimited tender projects', 'Tender Blueprint analysis', 'Evidence knowledge base', 'Module drafting & review gates', 'All export packs', '5 seats included'],
      },
      {
        name: 'Business', price: '$990', per: 'per month', highlight: true,
        blurb: 'For firms where bids cross disciplines and offices.',
        features: ['Everything in Team', 'Unlimited seats', 'Addendum impact analysis', 'Win themes & strategy inputs', 'Audit log & approvals trail', 'Priority support'],
      },
      {
        name: 'Enterprise', price: 'Custom', per: 'annual', highlight: false,
        blurb: 'For organisations with procurement and security review.',
        features: ['Everything in Business', 'SSO (Google / Microsoft)', 'Custom AI provider & model', 'Security review support', 'Onboarding & template migration', 'Dedicated success contact'],
      },
    ];
    return (
      <Shell>
        <section className="max-w-5xl mx-auto px-5 py-20">
          <div className="text-center mb-12">
            <SectionLabel>Pricing</SectionLabel>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">One lost tender costs more.</h1>
            <p className="mt-3 text-slate-500">Simple plans. Every plan includes the full command centre.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 items-stretch">
            {tiers.map((t) => (
              <div key={t.name} className={`rounded-2xl p-6 flex flex-col border ${t.highlight ? 'border-slate-900 bg-slate-950 text-white shadow-xl' : 'border-slate-200 bg-white'}`}>
                <div className={`text-sm font-semibold ${t.highlight ? 'text-indigo-300' : 'text-indigo-600'}`}>{t.name}</div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className={`text-3xl font-bold tracking-tight ${t.highlight ? 'text-white' : 'text-slate-950'}`}>{t.price}</span>
                  <span className={`text-sm ${t.highlight ? 'text-slate-400' : 'text-slate-400'}`}>{t.per}</span>
                </div>
                <p className={`mt-2 text-sm leading-relaxed ${t.highlight ? 'text-slate-300' : 'text-slate-500'}`}>{t.blurb}</p>
                <ul className="mt-5 space-y-2.5 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-sm ${t.highlight ? 'text-slate-200' : 'text-slate-600'}`}>
                      <Check className={`w-4 h-4 shrink-0 mt-0.5 ${t.highlight ? 'text-indigo-400' : 'text-emerald-600'}`} /> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => onNavigate('signup')}
                  className={`mt-6 w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    t.highlight ? 'bg-white text-slate-950 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}>
                  {t.name === 'Enterprise' ? 'Talk to us' : 'Get started'}
                </button>
              </div>
            ))}
          </div>
        </section>
      </Shell>
    );
  }

  /* ── AUTH (login / signup) ────────────────────────────────────── */

  const OAuthButtons = () => (
    <div className="grid grid-cols-2 gap-2.5">
      <button onClick={handleGoogleLogin} disabled={!!authLoading}
        className="flex items-center justify-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg py-2.5 text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50">
        {authLoading === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : (
          <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
        )}
        Google
      </button>
      <button onClick={handleMicrosoftLogin} disabled={!!authLoading}
        className="flex items-center justify-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg py-2.5 text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50">
        {authLoading === 'microsoft' ? <Loader2 className="w-4 h-4 animate-spin" /> : (
          <svg className="w-4 h-4" viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>
        )}
        Microsoft
      </button>
    </div>
  );

  const AuthDivider = () => (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs text-slate-400">or with email</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );

  const AuthError = () => authError ? (
    <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{authError}</span>
    </div>
  ) : null;

  const inputCls = 'w-full text-sm p-2.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 outline-none transition-shadow';
  const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

  const AuthShell = ({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) => (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white font-sans">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-slate-950 text-white p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(70%_50%_at_20%_0%,rgba(79,70,229,0.25)_0%,transparent_70%)]" aria-hidden="true" />
        <div className="relative">
          <button onClick={() => onNavigate('home')} className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-950 font-bold">B</span>
            <span className="font-bold tracking-tight text-[15px]">The Bid Room</span>
          </button>
        </div>
        <div className="relative max-w-md space-y-6">
          <h2 className="text-3xl font-semibold tracking-tight leading-tight">Every requirement.<br />Every gate. One room.</h2>
          <ul className="space-y-3">
            {[
              'Requirements extracted with source clause references',
              'Evidence matched by document content, gaps in red',
              'Review gates by discipline, exports locked until they pass',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" /> {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Built for engineering, rail and infrastructure bid teams.</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-6 sm:px-14 py-12 bg-[#FBFCFE]">
        <div className="lg:hidden mb-8"><Wordmark onClick={() => onNavigate('home')} /></div>
        <div className="w-full max-w-sm mx-auto lg:mx-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="text-sm text-slate-500 mt-1.5 mb-7">{subtitle}</p>
          {isDemoMode() && (
            <button onClick={() => onNavigate('dashboard')}
              className="w-full mb-5 flex items-center justify-between gap-2 text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 hover:border-amber-300 rounded-lg px-3.5 py-3 transition-colors text-left">
              <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Demo mode — explore without an account</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          )}
          {children}
          <div className="mt-7 text-sm text-slate-500">{footer}</div>
        </div>
      </div>
    </div>
  );

  if (currentPage === 'login') {
    return (
      <AuthShell title="Welcome back" subtitle="Sign in to your workspace."
        footer={<>New here? <button onClick={() => { setAuthError(null); onNavigate('signup'); }} className="font-semibold text-slate-900 hover:text-indigo-700">Create a workspace</button></>}>
        <OAuthButtons />
        <AuthDivider />
        <AuthError />
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Work email</label>
            <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordLogin()} placeholder="you@company.com" className={inputCls} autoComplete="email" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Password</label>
              <button onClick={() => toast('Password reset is coming soon — contact your workspace admin in the meantime.')}
                className="text-xs font-semibold text-slate-400 hover:text-indigo-700">Forgot password?</button>
            </div>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordLogin()} placeholder="••••••••" className={`${inputCls} pr-10`} autoComplete="current-password" />
              <button onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button onClick={handlePasswordLogin} disabled={!!authLoading}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-60">
            {authLoading === 'password' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  if (currentPage === 'signup') {
    if (isSubmitted) {
      return (
        <AuthShell title="Check your inbox" subtitle="One step left."
          footer={<>Already confirmed? <button onClick={() => onNavigate('login')} className="font-semibold text-slate-900 hover:text-indigo-700">Sign in</button></>}>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0"><Check className="w-4 h-4" /></span>
              <div>
                <div className="text-sm font-semibold text-emerald-900">Confirmation sent</div>
                <p className="text-sm text-emerald-800 mt-1">
                  We&rsquo;ve sent a validation link to <span className="font-mono font-semibold">{signupForm.email}</span>. Click it, then sign in to set up your workspace.
                </p>
              </div>
            </div>
          </div>
          {isDemoMode() && (
            <button onClick={() => onNavigate('dashboard')} className="mt-4 w-full text-sm font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg py-2.5 transition-colors">
              Continue to the demo workspace
            </button>
          )}
        </AuthShell>
      );
    }
    return (
      <AuthShell title="Create your workspace" subtitle="Free to start — your first tender is minutes away."
        footer={<>Already have an account? <button onClick={() => { setAuthError(null); onNavigate('login'); }} className="font-semibold text-slate-900 hover:text-indigo-700">Sign in</button></>}>
        <OAuthButtons />
        <AuthDivider />
        <AuthError />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Full name</label>
              <input value={signupForm.name} onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })} placeholder="Alex Chen" className={inputCls} autoComplete="name" />
            </div>
            <div>
              <label className={labelCls}>Role</label>
              <select value={signupForm.role} onChange={(e) => setSignupForm({ ...signupForm, role: e.target.value })} className={inputCls}>
                {['Bid Manager', 'Bid Director', 'Engineer / SME', 'Commercial Manager', 'Executive', 'Other'].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Work email</label>
            <input type="email" value={signupForm.email} onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })} placeholder="you@company.com" className={inputCls} autoComplete="email" />
          </div>
          <div>
            <label className={labelCls}>Company</label>
            <input value={signupForm.company} onChange={(e) => setSignupForm({ ...signupForm, company: e.target.value })} placeholder="Company name" className={inputCls} autoComplete="organization" />
          </div>
          <div>
            <label className={labelCls}>Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignup()} placeholder="At least 8 characters" className={`${inputCls} pr-10`} autoComplete="new-password" />
              <button onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button onClick={handleSignup} disabled={!!authLoading}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-60">
            {authLoading === 'password' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Create workspace
          </button>
          <p className="text-xs text-slate-400 leading-relaxed">By continuing you agree to keep tender documents you upload within your organisation&rsquo;s rights to use.</p>
        </div>
      </AuthShell>
    );
  }

  /* Fallback: unknown public route → home */
  return (
    <Shell>
      <section className="max-w-4xl mx-auto px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold text-slate-950">Page not found</h1>
        <p className="text-slate-500 mt-2">Let&rsquo;s get you back to solid ground.</p>
        <div className="mt-6 flex justify-center"><CTA onClick={() => onNavigate('home')}>Back to home</CTA></div>
      </section>
    </Shell>
  );
}
