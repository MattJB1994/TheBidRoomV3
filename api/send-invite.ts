/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sends a real invite email via Resend (https://resend.com) — a simple
 * REST API well-suited to a serverless function, and a reasonable
 * default for a project with no email infrastructure of its own. This
 * is entirely optional: if RESEND_API_KEY isn't set, this returns a
 * clear "not configured" response and TeamInvites.tsx already falls
 * back to its copy-the-link flow, so nothing breaks either way.
 *
 * Auth: same pattern as api/ai.ts — requires the caller's Supabase
 * session token, and uses a client scoped to THAT token (not the anon
 * key alone) to fetch the invite, so RLS guarantees a caller can only
 * ever send an email for an invite belonging to their own org.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
// resend.dev is a real domain Resend provides for testing without your
// own domain verified; swap for your own once you've verified one.
const FROM_EMAIL = process.env.INVITE_FROM_EMAIL || 'The Bid Room <onboarding@resend.dev>';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

/**
 * The base URL invite links are built from — a TRUSTED server-side value,
 * never the request's `origin`. Building links from client-supplied input
 * would let an attacker send a legitimate-looking invite email from our
 * domain/sender that points recipients at a URL they chose. Returns null
 * when unset or not a valid absolute http(s) URL, so the handler can fail
 * safely instead of emitting a broken or malicious link.
 */
export function resolveAppBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email sending is not configured. Copy the invite link instead.' });
  }

  // Invite links are built from a trusted server-side base URL, never
  // from the request. A missing/invalid APP_BASE_URL is a server
  // misconfiguration — fail clearly rather than emit a broken link.
  const appBaseUrl = resolveAppBaseUrl(process.env.APP_BASE_URL);
  if (!appBaseUrl) {
    return res.status(500).json({ error: 'Server is missing a valid APP_BASE_URL. Set APP_BASE_URL (e.g. https://thebidroom.com) in the deployment environment.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ') || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and try again.' });
  }
  const token = authHeader.slice('Bearer '.length);

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  const { inviteId } = body as { inviteId?: string };
  if (!inviteId) return res.status(400).json({ error: 'Missing inviteId' });

  try {
    // Scoped to the caller's own JWT: RLS on `invites` ("org members can
    // manage their invites") means this select silently returns nothing
    // if the invite doesn't belong to the caller's org — not an error,
    // just no row, which the check below turns into a clean 404.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: auth } = await supabase.auth.getUser(token);
    if (!auth.user) return res.status(401).json({ error: 'Unauthorized. Sign in and try again.' });

    const { data: invite, error } = await supabase
      .from('invites')
      .select('email, role, token, status, org:organizations(name)')
      .eq('id', inviteId)
      .single();
    if (error || !invite) return res.status(404).json({ error: 'Invite not found, or it does not belong to your organization.' });
    if (invite.status !== 'PENDING') return res.status(400).json({ error: 'This invite is no longer pending.' });

    const orgName = (invite.org as any)?.name || 'a workspace';
    const link = `${appBaseUrl}/?invite=${invite.token}`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: invite.email,
        subject: `You've been invited to join ${orgName} on The Bid Room`,
        html:
          `<p>You've been invited to join <strong>${orgName}</strong> on The Bid Room as a <strong>${String(invite.role).replace(/_/g, ' ')}</strong>.</p>` +
          `<p><a href="${link}">Accept the invite</a> to get started. This link expires in 14 days.</p>` +
          `<p style="color:#94a3b8;font-size:12px">If you weren't expecting this, you can ignore this email.</p>`,
      }),
    });
    if (!emailRes.ok) {
      const detail = await emailRes.text().catch(() => '');
      return res.status(502).json({ error: `Email provider rejected the request: ${detail.slice(0, 200)}` });
    }
    return res.status(200).json({ sent: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send invite email' });
  }
}
