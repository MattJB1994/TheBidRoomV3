-- ============================================================
-- Migration: Tender Blueprint persistence
-- Run this against an EXISTING database. New installs get the
-- same tables from schema.sql (kept in sync — see the
-- "TENDER BLUEPRINT" section there).
-- ============================================================
-- The blueprint is the intelligence layer generated per tender:
-- requirements register, activated proposal modules (whose rows also
-- carry the module's draft section), evidence map, review gates, risk
-- register, addendum impacts and the export package plan.
--
-- Storage model: one core row per tender in `blueprints` (scalar
-- summary fields, plus strategy inputs — win themes, terminology,
-- tone — and project meta as jsonb), and one row per entity in the
-- child tables. Each child row keeps the full typed entity in `data`
-- (jsonb): the TypeScript types in src/blueprint/types.ts are the
-- source of truth, and the columns pulled out beside `data` exist for
-- querying/reporting, not as a second copy to maintain by hand.
-- Draft sections live on blueprint_modules (draft, draft_status):
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
