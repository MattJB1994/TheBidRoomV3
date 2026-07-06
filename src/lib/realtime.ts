/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Real-time collaboration, built on Supabase Realtime. Two things:
 *
 *  - Presence: who else is currently viewing this tender (a real
 *    Realtime presence channel — join/leave events, not polling).
 *  - Remote change notifications: when another user edits a compliance
 *    item or proposal section, we get a postgres_changes event and
 *    re-fetch that tender's workspace data. Deliberately a debounced
 *    *reload* rather than hand-merging individual row payloads into
 *    local state: reusing db.loadWorkspace()'s already-tested mapping
 *    logic is far less error-prone than duplicating it here, and a few
 *    hundred milliseconds of extra latency on a live edit is a fine
 *    trade for correctness. Requires the tables to be added to the
 *    supabase_realtime publication — see supabase/schema.sql.
 *
 * No-ops entirely in demo mode.
 */
import { getSupabase, isDemoMode } from './supabase';

export interface PresenceUser {
  id: string;
  name: string;
}

/**
 * Tracks the current user's presence on a per-tender channel and calls
 * onSync with the full list of everyone currently present (including
 * yourself) whenever it changes. Returns an unsubscribe function.
 */
export function subscribeToPresence(
  tenderId: string,
  me: PresenceUser,
  onSync: (users: PresenceUser[]) => void,
): () => void {
  if (isDemoMode() || !tenderId) return () => {};
  const supabase = getSupabase();
  const channel = supabase.channel(`presence:tender:${tenderId}`, {
    config: { presence: { key: me.id } },
  });

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<PresenceUser>();
    const users = Object.values(state)
      .flat()
      .map((p) => ({ id: p.id, name: p.name }));
    onSync(users);
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      channel.track(me).catch(() => {});
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to compliance_items/proposal_sections changes for a tender
 * and calls onRemoteChange (debounced) whenever another client's write
 * comes through. Returns an unsubscribe function.
 */
export function subscribeToTenderChanges(
  tenderId: string,
  onRemoteChange: () => void,
  debounceMs = 600,
): () => void {
  if (isDemoMode() || !tenderId) return () => {};
  const supabase = getSupabase();
  let timer: number | undefined;
  const debounced = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onRemoteChange, debounceMs);
  };

  const channel = supabase
    .channel(`changes:tender:${tenderId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'compliance_items', filter: `tender_id=eq.${tenderId}` },
      debounced,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'proposal_sections', filter: `tender_id=eq.${tenderId}` },
      debounced,
    )
    .subscribe();

  return () => {
    window.clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
