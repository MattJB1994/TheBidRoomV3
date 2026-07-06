# The Bid Room — Audit & Production-Readiness Review

**Last updated:** 4 July 2026
**Scope:** Full review of the Vite + React 19 + Supabase codebase, tracking the
work from UI prototype to a backend-backed, tested proposal automation platform.
**Build status:** `npm run lint` (tsc) clean · `npm run build` succeeds ·
`npm run test` 38 passing · `npm audit --omit=dev` 0 vulnerabilities ·
`supabase/schema.sql` parses.

---

## Executive summary

The Bid Room is a proposal command centre for engineering, rail and
infrastructure bid teams. It takes the documents a client issued for a tender,
extracts a source-referenced requirements register, activates the proposal
modules the tender actually needs, maps evidence against the knowledge base,
runs discipline review gates, and produces gated export packs.

The application is wired to its backend. When Supabase is configured, tenders,
the knowledge base, the full Tender Blueprint (requirements, modules, evidence,
drafts, reviews, risks, addenda, exports), and uploaded tender documents are all
persisted and reload after refresh and across team sessions, each isolated per
organisation by row-level security. AI extraction and drafting run server-side
through an authenticated `/api/ai` endpoint that holds the provider key. When
Supabase is **not** configured the app runs in a clearly-labelled demo mode on
representative sample data, so the whole product is reviewable without
infrastructure.

This document records the current honest state: what is real, what is
deliberately provisional, and what remains. It is not a list of pending backend
wiring — that wiring is done.

---

## What is real and backed by the database

**Persistence.** `src/lib/db.ts` is the data-access layer. It reads and writes
tenders, KB files, compliance items, proposal sections, info requests,
recommended clarifications, audit entries, the Tender Blueprint aggregate, and
tender documents. All of it is org-scoped and exercised through the RLS policies
in `schema.sql`. A refresh no longer resets state on a connected backend; a
second team member sees what the first created.

**Tender Blueprint persistence.** The blueprint is stored as one core row per
tender (`blueprints`) plus one row per entity in seven child tables
(`blueprint_requirements/_modules/_evidence/_reviews/_risks/_addenda/_exports`).
Each child row carries the full typed entity as jsonb, with a few columns pulled
out for querying. Drafts live on `blueprint_modules` (they have no identity apart
from their module). `saveBlueprint` / `loadBlueprints` handle the round-trip; the
app loads blueprints with the workspace and debounce-saves every mutation.
Migration: `supabase/migrations/2026-07-04_tender_blueprint.sql`.

**Tender document persistence.** Every uploaded tender document is text-extracted,
uploaded to the `tender-documents` Storage bucket at
`{org_id}/{tender_id}/{document_id}/{filename}`, and recorded in the
`tender_documents` table with its extraction result. The `org_id` in the path is
derived server-side from the authenticated profile — never from a caller
argument — and the bucket's storage policies enforce the same first-segment org
check. Documents reload after refresh and are visible to the whole team, and
their stored extracted text is reused for addendum analysis and evidence review
without re-parsing. Migration: `supabase/migrations/2026-07-04_tender_documents.sql`.

**Multi-document analysis.** `src/lib/docText.ts` text-extracts every uploaded
document (PDF text layer via pdfjs-dist, DOCX via mammoth, XLSX via exceljs,
CSV/TXT natively) with page/sheet markers, then `buildTenderContext` assembles a
budgeted, named set of chunks. `extractTenderFromDocuments(files)` sends *all* of
them to analysis — not just the first file. Scanned PDFs (no text layer) are
detected and reported honestly; OCR is a declared future hook, not faked.

**AI extraction schema.** `/api/ai` `extract` returns a full blueprint input:
summary, submission instructions, deadline/time, weighted criteria, limits,
insurances, accreditations, and a `requirements[]` register where each entry
cites its source document, clause reference and extraction confidence. The engine
consumes this as the primary path; the legacy metadata arrays remain the demo
fallback.

**Content-based evidence matching.** `src/blueprint/engine.ts` scores evidence by
`kb_files.content_text` overlap (strongest signal), filename, and category
affinity, above a confidence threshold, and returns a confidence score and a
human-readable reason. A correctly-named-but-wrong-category file still beats
nothing; a stale match is surfaced as "needs checking", not "found".

**Addendum impact.** `src/blueprint/addendumService.ts` extracts an addendum's
text and analyses it against the live requirement register via `/api/ai`
`addendum`. The impact links to its source document, affected requirements and
modules, the review task and the risk it creates — and those links survive
persistence. Where no analysis can run (demo, scanned, AI down) the result is a
clearly-labelled **provisional** assessment requiring human review, never a fake
success.

**Export readiness.** `src/blueprint/exportReadiness.ts` (pure and unit-tested)
gates each pack on what actually matters: the full proposal requires drafts,
mandatory requirements answered, evidence found or formally waived, word limits
met, addenda reviewed, module gates approved and final approval. Internal working
exports stay live by design because their purpose is reporting current state.

**Authentication.** Email/password plus Google/Microsoft OAuth via `lib/auth`.
The `/api/ai` endpoint fails closed: without a valid bearer token every task is
refused (including the status probe), the provider key never reaches the browser,
and per-user rate limits cap spend.

---

## Deliberately provisional / documented limitations

- **OCR for scanned PDFs is not implemented.** Scanned/image-only PDFs are
  detected and flagged (`extraction_status = 'scanned'`); they are skipped in
  analysis with an honest note rather than silently dropped or fake-parsed. The
  extraction pipeline is structured as a service boundary so a server-side
  extractor (with OCR) can populate the same `tender_documents` columns later
  without any client change.

- **Blueprint saves are whole-document with conflict detection, not per-entity.**
  `saveBlueprint` replaces a tender's child rows and checks the server's
  `updated_at` against the baseline we loaded; if a teammate saved in between, the
  write is refused with `BlueprintConflictError` and the app reloads their copy
  instead of overwriting it. This is safe for a small bid team but is not
  operational-transform-grade concurrent editing.

- **Legacy binary `.xls` is not parsed.** exceljs handles `.xlsx`; `.xls` is
  refused with a note asking for a re-saved `.xlsx`. (The previous `xlsx` package
  was removed for a high-severity advisory — see below.)

- **Realtime does not yet subscribe to the blueprint/document tables.** Reload on
  conflict is manual-trigger, not push. Debounced saves plus conflict detection
  cover the common cases; live co-editing would need Supabase realtime channels.

- **Demo re-analyse uses the sample.** In demo mode, re-analysing a tender returns
  the built-in sample extraction (clearly noted in the UI), since there is no
  provider to call.

---

## Security posture

- **Row-level security on every workspace table**, including the blueprint and
  document tables, scoped by `current_org_id()`. Cross-org reads are impossible
  at the database layer.
- **Storage paths derive org from the authenticated profile**, never client
  input; bucket policies check the first path segment independently (defence in
  depth). A failed document insert cleans up its orphaned storage object.
- **AI provider key is server-only.** `/api/ai` verifies the Supabase bearer
  token before any provider call and rate-limits per user.
- **`npm audit --omit=dev` reports 0 vulnerabilities.** The `xlsx` package (an
  unpatched high-severity prototype-pollution/ReDoS advisory, and a real risk
  since tender pricing schedules are XLSX) was replaced with the maintained
  `exceljs`. exceljs's transitive `uuid` pin is forced to a patched version via a
  `package.json` override.

---

## Testing

`npm run test` runs Vitest (38 tests, 7 files):

- **engine.test.ts** — blueprint generation from a tender, the rich
  source-referenced path (provenance, no legacy duplication, extracted
  summary/risks/clarifications), content-based evidence matching (misnamed file
  matched by content with a reason; stale → check), activation rules, review-gate
  creation, empty-KB → all-missing.
- **docText.test.ts** — DOCX/XLSX(exceljs)/CSV extraction, honest `.xls` and
  unsupported-type refusals, multi-document context assembly, truncation notes.
- **exportReadiness.test.ts** — the full-proposal gate unlocking step by step, an
  unreviewed addendum re-blocking, the exec-summary gate, internal packs always
  ready.
- **addendum.test.ts** — provisional labelling, valid-id-only flagging, review
  task / risk linkage, immutability of the source blueprint.
- **db.blueprint.test.ts** — org-scoped child writes, conflict detection before
  any destructive delete, load reassembly.
- **db.documents.test.ts** — org-derived storage path, extracted-text cap,
  storage cleanup on insert failure, refusal without an org, load grouping.
- **api.auth.test.ts** — `/api/ai` fails closed (405 on GET; 401 on
  draft/extract/status/malformed-token).
- **api.ratelimit.test.ts** — over-limit → 429; rate-limit lookup failure fails
  CLOSED with 503 in production (no unmetered spend, no leaked DB error); a valid
  under-limit request proceeds.
- **uploadValidation.test.ts** — filename sanitisation (spaces, specials,
  uppercase, path traversal, diacritics, disguised extensions) and size/type
  enforcement.
- **invite.test.ts** — invite links resolve from a valid `APP_BASE_URL`;
  missing/invalid/non-http(s) values fail safely.
- **reanalysis.test.ts** — re-analysis preserves drafts, review decisions,
  resolved evidence, addenda and the commercial register while still refreshing
  structure; commercial-register seeding.
- **unsupportedClaims.test.ts** — claim-vs-evidence detection (experience,
  accreditation, personnel, insurance, absolute-compliance wording).

---

## Production hardening pass (5 July 2026)

Security and safety fixes, plus the product sharpened toward small/mid
infrastructure bid teams.

**Security**
- **Invite links use a trusted `APP_BASE_URL`, never the client origin.** The
  request body no longer carries `origin`; the server validates `APP_BASE_URL`
  (absolute http/https) and fails clearly if it's missing/invalid.
- **AI rate limiting fails closed in production.** A rate-limit lookup failure
  now returns 503 ("AI usage check failed") in production instead of silently
  allowing the request; dev/demo may fail open. The raw DB error is logged
  server-side, never sent to the client. Unauthenticated requests are still 401,
  and the provider key never reaches the browser.
- **Uploaded filenames are sanitised before Storage.** `sanitizeFileName` turns
  display names into safe lowercase slugs (no spaces, slashes, path traversal or
  unexpected extensions); the storage path uses the slug and the row keeps the
  original name. `src/lib/uploadValidation.ts` is the single source of truth.
- **File type and size are enforced consistently** (PDF/DOCX/XLSX/CSV/TXT/MD,
  25 MB cap) in the UI (FileDropzone) AND the storage layer (`addTenderDocument`),
  so a rejected file is never extracted and never uploaded.

**Safety**
- **Blueprint re-analysis no longer silently overwrites manual work.** An
  `editedAt` marker records team edits; re-analysis warns first, then merges
  drafts, review statuses, owners, resolved evidence, addenda and the commercial
  register onto the freshly regenerated structure (`mergeManualWork`). Whole-
  blueprint conflict detection (from the previous pass) still applies.
- **Scanned PDFs stay honest.** The status pill and note now spell out that a
  scanned/image-only PDF was not analysed (no OCR), is still stored and usable as
  evidence, and that a text-based version should be uploaded for analysis.

**Product / positioning**
- **Commercial Assumptions Register** is now a first-class feature: a typed,
  reviewable register (pricing assumptions, exclusions, departures, dependencies,
  contract concerns) with its own page, seeded from the tender's commercial
  signals, persisted (`blueprint_commercial` table), and gating the commercial
  export packs plus feeding the dashboard's commercial tile.
- **Unsupported-claims check** in drafting flags claims a draft makes without
  matching linked evidence (experience without a case study, accreditation
  without a certificate, personnel without a CV, etc.) — plus a "prepare for
  review" readiness read. Explainable, deterministic rules.
- **Dashboard next-best-actions**: an ordered, specific to-do list drawn from
  live bid state, each linking to where the work happens.
- **Public site + copy** sharpened to the infrastructure command-centre
  positioning and the named flagship features.

**Required environment variables (production)**
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `AI_API_KEY` (+ optional
`AI_BASE_URL`, `AI_MODEL`), and `APP_BASE_URL` (for invite emails). Optional:
`RESEND_API_KEY`, `INVITE_FROM_EMAIL`, `VITE_DEMO_MODE`.

**Known limitations (unchanged)**
- OCR for scanned PDFs is not implemented (flagged honestly, not faked).
- Blueprint saves are whole-document with conflict detection + manual-work merge,
  not per-entity operational-transform editing.
- Realtime doesn't yet push blueprint/document/commercial changes; reload on
  conflict is manual-trigger.
- Demo re-analyse uses the sample extraction.

---

## Historical note

Earlier revisions of this document described the app as an unwired UI prototype
with simulated AI and in-memory data. That is no longer accurate and those
sections have been removed to avoid contradiction. The persistence, AI, document,
blueprint and test layers described above are the current state of the code in
this repository.

---

## Intelligence layer pass (5 July 2026)

The next differentiation layer on top of the hardened base. Every feature is
deterministic where it needs to be testable, and honest about what it does and
doesn't do (no outcome predictions, no self-approval, no fabricated evidence).

**Proposal Run Through (two-pass whole-proposal drafting)** —
`src/blueprint/proposalRun.ts` (ProposalNarrativeEngine): first pass across all
activated modules, full run-through with a master prompt and section-dependency
map, repetition/consistency check, claim register, review-ready prep, and version
history. Section notes + global proposal notes persist and feed every pass.
Manual edits are never silently overwritten (preserve / blend / replace / compare).

**Prompt Composer** — `src/blueprint/promptComposer.ts`: builds the AI
instruction from structured layers (safety rules, master prompt, sector, tender
type, blueprint, module pattern, requirements, evidence + gaps, section/global
notes, commercial assumptions, addenda, sibling drafts, claim register,
terminology, output rules). The raw master prompt is NEVER shown to normal users;
they see a transparent generation summary of what went in.

**Response Pattern Library** — `src/blueprint/responsePatterns.ts`: per-module
default structure + SAFE starter text. Hard rule: starter text makes no
unsupported claims — it uses bracketed evidence prompts (e.g. "[Insert relevant
project evidence…]") never "we have extensive experience…". Powers "Start with
template" and "Prefill all activated modules".

**Controlled Proposal Loops** — `src/blueprint/proposalLoops.ts`: loops each
section through requirement → evidence → repetition → commercial → addendum →
human-review → export-readiness with CLEAR STOP CONDITIONS. Never endless
autonomous revision (AI revisions capped at MAX_AI_REVISIONS = 3); never marks
its own work approved; export-ready only when requirements answered, evidence
found/waived, addenda reviewed, commercial resolved and human review approved.
Proposal-wide loop report shows ready/blocked, gaps, claims and next actions.

**Evaluator Lens** — `evaluatorLens()` in `aiService.ts`: reads a draft as an
evaluator would (requirement coverage, specificity, evidence linkage, generic-
language penalties) and returns a rating, quality estimate, findings,
improvements and unsupported claims. Explicitly a review aid, NOT an outcome
prediction.

**Tender Risk Radar** — `src/blueprint/riskRadar.ts`: flags tender risks before
drafting (unclear scope, program feasibility, insurance/accreditation gaps,
client-data reliance, design warranty, pricing inconsistency, addendum scope
change, unresolved clarifications, missing returnables), each with category,
source clause, affected module, severity, suggested action and export impact.
Surfaced via "Run Risk Radar" on the Risks page, de-duped into the register.

**KB / evidence upload hardening** — `addKbFile()` now validates type/size and
sanitises the storage filename (original name preserved as display), matching the
tender-document path. Orphan cleanup on insert failure.

**Schema changes** — `proposal_notes` jsonb column on `blueprints`;
`blueprint_claims` and `blueprint_versions` child tables (migration
`2026-07-05_proposal_run.sql`). Section notes, first-pass meta and loop state ride
on the existing `blueprint_modules.data` jsonb, so no columns were needed for
them.

**Tests added** — proposalRun (10), promptComposer + patterns (7), proposalLoops
(12), evaluatorLens (4), riskRadar (6), plus the KB upload tests. Suite: 113
tests / 18 files.

**Deliberately scaffolded, not overclaimed** — SME Request Builder,
Clarification/Departures Generator, Submission Pack Builder, Tender Closeout
Learning and Client/Sector Memory are represented in the data model and adjacent
features (commercial register, evidence actions, exports, lessons-learned) but are
not claimed as complete standalone engines in this pass. The app does not pretend
to "know" a client it has no data for.

---

## Integration pass (5 July 2026)

Wired the intelligence layer through the product and closed the scaffolds into
real features.

**Prompt Composer now drives all module drafting.** Every drafting action
(generate, strengthen, add-evidence, more-technical/executive, shorten, expand,
rewrite-for-evaluator, add-case-study, add-risks, and the check actions) composes
its prompt through `composePrompt()` — the layered blueprint/pattern/requirements/
evidence/notes/commercial/addenda/claim-register/terminology context — and sends
that to the model. Users still never see the raw prompt; the right rail shows the
generation summary. (aiService takes a `composedPrompt` field, composed by the
caller, to avoid the proposalRun↔promptComposer import cycle.)

**Five new dedicated infrastructure modules** — `construction-methodology`,
`possession-access-planning`, `stakeholder-management`, `quality-management` and
`environmental-management` are now real `ModuleKey`s with catalogue entries,
activation rules, response patterns, section-dependency entries and review
disciplines — not folded into other modules.

**SME Request Builder** (`clarificationBuilder.ts`) — turns a missing-evidence
item into a titled, copyable request with required input, linked requirement +
module, evidence needed, suggested recipient role and a drafted message ("Can you
provide …? This is required for REQ-014 from clause 7.1 and is blocking the …
section."). Surfaced from the Evidence page's "Ask SME" action.

**Clarification & Departures Generator** (`clarificationBuilder.ts`) — converts
ambiguous clauses, client-data reliance, commercial risks and unmet mandatory
requirements into typed items (clarification / assumption / exclusion /
qualification / departure / provisional / client dependency) with source clause,
reason, proposed wording, reviewer role and export impact. Surfaced on the
Commercial page; items can be copied or added to the register.

**Submission Pack Builder** — the Exports page is now "Submission Pack" with a
readiness summary panel showing required-packs ready count and what's blocking the
whole pack (open review gates, unreviewed addenda, open commercial items, missing
packs with reasons). Added a Clarification Register export.

**Tender Closeout Learning** — `closeout` on the blueprint (outcome, feedback,
what worked / slowed us, evidence & sections reused, gaps, lessons, commercial and
addenda lessons, reusable patterns), persisted via the `closeout` jsonb column
(migration `2026-07-05_tender_closeout.sql`). New Closeout & Memory page.

**Client & Sector Memory** (`clientMemory.ts`) — groups reusable insights (common
requirement types, evidence, commercial assumptions, module patterns, terminology)
by client / sector / tender type, derived only from blueprints in the workspace.
It never invents data for a client it has none for.

**Tests** — integration pass adds prompt-composer-in-drafting, new-module
activation, SME message generation, clarification generation, submission-pack
blocked reasons, closeout shape and memory grouping. Suite: 123 tests / 19 files.



---

## Simplification & worked-sample pass (5 July 2026)

Made the depth usable: the same intelligence, presented as one calm workflow with
a worked sample to explore.

**Seven-stage workflow navigation** — `src/blueprint/workflow.ts` defines the
stages Intake → Blueprint → Gaps → Draft → Review → Submit → Closeout. Each maps
to an existing page (nothing was removed; secondary pages — Requirements, Modules,
Commercial, Risks — moved under a "More" group and stay reachable via the command
palette). A persistent `StageStepper` (`components/WorkflowUI.tsx`) shows where you
are and each stage's status (done / current / blocked), computed by
`computeStageStatuses`.

**Next Best Action** — `computeNextBestAction` derives the single most useful next
step from live state (unreviewed addendum > mandatory gaps > evidence gaps > open
commercial > drafting > reviews > submit > closeout), with why-it-matters and
what-it-unlocks. Rendered as one primary panel at the top of the dashboard rather
than scattered buttons.

**Consolidated Gaps view** — the old Evidence page is now "Gaps" and opens with a
summary of everything outstanding (missing evidence, open mandatory requirements,
open commercial items, addenda to review), each linking to the right place.

**Bluewater Junction worked sample** — `src/demo/bluewaterSample.ts`. A fully
worked, deterministic RFT that loads instantly with NO AI and NO Supabase (the
sample tests mock both to throw, proving it). It's intentionally imperfect —
8 documents including a scanned/OCR-limited addendum, evidence gaps (incl. an
Assurance Lead CV and an expired insurance certificate), open commercial
assumptions, an unreviewed addendum, unsupported and repeated claims, blocked
exports, drafts at various stages, and a partially completed closeout — so every
part of the workflow has something real to show. Loaded from the first screen via
"Load worked sample"; re-loading resets it. Clearly badged as a demo sample.

**Calmer marketing copy** — the hero leads with the guided workflow ("Run the
whole tender, one clear step at a time") and offers the worked sample, rather than
feature-listing.

**Tests** — worked-sample content + "no AI/Supabase" guarantees (12) and workflow
stage/next-action logic (7). Suite: 142 tests / 21 files.
---

## Polish pass (5 July 2026)

Finished the simplification and fixed two real bugs.

**Route fallback bug fixed** — `commercial` and `closeout` were missing from
`knownPrivatePages` in `App.tsx`, so those two pages rendered with the Dashboard
fallback underneath. Both added. A new safeguard test
(`tests/routeFallback.test.ts`) parses the route switch and fails if any
`currentPage === 'x'` route is not in `knownPrivatePages`, so this class of bug
can't recur silently.

**Worked-example CTA fixed** — the public homepage "Explore the worked sample"
button only navigated to the dashboard; it now loads the sample. `PublicPages`
takes an `onOpenWorkedExample` callback wired to the loader; the button reads
"Open worked example" and, in demo mode, loads Bluewater then lands on the
dashboard. The dashboard also exposes "Open worked example" in the portfolio
header, not only on the empty state.

**Wording** — the product UI now calls the sample a "worked example / example
project", never "demo sample / demo mode". A wording safeguard test
(`tests/workedExampleWording.test.ts`) locks this in.

**Second worked example (Riverside, Won)** — `src/demo/riversideSample.ts` adds a
finished, won water-sector RFT (all sections approved, all reviews approved, a
completed positive closeout with reusable patterns). `src/demo/sampleRegistry.ts`
loads both samples together, so the tender switcher feels real and Client & Sector
Memory has more than one tender to group. The Closeout page shows a Won/Lost
outcome banner, and the dashboard portfolio marks won tenders with a green pill.

**Navigation polish** — the workflow stepper now also renders on the stage
sub-pages (Requirements/Modules under Blueprint; Commercial/Risks under Gaps) via
`SUB_PAGE_STAGE`/`WORKFLOW_PAGES`, with a compact inline Next Best Action on every
workflow page and an in-stage tab strip (`StageTabs`) so sibling pages read as one
surface.

**Tests** — Riverside sample + populated memory (6), route-fallback safeguard (3),
wording/accessibility safeguard (5). Suite: 156 tests / 24 files.
---

## Draft & Review simplification pass (5 July 2026)

The last two feature-heavy screens brought in line with the calm workflow.

**Draft is now a guided writing flow.** The old six-button proposal-wide toolbar
(first pass / full run / consistency / review-ready / prefill / loop checks) is
replaced by a single state-aware primary action — draft everything → run the full
pass → prepare for review — with everything else moved into a "More actions"
menu. Per module, one primary action follows the module's state (Start section →
Add notes → Improve section → Resolve issues → Send for review), and every AI
rewrite/check lives under an "Improve with AI" menu rather than a row of visible
buttons. Prompt Composer stays hidden; the "Generated using" summary remains.

**Review now leads with Proposal Checks.** A plain-language panel shows six checks
— Requirement coverage, Evidence support, Repetition, Commercial consistency,
Addendum impact, Human review — each Passed / Needs attention / Blocked, computed
from the controlled-loop engine and the blueprint. The discipline review gates and
final sign-off remain below; the raw loop internals are no longer the default view.

**Tests** — source-structure safeguards for the guided Draft flow and the Review
Proposal Checks (7). Suite: 163 tests / 25 files.
---

## Calm visual redesign (5 July 2026)

A theme + primitives pass to reduce visual load while keeping every feature.

**Palette & type** — warm off-white canvas (#FAFAF8), ink text (#1A1A2E) and a
single deep-indigo accent (#4F46E5), defined as CSS variables in `index.css` and
applied globally. One sans family everywhere: `--font-serif` and `--font-mono` are
aliased to Inter, and the Lora / JetBrains Mono imports are gone, so the ALL-CAPS
mono labels and serif display on Knowledge Base, Billing and Master Prompt now
match the core app.

**Shared primitives** (`components/ui.tsx`) — the calm direction propagates from
here to every screen:
- `Card`: a single subtle border and larger radius (no competing border+shadow),
  with 24px padding used on the key screens.
- `PrimaryButton`: the indigo accent instead of near-black slate-900.
- `Pill`: semantic colours reserved strictly (green=done, amber=attention,
  red=blocking); informational blue/indigo tones now render as neutral gray.
- `EmptyState`: one friendly line and one action, no dashed boxes.

**Dashboard** — the 9-tile grid is replaced by one readiness ring plus at most
four stat cards showing only non-zero values; everything clear collapses into a
single "All clear: …" line. The duplicate "Open blueprint / Fix gaps / Exports"
button row and the redundant "Next best actions" list are removed — those live in
the pipeline and the single Next Best Action panel.

**Gaps** — a single-column list; each gap card has one primary action ("Upload")
plus a "•••" overflow menu holding Link existing / Ask SME / Clarify / Add risk /
Not required. Metadata is trimmed to at most two badges per row.

**Nav** — the sidebar now defaults to collapsed icons; the horizontal seven-step
pipeline remains the primary workflow nav with in-stage tabs.

**Colour restraint** — Knowledge Base category colours (a five-hue rainbow) are
neutralised to gray; a leftover dark indigo gradient card in the schedule tool and
cool-slate `#F8FAFC` grounds are warmed to the new canvas.

**Tests** — calm-theme safeguards (8): palette tokens, one font, accent primary
button, neutralised pills, single-border cards, one dashboard ring, the all-clear
line, and no duplicate actions list. Suite: 171 tests / 26 files.
