/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

/**
 * Returns true if Supabase credentials are present in the environment.
 * The app falls back to a mock auth/demo mode when they are not set,
 * so the UI is always reviewable even before real credentials exist.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Demo mode = the no-backend path where every sign-in is simulated and
 * the whole UI is reachable without infrastructure. This is great for
 * local review but DANGEROUS in production: a prod deploy that is simply
 * missing its Supabase env vars must NOT silently turn into an open,
 * unauthenticated app. So demo mode is only ever active when Supabase is
 * unconfigured AND we're either in a dev build or it's been explicitly
 * opted into with VITE_DEMO_MODE=true. In a production build with no
 * credentials, this returns false and auth fails closed with a clear
 * "not configured" error instead of granting access.
 */
export function isDemoMode(): boolean {
  if (isSupabaseConfigured()) return false;
  const explicit = (import.meta.env.VITE_DEMO_MODE as string | undefined) === 'true';
  return Boolean(import.meta.env.DEV) || explicit;
}

/**
 * Lazily creates a single shared Supabase client. Throws if credentials
 * are missing — callers should check isSupabaseConfigured() first, or
 * use the auth helpers in lib/auth.ts which handle the fallback path.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file.'
    );
  }
  if (!client) {
    client = createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/**
 * Headers for an authenticated fetch to one of this project's own
 * serverless endpoints (api/ai.ts, api/send-invite.ts, ...), which all
 * verify the caller's Supabase session token server-side. Demo mode
 * never reaches a real fetch to these endpoints, so it's always safe to
 * call this — it just won't have anything meaningful to attach.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (isDemoMode()) return {};
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
