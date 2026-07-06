/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Platform admin console — for YOU, the app's operator, not your
 * customers. Read-only cross-org overview (names, member/tender
 * counts) for support and monitoring. Only reachable at all if
 * db.amIPlatformAdmin() returns true, which itself only returns true
 * for an explicit allowlist entry made directly in Supabase — see
 * schema.sql's platform_admins table. There is no path to grant this
 * from inside the app, and no editing of another org's data here even
 * once you're in — visibility only.
 */
import React, { useEffect, useState } from 'react';
import { AdminOrgSummary, loadAdminOverview } from '../lib/db';
import { isDemoMode } from '../lib/supabase';
import { Building2, Users, Briefcase, ShieldCheck, RefreshCw } from 'lucide-react';

export default function AdminConsole() {
  const [orgs, setOrgs] = useState<AdminOrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setOrgs(await loadAdminOverview());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the admin overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!isDemoMode()) load(); else setLoading(false); }, []);

  const totalMembers = orgs.reduce((s, o) => s + o.memberCount, 0);
  const totalTenders = orgs.reduce((s, o) => s + o.tenderCount, 0);

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" /> Platform Admin Console
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Read-only overview across every organization. You're seeing this because your account is on the
            platform-admin allowlist — nothing here lets you edit another org's data.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 px-3 py-2 rounded shadow-2xs inline-flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {isDemoMode() ? (
        <div className="bg-white border border-dashed border-slate-200 rounded p-8 text-center text-xs text-slate-500">
          Demo mode has no backend to survey — this page is only meaningful on a connected deployment.
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded p-3">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Organizations" value={orgs.length} icon={<Building2 className="w-4 h-4 text-indigo-500" />} />
            <SummaryCard label="Total members" value={totalMembers} icon={<Users className="w-4 h-4 text-emerald-500" />} />
            <SummaryCard label="Total tenders" value={totalTenders} icon={<Briefcase className="w-4 h-4 text-amber-500" />} />
          </div>

          <div className="bg-white border border-slate-200 rounded shadow-xs overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="text-left font-semibold px-4 py-2">Organization</th>
                  <th className="text-left font-semibold px-2 py-2">Domain</th>
                  <th className="text-right font-semibold px-2 py-2">Members</th>
                  <th className="text-right font-semibold px-2 py-2">Tenders</th>
                  <th className="text-right font-semibold px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {orgs.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2 font-semibold text-slate-800">{o.name}</td>
                    <td className="px-2 py-2 text-slate-500 font-mono">{o.domain || '—'}</td>
                    <td className="px-2 py-2 text-right font-mono">{o.memberCount}</td>
                    <td className="px-2 py-2 text-right font-mono">{o.tenderCount}</td>
                    <td className="px-4 py-2 text-right text-slate-400 font-mono">{o.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orgs.length === 0 && !loading && (
              <div className="p-8 text-center text-xs text-slate-400">No organizations yet.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded shadow-xs p-4">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-bold font-mono text-slate-900 mt-1">{value}</div>
    </div>
  );
}
