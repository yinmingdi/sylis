import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const invariantPath = resolve(packageRoot, "prisma/invariants.sql");
const invariantMarker = "-- SQL-only invariants that Prisma cannot express.";

const invariantSql = readFileSync(invariantPath, "utf8").trim();
if (!invariantSql.startsWith(invariantMarker)) {
  throw new Error("DATABASE_INVARIANT_MARKER_MISSING");
}
for (const requiredFragment of [
  'CONSTRAINT "AuthSession_secure_shape_check"',
  `"audience" IN (
    'USER'::"SessionAudience",
    'ADMIN'::"SessionAudience"
  )`,
  'CREATE FUNCTION "sylis_guard_auth_session_update"()',
  'CREATE TRIGGER "AuthSession_update_guard"',
  "MESSAGE = 'AUTH_SESSION_EXPIRED_IMMUTABLE'",
  'CONSTRAINT "OperatorRoleAssignment_secure_shape_check"',
  'CREATE FUNCTION "sylis_mfa_credential_has_exact_child"(checked_credential_id uuid)',
  'CREATE FUNCTION "sylis_assert_operator_security"()',
  'CREATE TRIGGER "OperatorRoleAssignment_update_guard"',
  'CREATE CONSTRAINT TRIGGER "OperatorRoleAssignment_security_guard"',
  "MESSAGE = 'ACTIVE_OPERATOR_USABLE_MFA_REQUIRED'",
  "MESSAGE = 'ACTIVE_SECURITY_ADMIN_REQUIRED'",
  'CREATE FUNCTION "sylis_revoke_admin_sessions_for_identity_change"()',
  'CREATE TRIGGER "MfaRecoveryCode_session_revoke"',
  'CONSTRAINT "DiagnosticBundleRevision_confirmation_shape_check"',
  'CREATE FUNCTION "sylis_due_content_delete"(table_name text, row_data jsonb)',
  "WHEN 'ReadingDocumentRevision' THEN",
  "WHEN 'DiagnosticBundleRevision' THEN",
  "WHEN 'AgentArtifactRevision' THEN",
  "WHEN 'AgentPlanRevision' THEN",
  "'ReadingDocumentRevision',",
  "'DiagnosticBundleRevision',",
  "'AgentPlanRevision',",
  "'AgentArtifactRevision',",
  'CREATE FUNCTION "sylis_guard_outbox_event_update"()',
  'CREATE TRIGGER "OutboxEvent_update_guard"',
  "MESSAGE = 'OUTBOX_EVENT_BINDING_IMMUTABLE'",
  "MESSAGE = 'OUTBOX_EVENT_DELIVERY_TRANSITION_INVALID'",
  '"SecurityAuditEvent",',
  '"DataAccessAuditEvent",',
  '"RightsDecision",',
  '"CandidateRevision",',
  '"ReviewDecision",',
  '"ApprovalDecision",',
  '"AgentReleaseEvent",',
  '"ProviderRouteSecurityEvent",',
  '"CredentialSecurityEvent",',
  '"JobProgressEvent",',
  'CREATE FUNCTION "sylis_guard_agent_release_transition"()',
  'CREATE TRIGGER "ProviderRouteRelease_immutable_release_guard"',
  "MESSAGE = 'AGENT_RELEASE_TRANSITION_INVALID'",
  "MESSAGE = 'PROVIDER_ROUTE_RELEASE_TRANSITION_INVALID'",
  "MESSAGE = 'JOB_TERMINAL_IMMUTABLE'",
  'CREATE FUNCTION "sylis_guard_model_usage_ledger_insert"()',
  'CREATE TRIGGER "ModelUsageLedger_insert_guard"',
  "MESSAGE = 'MODEL_USAGE_BINDING_INVALID'",
  "MESSAGE = 'MODEL_USAGE_RESERVATION_INVALID'",
  "MESSAGE = 'MODEL_USAGE_SETTLEMENT_INVALID'",
  "MESSAGE = 'MODEL_USAGE_RELEASE_INVALID'",
  "MESSAGE = 'MODEL_USAGE_CORRECTION_INVALID'",
  "MESSAGE = 'MODEL_USAGE_BYOK_PLATFORM_SETTLEMENT_INVALID'",
  'CREATE FUNCTION "sylis_assert_model_usage_ledger_closure"()',
  'CREATE CONSTRAINT TRIGGER "ModelExecutionPermit_usage_closure_guard"',
  'CREATE CONSTRAINT TRIGGER "ModelUsageLedger_closure_guard"',
  "MESSAGE = 'MODEL_USAGE_RESERVATION_CARDINALITY_INVALID'",
  "MESSAGE = 'MODEL_USAGE_ACTIVE_LEDGER_INVALID'",
  "MESSAGE = 'MODEL_USAGE_TERMINAL_INCOMPLETE'",
  "MESSAGE = 'MODEL_USAGE_CORRECTION_TOTAL_INVALID'",
  "MESSAGE = 'MODEL_USAGE_UNUSED_TERMINAL_INVALID'",
  'CONSTRAINT "ModelContentBody_owner_xor_check"',
  'CONSTRAINT "ModelContentBody_envelope_and_lifecycle_check"',
  'CREATE TRIGGER "ModelContentBody_update_guard"',
  'CONSTRAINT "ModelExchangePart_normalized_shape_check"',
  'CREATE CONSTRAINT TRIGGER "ModelExchangePart_consent_guard"',
  'CREATE TRIGGER "ModelExchangePart_update_guard"',
  'CREATE CONSTRAINT TRIGGER "ConsentRecord_optional_exchange_withdrawal_guard"',
  "MESSAGE = 'MODEL_CONTENT_BODY_BINDING_IMMUTABLE'",
  "MESSAGE = 'MODEL_CONTENT_BODY_TRANSITION_INVALID'",
  "MESSAGE = 'MODEL_EXCHANGE_PART_CONSENT_INVALID'",
  "MESSAGE = 'MODEL_EXCHANGE_WITHDRAWAL_NOT_APPLIED'",
  'CREATE FUNCTION "sylis_operator_satisfies_role_expression"(',
  'CREATE TRIGGER "ApprovalPolicy_write_guard"',
  'CREATE TRIGGER "ApprovalRequest_write_guard"',
  'CREATE TRIGGER "ApprovalDecision_insert_guard"',
  "MESSAGE = 'APPROVAL_POLICY_SHAPE_INVALID'",
  "MESSAGE = 'APPROVAL_REQUEST_POLICY_SNAPSHOT_INVALID'",
  "MESSAGE = 'APPROVAL_REQUEST_BINDING_IMMUTABLE'",
  "MESSAGE = 'APPROVAL_REQUEST_TRANSITION_INVALID'",
  "MESSAGE = 'APPROVAL_DECISION_INVALID'",
  'CREATE UNIQUE INDEX "AgentRun_one_active_root_per_session_key"',
  'CREATE TRIGGER "AgentRun_hierarchy_binding_guard"',
  'CREATE CONSTRAINT TRIGGER "AgentRun_hierarchy_guard"',
  "MESSAGE = 'AGENT_ROOT_RUN_IDENTITY_INVALID'",
  "MESSAGE = 'AGENT_CHILD_RUN_PARENT_INVALID'",
  "MESSAGE = 'AGENT_CHILD_RUN_LIMIT_EXCEEDED'",
  'CREATE UNIQUE INDEX "AgentWaitCondition_one_active_per_run_key"',
  'CREATE TRIGGER "AgentRun_wait_resume_guard"',
  'CREATE CONSTRAINT TRIGGER "AgentRun_wait_state_guard"',
  'CREATE CONSTRAINT TRIGGER "AgentWaitCondition_run_state_guard"',
  'CREATE CONSTRAINT TRIGGER "AgentActivationJob_run_state_guard"',
  "MESSAGE = 'AGENT_WAIT_RESUME_JOB_INVALID'",
  "MESSAGE = 'AGENT_WAITING_ACTIVE_CONDITION_INVALID'",
  "MESSAGE = 'AGENT_WAITING_ACTIVATION_JOB_INVALID'",
  'CREATE TRIGGER "AgentProposal_binding_guard"',
  'CREATE CONSTRAINT TRIGGER "AgentProposal_commit_guard"',
  'CREATE CONSTRAINT TRIGGER "AgentToolGrant_proposal_guard"',
  'CREATE CONSTRAINT TRIGGER "IdempotencyRecord_proposal_guard"',
  "MESSAGE = 'AGENT_PROPOSAL_BINDING_IMMUTABLE'",
  "MESSAGE = 'AGENT_PROPOSAL_COMMIT_SHAPE_INVALID'",
  "MESSAGE = 'AGENT_PROPOSAL_GRANT_INVALID'",
  "MESSAGE = 'AGENT_PROPOSAL_IDEMPOTENCY_INVALID'",
  'CREATE TRIGGER "CredentialRevision_update_guard"',
  'CREATE TRIGGER "CredentialRevision_delete_guard"',
  'CREATE CONSTRAINT TRIGGER "CredentialProfile_current_revision_guard"',
  'CREATE TRIGGER "ModelExecutionPermit_credential_insert_guard"',
  'CREATE CONSTRAINT TRIGGER "CredentialProfile_issued_permit_guard"',
  'CREATE CONSTRAINT TRIGGER "CredentialRevision_issued_permit_guard"',
  "MESSAGE = 'CREDENTIAL_REVISION_BINDING_IMMUTABLE'",
  "MESSAGE = 'CREDENTIAL_REVISION_CONTENT_IMMUTABLE'",
  "MESSAGE = 'CREDENTIAL_REVISION_TRANSITION_INVALID'",
  "MESSAGE = 'CREDENTIAL_CURRENT_REVISION_INVALID'",
  "MESSAGE = 'MODEL_PERMIT_CREDENTIAL_INVALID'",
  "MESSAGE = 'CREDENTIAL_REVOCATION_HAS_ISSUED_PERMIT'",
]) {
  if (!invariantSql.includes(requiredFragment)) {
    throw new Error(`DATABASE_INVARIANT_INCOMPLETE:${requiredFragment}`);
  }
}

for (const forbiddenFragment of [
  "_prisma_migrations",
  "CREATE TABLE",
  "CREATE TYPE",
  "prisma migrate",
]) {
  if (invariantSql.includes(forbiddenFragment)) {
    throw new Error(`DATABASE_INVARIANT_FORBIDDEN:${forbiddenFragment}`);
  }
}

process.stdout.write(
  `database invariants valid bytes=${Buffer.byteLength(invariantSql)}\n`,
);
