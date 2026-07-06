/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server-side AI endpoint (Vercel serverless function).
 *
 * Provider-agnostic: it speaks the OpenAI-compatible Chat Completions
 * API, so it works with ANY provider that exposes that format — OpenAI,
 * Azure OpenAI, OpenRouter, Groq, Together, Mistral, DeepSeek, Anthropic,
 * or a local model (Ollama/vLLM) via their OpenAI-compatible endpoints.
 * Point it wherever you like with three env vars:
 *
 *   AI_API_KEY    your provider key (falls back to OPENAI_API_KEY)
 *   AI_BASE_URL   API base, default https://api.openai.com/v1
 *   AI_MODEL      model id, default gpt-4o-mini
 *
 * This is the ONLY place the key is read. It is deliberately not
 * VITE_-prefixed, so it never ships to the browser. The client calls
 * this endpoint via src/lib/ai.ts.
 *
 * Tasks, selected by the `task` field of the JSON body:
 *   "extract"      — given the tender's documents as named TEXT chunks
 *                    (extracted client-side by src/lib/docText.ts),
 *                    return the full blueprint-input JSON: metadata plus
 *                    a source-referenced requirements register.
 *   "draft"        — given a requirement + optional evidence, return prose.
 *   "addendum"     — analyse an addendum's text against the requirement
 *                    register; return the impact assessment.
 *   "extract_text" — vision transcription for images only (KB search index).
 *   "status"       — non-secret configuration report for Settings.
 * PDFs are never sent here as bytes or fake image URLs — the client
 * extracts their text layer first and sends structured text.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';

// Supabase project used to verify the CALLER's identity (not the AI
// provider — that's API_KEY above). Vercel exposes every env var to
// serverless functions regardless of the VITE_ prefix; that prefix only
// controls what Vite embeds into the client bundle at build time.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

/**
 * Without this, anyone who discovers this endpoint's URL on a deployed
 * instance could call it directly and spend the site owner's AI budget
 * — the request body is attacker-controlled, so there's nothing else
 * gating it. Requires a valid Supabase session token from the caller,
 * verified against Supabase's auth service (not just decoded locally).
 * Returns the caller's user id on success, null otherwise.
 */
async function getAuthedUserId(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ') || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const token = authHeader.slice('Bearer '.length);
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Stops a single legitimate signed-in user (or a bug in a retry loop)
// from running up unbounded provider costs — auth alone only stops
// random internet abuse, not this. Backed by ai_requests (see
// schema.sql): one row per request, counted over a sliding window.
// Uses a Supabase client authenticated with the CALLER's own JWT (not
// the anon key alone) so the table's RLS — "you can only see/insert
// your own rows" — does the actual enforcement; this function can't
// accidentally count or rate-limit against anyone else's requests.
const RATE_LIMIT_PER_MINUTE = 20;

// Whether an infra failure during the rate-limit check should fail OPEN
// (allow the request) or CLOSED (reject it). Failing open in production
// means an attacker who can break the rate-limit lookup gets unmetered
// AI spend, so production fails closed. Only an explicitly non-production
// environment gets the convenience of failing open.
const RATE_LIMIT_FAILS_OPEN =
  process.env.NODE_ENV !== 'production' || process.env.VITE_DEMO_MODE === 'true';

/** Result of a rate-limit check. `error` is set when the check itself failed. */
async function checkRateLimit(token: string, userId: string): Promise<{ allowed: boolean; retryAfterSeconds?: number; error?: boolean }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { allowed: true }; // no backend configured — nothing to rate-limit against
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count, error: countErr } = await supabase
      .from('ai_requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', windowStart);
    if (countErr) {
      // Log server-side (detail stays in logs, never sent to the client)
      // and fail closed in production so a lookup failure can't become an
      // unmetered-spend hole.
      console.error('[ai] rate-limit lookup failed:', countErr.message);
      return RATE_LIMIT_FAILS_OPEN ? { allowed: true } : { allowed: false, error: true };
    }
    if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) return { allowed: false, retryAfterSeconds: 60 };

    // Record this request, and opportunistically trim rows older than a
    // day so the table doesn't grow unbounded without needing a cron job.
    await supabase.from('ai_requests').insert({ user_id: userId });
    if (Math.random() < 0.05) {
      supabase.from('ai_requests').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString()).then(() => {});
    }
    return { allowed: true };
  } catch (err) {
    console.error('[ai] rate-limit check threw:', err instanceof Error ? err.message : 'unknown');
    return RATE_LIMIT_FAILS_OPEN ? { allowed: true } : { allowed: false, error: true };
  }
}

// The extraction schema. Kept as a prompt (rather than a provider-
// specific schema object) so it works across every OpenAI-compatible
// provider. Produces a full Tender Blueprint input: high-level metadata
// PLUS a source-referenced requirements register across every category.
const EXTRACT_SYSTEM =
  'You are a tender intake analyst for an engineering / rail / infrastructure bid team. ' +
  'You will receive one or more tender documents as named text sections (RFT/RFP, scope, returnable schedules, pricing schedules, addenda, contract conditions, templates, specifications). ' +
  'Read ALL of them and return ONLY a single JSON object (no prose, no code fences) with exactly these keys:\n' +
  'client (string), tenderName (string), tenderNumber (string), closingDate (string, ISO YYYY-MM-DD), closingTime (string, e.g. "14:00 local" or ""), submissionPortal (string), ' +
  'summary (string, 2-3 sentence tender summary), submissionInstructions (string[]), ' +
  'mandatoryRequirements (string[]), evaluationCriteria (string[]), weightedCriteria (array of {criterion: string, weight: string}), requiredSchedules (string[]), ' +
  'pageLimits (string), wordLimits (string), attachmentsCount (number), pricingFormsCount (number), requiredCVsCount (number), requiredProjectExamplesCount (number), ' +
  'mandatoryInsurances (string[]), requiredPolicies (string[]), addendaCount (number), addendaReferences (string[]), ' +
  'clarificationsNeeded (string[] — ambiguities worth clarifying with the client), commercialRisks (string[]), legalRisks (string[]), ' +
  'requirements (array — THE MOST IMPORTANT FIELD — one entry per distinct requirement found anywhere in the documents, each: ' +
  '{text: string (the requirement, faithful to source), category: string (one of: "Submission instruction","Mandatory returnable","Evaluation criteria","Technical","Commercial","Legal","Safety","Assurance","Program","Personnel","Experience","Pricing","Insurance","Accreditation","Template","Formatting","Evidence"), ' +
  'sourceDocument: string (the document name it came from), clauseRef: string (clause/section/page reference, "" if none), ' +
  'confidence: "high"|"medium"|"low", mandatory: boolean, scored: boolean, evidenceRequired: boolean}).\n' +
  'Rules: be faithful to the source and NEVER invent requirements; every requirements[] entry must cite its sourceDocument and clauseRef where available; ' +
  'use confidence "low" when inferring; use 0 for missing counts and empty strings/arrays for missing fields. Aim for completeness across all documents, not just the first.';

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: any; }

async function chat(messages: ChatMessage[], jsonMode: boolean): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Provider returned ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

function safeParse(s: string): any {
  const cleaned = s.replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  // Best-effort: grab the outermost JSON object.
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // 'status' is answered before the key guard so Settings can show an
  // honest "not configured" state instead of an opaque 503. It reports
  // configuration booleans plus the (non-secret) base URL and model id —
  // never the key itself.
  const earlyBody = (typeof req.body === 'string' ? safeParse(req.body) : req.body) || {};
  if (earlyBody.task === 'status') {
    const statusUserId = await getAuthedUserId(req);
    if (!statusUserId) return res.status(401).json({ error: 'Unauthorized. Sign in and try again.' });
    return res.status(200).json({
      result: {
        configured: !!API_KEY,
        baseUrl: BASE_URL,
        model: MODEL,
        keyConfigured: !!API_KEY,
        baseUrlConfigured: !!process.env.AI_BASE_URL,
        modelConfigured: !!process.env.AI_MODEL,
      },
    });
  }

  if (!API_KEY) {
    return res.status(503).json({
      error: 'AI is not configured on the server. Set AI_API_KEY (and optionally AI_BASE_URL and AI_MODEL) in the deployment environment.',
    });
  }

  const userId = await getAuthedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Sign in and try again.' });
  }

  const token = (req.headers.authorization || '').slice('Bearer '.length);
  const rateLimit = await checkRateLimit(token, userId);
  if (rateLimit.error) {
    // The check itself failed and we're failing closed (production).
    return res.status(503).json({ error: 'AI usage check failed. Please try again.' });
  }
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds ?? 60));
    return res.status(429).json({ error: `Too many AI requests. Try again in about ${rateLimit.retryAfterSeconds ?? 60} seconds.` });
  }

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) || {};
  const task = body.task as string | undefined;

  try {
    if (task === 'extract') {
      const { documents, text, data, mimeType } = body as {
        documents?: { name: string; text: string }[];
        text?: string; data?: string; mimeType?: string;
      };

      // Primary path: pre-extracted text chunks from the client's
      // document pipeline (src/lib/docText.ts) — one named section per
      // uploaded document, so the analysis covers the whole tender.
      let userContent: any = null;
      if (documents?.length) {
        const combined = documents
          .map((d) => `===== DOCUMENT: ${d.name} =====\n${d.text}`)
          .join('\n\n');
        userContent = [{ type: 'text', text: `Extract the full tender blueprint input from these ${documents.length} tender document(s):\n\n${combined}` }];
      } else if (text) {
        userContent = [{ type: 'text', text: `Extract the full tender blueprint input from this document:\n\n${text}` }];
      } else if (data) {
        // Raw bytes are only accepted for actual images (vision models
        // read those natively). PDFs must be text-extracted client-side
        // first — sending a PDF as an image URL was never reliable.
        if (!mimeType?.startsWith('image/')) {
          return res.status(400).json({
            error: 'Raw document bytes are only accepted for images. Extract the document text first and send it as `documents` or `text` (the app does this automatically).',
          });
        }
        userContent = [
          { type: 'text', text: 'Extract the full tender blueprint input from the attached document image.' },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } },
        ];
      } else {
        return res.status(400).json({ error: 'Provide the tender as `documents` (name+text chunks), `text`, or an image as base64 `data`.' });
      }

      const content = await chat(
        [{ role: 'system', content: EXTRACT_SYSTEM }, { role: 'user', content: userContent }],
        true,
      );
      const result = safeParse(content);
      if (!result) return res.status(502).json({ error: 'The model did not return valid JSON. Try a more capable model via AI_MODEL.' });
      return res.status(200).json({ result });
    }

    if (task === 'addendum') {
      // Live addendum impact: the addendum's extracted text + the current
      // requirement register → what changed and what it touches.
      const { addendumName, addendumText, requirements, moduleKeys } = body as {
        addendumName?: string; addendumText?: string;
        requirements?: { id: string; text: string }[]; moduleKeys?: string[];
      };
      if (!addendumText) return res.status(400).json({ error: 'Missing addendumText (extract the addendum text client-side first).' });

      const reqList = (requirements ?? []).map((r) => `${r.id}: ${r.text}`).join('\n');
      const prompt =
        `An addendum ("${addendumName || 'Addendum'}") has been issued for a live tender. Analyse it against the current requirement register and active proposal modules.\n\n` +
        `ADDENDUM TEXT:\n${addendumText}\n\n` +
        `CURRENT REQUIREMENTS:\n${reqList || '(none)'}\n\n` +
        `ACTIVE MODULE KEYS: ${(moduleKeys ?? []).join(', ') || '(none)'}\n\n` +
        'Return ONLY a JSON object: {summary: string (what the addendum changes, 2-3 sentences), changes: string[] (specific changes), ' +
        'affectedRequirementIds: string[] (IDs from the register above that are affected — only real IDs), ' +
        'affectedModuleKeys: string[] (module keys from the list above that are affected — only real keys), ' +
        'pricingImpact: boolean, riskImpact: boolean}. Be faithful to the addendum text; do not invent changes.';

      const content = await chat(
        [
          { role: 'system', content: 'You are a tender addendum analyst. Precise, faithful to source, JSON only.' },
          { role: 'user', content: prompt },
        ],
        true,
      );
      const result = safeParse(content);
      if (!result) return res.status(502).json({ error: 'The model did not return valid JSON for the addendum analysis.' });
      return res.status(200).json({ result });
    }

    if (task === 'draft') {
      const { requirement, evidence, sectionTitle } = body as { requirement?: string; evidence?: string; sectionTitle?: string };
      if (!requirement) return res.status(400).json({ error: 'Missing requirement' });

      const prompt =
        `Draft a concise, evidence-grounded proposal response for the section "${sectionTitle || 'Response'}". ` +
        `Address this requirement:\n\n${requirement}\n\n` +
        (evidence ? `Use only this verified evidence; do not fabricate claims:\n${evidence}\n\n` : '') +
        `Write in a professional, factual tone suitable for a government rail tender. Do not invent project names, dates, or credentials.`;

      const content = await chat(
        [
          { role: 'system', content: 'You are a professional bid writer. Be factual and concise; never fabricate evidence.' },
          { role: 'user', content: prompt },
        ],
        false,
      );
      return res.status(200).json({ result: content });
    }

    if (task === 'extract_text') {
      // Vision transcription for IMAGES ONLY (populates
      // kb_files.content_text for search). PDFs/DOCX/XLSX are extracted
      // client-side by real parsers (src/lib/docText.ts) and never
      // arrive here as bytes.
      const { data, mimeType } = body as { data?: string; mimeType?: string };
      if (!data) return res.status(400).json({ error: 'Missing document data' });
      if (!mimeType?.startsWith('image/')) {
        return res.status(400).json({ error: 'extract_text accepts images only. Other formats are text-extracted client-side.' });
      }

      const content = await chat(
        [
          { role: 'system', content: 'Transcribe the visible text content of this image as plain text, for search indexing. No commentary, no formatting, just the text content.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcribe this document image.' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } },
            ],
          },
        ],
        false,
      );
      // Cap length — this is a search index, not a document store.
      return res.status(200).json({ result: content.slice(0, 20000) });
    }

    return res.status(400).json({ error: `Unknown task: ${String(task)}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI request failed';
    return res.status(502).json({ error: message });
  }
}
