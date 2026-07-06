/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared UI primitives for the Blueprint pages. One visual system:
 * calm light surfaces, hairline borders, a single indigo accent,
 * emerald/amber/red reserved strictly for status.
 */
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

/* ── Page header ──────────────────────────────────────────────────── */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-200/80">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-950 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ── Card ─────────────────────────────────────────────────────────── */

export function Card({ children, className = '', onClick, title, headerRight }: {
  children: React.ReactNode; className?: string; onClick?: () => void;
  title?: string; headerRight?: React.ReactNode;
}) {
  const body = (
    <>
      {title && (
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {headerRight}
        </div>
      )}
      {children}
    </>
  );
  // Calm card: a single subtle border (no competing shadow), warm white
  // surface, generous radius. Interactive cards lift on hover only.
  if (onClick) {
    return (
      <button onClick={onClick} className={`text-left w-full bg-white border border-slate-200/80 rounded-2xl hover:border-slate-300 transition-colors ${className}`}>
        {body}
      </button>
    );
  }
  return <div className={`bg-white border border-slate-200/80 rounded-2xl ${className}`}>{body}</div>;
}

/* ── Buttons ──────────────────────────────────────────────────────── */

export function PrimaryButton({ children, onClick, disabled, className = '' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled, className = '' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}>
      {children}
    </button>
  );
}

/* ── Status pill ──────────────────────────────────────────────────── */

export type PillTone = 'green' | 'amber' | 'red' | 'slate' | 'indigo' | 'blue';
// Semantic colours are reserved strictly: green = done, amber = attention,
// red = blocking. Informational tones (blue, indigo) render as neutral
// gray so colour carries meaning, not decoration.
const PILL: Record<PillTone, string> = {
  green: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  amber: 'bg-amber-50 text-amber-900 border-amber-200',
  red: 'bg-red-50 text-red-800 border-red-100',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  indigo: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function Pill({ tone, children, dot = false }: { tone: PillTone; children: React.ReactNode; dot?: boolean }) {
  const DOT: Record<PillTone, string> = {
    green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500',
    slate: 'bg-slate-400', indigo: 'bg-slate-400', blue: 'bg-slate-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${PILL[tone]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOT[tone]}`} />}
      {children}
    </span>
  );
}

/* ── Score ring ───────────────────────────────────────────────────── */

export function ScoreRing({ value, label, size = 88 }: { value: number; label: string; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const tone = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
          style={{ transition: 'stroke-dashoffset 600ms ease' }} />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
          className="rotate-90" style={{ transformOrigin: 'center' }}
          fontSize={size / 4.2} fontWeight={700} fill="#0f172a">{pct}</text>
      </svg>
      <span className="text-xs font-medium text-slate-500">{label}</span>
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────── */

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl px-6 py-10 text-center">
      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center mx-auto mb-3 text-slate-400">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ── Slide-over drawer ────────────────────────────────────────────── */

export function Drawer({ open, onClose, title, subtitle, children, width = 'sm:w-[560px]' }: {
  open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode;
  children: React.ReactNode; width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px] z-40"
            onClick={onClose} aria-hidden="true"
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className={`fixed top-0 right-0 bottom-0 w-full ${width} bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col`}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-950">{title}</div>
                {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
              </div>
              <button onClick={onClose} aria-label="Close" className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Definition row ───────────────────────────────────────────────── */

export function DefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-900 text-right min-w-0">{children}</span>
    </div>
  );
}

/* ── Segmented filter ─────────────────────────────────────────────── */

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            value === o.id ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}>
          {o.label}{o.count !== undefined && <span className="ml-1.5 text-slate-400 font-mono">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
