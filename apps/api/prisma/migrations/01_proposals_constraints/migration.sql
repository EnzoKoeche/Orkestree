-- ═══════════════════════════════════════════════════════════════════════════
-- proposals foundation — supplemental raw SQL migration
-- File: prisma/migrations/01_proposals_constraints/migration.sql
--
-- Purpose: composite foreign keys, composite unique targets, and partial
-- unique indexes that Prisma cannot express in schema syntax for the
-- Proposal bounded context.
--
-- Execution order: this file MUST run after `prisma migrate deploy` has
-- applied the Prisma-managed DDL for Proposal / ProposalItem /
-- ProposalStatusHistory / ProposalFieldValue and AFTER the
-- 00_supplemental_constraints migration that established the composite
-- targets on ServiceRequest, Client, and CustomField.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 1: Composite unique target on Proposal
-- Required as the reference target for FKs from ProposalItem,
-- ProposalStatusHistory, and ProposalFieldValue.
-- @@unique([companyId, number]) is already created by Prisma schema.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "Proposal"
  ADD CONSTRAINT uq_proposal_company_id
  UNIQUE ("companyId", "id");

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 2: Composite foreign keys — tenant consistency enforcement
--
-- Same rationale as the service-requests / clients / tasks migrations:
-- composite FKs are preferred over CHECK + subquery because they are
-- enforced at row insert/update time and are index-backed via the
-- composite UNIQUE constraints declared in 00_supplemental_constraints.
-- ─────────────────────────────────────────────────────────────────────────

-- Proposal → ServiceRequest: tenant consistency.
-- ON DELETE RESTRICT — a request that has any proposal cannot be silently
-- removed; callers must explicitly cancel/dispose proposals first.
ALTER TABLE "Proposal"
  ADD CONSTRAINT fk_proposal_company_request
  FOREIGN KEY ("companyId", "serviceRequestId")
  REFERENCES "ServiceRequest" ("companyId", "id")
  ON DELETE RESTRICT;

-- Proposal → Client: tenant consistency, optional link.
-- clientId is nullable; when null the FK does not apply (PostgreSQL skips
-- FK validation when any column of the FK key is NULL).
-- DEFERRABLE INITIALLY DEFERRED mirrors the convention used on
-- ServiceRequest → Client so cross-table edits in the same transaction can
-- be reordered without losing FK enforcement at commit time.
ALTER TABLE "Proposal"
  ADD CONSTRAINT fk_proposal_company_client
  FOREIGN KEY ("companyId", "clientId")
  REFERENCES "Client" ("companyId", "id")
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

-- ProposalItem → Proposal: tenant consistency with cascade delete.
-- Items are part of the proposal aggregate; removing the parent removes them.
ALTER TABLE "ProposalItem"
  ADD CONSTRAINT fk_proposal_item_company_proposal
  FOREIGN KEY ("companyId", "proposalId")
  REFERENCES "Proposal" ("companyId", "id")
  ON DELETE CASCADE;

-- ProposalStatusHistory → Proposal: tenant consistency with cascade delete.
-- The audit timeline is meaningless without its parent; cascade is correct.
ALTER TABLE "ProposalStatusHistory"
  ADD CONSTRAINT fk_proposal_status_history_company_proposal
  FOREIGN KEY ("companyId", "proposalId")
  REFERENCES "Proposal" ("companyId", "id")
  ON DELETE CASCADE;

-- ProposalFieldValue → Proposal: tenant consistency with cascade delete.
ALTER TABLE "ProposalFieldValue"
  ADD CONSTRAINT fk_proposal_field_value_company_proposal
  FOREIGN KEY ("companyId", "proposalId")
  REFERENCES "Proposal" ("companyId", "id")
  ON DELETE CASCADE;

-- ProposalFieldValue → CustomField: tenant consistency with restrict delete.
-- A CustomField referenced by any proposal cannot be hard-deleted; deactivate
-- the field instead.
ALTER TABLE "ProposalFieldValue"
  ADD CONSTRAINT fk_proposal_field_value_company_custom_field
  FOREIGN KEY ("companyId", "customFieldId")
  REFERENCES "CustomField" ("companyId", "id")
  ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 3: Partial unique index — at most one APPROVED proposal per request
--
-- Business rule: a service request can only have one accepted proposal at a
-- time. Other statuses (DRAFT/SENT/REJECTED/EXPIRED/CANCELLED) are unbounded.
--
-- The index is tenant-aware (companyId, serviceRequestId) for symmetry with
-- every other constraint in 00_supplemental_constraints and this file.
-- Even though serviceRequestId is globally unique by CUID, scoping the
-- partial uniqueness to (companyId, serviceRequestId) is the canonical form
-- in this schema and prevents accidental cross-tenant collisions if a
-- future migration ever changes the id strategy.
--
-- Concurrency: catching P2002 from this index is the hard safety net for
-- ProposalTransitionsService.approveProposal. The service also takes
-- SELECT FOR UPDATE on the proposal row, but only the unique index protects
-- against two different proposals on the same request being approved
-- concurrently.
-- ─────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX udx_one_approved_proposal_per_request
  ON "Proposal" ("companyId", "serviceRequestId")
  WHERE status = 'APPROVED';

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 4: CHECK constraints on Proposal money fields
--
-- These are belt-and-suspenders against logic bugs. The service computes all
-- pricing fields server-side and never trusts client input; CHECKs here turn
-- a logic regression into an immediate DB error instead of silently corrupt
-- totals.
-- ─────────────────────────────────────────────────────────────────────────

-- discountPct must be in [0, 100] when set.
ALTER TABLE "Proposal"
  ADD CONSTRAINT chk_proposal_discount_pct_range
  CHECK ("discountPct" IS NULL OR ("discountPct" >= 0 AND "discountPct" <= 100));

-- discountAmount must be non-negative when set.
ALTER TABLE "Proposal"
  ADD CONSTRAINT chk_proposal_discount_amount_nonneg
  CHECK ("discountAmount" IS NULL OR "discountAmount" >= 0);

-- discountPct and discountAmount are mutually exclusive at any given time.
ALTER TABLE "Proposal"
  ADD CONSTRAINT chk_proposal_discount_exclusive
  CHECK ("discountPct" IS NULL OR "discountAmount" IS NULL);

-- subtotal, totalPrice, totalCost are non-negative.
ALTER TABLE "Proposal"
  ADD CONSTRAINT chk_proposal_subtotal_nonneg
  CHECK ("subtotal" >= 0);

ALTER TABLE "Proposal"
  ADD CONSTRAINT chk_proposal_total_price_nonneg
  CHECK ("totalPrice" >= 0);

ALTER TABLE "Proposal"
  ADD CONSTRAINT chk_proposal_total_cost_nonneg
  CHECK ("totalCost" >= 0);

-- ProposalItem: quantity > 0, unitPrice >= 0, discountPct in [0, 100],
-- internalCost >= 0 when set.
ALTER TABLE "ProposalItem"
  ADD CONSTRAINT chk_proposal_item_quantity_positive
  CHECK ("quantity" > 0);

ALTER TABLE "ProposalItem"
  ADD CONSTRAINT chk_proposal_item_unit_price_nonneg
  CHECK ("unitPrice" >= 0);

ALTER TABLE "ProposalItem"
  ADD CONSTRAINT chk_proposal_item_discount_pct_range
  CHECK ("discountPct" IS NULL OR ("discountPct" >= 0 AND "discountPct" <= 100));

ALTER TABLE "ProposalItem"
  ADD CONSTRAINT chk_proposal_item_internal_cost_nonneg
  CHECK ("internalCost" IS NULL OR "internalCost" >= 0);

ALTER TABLE "ProposalItem"
  ADD CONSTRAINT chk_proposal_item_subtotal_nonneg
  CHECK ("subtotal" >= 0);
