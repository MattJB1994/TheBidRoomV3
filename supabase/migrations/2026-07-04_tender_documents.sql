-- ============================================================
-- Migration: Tender document persistence
-- Run this against an EXISTING database. New installs get the
-- same table from schema.sql (kept in sync — see the
-- "TENDER DOCUMENTS" section there).
-- ============================================================
-- Every document uploaded to a tender (RFT, scope, schedules, pricing,
-- addenda, evidence) gets a row here plus a Storage object in the
-- existing `tender-documents` bucket at:
--
--   {org_id}/{tender_id}/{document_id}/{filename}
--
-- org_id is ALWAYS derived server-side from the authenticated profile
-- (see addTenderDocument in src/lib/db.ts) — never trusted from client
-- input — and the bucket's storage policies enforce the same first-
-- segment org check as every other bucket.
--
-- Extraction fields make the document pipeline a proper service
-- boundary: extraction currently runs in the browser (pdf text layer /
-- docx / xlsx / csv — src/lib/docText.ts) and its result is stored
-- here; a server-side extractor can later populate the same columns
-- without any client change. `extraction_status` is honest: scanned
-- PDFs are 'scanned' (OCR not implemented), not silently 'extracted'.

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
