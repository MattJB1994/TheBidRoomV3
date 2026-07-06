/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Opportunity mutation handlers (info-request status/response,
 * clarification promote/submit/answer) — each one is local-state update
 * + db.ts persistence + audit log, and until this was extracted, that
 * logic was maintained as two separate, drifting copies: one inline in
 * Opportunity.tsx's tabs, one inline in NotificationCenter.tsx's inline
 * actions. A future change to any of these (a new validation rule, a
 * different audit message) now only has to happen once.
 *
 * Split into two hooks rather than one combined one because the two
 * callers that need info-request actions (Opportunity's
 * RequirementsTab, NotificationCenter) don't always also have
 * clarifications in scope, and vice versa (ClarificationsTab) — forcing
 * a single hook would mean passing dummy state just to satisfy it.
 */
import { useCallback } from 'react';
import { isDemoMode } from './supabase';
import * as db from './db';
import { toast, toastError } from './toast';
import type { InfoRequest, Clarification } from '../types';

export function useInfoRequestActions(
  requests: InfoRequest[],
  setRequests: React.Dispatch<React.SetStateAction<InfoRequest[]>>,
) {
  const setRequestStatus = useCallback((id: string, status: InfoRequest['status']) => {
    const item = requests.find((r) => r.id === id);
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    if (!isDemoMode()) {
      db.updateInfoRequest(id, { status }).catch((e) => toastError(e instanceof Error ? e.message : 'Could not save.'));
      if (item) db.logAuditQuick('INFO_REQUEST_STATUS_CHANGED', `${item.label} → ${status}`);
    }
  }, [requests, setRequests]);

  const setRequestResponse = useCallback((id: string, response: string) => {
    const item = requests.find((r) => r.id === id);
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, response } : r)));
    if (!isDemoMode()) {
      db.updateInfoRequest(id, { response }).catch((e) => toastError(e instanceof Error ? e.message : 'Could not save.'));
      if (item) db.logAuditQuick('INFO_REQUEST_RESPONSE_ADDED', item.label);
    }
  }, [requests, setRequests]);

  return { setRequestStatus, setRequestResponse };
}

export function useClarificationActions(
  clarifications: Clarification[],
  setClarifications: React.Dispatch<React.SetStateAction<Clarification[]>>,
) {
  const promoteClarification = useCallback((id: string) => {
    setClarifications((cs) => cs.map((c) => (c.id === id ? { ...c, status: 'DRAFT', source: 'MANUAL' } : c)));
    toast('Added to your register.');
    if (!isDemoMode()) db.updateClarification(id, { status: 'DRAFT', source: 'MANUAL' }).catch((e) => toastError(e instanceof Error ? e.message : 'Could not save.'));
  }, [setClarifications]);

  const submitClarification = useCallback((id: string) => {
    const item = clarifications.find((c) => c.id === id);
    setClarifications((cs) => cs.map((c) => (c.id === id ? { ...c, status: 'SUBMITTED' } : c)));
    if (!isDemoMode()) {
      db.updateClarification(id, { status: 'SUBMITTED' }).catch((e) => toastError(e instanceof Error ? e.message : 'Could not save.'));
      if (item) db.logAuditQuick('CLARIFICATION_SUBMITTED', item.question);
    }
  }, [clarifications, setClarifications]);

  const answerClarification = useCallback((id: string, text: string) => {
    const item = clarifications.find((c) => c.id === id);
    setClarifications((cs) => cs.map((c) => (c.id === id ? { ...c, answer: text, status: text ? 'ANSWERED' : c.status } : c)));
    if (!isDemoMode()) {
      db.updateClarification(id, { answer: text, ...(text ? { status: 'ANSWERED' as const } : {}) }).catch((e) => toastError(e instanceof Error ? e.message : 'Could not save.'));
      if (item && text) db.logAuditQuick('CLARIFICATION_ANSWERED', item.question);
    }
  }, [clarifications, setClarifications]);

  return { promoteClarification, submitClarification, answerClarification };
}
