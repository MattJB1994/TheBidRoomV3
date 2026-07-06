-- The Bid Room — Supabase schema
-- Run via the Supabase SQL editor, or `supabase db push` with the CLI.
--
-- Mirrors the TypeScript types in src/types.ts. Multi-tenant: every
-- table is scoped to an organization via org_id, and Row Level Security
-- ensures a user can only ever see rows belonging to their own org —
-- this is the actual enforcement mechanism, not just app-layer logic.

-- ── Organizations & membership ──────────────────────────────────────

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  created_at timestamptz default now()
);

create table profiles (
  -- One row per Supabase auth user, created via the trigger below.
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references organizations(id),
  full_name text,
  email text not null,
  role text not null default 'CONTRIBUTOR'
    check (role in ('OWNER','ADMIN','BID_MANAGER','TECHNICAL_REVIEWER','COMMERCIAL_REVIEWER','CONTRIBUTOR','VIEWER')),
  avatar_url text,
  created_at timestamptz default now()
);

-- Auto-create a profile row whenever someone signs up (email/password
-- or OAuth — both go through auth.users the same way in Supabase).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Onboarding: a freshly signed-up user has org_id = NULL, which means
-- every org-scoped RLS policy below evaluates to false and the user can
-- see and create nothing — they are locked out until they belong to an
-- org. This security-definer function is the supported way to bootstrap
-- that first org. It creates the organization and makes the caller its
-- OWNER, but only if they don't already belong to one (so it can't be
-- used to jump between tenants — that path is the privilege-escalation
-- guard's job). Call it from the app's post-signup onboarding screen:
--   await supabase.rpc('create_org_and_join', { org_name, org_domain })
create or replace function public.create_org_and_join(org_name text, org_domain text default null)
returns uuid as $$
declare
  new_org_id uuid;
  existing_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create an organization';
  end if;
  select org_id into existing_org from public.profiles where id = auth.uid();
  if existing_org is not null then
    raise exception 'You already belong to an organization';
  end if;
  if org_name is null or length(trim(org_name)) = 0 then
    raise exception 'Organization name is required';
  end if;

  insert into public.organizations (name, domain)
  values (trim(org_name), org_domain)
  returning id into new_org_id;

  update public.profiles
    set org_id = new_org_id, role = 'OWNER'
    where id = auth.uid();

  return new_org_id;
end;
$$ language plpgsql security definer;

-- ── Teammate invites ─────────────────────────────────────────────────
-- The RLS-friendly way to invite someone who doesn't have an account
-- yet: an admin creates an invite row (org-scoped, readable only by
-- their own org — no public read policy, so a token can't be browsed or
-- enumerated), shares the resulting link out-of-band (copy/paste, or
-- wire a real email provider — this app has none configured), and the
-- invitee calls accept_invite(token) via RPC once they've signed up,
-- which runs security-definer so it can look the invite up despite the
-- invitee not being an org member yet.
create table invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) not null,
  email text not null,
  role text not null default 'CONTRIBUTOR'
    check (role in ('ADMIN','BID_MANAGER','TECHNICAL_REVIEWER','COMMERCIAL_REVIEWER','CONTRIBUTOR','VIEWER')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid references profiles(id),
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REVOKED')),
  created_at timestamptz default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create or replace function public.accept_invite(invite_token uuid)
returns uuid as $$
declare
  inv record;
  existing_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to accept an invite';
  end if;
  select org_id into existing_org from public.profiles where id = auth.uid();
  if existing_org is not null then
    raise exception 'You already belong to an organization';
  end if;

  select * into inv from public.invites
    where token = invite_token and status = 'PENDING' and expires_at > now();
  if inv is null then
    raise exception 'This invite is invalid, already used, or has expired';
  end if;

  update public.profiles set org_id = inv.org_id, role = inv.role where id = auth.uid();
  update public.invites set status = 'ACCEPTED' where id = inv.id;

  return inv.org_id;
end;
$$ language plpgsql security definer;

-- ── Tenders (the core "bid room" per opportunity) ───────────────────

create table tenders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) not null,
  name text not null,
  number text,
  client text,
  closing_date date,
  portal text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','IN_INTAKE','SOURCING_MATCHED','DRAFTING','UNDER_REVIEW','APPROVED','EXPORTED','SUBMITTED')),
  estimated_value text,
  probability_of_win int check (probability_of_win between 0 and 100),
  owner_id uuid references profiles(id),
  source_file_path text,           -- Supabase Storage path of the uploaded tender doc
  extracted_metadata jsonb,        -- raw ExtractedTenderMetadata from intake AI extraction
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Knowledge base files ────────────────────────────────────────────

create table kb_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) not null,
  name text not null,
  category text not null
    check (category in ('CV','PROJECT_EVIDENCE','CREDENTIAL','POLICY','BENCHMARK','CAPABILITY','UNSORTED')),
  storage_path text not null,      -- Supabase Storage path
  size_bytes bigint,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now(),
  last_verified_at timestamptz default now(),
  -- Staleness is derived from last_verified_at at read time (see
  -- mapKbFile in src/lib/db.ts). It is NOT a generated column: a
  -- generation expression must be immutable, and "> 180 days ago"
  -- depends on now(), which isn't — that raises 42P17. Keeping a plain
  -- column also lets a job/trigger flip it if you ever want it stored.
  is_stale boolean default false,
  -- Extracted document text, populated by a text-extraction step at
  -- upload time (not built yet — see AUDIT.md). Nullable: search still
  -- works on name/category alone until that's wired.
  content_text text
);

-- Full-text search. A trigger-maintained column, NOT a generated one:
-- to_tsvector(regconfig, text) is STABLE, not IMMUTABLE (search configs
-- can be altered by an admin), so Postgres rejects it in a generated
-- column's expression the same way it rejected now() for is_stale
-- above (42P17). A trigger sidesteps that entirely and is the
-- traditional, always-correct way to maintain a tsvector column.
alter table kb_files add column search_vector tsvector;

create or replace function public.kb_files_search_vector_update()
returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.content_text, '')), 'C');
  return new;
end;
$$ language plpgsql;

create trigger kb_files_search_vector_trigger
  before insert or update on kb_files
  for each row execute procedure public.kb_files_search_vector_update();

create index kb_files_search_idx on kb_files using gin(search_vector);

-- ── Compliance matrix items (per tender) ────────────────────────────

create table compliance_items (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade not null,
  requirement text not null,
  tender_reference text,
  is_mandatory boolean default true,
  response_section text,
  source_files uuid[] default '{}',   -- array of kb_files.id
  owner_id uuid references profiles(id),
  reviewer_id uuid references profiles(id),
  status text not null default 'NOT_STARTED'
    check (status in ('NOT_STARTED','SOURCE_MATCHED','DRAFTED','NEEDS_EVIDENCE','NEEDS_TECHNICAL_REVIEW','NEEDS_COMMERCIAL_REVIEW','APPROVED')),
  gap text,
  created_at timestamptz default now()
);

-- ── Proposal sections + claims (the drafted response) ───────────────

create table proposal_sections (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade not null,
  title text not null,
  content text default '',
  status text not null default 'NOT_STARTED'
    check (status in ('NOT_STARTED','SOURCE_MATCHED','DRAFTED','NEEDS_EVIDENCE','NEEDS_TECHNICAL_REVIEW','NEEDS_COMMERCIAL_REVIEW','APPROVED')),
  reviewer_id uuid references profiles(id),
  approved boolean default false,
  sort_order int default 0,
  last_saved_at timestamptz default now()
);

-- Claims are the atomic, source-traced statements inside a section —
-- this is what the review gate actually checks before approval.
create table claims (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references proposal_sections(id) on delete cascade not null,
  text text not null,
  source_file_id uuid references kb_files(id),
  source_page text,
  extracted_evidence text,
  confidence_score int check (confidence_score between 0 and 100),
  last_updated_date date default current_date,
  is_stale boolean default false
);

-- ── Lessons learned (outcome feedback loop) ─────────────────────────

create table lessons_learned (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) not null,
  tender_id uuid references tenders(id),
  tender_name text not null,
  outcome text not null check (outcome in ('WON','LOST','WITHDRAWN')),
  key_insights text[] default '{}',
  related_kb_file_id uuid references kb_files(id),  -- e.g. the CV this lesson is tied to
  created_by uuid references profiles(id),
  date date default current_date
);

-- ── Audit log ────────────────────────────────────────────────────────

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) not null,
  user_id uuid references profiles(id),
  action text not null,
  details text,
  timestamp timestamptz default now()
);

-- ── Opportunity workspace (per tender) ───────────────────────────────
-- What the imported tender determined we need, matched against the
-- standing kb_files library. See src/lib/requirementMatching.ts, which
-- generates these rows client-side on import; this table is where they
-- persist once a real backend is connected.

create table info_requests (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade not null,
  label text not null,
  detail text,
  category text not null check (category in ('EVIDENCE','CV','POLICY','COMMERCIAL','CREDENTIAL')),
  status text not null default 'GAP' check (status in ('MATCHED','PROVIDED','REQUESTED','GAP')),
  matched_file_id uuid references kb_files(id),
  response text,
  tailoring_note text,
  assigned_to uuid references profiles(id),
  created_at timestamptz default now()
);

-- Intelligence captured FOR THE OPPORTUNITY — deliberately not attached
-- to any CV or KB file. Client drivers, incumbent notes, evaluation
-- signals: knowledge specific to this bid, not reusable collateral.
create table intel_notes (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade not null,
  title text not null,
  body text not null,
  tag text not null check (tag in ('CLIENT','INCUMBENT','EVALUATION','COMPETITOR','STRATEGY','RISK')),
  author_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- Clarification questions to the client — raised manually or surfaced
-- as a recommendation. Always scoped to the opportunity, never to a CV.
create table clarifications (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade not null,
  question text not null,
  rationale text,
  source text not null default 'MANUAL' check (source in ('MANUAL','RECOMMENDED')),
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','ANSWERED')),
  answer text,
  raised_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ── Pricing ──────────────────────────────────────────────────────────
-- Rate card is org-wide (reused across tenders); pricing lines are per
-- tender, each referencing a rate card entry.

create table rate_card_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) not null,
  role text not null,
  unit text not null default 'day' check (unit in ('day','hour')),
  rate numeric(12,2) not null,
  source text not null default 'CUSTOM' check (source in ('CUSTOM','BENCHMARK')),
  created_at timestamptz default now()
);

create table pricing_lines (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid references tenders(id) on delete cascade not null,
  description text not null,
  rate_id uuid references rate_card_items(id) not null,
  quantity numeric(10,2) not null default 1,
  markup_pct numeric(5,2) not null default 0,
  created_at timestamptz default now()
);

-- ── Personnel / CV profiles ──────────────────────────────────────────
-- CV content (credentials, project history) kept separate from
-- profiles (account/role info) since it's bid content that gets
-- tailored per opportunity, not an account attribute.

create table personnel_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  headline text,
  years_experience integer,
  credentials text[] default '{}',
  cv_file_id uuid references kb_files(id),
  created_at timestamptz default now()
);

create table project_history_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references personnel_profiles(id) on delete cascade not null,
  project text not null,
  role text not null,
  period text,
  summary text
);

-- ── Platform admin console (vendor-only, read-only) ─────────────────
-- An explicit allowlist for YOU (the app's operator) to get a
-- cross-org overview — org names, member/tender counts — for support
-- and monitoring. Deliberately NOT a role stored on profiles: that
-- table's privilege-escalation guard stops a user promoting their own
-- `role`, but a cross-tenant visibility flag is a different, much
-- larger privilege than any org-scoped role, and deserves a separate,
-- harder-to-reach mechanism. There is intentionally NO insert/update/
-- delete policy below — under RLS, no policy for an operation means
-- that operation is denied outright. The only way to grant platform
-- admin is a direct SQL insert in the Supabase dashboard/SQL editor,
-- never through the app itself. The one SELECT policy only lets a user
-- check their OWN membership (id = auth.uid()), not browse the list of
-- who else has it.
create table platform_admins (
  id uuid primary key references profiles(id),
  granted_at timestamptz default now(),
  note text
);

-- ── AI rate limiting ─────────────────────────────────────────────────
-- api/ai.ts requires a valid session (see the caller-auth section of
-- that file), which stops random internet abuse — but a single
-- legitimate signed-in user could still call it in a tight loop and run
-- up unbounded provider costs. This table backs a real per-user rate
-- limit: one row per request, counted over a sliding window. A user can
-- only insert/count their OWN rows (RLS below), so the server-side
-- check works by constructing a Supabase client with the CALLER's JWT
-- (not just the anon key), exactly the way any other per-user query in
-- this app works — no service-role key or new secret required.
create table ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  created_at timestamptz default now()
);

-- ── Row Level Security ───────────────────────────────────────────────
-- Every table below: a user can only see/write rows in their own org.
-- This is the actual multi-tenant boundary — not app code, the database.

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table tenders enable row level security;
alter table kb_files enable row level security;
alter table compliance_items enable row level security;
alter table proposal_sections enable row level security;
alter table claims enable row level security;
alter table lessons_learned enable row level security;
alter table audit_log enable row level security;
alter table info_requests enable row level security;
alter table intel_notes enable row level security;
alter table clarifications enable row level security;
alter table rate_card_items enable row level security;
alter table pricing_lines enable row level security;
alter table personnel_profiles enable row level security;
alter table project_history_entries enable row level security;
alter table invites enable row level security;
alter table ai_requests enable row level security;
alter table platform_admins enable row level security;

-- Helper: the calling user's org_id, looked up once per query.
create or replace function public.current_org_id()
returns uuid as $$
  select org_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create policy "org members can view their org" on organizations
  for select using (id = current_org_id());

create policy "users can view profiles in their org" on profiles
  for select using (org_id = current_org_id());
-- A user may edit their own profile row, but NOT escalate their own
-- privileges. The USING clause restricts which row; the trigger below
-- (prevent_profile_privilege_escalation) is what actually stops a user
-- from changing their own role or moving themselves into another org.
-- RLS alone cannot compare OLD vs NEW values, so the trigger is required.
create policy "users can update their own profile" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ── Privilege-escalation guard ───────────────────────────────────────
-- Without this, the self-update policy above would let any authenticated
-- user run `update profiles set role = 'OWNER'` on their own row, or set
-- org_id to a victim org's UUID and read that tenant's entire workspace.
-- That single gap defeats both the role model and multi-tenant isolation.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger as $$
begin
  -- service_role (server-side admin) bypasses this guard entirely.
  if (auth.jwt() ->> 'role') = 'service_role' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'Changing your own role is not permitted';
  end if;
  if new.org_id is distinct from old.org_id then
    raise exception 'Changing your own organization is not permitted';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger profiles_block_privilege_escalation
  before update on public.profiles
  for each row execute procedure public.prevent_profile_privilege_escalation();

create policy "org-scoped tenders" on tenders
  for all using (org_id = current_org_id());

create policy "org-scoped kb_files" on kb_files
  for all using (org_id = current_org_id());

create policy "compliance via tender org" on compliance_items
  for all using (
    tender_id in (select id from tenders where org_id = current_org_id())
  );

create policy "sections via tender org" on proposal_sections
  for all using (
    tender_id in (select id from tenders where org_id = current_org_id())
  );

create policy "claims via section's tender org" on claims
  for all using (
    section_id in (
      select ps.id from proposal_sections ps
      join tenders t on t.id = ps.tender_id
      where t.org_id = current_org_id()
    )
  );

create policy "org-scoped lessons" on lessons_learned
  for all using (org_id = current_org_id());

-- Audit log is append-only for users: they can read their org's entries
-- and insert new ones, but cannot UPDATE or DELETE them. An audit trail a
-- user can rewrite or erase is not an audit trail. (No update/delete
-- policy is defined, so those operations are denied under RLS; only the
-- service_role can prune/rotate the log out-of-band.)
create policy "org members can read their audit log" on audit_log
  for select using (org_id = current_org_id());
create policy "org members can append to their audit log" on audit_log
  for insert with check (org_id = current_org_id());

-- ── Opportunity, pricing, personnel — all scoped via their tender's or
-- their own org, following the same "join up to org_id" pattern as
-- compliance_items/proposal_sections above.
create policy "info requests via tender org" on info_requests
  for all using (tender_id in (select id from tenders where org_id = current_org_id()));

create policy "intel via tender org" on intel_notes
  for all using (tender_id in (select id from tenders where org_id = current_org_id()));

create policy "clarifications via tender org" on clarifications
  for all using (tender_id in (select id from tenders where org_id = current_org_id()));

create policy "org-scoped rate card" on rate_card_items
  for all using (org_id = current_org_id());

create policy "pricing lines via tender org" on pricing_lines
  for all using (tender_id in (select id from tenders where org_id = current_org_id()));

-- Personnel profiles are keyed to profiles.id, so scope through that
-- profile's org rather than a separate org_id column.
create policy "personnel profiles via own org" on personnel_profiles
  for all using (id in (select id from profiles where org_id = current_org_id()));

create policy "project history via profile org" on project_history_entries
  for all using (
    profile_id in (
      select pp.id from personnel_profiles pp
      join profiles p on p.id = pp.id
      where p.org_id = current_org_id()
    )
  );

-- Deliberately no public/anon read policy on invites — a token can only
-- be redeemed via the accept_invite() RPC above (security definer, so it
-- can look up the row despite the invitee not being an org member yet),
-- never browsed or enumerated directly.
create policy "org members can manage their invites" on invites
  for all using (org_id = current_org_id());

-- Strictly self-scoped, no org dimension: a user can only see/insert
-- their own rate-limit counter rows, never anyone else's.
create policy "users manage their own ai request log" on ai_requests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Self-check only — lets amIPlatformAdmin() work without letting anyone
-- browse who else holds this privilege. No insert/update/delete policy
-- exists for this table at all (see the table's own comment above).
create policy "users can check their own platform-admin status" on platform_admins
  for select using (id = auth.uid());

-- Read-only, additive cross-org visibility for platform admins. This is
-- a SECOND permissive policy alongside the existing org-scoped ones —
-- Postgres RLS OR's multiple permissive policies together, so this
-- WIDENS who can read (adds a path for platform admins) without
-- narrowing the existing per-org access at all, and only for SELECT,
-- never for writes.
create policy "platform admins can read all organizations" on organizations
  for select using (exists (select 1 from platform_admins where id = auth.uid()));
create policy "platform admins can read all tenders" on tenders
  for select using (exists (select 1 from platform_admins where id = auth.uid()));
create policy "platform admins can read all profiles" on profiles
  for select using (exists (select 1 from platform_admins where id = auth.uid()));

-- ── Realtime ─────────────────────────────────────────────────────────
-- RLS controls who can read/write a row; it does NOT control whether
-- that row's changes are broadcast over Realtime — that's a separate
-- opt-in via publication membership. Without this, src/lib/realtime.ts's
-- postgres_changes subscriptions silently receive nothing. RLS still
-- applies on top: a client only receives change events for rows it's
-- allowed to see.
alter publication supabase_realtime add table compliance_items;
alter publication supabase_realtime add table proposal_sections;

-- ── Storage buckets + RLS ────────────────────────────────────────────
-- Every file lives under a path of the form {org_id}/{...}, and the
-- policies below check that prefix against the caller's own org_id —
-- this is what actually stops one tenant from reading or overwriting
-- another tenant's uploaded tender documents, CVs, or exports. Without
-- this, the database-level RLS above means nothing for raw files,
-- since Storage objects are not rows in the tables it protects.
--
-- storage.foldername(name) splits the object path on '/' and returns
-- it as a text[] — foldername(name)[1] is the first path segment,
-- which by convention is always the org_id for every bucket here.

insert into storage.buckets (id, name, public)
values
  ('tender-documents', 'tender-documents', false),
  ('kb-files', 'kb-files', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;
-- If this insert fails with a permissions error (some Supabase plans
-- restrict direct writes to storage.buckets), create the three buckets
-- manually instead: Dashboard -> Storage -> New bucket, name them
-- exactly as above, and leave "Public bucket" OFF for all three. The
-- policies below apply regardless of how the buckets were created.

-- tender-documents: uploaded Project Orders / RFTs, one per tender
create policy "org members can read their tender documents"
  on storage.objects for select
  using (
    bucket_id = 'tender-documents'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

create policy "org members can upload tender documents"
  on storage.objects for insert
  with check (
    bucket_id = 'tender-documents'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

create policy "org members can update their tender documents"
  on storage.objects for update
  using (
    bucket_id = 'tender-documents'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

create policy "org members can delete their tender documents"
  on storage.objects for delete
  using (
    bucket_id = 'tender-documents'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

-- kb-files: CVs, capability statements, credentials, benchmarks
create policy "org members can read their kb files"
  on storage.objects for select
  using (
    bucket_id = 'kb-files'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

create policy "org members can upload kb files"
  on storage.objects for insert
  with check (
    bucket_id = 'kb-files'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

create policy "org members can update their kb files"
  on storage.objects for update
  using (
    bucket_id = 'kb-files'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

create policy "org members can delete their kb files"
  on storage.objects for delete
  using (
    bucket_id = 'kb-files'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

-- exports: generated submission packages (DOCX/XLSX/PDF bundles)
create policy "org members can read their exports"
  on storage.objects for select
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

create policy "org members can write their exports"
  on storage.objects for insert
  with check (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

create policy "org members can delete their exports"
  on storage.objects for delete
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

-- Expected upload path convention (enforce client-side when building
-- the upload path string — these policies trust the org_id segment is
-- correct, so the app must always construct paths this way and never
-- accept a caller-supplied org_id):
--   tender-documents/{org_id}/{tender_id}/{filename}
--   kb-files/{org_id}/{kb_file_id}/{filename}
--   exports/{org_id}/{tender_id}/{export_id}/{filename}

-- ============================================================
-- TENDER BLUEPRINT (see supabase/migrations/2026-07-04_tender_blueprint.sql
-- for the standalone migration with full commentary — identical DDL).
-- ============================================================
-- a draft has no identity apart from its module.

create table if not exists blueprints (
  tender_id uuid primary key references tenders(id) on delete cascade,
  org_id uuid references organizations(id) not null,
  generated_at timestamptz not null default now(),
  summary text not null default '',
  submission_type text not null default 'RFT',
  page_limits text not null default '',
  word_limits text not null default '',
  addenda_count int not null default 0,
  returnables jsonb not null default '[]',
  evaluation_criteria jsonb not null default '[]',
  required_templates jsonb not null default '[]',
  required_accreditations jsonb not null default '[]',
  required_insurances jsonb not null default '[]',
  win_themes jsonb not null default '[]',   -- mirror of inputs.winThemes for reporting
  inputs jsonb not null default '{}',       -- ProjectInputs (win themes, hot buttons, terminology, tone…)
  meta jsonb not null default '{}',         -- ProjectMeta (submission type, sector, bid manager…)
  updated_at timestamptz not null default now()
);

create table if not exists blueprint_requirements (
  id text not null,                          -- e.g. REQ-001 (unique within a tender)
  tender_id uuid references tenders(id) on delete cascade not null,
  org_id uuid references organizations(id) not null,
  data jsonb not null,                       -- full Requirement
  updated_at timestamptz not null default now(),
  primary key (tender_id, id)
);

create table if not exists blueprint_modules (
  id text not null,                          -- ModuleKey
  tender_id uuid references tenders(id) on delete cascade not null,
  org_id uuid references organizations(id) not null,
  active boolean not null default false,
  draft text not null default '',            -- the module's draft section
  draft_status text not null default 'Not started',
  data jsonb not null,                       -- full ProposalModule
  updated_at timestamptz not null default now(),
  primary key (tender_id, id)
);

create table if not exists blueprint_evidence (
  id text not null,
  tender_id uuid references tenders(id) on delete cascade not null,
  org_id uuid references organizations(id) not null,
  status text not null default 'missing' check (status in ('found','check','missing')),
  data jsonb not null,                       -- full EvidenceItem
  updated_at timestamptz not null default now(),
  primary key (tender_id, id)
);

create table if not exists blueprint_reviews (
  id text not null,
  tender_id uuid references tenders(id) on delete cascade not null,
  org_id uuid references organizations(id) not null,
  status text not null default 'Not started',
  data jsonb not null,                       -- full ReviewTask
  updated_at timestamptz not null default now(),
  primary key (tender_id, id)
);

create table if not exists blueprint_risks (
  id text not null,
  tender_id uuid references tenders(id) on delete cascade not null,
  org_id uuid references organizations(id) not null,
  rating text not null default 'Medium',
  status text not null default 'Open',
  data jsonb not null,                       -- full RiskItem
  updated_at timestamptz not null default now(),
  primary key (tender_id, id)
);

create table if not exists blueprint_addenda (
  id text not null,
  tender_id uuid references tenders(id) on delete cascade not null,
  org_id uuid references organizations(id) not null,
  reviewed boolean not null default false,
  data jsonb not null,                       -- full AddendumImpact
  updated_at timestamptz not null default now(),
  primary key (tender_id, id)
);

create table if not exists blueprint_exports (
  id text not null,                          -- ExportKey
  tender_id uuid references tenders(id) on delete cascade not null,
  org_id uuid references organizations(id) not null,
  level text not null default 'Optional',
  last_exported_at timestamptz,
  data jsonb not null,                       -- full ExportPackage
  updated_at timestamptz not null default now(),
  primary key (tender_id, id)
);

create index if not exists idx_bp_requirements_tender on blueprint_requirements(tender_id);
create index if not exists idx_bp_modules_tender on blueprint_modules(tender_id);
create index if not exists idx_bp_evidence_tender on blueprint_evidence(tender_id);
create index if not exists idx_bp_reviews_tender on blueprint_reviews(tender_id);
create index if not exists idx_bp_risks_tender on blueprint_risks(tender_id);
create index if not exists idx_bp_addenda_tender on blueprint_addenda(tender_id);
create index if not exists idx_bp_exports_tender on blueprint_exports(tender_id);

-- RLS: same org-scoped model as every other workspace table.
alter table blueprints enable row level security;
alter table blueprint_requirements enable row level security;
alter table blueprint_modules enable row level security;
alter table blueprint_evidence enable row level security;
alter table blueprint_reviews enable row level security;
alter table blueprint_risks enable row level security;
alter table blueprint_addenda enable row level security;
alter table blueprint_exports enable row level security;

create policy "org rw blueprints" on blueprints
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "org rw blueprint_requirements" on blueprint_requirements
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "org rw blueprint_modules" on blueprint_modules
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "org rw blueprint_evidence" on blueprint_evidence
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "org rw blueprint_reviews" on blueprint_reviews
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "org rw blueprint_risks" on blueprint_risks
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "org rw blueprint_addenda" on blueprint_addenda
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "org rw blueprint_exports" on blueprint_exports
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ============================================================
-- TENDER DOCUMENTS (see supabase/migrations/2026-07-04_tender_documents.sql
-- for the standalone migration with full commentary — identical DDL).
-- ============================================================
create table if not exists tender_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) not null,
  tender_id uuid references tenders(id) on delete cascade not null,
  name text not null,
  storage_path text not null,               -- path within the tender-documents bucket
  size_bytes bigint,
  mime_type text,
  document_tag text not null default 'Other',
  status text not null default 'Uploaded'
    check (status in ('Uploaded','Analysed')),
  extracted_text text,                       -- capped at write time (analysis input, not a document store)
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','extracted','scanned','unsupported','failed')),
  extraction_note text,                      -- honest note, e.g. "scanned PDF — OCR not implemented"
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tender_documents_tender on tender_documents(tender_id);
create index if not exists idx_tender_documents_org on tender_documents(org_id);

alter table tender_documents enable row level security;

create policy "org rw tender_documents" on tender_documents
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ============================================================
-- COMMERCIAL ASSUMPTIONS REGISTER (see
-- supabase/migrations/2026-07-05_commercial_register.sql — identical DDL).
-- ============================================================
  org_id uuid references organizations(id) not null,
  status text not null default 'Open',
  data jsonb not null,                       -- full CommercialItem
  updated_at timestamptz not null default now(),
  primary key (tender_id, id)
);

create index if not exists idx_bp_commercial_tender on blueprint_commercial(tender_id);

alter table blueprint_commercial enable row level security;

create policy "org rw blueprint_commercial" on blueprint_commercial
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ============================================================
-- PROPOSAL RUN THROUGH (see
-- supabase/migrations/2026-07-05_proposal_run.sql — identical DDL).
-- ============================================================

create table if not exists blueprint_claims (
  id text not null,
  tender_id uuid references tenders(id) on delete cascade not null,
  org_id uuid references organizations(id) not null,
  data jsonb not null,                       -- full ProposalClaim
  updated_at timestamptz not null default now(),
  primary key (tender_id, id)
);

create table if not exists blueprint_versions (
  id text not null,
  tender_id uuid references tenders(id) on delete cascade not null,
  org_id uuid references organizations(id) not null,
  data jsonb not null,                       -- full ProposalVersion (incl. snapshots)
  created_at timestamptz not null default now(),
  primary key (tender_id, id)
);

create index if not exists idx_bp_claims_tender on blueprint_claims(tender_id);
create index if not exists idx_bp_versions_tender on blueprint_versions(tender_id);

alter table blueprint_claims enable row level security;
alter table blueprint_versions enable row level security;

create policy "org rw blueprint_claims" on blueprint_claims
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "org rw blueprint_versions" on blueprint_versions
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ============================================================
-- TENDER CLOSEOUT (see supabase/migrations/2026-07-05_tender_closeout.sql)
-- ============================================================
alter table blueprints
  add column if not exists closeout jsonb;
