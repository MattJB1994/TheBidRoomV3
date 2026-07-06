-- ============================================================
-- Migration: Proposal Run Through persistence
-- Run this against an EXISTING database. New installs get the same
-- objects from schema.sql (kept in sync).
-- ============================================================
-- The two-pass whole-proposal drafting workflow adds:
--   * blueprints.proposal_notes  — global proposal direction (jsonb)
--   * blueprint_claims           — the Claim Register (claims tracked
--                                   across sections)
--   * blueprint_versions         — version history of full run-throughs
-- Section notes and first-pass meta live ON blueprint_modules.data
-- (the ProposalModule jsonb), so they need no new columns.
-- Same jsonb-with-query-columns shape and org-scoped RLS as the other
-- blueprint child tables.

alter table blueprints
  add column if not exists proposal_notes jsonb not null default '{}';

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
