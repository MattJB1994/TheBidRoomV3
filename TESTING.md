# Testing Runbook — First Live Verification Session

> **Automated tests** run with `npm run test` (Vitest) and cover the blueprint
> engine, document extraction, persistence (blueprint + documents), export-
> readiness gating, addendum impact, and `/api/ai` fail-closed auth. This
> runbook is the complementary **manual** checklist for verifying the app end to
> end against a real Supabase project — the one thing the unit tests can't do.

This app has been built, typechecked and unit-tested extensively but each new
backend should still be **verified once against a live Supabase project**. This
is the checklist for that first real session — ordered by risk, not by feature
order, so if you run short on time the most important things get checked first.

---

## 0. Setup (once)

1. Create a Supabase project (supabase.com → New Project).
2. In the Supabase SQL Editor, paste and run the **entire** contents of
   `supabase/schema.sql` in one go. It should complete with no errors.
   - If it errors partway through, the whole thing rolls back (Supabase runs
     the SQL Editor in a transaction) — nothing is left half-created. Fix the
     reported line and re-run the whole file.
3. Supabase Dashboard → Storage → confirm three buckets exist:
   `tender-documents`, `kb-files`, `exports`, all **private** (not public).
   The schema tries to create these itself; if that insert failed silently
   (some plans restrict direct writes to `storage.buckets`), create them
   manually with those exact names.
4. Copy `.env.example` to `.env.local`. Fill in:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (Settings → API)
   - `AI_API_KEY` (any OpenAI-compatible provider — see `.env.example` for
     options) if you want to test real AI extraction/drafting
   - `APP_BASE_URL` (e.g. `http://localhost:3000` for local, your real domain
     in production) — required for invite emails; the link is always built
     from this, never the browser origin
   - Leave `RESEND_API_KEY` blank unless you want to test real invite emails
5. `npm install && npm run dev` locally, or `vercel dev` if you want the
   `/api/*` serverless functions to work too (plain `npm run dev` won't serve
   those — AI and invite-email features will silently no-op without them).

---

## 1. Security-critical — check these FIRST

These are the things where "looks fine" and "is actually fine" can differ,
and where a bug means real data exposure, not just a broken button.

- [ ] **Sign up as User A**, go through onboarding, create an org named
      "Test Org A". Confirm you land on the dashboard with an **empty**
      workspace (no Cindervale/TMTA fictional data — that's demo mode only).
- [ ] **Open a second browser (or incognito) as User B**, sign up, create a
      **different** org "Test Org B". Import a tender, add a KB file.
- [ ] Switch back to User A. Confirm you **cannot see** User B's tender, KB
      file, or org name anywhere — not in the dashboard, not in the command
      palette (⌘K) search, not in Knowledge Base. This is the core RLS
      promise; if it fails, stop and tell me immediately, this is the most
      important thing in the whole app.
- [ ] As User A, try the **teammate invite** flow: create an invite, copy the
      link, open it in a third browser/incognito session, sign up fresh.
      Confirm you land in **Test Org A**, not a new org, with the role you
      set.
- [ ] **Invite link origin**: with `RESEND_API_KEY` + `APP_BASE_URL` set, send
      an invite email and confirm the link uses `APP_BASE_URL`. Unset
      `APP_BASE_URL` and confirm sending returns a clear server error rather
      than a broken link.
- [ ] **Upload validation**: try uploading an unsupported type (e.g. `.zip`)
      and an oversized file — both should be rejected in the UI with a clear
      message and never appear in Storage. Upload a file with a messy name
      (`Tender Addendum #1 (Final).pdf`) and confirm the stored object path is
      a clean slug while the displayed name is preserved.
- [ ] **Blueprint re-analysis safety**: edit a draft / approve a review, then
      click Re-analyse. Confirm you're warned first, and after confirming, your
      draft and review decision are preserved.
- [ ] **Commercial register**: open the Commercial page, acknowledge/approve an
      item, and confirm open items block the pricing-assumptions export and
      show on the dashboard.
- [ ] **Unsupported-claims check**: in Drafts, write "we have a proven track
      record" with no case-study evidence linked and run *Check unsupported
      claims* — it should flag the claim.
- [ ] **Proposal Run Through**: in Drafts, click *Generate First Pass Across All
      Sections* (fills every activated module, labelled working drafts). Add
      section notes and global proposal notes and confirm they persist. Click
      *Run Full Proposal Pass*; if a section was hand-edited, confirm you're
      asked to preserve / blend / replace. Check *Versions* shows the run, and
      *Restore snapshot* works.
- [ ] **Controlled Loops**: click *Run controlled loop checks* and confirm the
      loop report shows ready/blocked sections and next actions; a section with
      an unsupported claim or missing evidence should be Blocked, and no section
      should reach Approved without human review.
- [ ] **Evaluator Lens**: in a module's *More* menu, run *Evaluator Lens* and
      confirm it returns a rating + improvements (a review aid, not a score
      guarantee).
- [ ] **Risk Radar**: on the Risks page, click *Run Risk Radar* and confirm it
      adds tender risks (e.g. insurance gap, unreviewed addendum) with category
      and severity, de-duped on re-run.
- [ ] **Response templates**: on an empty module, *Start with template* inserts
      structure with bracketed evidence placeholders (no unsupported claims);
      *Prefill all activated modules* fills every empty one.
- [ ] **Worked example** (demo mode): from the public homepage, click *Open worked
      example* — it should load the Bluewater tender (not just navigate) and land on
      the dashboard. Also try it from the dashboard "Recent projects" header when
      tenders already exist. Confirm it's labelled "Example project", loads
      instantly (no AI/network wait), and can be reset via the badge.
- [ ] **Two examples**: after loading, the switcher shows both Bluewater
      (mid-workflow) and Riverside (a won tender, green "Won" pill). Open
      Closeout & Memory on Riverside to see the Won banner and populated Client &
      Sector Memory.
- [ ] **Route fallback**: open Commercial and Closeout — neither should show the
      dashboard bleeding through underneath.
- [ ] **Stage stepper & tabs**: on Requirements/Modules the stepper highlights
      Blueprint; on Commercial/Risks it highlights Gaps; the in-stage tab strip
      switches between sibling pages.
- [ ] **Guided Draft**: on the Draft page, confirm the proposal area shows one
      primary action that changes with state (Generate first pass → Draft
      remaining → Run full proposal pass → Prepare for review), with the rest under
      "More actions". Per module, one primary action reflects state (Start section
      / Add notes / Improve section / Resolve issues / Send for review), and AI
      rewrites/checks sit under "Improve with AI".
- [ ] **Proposal Checks**: on the Review page, confirm the Proposal Checks panel
      shows the six checks with Passed / Needs attention / Blocked, and the
      discipline gates remain below.
- [ ] Rate limiter: as User A, if you have `AI_API_KEY` configured, click
      "Draft with AI" or run tender extraction ~21 times in under a minute
      (a bit tedious, but this is the one that protects your wallet). The
      21st should return a 429 "Too many AI requests" error, not silently
      keep working.
- [ ] Platform admin console: you should **not** see "Platform Admin" in the
      sidebar for either test user (nobody's on the allowlist yet). If you
      want to test it, go to Supabase SQL Editor and run:
      `insert into platform_admins (id) values ('<your-user-uuid>');`
      then reload — the nav item and `/admin-console` page should now work
      and show both test orgs' names and counts, read-only.

## 2. Core workflow — the main value path

- [ ] Tender Intake: upload a real PDF (or use "Use Sample RFT File" if you
      don't have `AI_API_KEY` configured). Confirm it lands on the
      Opportunity page with real MATCHED/REQUESTED/GAP items generated from
      your Knowledge Base — not just the seeded demo ones.
- [ ] Compliance Matrix: change a few statuses, confirm they persist after a
      page refresh (this is the real tell for "did it actually save to the
      database" vs "just local state").
- [ ] Drafting Studio: click "Draft with AI" on a section (needs
      `AI_API_KEY`), confirm it fills the editor without auto-saving, then
      click "Save Work" and refresh to confirm persistence.
- [ ] Review Gate: work through the checklist, then actually download each
      export (docx, csv, pdf) and **open the files** — confirm they're real,
      not empty or corrupted.
- [ ] Knowledge Base: upload 2-3 real files (multi-select at once), confirm
      each becomes its own record with the correct size, and that "View"
      opens the actual file. Search for a word you know is in one of the
      documents — full-text search needs a moment after upload (background
      text extraction) before it'll find content, not just filenames.

## 3. Secondary features — check if time allows

- [ ] Pricing Tool: add a custom rate, add a pricing line, refresh, confirm
      both persisted.
- [ ] Personnel: edit a profile (headline, add a project history entry),
      refresh, confirm it persisted. This exercises a fix made during static
      review — worth double-checking specifically.
- [ ] Scheduler: add a few tasks with dependencies, toggle "Highlight
      Critical Path," confirm the critical chain and float numbers look
      sane for the dependency structure you built.
- [ ] Real-time: open the same tender in two browser tabs as the same user
      (or two team members in the same org). Edit a compliance item's status
      in one tab, confirm the other tab updates within ~1 second (via the
      Realtime subscription) without a manual refresh. Also check for a
      small colored avatar in the header showing the other tab is "present."
- [ ] Mobile: shrink the browser window / use dev tools device emulation.
      Confirm the sidebar becomes a slide-in drawer and nothing overflows
      horizontally.

## 4. What's expected, not a bug

- The build prints a "chunks are larger than 500 kB" warning — expected,
  not an error. The two largest chunks (`docx`, `pdf-lib`) only load when
  you actually click an export button, not on initial page load.
- `npm audit` reports vulnerabilities — all of them are in `@vercel/node`'s
  dev-only tooling (used to type the serverless functions), not runtime
  code. `npm audit --omit=dev` shows zero.
- Billing and the general Settings copy are intentionally static — no
  payment processor is wired up; that's a separate, larger project.
- If `AI_API_KEY` isn't set, AI features fall back to clearly-labeled
  representative sample output rather than erroring — that's the
  demo-mode fallback working as intended, not a broken integration.

## 5. If something breaks

The single most useful thing to bring back is the **exact error text**,
plus which of these three places it came from:
1. A red toast in the UI (usually means a Postgrest/Supabase error — the
   toast text is the actual database error message, not a generic one)
2. The browser console (`F12` → Console tab) — most useful for anything
   that fails silently with no toast
3. The Supabase Dashboard → Logs → API/Postgres logs, if the browser
   console doesn't show enough

With that, I can go straight to the relevant file instead of guessing.
