/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Team registry + teammate invites. Invite creation and acceptance are
 * real (a real `invites` row, redeemed via the accept_invite RPC — see
 * schema.sql). Sending is a real email via api/send-invite.ts (Resend)
 * when RESEND_API_KEY is configured; otherwise — and always, as a
 * fallback if the send fails — the invite link is copy-able so it can
 * be shared manually. `?invite=<token>` is picked up by App.tsx and
 * routed to Onboarding, which calls acceptInvite() instead of
 * create_org_and_join.
 */
import React, { useEffect, useState } from 'react';
import { TeamMember, Invite } from '../types';
import { mockTeam } from '../data/mockData';
import { isDemoMode, authHeaders } from '../lib/supabase';
import * as db from '../lib/db';
import { toast, toastError } from '../lib/toast';
import { UserPlus, Copy, X, Clock, Mail, Check, ShieldAlert } from 'lucide-react';

interface TeamInvitesProps {
  team?: TeamMember[];
}

const ROLES: TeamMember['role'][] = ['ADMIN', 'BID_MANAGER', 'TECHNICAL_REVIEWER', 'COMMERCIAL_REVIEWER', 'CONTRIBUTOR', 'VIEWER'];

export default function TeamInvites({ team = mockTeam }: TeamInvitesProps) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamMember['role']>('CONTRIBUTOR');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isDemoMode()) return;
    (async () => {
      try {
        const profile = await db.getMyProfile();
        if (profile?.orgId) setInvites(await db.listInvites(profile.orgId));
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Could not load invites.');
      }
    })();
  }, []);

  const invite = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('Enter a valid email address.', 'error');
      return;
    }
    if (team.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
      toast('That person is already on the team.', 'error');
      return;
    }
    setSending(true);
    try {
      if (isDemoMode()) {
        const demoInvite: Invite = {
          id: 'inv_' + Date.now(), email, role, token: crypto.randomUUID(),
          status: 'PENDING', createdAt: new Date().toISOString().slice(0, 10),
          expiresAt: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        };
        setInvites([demoInvite, ...invites]);
      } else {
        const profile = await db.getMyProfile();
        if (!profile?.orgId) throw new Error('No organization found.');
        const created = await db.createInvite(profile.orgId, profile.id, email, role);
        setInvites([created, ...invites]);
        db.logAuditQuick('TEAMMATE_INVITED', `${email} (${role.replace(/_/g, ' ')})`);
        trySendInviteEmail(created.id, email);
      }
      toast(`Invite created for ${email}. Copy the link below and send it to them.`);
      setEmail('');
      setRole('CONTRIBUTOR');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create the invite.');
    } finally {
      setSending(false);
    }
  };

  const revoke = async (id: string) => {
    const inv = invites.find((i) => i.id === id);
    setInvites(invites.map((i) => (i.id === id ? { ...i, status: 'REVOKED' } : i)));
    if (!isDemoMode()) {
      db.revokeInvite(id).catch((e) => toastError(e instanceof Error ? e.message : 'Could not revoke.'));
      if (inv) db.logAuditQuick('INVITE_REVOKED', inv.email);
    }
  };

  // Best-effort: if RESEND_API_KEY is configured server-side, this sends
  // a real email. If it's not configured, or the send fails for any
  // reason, this fails silently — the copy-link flow below is always
  // available regardless, so a missing email provider is never a dead
  // end for the person sending the invite.
  const trySendInviteEmail = async (inviteId: string, toEmail: string) => {
    if (isDemoMode()) return;
    try {
      const res = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ inviteId }),
      });
      if (res.ok) toast(`Invite email sent to ${toEmail}.`);
      // Silent on failure/not-configured — the toast above already told
      // the person to copy the link, which still works either way.
    } catch { /* silent */ }
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}${window.location.pathname}?invite=${token}`;
    navigator.clipboard.writeText(link).then(
      () => toast('Invite link copied.'),
      () => toast('Could not copy — select and copy the link manually.', 'error'),
    );
  };

  const pending = invites.filter((i) => i.status === 'PENDING');

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-xl font-sans font-semibold text-slate-950 tracking-tight">Bid Team Registry</h1>
        <p className="text-xs text-slate-600 mt-1">Manage project members, access controls, and submission sign-off authorities.</p>
      </div>

      {/* Current team */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {team.map((member) => (
          <div key={member.id} className="bg-white border border-slate-200 rounded p-4 flex gap-4 items-center">
            <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {member.name.split(' ').map((n) => n[0]).join('')}
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

      {/* Invite form */}
      <div className="bg-white border border-slate-200 rounded shadow-xs p-5 space-y-3">
        <h3 className="text-sm font-sans font-bold text-slate-900 flex items-center gap-2"><UserPlus className="w-4 h-4 text-indigo-600" /> Invite a teammate</h3>
        {!isDemoMode() && (
          <div className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-100 rounded px-2.5 py-2">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>If an email provider is configured, invites are emailed automatically. Either way, you can copy the link below and send it yourself.</span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@yourcompany.com"
            className="flex-1 text-xs p-2 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <select value={role} onChange={(e) => setRole(e.target.value as TeamMember['role'])} className="text-xs p-2 border border-slate-200 rounded bg-white">
            {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
          <button
            onClick={invite}
            disabled={sending}
            className="text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white px-4 py-2 rounded inline-flex items-center justify-center gap-1.5"
          >
            <Mail className="w-3.5 h-3.5" /> {sending ? 'Sending…' : 'Create invite'}
          </button>
        </div>
      </div>

      {/* Pending invites */}
      {pending.length > 0 && (
        <div className="bg-white border border-slate-200 rounded shadow-xs">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-600">Pending invites</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {pending.map((inv) => (
              <div key={inv.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800">{inv.email}</div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                    <span className="uppercase">{inv.role.replace(/_/g, ' ')}</span>
                    <span>·</span>
                    <Clock className="w-3 h-3" /> Expires {inv.expiresAt}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => copyLink(inv.token)} className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded">
                    <Copy className="w-3.5 h-3.5" /> Copy link
                  </button>
                  <button onClick={() => revoke(inv.id)} aria-label={`Revoke invite for ${inv.email}`} className="text-slate-400 hover:text-red-600 p-1.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
