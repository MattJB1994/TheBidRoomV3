/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AiModelSettings — the visible AI model panel in Settings. Shows the
 * provider, base URL, model (analysis + drafting), whether the server's
 * AI_API_KEY / AI_BASE_URL / AI_MODEL are configured (never the values
 * of secrets), a Test connection button, usage this month, and the
 * data-training-disabled notice. In demo mode it simply reports the
 * demo model as active.
 */
import React, { useEffect, useState } from 'react';
import { Cpu, CheckCircle2, XCircle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { getAiStatus, AiStatus } from '../lib/ai';
import { isDemoMode } from '../lib/supabase';
import { toast, toastError } from '../lib/toast';

interface AiModelSettingsProps {
  /** Rough "AI runs this month" figure (tenders analysed). */
  usageCount?: number;
}

export default function AiModelSettings({ usageCount = 0 }: AiModelSettingsProps) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getAiStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the AI configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const s = await getAiStatus();
      setStatus(s);
      if (s.demo) toast('Demo model active — analysis and drafting run locally with sample output.');
      else if (s.configured) toast('Connection OK — the AI endpoint responded and a provider key is configured.');
      else toastError('The endpoint responded, but no AI_API_KEY is configured on the server.');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  };

  const configuredBadge = (ok: boolean, okLabel = 'Configured', badLabel = 'Not set') => (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {ok ? okLabel : badLabel}
    </span>
  );

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900 sm:text-right">{value}</span>
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xs">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-slate-700" />
          <h2 className="text-sm font-semibold text-slate-900">AI model</h2>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
              status.demo ? 'bg-indigo-50 text-indigo-800' : status.configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-900'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.demo ? 'bg-indigo-500' : status.configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {status.demo ? 'Demo model active' : status.configured ? 'Model ready' : 'Not configured'}
            </span>
          )}
          <button
            onClick={testConnection}
            disabled={testing || loading}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Test connection
          </button>
        </div>
      </div>

      <div className="px-5 py-2">
        {loading ? (
          <div className="py-6 flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking configuration…
          </div>
        ) : error ? (
          <div className="py-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 my-3">
            {error}
          </div>
        ) : status?.demo ? (
          <>
            {row('Provider', 'Demo model (local sample output)')}
            {row('Analysis model', 'demo-local')}
            {row('Drafting model', 'demo-local')}
            {row('Usage this month', `${usageCount} analysis run${usageCount === 1 ? '' : 's'}`)}
            <p className="text-sm text-slate-500 py-3">
              You're in demo mode — extraction and drafting return representative sample output.
              Deploy with <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">AI_API_KEY</code> to
              use a live model.
            </p>
          </>
        ) : status ? (
          <>
            {row('Provider', status.provider)}
            {row('Base URL', <span className="font-mono text-xs">{status.baseUrl ?? '—'}</span>)}
            {row('Model', <span className="font-mono text-xs">{status.model ?? '—'}</span>)}
            {row('Analysis model', <span className="font-mono text-xs">{status.model ?? '—'}</span>)}
            {row('Drafting model', <span className="font-mono text-xs">{status.model ?? '—'}</span>)}
            {row('AI_API_KEY', configuredBadge(status.keyConfigured))}
            {row('AI_BASE_URL', configuredBadge(status.baseUrlConfigured, 'Configured', 'Default'))}
            {row('AI_MODEL', configuredBadge(status.modelConfigured, 'Configured', 'Default'))}
            {row('Usage this month', `${usageCount} analysis run${usageCount === 1 ? '' : 's'}`)}
          </>
        ) : null}
      </div>

      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-lg flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="text-sm text-slate-600">
          Model data training is <span className="font-semibold text-slate-900">disabled</span> — your documents are never used to train models.
        </span>
      </div>
    </div>
  );
}
