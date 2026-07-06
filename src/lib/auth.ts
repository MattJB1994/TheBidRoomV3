/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSupabase, isSupabaseConfigured, isDemoMode } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

export type AuthProvider = 'google' | 'azure';

/**
 * Returned when Supabase isn't configured and demo mode is off (i.e. a
 * production build missing its credentials). Fail closed rather than
 * pretending the sign-in worked.
 */
const NOT_CONFIGURED: AuthResult = {
  success: false,
  error: 'Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_DEMO_MODE=true for a no-backend demo).',
};


export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * The redirect URL OAuth providers and email confirmation links send
 * the user back to. This is a single-page app with no router, so
 * there's no dedicated /auth/callback page to land on — instead this
 * points at the app root. App.tsx's onAuthStateChange listener and
 * getCurrentSession() check on mount pick up the session from the URL
 * automatically (Supabase's detectSessionInUrl handles the token
 * exchange), so landing on '/' is sufficient and avoids a 404.
 */
function getRedirectUrl(): string {
  return window.location.origin;
}

/**
 * Email/password sign in. Falls back to a mock success in demo mode
 * (no Supabase credentials configured) so the UI remains reviewable
 * without requiring real infrastructure first.
 */
export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    if (!isDemoMode()) return NOT_CONFIGURED;
    console.warn('[auth] Demo mode — no Supabase credentials configured. Simulating sign-in.');
    return { success: true };
  }
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Email/password sign up. In demo mode, simulates the "check your
 * email" flow without sending anything.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  metadata: { fullName: string; company: string; role: string }
): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    if (!isDemoMode()) return NOT_CONFIGURED;
    console.warn('[auth] Demo mode — no Supabase credentials configured. Simulating sign-up.');
    return { success: true };
  }
  const { error } = await getSupabase().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getRedirectUrl(),
      data: {
        full_name: metadata.fullName,
        company: metadata.company,
        role: metadata.role,
      },
    },
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Google OAuth sign in. Requires the Google provider to be enabled
 * in the Supabase dashboard (Authentication -> Providers -> Google)
 * with a Google Cloud OAuth client ID/secret configured there.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    if (!isDemoMode()) return NOT_CONFIGURED;
    console.warn('[auth] Demo mode — Google sign-in simulated.');
    return { success: true };
  }
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: getRedirectUrl() },
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Microsoft OAuth sign in, via Supabase's 'azure' provider. Requires
 * the Azure provider to be enabled in the Supabase dashboard with an
 * Azure AD (Entra ID) app registration's client ID/secret/tenant.
 */
export async function signInWithMicrosoft(): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    if (!isDemoMode()) return NOT_CONFIGURED;
    console.warn('[auth] Demo mode — Microsoft sign-in simulated.');
    return { success: true };
  }
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: getRedirectUrl(),
      scopes: 'email openid profile',
    },
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().auth.signOut();
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().auth.getUser();
  return data.user;
}

/**
 * Subscribes to auth state changes (sign in, sign out, token refresh).
 * Returns an unsubscribe function. No-ops in demo mode.
 */
export function onAuthStateChange(callback: (session: Session | null, event?: string) => void): () => void {
  if (!isSupabaseConfigured()) {
    return () => {};
  }
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    callback(session, event);
  });
  return () => data.subscription.unsubscribe();
}
