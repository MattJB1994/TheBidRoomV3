/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pricing tool. Two parts:
 *   1. Rate card — custom and benchmark day/hour rates you can edit.
 *   2. Build-up  — priced lines (role × quantity × markup) that roll up
 *      to a sell total, with margin and a comparison to the tender value.
 *
 * Demo-mode local state; mirrors the pattern used across the app.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { toast, toastError } from '../lib/toast';
import { isDemoMode } from '../lib/supabase';
import * as db from '../lib/db';
import { formatMoney as money, parseMoney } from '../lib/format';
import { RateCardItem, PricingLine } from '../types';
import { mockRates, mockPricingLines } from '../data/mockData';
import { DollarSign, Plus, Trash2, Download, Calculator, TrendingUp, Pencil, Check } from 'lucide-react';

interface PricingProps {
  tenderName?: string;
  tenderValue?: string; // e.g. "$2,150,000"
  tenderId?: string;
}

export default function Pricing({ tenderName, tenderValue, tenderId }: PricingProps) {
  const [rates, setRates] = useState<RateCardItem[]>(mockRates);
  const [lines, setLines] = useState<PricingLine[]>(mockPricingLines);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const orgIdRef = useRef<string | null>(null);

  // Resolve the caller's org once, for rate-card inserts. No-op in demo mode.
  useEffect(() => {
    if (isDemoMode()) return;
    db.getMyProfile().then((p) => { orgIdRef.current = p?.orgId ?? null; }).catch(() => {});
  }, []);

  // Persist pricing-line edits to the backend, debounced so we don't fire
  // a write on every keystroke. Demo mode / no connected tender: no-op.
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (isDemoMode() || !tenderId) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      db.savePricingLines(tenderId, lines).catch((e) => toastError(e instanceof Error ? e.message : 'Could not save pricing.'));
    }, 800);
    return () => window.clearTimeout(saveTimer.current);
  }, [lines, tenderId]);

  // New rate form
  const [newRole, setNewRole] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newUnit, setNewUnit] = useState<'day' | 'hour'>('day');

  const rateById = useMemo(() => new Map(rates.map((r) => [r.id, r])), [rates]);

  const computed = useMemo(() => {
    let cost = 0;
    let sell = 0;
    const rows = lines.map((l) => {
      const r = rateById.get(l.rateId);
      const lineCost = (r?.rate ?? 0) * l.quantity;
      const lineSell = lineCost * (1 + l.markupPct / 100);
      cost += lineCost;
      sell += lineSell;
      return { ...l, role: r?.role ?? 'Unknown rate', unit: r?.unit ?? 'day', rate: r?.rate ?? 0, lineCost, lineSell };
    });
    const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
    return { rows, cost, sell, margin };
  }, [lines, rateById]);

  const tenderTotal = parseMoney(tenderValue);
  const bond = computed.sell * 0.1; // illustrative 10% performance security bond

  const addRate = () => {
    const rate = Number(newRate.replace(/[^0-9.]/g, ''));
    if (!newRole.trim() || !rate) {
      toast('Enter a role and a numeric rate.', 'error');
      return;
    }
    const optimistic: RateCardItem = { id: 'rate_' + Date.now(), role: newRole.trim(), unit: newUnit, rate, source: 'CUSTOM' };
    setRates([...rates, optimistic]);
    setNewRole(''); setNewRate(''); setNewUnit('day');
    toast('Custom rate added.');
    if (!isDemoMode() && orgIdRef.current) {
      db.addRateCardItem(orgIdRef.current, { role: optimistic.role, unit: optimistic.unit, rate: optimistic.rate, source: 'CUSTOM' })
        .then((saved) => setRates((prev) => prev.map((r) => (r.id === optimistic.id ? saved : r))))
        .catch((e) => toastError(e instanceof Error ? e.message : 'Could not save the rate.'));
      db.logAuditQuick('RATE_CARD_ITEM_ADDED', `${optimistic.role} · ${money(optimistic.rate)}/${optimistic.unit}`);
    }
  };

  const updateRate = (id: string, value: number) => {
    const item = rates.find((r) => r.id === id);
    setRates(rates.map((r) => (r.id === id ? { ...r, rate: value } : r)));
    if (!isDemoMode()) {
      db.updateRateCardItem(id, value).catch((e) => toastError(e instanceof Error ? e.message : 'Could not save the rate.'));
      if (item) db.logAuditQuick('RATE_CARD_ITEM_UPDATED', `${item.role}: ${money(item.rate)} → ${money(value)}`);
    }
  };

  const removeRate = (id: string) => {
    if (lines.some((l) => l.rateId === id)) {
      toast('That rate is used by a pricing line. Remove the line first.', 'error');
      return;
    }
    const item = rates.find((r) => r.id === id);
    setRates(rates.filter((r) => r.id !== id));
    if (!isDemoMode()) {
      db.removeRateCardItem(id).catch((e) => toastError(e instanceof Error ? e.message : 'Could not remove the rate.'));
      if (item) db.logAuditQuick('RATE_CARD_ITEM_REMOVED', item.role);
    }
  };

  const addLine = () => {
    if (rates.length === 0) { toast('Add a rate first.', 'error'); return; }
    setLines([...lines, { id: 'pl_' + Date.now(), description: 'New line', rateId: rates[0].id, quantity: 1, markupPct: 10 }]);
  };

  const updateLine = (id: string, patch: Partial<PricingLine>) =>
    setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const removeLine = (id: string) => setLines(lines.filter((l) => l.id !== id));

  const exportCsv = () => {
    const header = 'Description,Role,Unit,Rate,Quantity,Markup %,Line cost,Line sell\n';
    const body = computed.rows
      .map((r) => `"${r.description}","${r.role}",${r.unit},${r.rate},${r.quantity},${r.markupPct},${Math.round(r.lineCost)},${Math.round(r.lineSell)}`)
      .join('\n');
    const totals = `\n,,,,,,${Math.round(computed.cost)},${Math.round(computed.sell)}`;
    const blob = new Blob([header + body + totals], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pricing_build_up.csv'; a.click();
    URL.revokeObjectURL(url);
    toast('Pricing exported as CSV.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight">Pricing Tool</h1>
          <p className="text-xs text-slate-600 mt-1">
            Enter custom rates and build the commercial submission for{' '}
            <span className="font-semibold text-slate-800">{tenderName || 'this tender'}</span>.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-2 rounded shadow-2xs self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" /> Export pricing (CSV)
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total cost" value={money(computed.cost)} icon={<Calculator className="w-4 h-4 text-slate-400" />} />
        <SummaryCard label="Sell price" value={money(computed.sell)} accent icon={<DollarSign className="w-4 h-4 text-indigo-500" />} />
        <SummaryCard label="Blended margin" value={`${computed.margin.toFixed(1)}%`} icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} />
        <SummaryCard
          label="vs tender value"
          value={tenderTotal ? `${((computed.sell / tenderTotal) * 100).toFixed(0)}%` : '—'}
          sub={tenderTotal ? `est. ${money(tenderTotal)}` : undefined}
          icon={<TrendingUp className="w-4 h-4 text-slate-400" />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Rate card */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded shadow-xs">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-sans font-bold text-slate-900">Rate card</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Custom rates override benchmark rates from the knowledge base.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {rates.map((r) => (
              <div key={r.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{r.role}</div>
                  <span className={`text-[9px] font-mono uppercase tracking-wider px-1 rounded ${r.source === 'CUSTOM' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                    {r.source} · /{r.unit}
                  </span>
                </div>
                {editingRate === r.id ? (
                  <input
                    type="number"
                    defaultValue={r.rate}
                    autoFocus
                    onBlur={(e) => { updateRate(r.id, Number(e.target.value) || 0); setEditingRate(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-24 text-xs text-right p-1 border border-indigo-300 rounded outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                ) : (
                  <button onClick={() => setEditingRate(r.id)} className="text-xs font-mono font-semibold text-slate-900 hover:text-indigo-700 flex items-center gap-1">
                    {money(r.rate)} <Pencil className="w-3 h-3 text-slate-300" />
                  </button>
                )}
                <button onClick={() => removeRate(r.id)} aria-label={`Remove ${r.role}`} className="text-slate-300 hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {/* Add custom rate */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 space-y-2">
            <input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="Role (e.g. Senior Signalling Engineer)"
              className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <input
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="Rate"
                inputMode="numeric"
                className="flex-1 min-w-0 text-xs p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <select value={newUnit} onChange={(e) => setNewUnit(e.target.value as 'day' | 'hour')} className="text-xs p-1.5 border border-slate-200 rounded bg-white">
                <option value="day">/day</option>
                <option value="hour">/hour</option>
              </select>
              <button onClick={addRate} className="text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white px-3 rounded inline-flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        </div>

        {/* Build-up */}
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded shadow-xs">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-sans font-bold text-slate-900">Commercial build-up</h3>
            <button onClick={addLine} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add line
            </button>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="text-left font-semibold px-4 py-2">Line</th>
                  <th className="text-left font-semibold px-2 py-2">Rate</th>
                  <th className="text-right font-semibold px-2 py-2">Qty</th>
                  <th className="text-right font-semibold px-2 py-2">Markup</th>
                  <th className="text-right font-semibold px-4 py-2">Sell</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {computed.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2">
                      <input
                        value={r.description}
                        onChange={(e) => updateLine(r.id, { description: e.target.value })}
                        className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded px-1 py-0.5 font-medium text-slate-800"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={r.rateId}
                        onChange={(e) => updateLine(r.id, { rateId: e.target.value })}
                        className="max-w-[160px] text-xs bg-transparent outline-none focus:ring-1 focus:ring-indigo-300 rounded"
                      >
                        {rates.map((rt) => <option key={rt.id} value={rt.id}>{rt.role}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input type="number" value={r.quantity} min={0}
                        onChange={(e) => updateLine(r.id, { quantity: Number(e.target.value) || 0 })}
                        className="w-16 text-right bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded px-1 font-mono" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input type="number" value={r.markupPct} min={0}
                        onChange={(e) => updateLine(r.id, { markupPct: Number(e.target.value) || 0 })}
                        className="w-14 text-right bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded px-1 font-mono" />
                      <span className="text-slate-400">%</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-slate-900">{money(r.lineSell)}</td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => removeLine(r.id)} aria-label="Remove line" className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {computed.rows.map((r) => (
              <div key={r.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <input
                    value={r.description}
                    onChange={(e) => updateLine(r.id, { description: e.target.value })}
                    className="flex-1 text-xs font-medium text-slate-800 bg-slate-50 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                  <button onClick={() => removeLine(r.id)} aria-label="Remove line" className="text-slate-300 hover:text-red-500 mt-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <select value={r.rateId} onChange={(e) => updateLine(r.id, { rateId: e.target.value })}
                  className="w-full text-xs bg-white border border-slate-200 rounded px-2 py-1">
                  {rates.map((rt) => <option key={rt.id} value={rt.id}>{rt.role} · {money(rt.rate)}/{rt.unit}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500">Qty
                    <input type="number" value={r.quantity} min={0} onChange={(e) => updateLine(r.id, { quantity: Number(e.target.value) || 0 })}
                      className="ml-1 w-16 text-xs border border-slate-200 rounded px-1 py-0.5 font-mono" /></label>
                  <label className="text-[10px] text-slate-500">Markup
                    <input type="number" value={r.markupPct} min={0} onChange={(e) => updateLine(r.id, { markupPct: Number(e.target.value) || 0 })}
                      className="ml-1 w-14 text-xs border border-slate-200 rounded px-1 py-0.5 font-mono" />%</label>
                  <span className="ml-auto text-xs font-mono font-semibold text-slate-900">{money(r.lineSell)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/60 space-y-1.5">
            <Row label="Cost" value={money(computed.cost)} />
            <Row label="Sell price" value={money(computed.sell)} strong />
            <Row label="Performance bond (10%, illustrative)" value={money(bond)} muted />
            <Row label="Blended margin" value={`${computed.margin.toFixed(1)}%`} muted />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, accent, icon }: { label: string; value: string; sub?: string; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={`p-3 rounded border shadow-xs ${accent ? 'bg-indigo-950 border-indigo-900 text-white' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[9px] font-mono uppercase tracking-wider ${accent ? 'text-indigo-200' : 'text-slate-500'}`}>{label}</span>
        {icon}
      </div>
      <div className={`text-lg font-bold font-sans tracking-tight mt-1 ${accent ? 'text-white' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className={`text-[10px] font-mono ${accent ? 'text-indigo-200' : 'text-slate-400'}`}>{sub}</div>}
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${muted ? 'text-slate-500' : 'text-slate-600'}`}>{label}</span>
      <span className={`font-mono ${strong ? 'text-sm font-bold text-slate-900' : muted ? 'text-xs text-slate-500' : 'text-xs font-semibold text-slate-800'}`}>{value}</span>
    </div>
  );
}
