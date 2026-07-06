-- ============================================================
-- Migration: Commercial Assumptions Register
-- Run this against an EXISTING database. New installs get the same
-- table from schema.sql (kept in sync).
-- ============================================================
-- First-class commercial control: pricing assumptions, exclusions,
-- departures, provisional/optional items, client dependencies and
-- contract concerns the bid is taking a position on. Same jsonb-with-
-- query-columns shape as the other blueprint child tables, same
-- org-scoped RLS. Unacknowledged Open items gate the commercial exports.

create table if not exists blueprint_commercial (
  id text not null,
  tender_id uuid references tenders(id) on delete cascade not null,
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
