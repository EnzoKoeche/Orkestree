-- ═══════════════════════════════════════════════════════════════════════════
-- company-config v3.1 — supplemental raw SQL migration
-- File: prisma/migrations/00_supplemental_constraints/migration.sql
--
-- Purpose: composite foreign keys and partial unique indexes that Prisma
-- cannot express in schema syntax.
--
-- Execution: this file must be run AFTER `prisma migrate deploy` applies
-- the Prisma-managed DDL for all models.
-- In CI: wrap both steps in the same migration step to keep atomicity.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 1: Composite unique constraints
-- Required as reference targets for composite foreign keys below.
-- Note: @@unique([workflowId, id]) on WorkflowStage and
--       @@unique([companyId, id]) on ServiceType are declared in Prisma
--       schema and already created as unique indexes by prisma migrate.
--       Only the constraints not expressible in Prisma schema are here.
-- ─────────────────────────────────────────────────────────────────────────

-- Workflow(companyId, id): FK target for WorkflowStage and StageTransition
ALTER TABLE "Workflow"
  ADD CONSTRAINT uq_workflow_company_id
  UNIQUE ("companyId", "id");

-- WorkflowStage(companyId, id): FK target for StageAssigneeRule
-- Note: (workflowId, id) unique already exists from Prisma schema.
ALTER TABLE "WorkflowStage"
  ADD CONSTRAINT uq_stage_company_id
  UNIQUE ("companyId", "id");

-- ServiceType(companyId, id): FK target for CustomField and ServiceRequest.
-- The schema declares @@unique([companyId, code]) but NOT (companyId, id).
-- The original migration relied on a comment that misnamed this as "from
-- Prisma schema" — it was always meant to live here. Patched 2026-05-04
-- after a P3018 caught the gap during the first end-to-end migrate against
-- a fresh database.
ALTER TABLE "ServiceType"
  ADD CONSTRAINT uq_service_type_company_id
  UNIQUE ("companyId", "id");

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 2: Composite foreign keys — tenant consistency enforcement
--
-- Design rationale: composite FKs are preferred over CHECK constraints
-- with cross-table subqueries because:
--   - CHECK constraints with subqueries can be bypassed under certain
--     PostgreSQL isolation levels and create implicit sequential scans.
--   - Composite FKs are enforced at row insert/update time at DB level
--     and are index-backed via the unique constraints in Section 1.
-- ─────────────────────────────────────────────────────────────────────────

-- WorkflowStage must belong to a Workflow owned by the same company.
ALTER TABLE "WorkflowStage"
  ADD CONSTRAINT fk_stage_company_workflow
  FOREIGN KEY ("companyId", "workflowId")
  REFERENCES "Workflow" ("companyId", "id")
  ON DELETE RESTRICT;

-- StageAssigneeRule must reference a WorkflowStage in the same company.
ALTER TABLE "StageAssigneeRule"
  ADD CONSTRAINT fk_assignee_rule_company_stage
  FOREIGN KEY ("companyId", "stageId")
  REFERENCES "WorkflowStage" ("companyId", "id")
  ON DELETE RESTRICT;

-- StageTransition must belong to a Workflow in the same company.
ALTER TABLE "StageTransition"
  ADD CONSTRAINT fk_transition_company_workflow
  FOREIGN KEY ("companyId", "workflowId")
  REFERENCES "Workflow" ("companyId", "id")
  ON DELETE RESTRICT;

-- StageTransition.fromStageId must belong to the declared workflowId.
-- Relies on WorkflowStage UNIQUE(workflowId, id) from Prisma schema.
ALTER TABLE "StageTransition"
  ADD CONSTRAINT fk_transition_from_stage
  FOREIGN KEY ("workflowId", "fromStageId")
  REFERENCES "WorkflowStage" ("workflowId", "id")
  ON DELETE RESTRICT;

-- StageTransition.toStageId must belong to the declared workflowId.
ALTER TABLE "StageTransition"
  ADD CONSTRAINT fk_transition_to_stage
  FOREIGN KEY ("workflowId", "toStageId")
  REFERENCES "WorkflowStage" ("workflowId", "id")
  ON DELETE RESTRICT;

-- ServiceType → Workflow: tenant consistency.
-- workflowId is nullable; NULL does not trigger a FK violation (correct).
ALTER TABLE "ServiceType"
  ADD CONSTRAINT fk_service_type_company_workflow
  FOREIGN KEY ("companyId", "workflowId")
  REFERENCES "Workflow" ("companyId", "id")
  ON DELETE RESTRICT;

-- CustomField → ServiceType: tenant consistency.
-- serviceTypeId is nullable; NULL does not trigger a FK violation (correct).
-- Relies on ServiceType UNIQUE(companyId, id) from Prisma schema.
ALTER TABLE "CustomField"
  ADD CONSTRAINT fk_custom_field_company_service_type
  FOREIGN KEY ("companyId", "serviceTypeId")
  REFERENCES "ServiceType" ("companyId", "id")
  ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 3: Partial unique indexes — single-value constraints
--
-- Prisma does not support WHERE-filtered unique indexes in schema syntax.
-- These enforce "exactly one" constraints for default/initial designations.
--
-- Scoping note: indexes are NOT additionally filtered by isActive = true.
-- Consequence: to deactivate the current default, operators must first
-- designate a replacement as default. This prevents a company silently
-- ending up with no default by deactivating it. The service enforces the
-- swap transactionally with SELECT FOR UPDATE on the current default row.
-- ─────────────────────────────────────────────────────────────────────────

-- Exactly one default workflow per company.
CREATE UNIQUE INDEX udx_one_default_workflow
  ON "Workflow" ("companyId")
  WHERE "isDefault" = true;

-- Exactly one initial stage per workflow.
CREATE UNIQUE INDEX udx_one_initial_stage
  ON "WorkflowStage" ("workflowId")
  WHERE "isInitial" = true;

-- TODO: ProposalTemplate and PdfTemplate models do not yet exist in
-- schema.prisma — only the enums PdfTemplateType and TemplateEngine are
-- declared. The two partial unique indexes below are kept as design intent
-- (see Design Reference in Notion: "Templates com versionamento") and must
-- be re-enabled in a follow-up migration when those models land. Tracked
-- as a TODO task in Notion ✅ Tarefas.
--
-- CREATE UNIQUE INDEX udx_one_default_proposal_template
--   ON "ProposalTemplate" ("companyId")
--   WHERE "isDefault" = true;
--
-- CREATE UNIQUE INDEX udx_one_default_pdf_template
--   ON "PdfTemplate" ("companyId", "type")
--   WHERE "isDefault" = true;

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 4: Service-requests bounded context
-- ─────────────────────────────────────────────────────────────────────────

-- CustomField(companyId, id): FK target for RequestFieldValue.
-- Relies on CustomField.@@unique([companyId, code]) — but we need (companyId, id).
ALTER TABLE "CustomField"
  ADD CONSTRAINT uq_custom_field_company_id
  UNIQUE ("companyId", "id");

-- ServiceRequest(companyId, id): FK target for child tables.
-- @@unique([companyId, number]) already created by Prisma schema.
ALTER TABLE "ServiceRequest"
  ADD CONSTRAINT uq_service_request_company_id
  UNIQUE ("companyId", "id");

-- ServiceRequest → ServiceType: tenant consistency.
-- Relies on ServiceType UNIQUE(companyId, id) from Prisma schema.
ALTER TABLE "ServiceRequest"
  ADD CONSTRAINT fk_service_request_company_service_type
  FOREIGN KEY ("companyId", "serviceTypeId")
  REFERENCES "ServiceType" ("companyId", "id")
  ON DELETE RESTRICT;

-- ServiceRequest → Workflow: tenant consistency.
ALTER TABLE "ServiceRequest"
  ADD CONSTRAINT fk_service_request_company_workflow
  FOREIGN KEY ("companyId", "workflowId")
  REFERENCES "Workflow" ("companyId", "id")
  ON DELETE RESTRICT;

-- ServiceRequest → WorkflowStage (currentStageId): tenant consistency.
ALTER TABLE "ServiceRequest"
  ADD CONSTRAINT fk_service_request_company_stage
  FOREIGN KEY ("companyId", "currentStageId")
  REFERENCES "WorkflowStage" ("companyId", "id")
  ON DELETE RESTRICT;

-- RequestFieldValue → ServiceRequest: tenant consistency with cascade delete.
ALTER TABLE "RequestFieldValue"
  ADD CONSTRAINT fk_field_value_company_request
  FOREIGN KEY ("companyId", "requestId")
  REFERENCES "ServiceRequest" ("companyId", "id")
  ON DELETE CASCADE;

-- RequestFieldValue → CustomField: tenant consistency with restrict delete.
ALTER TABLE "RequestFieldValue"
  ADD CONSTRAINT fk_field_value_company_custom_field
  FOREIGN KEY ("companyId", "customFieldId")
  REFERENCES "CustomField" ("companyId", "id")
  ON DELETE RESTRICT;

-- RequestStageHistory → ServiceRequest: tenant consistency with cascade delete.
ALTER TABLE "RequestStageHistory"
  ADD CONSTRAINT fk_stage_history_company_request
  FOREIGN KEY ("companyId", "requestId")
  REFERENCES "ServiceRequest" ("companyId", "id")
  ON DELETE CASCADE;

-- RequestAssignment → ServiceRequest: tenant consistency with cascade delete.
ALTER TABLE "RequestAssignment"
  ADD CONSTRAINT fk_assignment_company_request
  FOREIGN KEY ("companyId", "requestId")
  REFERENCES "ServiceRequest" ("companyId", "id")
  ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 5: Clients bounded context
-- ─────────────────────────────────────────────────────────────────────────

-- Client(companyId, id): FK target for ServiceRequest and ClientFieldValue.
-- @@unique([companyId, number]) already created by Prisma schema.
ALTER TABLE "Client"
  ADD CONSTRAINT uq_client_company_id
  UNIQUE ("companyId", "id");

-- One taxId per company (partial: only when taxId is set).
CREATE UNIQUE INDEX udx_client_tax_id
  ON "Client" ("companyId", "taxId")
  WHERE "taxId" IS NOT NULL;

-- BUSINESS clients must have legalName.
ALTER TABLE "Client"
  ADD CONSTRAINT chk_client_business_legal_name
  CHECK (type != 'BUSINESS' OR "legalName" IS NOT NULL);

-- ServiceRequest → Client: tenant consistency with restrict delete.
-- Relies on Client UNIQUE(companyId, id) above.
-- clientId is nullable; FK applies only when set.
ALTER TABLE "ServiceRequest"
  ADD CONSTRAINT fk_service_request_company_client
  FOREIGN KEY ("companyId", "clientId")
  REFERENCES "Client" ("companyId", "id")
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

-- ClientFieldValue → Client: tenant consistency with cascade delete.
ALTER TABLE "ClientFieldValue"
  ADD CONSTRAINT fk_client_field_value_company_client
  FOREIGN KEY ("companyId", "clientId")
  REFERENCES "Client" ("companyId", "id")
  ON DELETE CASCADE;

-- ClientFieldValue → CustomField: tenant consistency with restrict delete.
ALTER TABLE "ClientFieldValue"
  ADD CONSTRAINT fk_client_field_value_company_custom_field
  FOREIGN KEY ("companyId", "customFieldId")
  REFERENCES "CustomField" ("companyId", "id")
  ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 6: Tasks bounded context
-- ─────────────────────────────────────────────────────────────────────────

-- Task(companyId, id): FK target for TaskComment.
-- @@unique([companyId, number]) already created by Prisma schema.
ALTER TABLE "Task"
  ADD CONSTRAINT uq_task_company_id
  UNIQUE ("companyId", "id");

-- Task → ServiceRequest: tenant consistency.
-- ON DELETE RESTRICT prevents silently orphaning tasks when a request is
-- deleted; callers must explicitly handle tasks before removing the request.
ALTER TABLE "Task"
  ADD CONSTRAINT fk_task_company_request
  FOREIGN KEY ("companyId", "requestId")
  REFERENCES "ServiceRequest" ("companyId", "id")
  ON DELETE RESTRICT;

-- TaskComment → Task: cascade delete so comments are removed atomically with
-- their parent task. This runs before the Prisma-generated RESTRICT FK check
-- on taskId, leaving no referencing rows for that check to block on.
ALTER TABLE "TaskComment"
  ADD CONSTRAINT fk_task_comment_company_task
  FOREIGN KEY ("companyId", "taskId")
  REFERENCES "Task" ("companyId", "id")
  ON DELETE CASCADE;
