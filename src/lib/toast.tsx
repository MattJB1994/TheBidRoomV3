/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tiny toast system with no context plumbing: call `toast('saved')` from
 * anywhere, and the single <Toaster/> mounted in App renders it. Replaces
 * the blocking browser alert() calls the prototype used.
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastItem { id: number; message: string; kind: ToastKind; }

type Listener = (toasts: ToastItem[]) => void;
let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit() { listeners.forEach((l) => l([...toasts])); }

export function toast(message: string, kind: ToastKind = 'success', durationMs = 3500) {
  const id = nextId++;
  toasts = [...toasts, { id, message, kind }];
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, durationMs);
}

export const toastError = (m: string) => toast(m, 'error', 5000);

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const l: Listener = (t) => setItems(t);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const icon = (kind: ToastKind) =>
    kind === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600" />
    : kind === 'error' ? <AlertCircle className="w-4 h-4 text-red-600" />
    : <Info className="w-4 h-4 text-indigo-600" />;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className="bg-white border border-slate-200 shadow-lg rounded px-3 py-2.5 flex items-start gap-2.5 text-xs text-slate-800 animate-in"
        >
          <span className="shrink-0 mt-0.5">{icon(t.kind)}</span>
          <span className="flex-1 leading-relaxed">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="shrink-0 text-slate-400 hover:text-slate-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
