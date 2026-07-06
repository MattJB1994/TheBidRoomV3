/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shown to an authenticated user who doesn't yet belong to an org. Until
 * they join one, every org-scoped RLS policy denies them, so this is the
 * required first step after a fresh signup. Two paths: create a new
 * workspace (create_org_and_join), or — if they arrived via an invite
 * link (?invite=<token>, parsed in App.tsx) — accept it (accept_invite),
 * joining the org that invited them instead.
 */
import React, { useState } from 'react';
import { Building2, ArrowRight, Loader2, LogOut, Mail } from 'lucide-react';
import { createOrgAndJoin, acceptInvite } from '../lib/db';

interface OnboardingProps {
  defaultName?: string;
  onComplete: () => void;
  onSignOut: () => void;
  inviteToken?: string | null;
}

export default function Onboarding({ defaultName = '', onComplete, onSignOut, inviteToken }: OnboardingProps) {
  const [orgName, setOrgName] = useState(defaultName);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptTheInvite = async () => {
    if (!inviteToken) return;
    setError(null);
    setLoading(true);
    try {
      await acceptInvite(inviteToken);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept this invite. It may have expired or already been used.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!orgName.trim()) {
      setError('Enter your organization name to continue.');
      return;
    }
    setLoading(true);
    try {
      await createOrgAndJoin(orgName.trim(), domain.trim() || undefined);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your workspace. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl border border-slate-200 p-8">
        <div className="w-10 h-10 rounded bg-slate-900 flex items-center justify-center mb-5">
          {inviteToken ? <Mail className="w-5 h-5 text-white" /> : <Building2 className="w-5 h-5 text-white" />}
        </div>

        {inviteToken ? (
          <>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">You've been invited</h1>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Someone invited you to join their workspace on The Bid Room. Accept to join their organization
              with the role they set for you.
            </p>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded p-2.5">{error}</div>
            )}

            <div className="mt-5 space-y-3">
              <button
                onClick={acceptTheInvite}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Accept invite <ArrowRight className="w-4 h-4" /></>}
              </button>
              <button
                onClick={onSignOut}
                className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-800 text-xs py-1.5"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          </>
        ) : (
          <>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Create your workspace</h1>
        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
          You're signed in. Set up your organization to start building tender runs.
          You'll be its owner and can invite your team afterwards.
        </p>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded p-2.5">{error}</div>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="org-name" className="text-xs font-semibold text-slate-700">Organization name</label>
            <input
              id="org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Your organization name"
              className="mt-1 w-full text-sm p-2 border border-slate-300 rounded outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="org-domain" className="text-xs font-semibold text-slate-700">
              Domain <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="org-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="yourcompany.com"
              className="mt-1 w-full text-sm p-2 border border-slate-300 rounded outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Create workspace <ArrowRight className="w-4 h-4" /></>}
          </button>

          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-800 text-xs py-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
