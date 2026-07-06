# The Bid Room

Structured bid and proposal workspace for engineering, rail, signalling, and
technical advisory teams — built by Buckland Consulting Group.

Wired up with real authentication (Supabase, including Google and Microsoft
sign-in) and deployment configs for Vercel and GitLab CI.

Upload the documents a client issued for a tender and The Bid Room builds a
**Tender Blueprint**: a source-referenced requirements register, the proposal
modules that tender needs, an evidence map against your knowledge base,
discipline review gates, and gated export packs. On a configured Supabase
backend the whole blueprint, its tender documents, and the knowledge base
persist and reload across refreshes and team sessions, each isolated per
organisation by Row Level Security. Without Supabase, the app runs in a
clearly-labelled **demo mode** on representative sample data.

### A guided, seven-stage workflow

The product is organised as one calm workflow — **Intake → Blueprint → Gaps →
Draft → Review → Submit → Closeout** — with a persistent stepper showing where you
are and a single **Next Best Action** telling you what to do next. In demo mode you
can **Open worked example** to load two realistic, fictional tenders with no
upload, no AI and no wait: **Bluewater Junction Corridor Renewal** (mid-workflow,
intentionally imperfect — evidence gaps, a scanned addendum, open commercial items,
blocked exports) and **Riverside Water Treatment Upgrade** (a finished, *won*
tender with a completed closeout). They're labelled "Example project", never a
"demo", and can be reset at any time.

### Controlled tender delivery (not just AI writing)

On top of the blueprint sit the differentiators that make this a tender
*command centre*:

- **Proposal Run Through** — two-pass whole-proposal drafting so sections are
  connected, not generated in isolation: first pass across all modules → section
  and global notes → full run-through (master prompt) → repetition/consistency
  check → review-ready draft. Version history; manual edits are never silently
  overwritten.
- **Prompt Composer** — assembles AI instructions from structured layers
  (blueprint, requirements, evidence, notes, commercial assumptions, addenda,
  claim register, terminology). Users steer it through notes and structured
  actions and see a transparent generation summary; the raw master prompt is not
  exposed.
- **Controlled Proposal Loops** — each section is looped through requirement,
  evidence, repetition, commercial and addendum checks with clear stop conditions
  (no endless autonomous revision; AI never self-approves; export-ready only when
  all checks pass and a human has approved).
- **Response Pattern Library** — safe starter structure for every module, using
  evidence placeholders rather than unsupported claims.
- **Evaluator Lens** — reads a draft as an evaluator would (a review aid, not an
  outcome prediction).
- **Tender Risk Radar** — flags scope, program, insurance, accreditation,
  client-data, addendum and returnable risks before drafting starts.
- **Commercial Assumptions Register** and **Claim Register** keep commercial
  positions and cross-section claims visible and gate export readiness.

## Stack

- **Frontend**: Vite + React 19 + TypeScript + Tailwind v4
- **Auth & DB**: Supabase (Postgres + Auth + Storage, with Row Level Security)
- **AI**: any OpenAI-compatible provider (tender extraction, drafting assistance)
- **Hosting**: Vercel
- **CI/CD**: GitLab CI, deploying to Vercel on merge

## Run locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```
   npm install
   ```
2. Copy the env template and fill in real values:
   ```
   cp .env.example .env.local
   ```
   Leave `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` blank to run in
   **demo mode** — every sign-in (including the Google/Microsoft buttons)
   succeeds instantly with no backend, so the full UI is reviewable with
   zero setup. Demo mode is active only in `npm run dev` or when
   `VITE_DEMO_MODE=true` is set explicitly; a production build with no
   Supabase credentials fails closed (sign-in errors) instead of silently
   becoming an open app.
3. Run the app:
   ```
   npm run dev
   ```

### Checks

```
npm run lint    # tsc --noEmit
npm run build   # production build
npm run test    # Vitest unit tests (engine, extraction, persistence, readiness, auth)
```

## AI (tender extraction & drafting)

AI runs **server-side** via the Vercel serverless function in `api/ai.ts`,
the only place the provider key is read. It's intentionally **not**
`VITE_`-prefixed, so it never reaches the browser bundle. The client
(`src/lib/ai.ts`) calls `/api/ai`; in demo mode it returns representative
sample output instead.

The endpoint speaks the **OpenAI-compatible Chat Completions API**, so you
can plug in any provider — OpenAI, Azure OpenAI, OpenRouter, Groq,
Together, Mistral, DeepSeek, Anthropic, or a local model (Ollama/vLLM) via
their OpenAI-compatible endpoints. Configure it with three
env vars (set them in your Vercel project, and `.env.local` for
`vercel dev`):

```
AI_API_KEY   your provider key      (required; falls back to OPENAI_API_KEY)
AI_BASE_URL  API base URL           (default https://api.openai.com/v1)
AI_MODEL     model id               (default gpt-4o-mini)
```

See `.env.example` for ready-to-use base URL / model combinations.

## Teammate invite emails (optional)

Sending invite emails uses two server-side variables (never `VITE_`-prefixed):

```
APP_BASE_URL     the trusted origin invite links are built from, e.g. https://thebidroom.com (required to send)
RESEND_API_KEY   Resend key for the actual send (optional; without it, invites fall back to copy-the-link)
INVITE_FROM_EMAIL  sender address (default: The Bid Room <onboarding@resend.dev>)
```

Invite links are always built from the trusted `APP_BASE_URL` — never from
the browser's origin — so a missing or invalid `APP_BASE_URL` returns a clear
server error rather than emitting a broken or attacker-controlled link.

## Setting up real authentication

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql` — this creates every
   table (including the Tender Blueprint tables and `tender_documents`),
   the multi-tenant Row Level Security policies, the three Storage
   buckets (tender documents, KB files, exports) with their own
   org-scoped RLS policies, and the trigger that auto-creates a profile
   on signup. Applying to an existing database instead? Run the
   incremental migrations in `supabase/migrations/` — most recently
   `2026-07-04_tender_blueprint.sql`, `2026-07-04_tender_documents.sql`,
   `2026-07-05_commercial_register.sql`, `2026-07-05_proposal_run.sql` and
   `2026-07-05_tender_closeout.sql`.
   If the bucket-creation statement fails on your plan, create the three
   buckets manually (Storage → New bucket, names exactly
   `tender-documents`, `kb-files`, `exports`, all non-public); the
   policies apply regardless.
3. Copy your project's URL and anon key from **Settings → API** into
   `.env.local` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
4. **Google sign-in**: create an OAuth Client ID at the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   set the authorized redirect URI to
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`, then paste
   the Client ID/Secret into Supabase's **Authentication → Providers → Google**.
5. **Microsoft sign-in**: register an app at the
   [Azure Portal](https://portal.azure.com) (App registrations → New
   registration), same redirect URI pattern, then paste the
   Application ID/Secret/Tenant ID into Supabase's
   **Authentication → Providers → Azure**.

Full details, including exact redirect URIs and required scopes, are
documented inline in `.env.example`.

## Deploying

### Vercel (recommended)
`vercel.json` is already configured for a Vite SPA. Connect the repo
in the Vercel dashboard, or run `vercel --prod` locally. Set the same
environment variables from `.env.local` in the Vercel project settings.

### GitLab CI
`.gitlab-ci.yml` runs type-checking and a production build on every
merge request, deploys a preview environment per branch, and deploys
to production on merge to `main`. Requires these CI/CD variables to be
set in **Settings → CI/CD → Variables**: `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, plus the same Supabase / AI provider
variables as local dev.

## Project structure

```
api/
  ai.ts                    Server-side AI endpoint (any OpenAI-compatible provider)
  send-invite.ts           Server-side invite email sending (Resend, optional)
src/
  App.tsx                  Root component, routing, session + data loading
  types.ts                 Shared TypeScript interfaces
  lib/
    supabase.ts             Supabase client singleton + demo-mode guard
    auth.ts                 Auth helpers (email/password, Google, Microsoft)
    db.ts                   Data-access layer: maps DB rows ⇄ app types, CRUD
    ai.ts                   Client wrapper for /api/ai (demo fallback)
    toast.tsx               App-wide toast notifications
    exportDocx.ts            Real .docx generation (lazy-loaded)
    exportCsv.ts             Real .csv generation
    exportPdf.ts             Real .pdf generation (lazy-loaded)
    realtime.ts              Supabase Realtime: presence + live-change reload
    requirementMatching.ts   Tender-to-KB matching + recommended clarifications
  blueprint/
    types.ts                 Tender Blueprint domain types (source of truth)
    engine.ts                Blueprint generation, module activation, evidence matching
    exportReadiness.ts       Pure, tested export-gating rules
    addendumService.ts       Addendum impact (live AI + provisional fallback)
    aiService.ts             Module drafting actions
  lib/
    docText.ts               Document text extraction (PDF/DOCX/XLSX/CSV) → analysis chunks
  components/
    PublicPages.tsx          Marketing site, login, signup
    TenderIntake.tsx         Upload & multi-document AI extraction of a new tender
    CommandPalette.tsx       Cmd/Ctrl+K global search & navigation
    NotificationCenter.tsx   Header bell: pending requests, clarifications, stale files
    Personnel.tsx            CV & personnel library, live tailoring notes
    Pricing.tsx              Custom rate card & commercial build-up
    TeamInvites.tsx          Team registry + real invite creation/acceptance
    AdminConsole.tsx         Read-only cross-org overview (platform-admin allowlist only)
    AdminPromptConsole.tsx   AI prompt tuning (admin only)
    ErrorBoundary.tsx        Recoverable per-page + app-level crash handling
    Onboarding.tsx           First-run org creation (create_org_and_join)
    ScheduleBuilder.tsx      Interactive delivery schedule
    OtherPages.tsx           Knowledge base, team, lessons learned, billing
    ui.tsx                   Shared UI primitives (Card, Pill, Drawer, ScoreRing…)
    blueprint/               The command-centre pages (Dashboard, Blueprint,
                             Requirements, Modules, Evidence, Drafts, Reviews,
                             Risks, Exports, Documents)
  data/
    mockData.ts              Seed/demo data (demo mode only)
supabase/
  schema.sql                 Full Postgres schema with RLS policies + onboarding RPC
  migrations/                Incremental migrations for existing databases
tests/                       Vitest unit tests (run with npm run test)
```

See `AUDIT.md` for the current production-readiness review — what's backed by
the database, what's deliberately provisional (e.g. OCR), and the test coverage.
