-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'FINANCEIRO', 'OPERACIONAL', 'CLIENTE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'INVITED');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'DECIMAL', 'DATE', 'DATETIME', 'SELECT', 'MULTISELECT', 'BOOLEAN', 'FILE', 'PHONE', 'EMAIL', 'URL');

-- CreateEnum
CREATE TYPE "CustomFieldTarget" AS ENUM ('REQUEST', 'CLIENT', 'PROPOSAL', 'SERVICE_ORDER', 'CONTACT');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('ROLE', 'USER', 'ROUND_ROBIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "PdfTemplateType" AS ENUM ('PROPOSAL', 'INVOICE', 'REPORT', 'SERVICE_ORDER');

-- CreateEnum
CREATE TYPE "TemplateEngine" AS ENUM ('HANDLEBARS', 'BLOCKS');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('REQUEST_CREATED', 'STAGE_CHANGED', 'PROPOSAL_SENT', 'PROPOSAL_APPROVED', 'PROPOSAL_REJECTED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'TASK_COMPLETED', 'DOCUMENT_UPLOADED');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('SEND_EMAIL', 'SEND_NOTIFICATION', 'ASSIGN_USER', 'CHANGE_STAGE', 'CREATE_TASK', 'GENERATE_DOCUMENT', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "ConditionOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL', 'IS_NULL', 'IS_NOT_NULL', 'IN', 'NOT_IN');

-- CreateEnum
CREATE TYPE "CompanyResource" AS ENUM ('REQUEST', 'CLIENT', 'PROPOSAL', 'FINANCIAL', 'TASK', 'DOCUMENT', 'CHAT', 'SETTINGS', 'COMPANY_CONFIG', 'USER_MANAGEMENT', 'AUDIT_LOG');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'PUBLISH', 'EXPORT', 'ASSIGN');

-- CreateEnum
CREATE TYPE "SensitiveField" AS ENUM ('INTERNAL_COST', 'MARGIN', 'SUPPLIER_PRICE', 'GROSS_PROFIT', 'NET_PROFIT', 'PAYMENT_METHOD', 'BANK_ACCOUNT', 'FISCAL_KEY');

-- CreateEnum
CREATE TYPE "AuditOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'DEACTIVATE', 'REORDER', 'TRANSITION', 'ASSIGN', 'CANCEL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "taxId" TEXT NOT NULL,
    "stateRegistration" TEXT,
    "municipalRegistration" TEXT,
    "financialEmail" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "addressStreet" TEXT NOT NULL,
    "addressNumber" TEXT NOT NULL,
    "addressComplement" TEXT,
    "addressNeighborhood" TEXT NOT NULL,
    "addressCity" TEXT NOT NULL,
    "addressState" TEXT NOT NULL,
    "addressPostalCode" TEXT NOT NULL,
    "addressCountry" TEXT NOT NULL DEFAULT 'BR',

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMembership" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workflowId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "target" "CustomFieldTarget" NOT NULL,
    "serviceTypeId" TEXT,
    "type" "CustomFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "placeholder" TEXT,
    "helpText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldOption" (
    "id" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CustomFieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTransition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "fromStageId" TEXT NOT NULL,
    "toStageId" TEXT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageAssigneeRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "assignmentType" "AssignmentType" NOT NULL,
    "role" "Role",
    "membershipId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageAssigneeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundRobinCursor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "lastMembershipId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundRobinCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "resource" "CompanyResource" NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "resource" "CompanyResource" NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleFieldPermission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "field" "SensitiveField" NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleFieldPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFieldPermissionOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "field" "SensitiveField" NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFieldPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigAuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operation" "AuditOperation" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityCode" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "currentStageId" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedMembershipId" TEXT,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancellationReason" TEXT,
    "createdByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestFieldValue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(65,30),
    "valueBoolean" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "valueMulti" TEXT[],

    CONSTRAINT "RequestFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestStageHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "assignedByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "ClientType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dateOfBirth" TIMESTAMP(3),
    "legalName" TEXT,
    "tradeName" TEXT,
    "stateRegistration" TEXT,
    "municipalRegistration" TEXT,
    "taxId" TEXT,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "addressNeighborhood" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressPostalCode" TEXT,
    "addressCountry" TEXT DEFAULT 'BR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientFieldValue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(65,30),
    "valueBoolean" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "valueMulti" TEXT[],

    CONSTRAINT "ClientFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedMembershipId" TEXT,
    "createdByMembershipId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorMembershipId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "serviceRequestId" TEXT NOT NULL,
    "clientId" TEXT,
    "number" INTEGER NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "clientNotes" TEXT,
    "discountPct" DECIMAL(5,2),
    "discountAmount" DECIMAL(12,2),
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancellationReason" TEXT,
    "approvedByMembershipId" TEXT,
    "rejectedByMembershipId" TEXT,
    "createdByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountPct" DECIMAL(5,2),
    "internalCost" DECIMAL(12,2),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalStatusHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "fromStatus" "ProposalStatus",
    "toStatus" "ProposalStatus" NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalFieldValue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(65,30),
    "valueBoolean" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "valueMulti" TEXT[],

    CONSTRAINT "ProposalFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_taxId_key" ON "Company"("taxId");

-- CreateIndex
CREATE INDEX "Company_taxId_idx" ON "Company"("taxId");

-- CreateIndex
CREATE INDEX "CompanyMembership_companyId_idx" ON "CompanyMembership"("companyId");

-- CreateIndex
CREATE INDEX "CompanyMembership_companyId_role_idx" ON "CompanyMembership"("companyId", "role");

-- CreateIndex
CREATE INDEX "CompanyMembership_companyId_status_idx" ON "CompanyMembership"("companyId", "status");

-- CreateIndex
CREATE INDEX "CompanyMembership_userId_idx" ON "CompanyMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMembership_companyId_userId_key" ON "CompanyMembership"("companyId", "userId");

-- CreateIndex
CREATE INDEX "ServiceType_companyId_idx" ON "ServiceType"("companyId");

-- CreateIndex
CREATE INDEX "ServiceType_companyId_isActive_idx" ON "ServiceType"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceType_companyId_code_key" ON "ServiceType"("companyId", "code");

-- CreateIndex
CREATE INDEX "CustomField_companyId_target_idx" ON "CustomField"("companyId", "target");

-- CreateIndex
CREATE INDEX "CustomField_companyId_target_serviceTypeId_idx" ON "CustomField"("companyId", "target", "serviceTypeId");

-- CreateIndex
CREATE INDEX "CustomField_companyId_isActive_idx" ON "CustomField"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_companyId_code_key" ON "CustomField"("companyId", "code");

-- CreateIndex
CREATE INDEX "CustomFieldOption_customFieldId_idx" ON "CustomFieldOption"("customFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldOption_customFieldId_value_key" ON "CustomFieldOption"("customFieldId", "value");

-- CreateIndex
CREATE INDEX "Workflow_companyId_idx" ON "Workflow"("companyId");

-- CreateIndex
CREATE INDEX "Workflow_companyId_isDefault_idx" ON "Workflow"("companyId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_companyId_code_key" ON "Workflow"("companyId", "code");

-- CreateIndex
CREATE INDEX "WorkflowStage_companyId_idx" ON "WorkflowStage"("companyId");

-- CreateIndex
CREATE INDEX "WorkflowStage_workflowId_sortOrder_idx" ON "WorkflowStage"("workflowId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkflowStage_companyId_isActive_idx" ON "WorkflowStage"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStage_workflowId_code_key" ON "WorkflowStage"("workflowId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStage_workflowId_id_key" ON "WorkflowStage"("workflowId", "id");

-- CreateIndex
CREATE INDEX "StageTransition_companyId_idx" ON "StageTransition"("companyId");

-- CreateIndex
CREATE INDEX "StageTransition_workflowId_fromStageId_idx" ON "StageTransition"("workflowId", "fromStageId");

-- CreateIndex
CREATE UNIQUE INDEX "StageTransition_workflowId_fromStageId_toStageId_key" ON "StageTransition"("workflowId", "fromStageId", "toStageId");

-- CreateIndex
CREATE INDEX "StageAssigneeRule_companyId_idx" ON "StageAssigneeRule"("companyId");

-- CreateIndex
CREATE INDEX "StageAssigneeRule_companyId_stageId_idx" ON "StageAssigneeRule"("companyId", "stageId");

-- CreateIndex
CREATE INDEX "StageAssigneeRule_membershipId_idx" ON "StageAssigneeRule"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundRobinCursor_ruleId_key" ON "RoundRobinCursor"("ruleId");

-- CreateIndex
CREATE INDEX "RoundRobinCursor_companyId_idx" ON "RoundRobinCursor"("companyId");

-- CreateIndex
CREATE INDEX "RolePermission_companyId_role_idx" ON "RolePermission"("companyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_companyId_role_resource_action_key" ON "RolePermission"("companyId", "role", "resource", "action");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_companyId_membershipId_idx" ON "UserPermissionOverride"("companyId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionOverride_companyId_membershipId_resource_acti_key" ON "UserPermissionOverride"("companyId", "membershipId", "resource", "action");

-- CreateIndex
CREATE INDEX "RoleFieldPermission_companyId_role_idx" ON "RoleFieldPermission"("companyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "RoleFieldPermission_companyId_role_field_key" ON "RoleFieldPermission"("companyId", "role", "field");

-- CreateIndex
CREATE INDEX "UserFieldPermissionOverride_companyId_membershipId_idx" ON "UserFieldPermissionOverride"("companyId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFieldPermissionOverride_companyId_membershipId_field_key" ON "UserFieldPermissionOverride"("companyId", "membershipId", "field");

-- CreateIndex
CREATE INDEX "ConfigAuditLog_companyId_idx" ON "ConfigAuditLog"("companyId");

-- CreateIndex
CREATE INDEX "ConfigAuditLog_companyId_entityType_entityId_idx" ON "ConfigAuditLog"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ConfigAuditLog_companyId_actorId_idx" ON "ConfigAuditLog"("companyId", "actorId");

-- CreateIndex
CREATE INDEX "ConfigAuditLog_companyId_createdAt_idx" ON "ConfigAuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_companyId_idx" ON "ServiceRequest"("companyId");

-- CreateIndex
CREATE INDEX "ServiceRequest_companyId_currentStageId_idx" ON "ServiceRequest"("companyId", "currentStageId");

-- CreateIndex
CREATE INDEX "ServiceRequest_companyId_serviceTypeId_idx" ON "ServiceRequest"("companyId", "serviceTypeId");

-- CreateIndex
CREATE INDEX "ServiceRequest_companyId_clientId_idx" ON "ServiceRequest"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "ServiceRequest_companyId_assignedMembershipId_idx" ON "ServiceRequest"("companyId", "assignedMembershipId");

-- CreateIndex
CREATE INDEX "ServiceRequest_companyId_isCancelled_idx" ON "ServiceRequest"("companyId", "isCancelled");

-- CreateIndex
CREATE INDEX "ServiceRequest_companyId_createdAt_idx" ON "ServiceRequest"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_companyId_createdByMembershipId_idx" ON "ServiceRequest"("companyId", "createdByMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_companyId_number_key" ON "ServiceRequest"("companyId", "number");

-- CreateIndex
CREATE INDEX "RequestFieldValue_companyId_requestId_idx" ON "RequestFieldValue"("companyId", "requestId");

-- CreateIndex
CREATE INDEX "RequestFieldValue_customFieldId_idx" ON "RequestFieldValue"("customFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestFieldValue_requestId_customFieldId_key" ON "RequestFieldValue"("requestId", "customFieldId");

-- CreateIndex
CREATE INDEX "RequestStageHistory_companyId_requestId_idx" ON "RequestStageHistory"("companyId", "requestId");

-- CreateIndex
CREATE INDEX "RequestStageHistory_companyId_requestId_createdAt_idx" ON "RequestStageHistory"("companyId", "requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestAssignment_companyId_requestId_idx" ON "RequestAssignment"("companyId", "requestId");

-- CreateIndex
CREATE INDEX "RequestAssignment_companyId_membershipId_idx" ON "RequestAssignment"("companyId", "membershipId");

-- CreateIndex
CREATE INDEX "Client_companyId_idx" ON "Client"("companyId");

-- CreateIndex
CREATE INDEX "Client_companyId_type_idx" ON "Client"("companyId", "type");

-- CreateIndex
CREATE INDEX "Client_companyId_isActive_idx" ON "Client"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "Client_companyId_name_idx" ON "Client"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_companyId_number_key" ON "Client"("companyId", "number");

-- CreateIndex
CREATE INDEX "ClientFieldValue_companyId_clientId_idx" ON "ClientFieldValue"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "ClientFieldValue_customFieldId_idx" ON "ClientFieldValue"("customFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFieldValue_clientId_customFieldId_key" ON "ClientFieldValue"("clientId", "customFieldId");

-- CreateIndex
CREATE INDEX "Task_companyId_idx" ON "Task"("companyId");

-- CreateIndex
CREATE INDEX "Task_companyId_requestId_idx" ON "Task"("companyId", "requestId");

-- CreateIndex
CREATE INDEX "Task_companyId_status_idx" ON "Task"("companyId", "status");

-- CreateIndex
CREATE INDEX "Task_companyId_assignedMembershipId_idx" ON "Task"("companyId", "assignedMembershipId");

-- CreateIndex
CREATE INDEX "Task_companyId_dueAt_idx" ON "Task"("companyId", "dueAt");

-- CreateIndex
CREATE INDEX "Task_companyId_createdAt_idx" ON "Task"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_companyId_number_key" ON "Task"("companyId", "number");

-- CreateIndex
CREATE INDEX "TaskComment_companyId_taskId_idx" ON "TaskComment"("companyId", "taskId");

-- CreateIndex
CREATE INDEX "TaskComment_companyId_taskId_createdAt_idx" ON "TaskComment"("companyId", "taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_companyId_idx" ON "Proposal"("companyId");

-- CreateIndex
CREATE INDEX "Proposal_companyId_serviceRequestId_idx" ON "Proposal"("companyId", "serviceRequestId");

-- CreateIndex
CREATE INDEX "Proposal_companyId_clientId_idx" ON "Proposal"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "Proposal_companyId_status_idx" ON "Proposal"("companyId", "status");

-- CreateIndex
CREATE INDEX "Proposal_companyId_validUntil_idx" ON "Proposal"("companyId", "validUntil");

-- CreateIndex
CREATE INDEX "Proposal_companyId_createdAt_idx" ON "Proposal"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_companyId_number_key" ON "Proposal"("companyId", "number");

-- CreateIndex
CREATE INDEX "ProposalItem_companyId_proposalId_idx" ON "ProposalItem"("companyId", "proposalId");

-- CreateIndex
CREATE INDEX "ProposalItem_companyId_proposalId_sortOrder_idx" ON "ProposalItem"("companyId", "proposalId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProposalStatusHistory_companyId_proposalId_idx" ON "ProposalStatusHistory"("companyId", "proposalId");

-- CreateIndex
CREATE INDEX "ProposalStatusHistory_companyId_proposalId_createdAt_idx" ON "ProposalStatusHistory"("companyId", "proposalId", "createdAt");

-- CreateIndex
CREATE INDEX "ProposalFieldValue_companyId_proposalId_idx" ON "ProposalFieldValue"("companyId", "proposalId");

-- CreateIndex
CREATE INDEX "ProposalFieldValue_customFieldId_idx" ON "ProposalFieldValue"("customFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalFieldValue_proposalId_customFieldId_key" ON "ProposalFieldValue"("proposalId", "customFieldId");

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceType" ADD CONSTRAINT "ServiceType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceType" ADD CONSTRAINT "ServiceType_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldOption" ADD CONSTRAINT "CustomFieldOption_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "WorkflowStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "WorkflowStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageAssigneeRule" ADD CONSTRAINT "StageAssigneeRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageAssigneeRule" ADD CONSTRAINT "StageAssigneeRule_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "WorkflowStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageAssigneeRule" ADD CONSTRAINT "StageAssigneeRule_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundRobinCursor" ADD CONSTRAINT "RoundRobinCursor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundRobinCursor" ADD CONSTRAINT "RoundRobinCursor_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "StageAssigneeRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundRobinCursor" ADD CONSTRAINT "RoundRobinCursor_lastMembershipId_fkey" FOREIGN KEY ("lastMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleFieldPermission" ADD CONSTRAINT "RoleFieldPermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFieldPermissionOverride" ADD CONSTRAINT "UserFieldPermissionOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFieldPermissionOverride" ADD CONSTRAINT "UserFieldPermissionOverride_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigAuditLog" ADD CONSTRAINT "ConfigAuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigAuditLog" ADD CONSTRAINT "ConfigAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "WorkflowStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_assignedMembershipId_fkey" FOREIGN KEY ("assignedMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestFieldValue" ADD CONSTRAINT "RequestFieldValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestFieldValue" ADD CONSTRAINT "RequestFieldValue_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestFieldValue" ADD CONSTRAINT "RequestFieldValue_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStageHistory" ADD CONSTRAINT "RequestStageHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStageHistory" ADD CONSTRAINT "RequestStageHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStageHistory" ADD CONSTRAINT "RequestStageHistory_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "WorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStageHistory" ADD CONSTRAINT "RequestStageHistory_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "WorkflowStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStageHistory" ADD CONSTRAINT "RequestStageHistory_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignment" ADD CONSTRAINT "RequestAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignment" ADD CONSTRAINT "RequestAssignment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignment" ADD CONSTRAINT "RequestAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignment" ADD CONSTRAINT "RequestAssignment_assignedByMembershipId_fkey" FOREIGN KEY ("assignedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFieldValue" ADD CONSTRAINT "ClientFieldValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFieldValue" ADD CONSTRAINT "ClientFieldValue_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFieldValue" ADD CONSTRAINT "ClientFieldValue_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedMembershipId_fkey" FOREIGN KEY ("assignedMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_approvedByMembershipId_fkey" FOREIGN KEY ("approvedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_rejectedByMembershipId_fkey" FOREIGN KEY ("rejectedByMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalStatusHistory" ADD CONSTRAINT "ProposalStatusHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalStatusHistory" ADD CONSTRAINT "ProposalStatusHistory_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalStatusHistory" ADD CONSTRAINT "ProposalStatusHistory_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "CompanyMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalFieldValue" ADD CONSTRAINT "ProposalFieldValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalFieldValue" ADD CONSTRAINT "ProposalFieldValue_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalFieldValue" ADD CONSTRAINT "ProposalFieldValue_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

