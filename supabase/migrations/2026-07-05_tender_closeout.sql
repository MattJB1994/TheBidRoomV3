-- ============================================================
-- Migration: Tender Closeout Learning
-- Run this against an EXISTING database. New installs get the same
-- column from schema.sql (kept in sync).
-- ============================================================
-- Post-submission closeout (outcome, feedback, lessons, reusable
-- patterns) captured on the blueprint. Feeds Client & Sector Memory,
-- which is derived at read-time from the blueprints in the workspace.

alter table blueprints
  add column if not exists closeout jsonb;
