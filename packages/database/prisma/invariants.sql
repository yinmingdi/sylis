-- SQL-only invariants that Prisma cannot express.
ALTER TABLE "PasswordCredential"
ADD CONSTRAINT "PasswordCredential_secure_storage_check"
CHECK (
  "hash" ~ '^\$argon2id\$v=[0-9]+\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'
  AND "parameters" = '{"encoding":"PHC"}'::jsonb
  AND ("revokedAt" IS NULL OR "revokedAt" >= "changedAt")
);

ALTER TABLE "VerificationChallenge"
ADD CONSTRAINT "VerificationChallenge_secure_shape_check"
CHECK (
  "destinationHash" ~ '^[0-9a-f]{64}$'
  AND "codeHash" ~ '^[0-9a-f]{64}$'
  AND "attemptCount" >= 0
  AND "expiresAt" > "createdAt"
  AND (
    "consumedAt" IS NULL
    OR ("consumedAt" >= "createdAt" AND "consumedAt" <= "expiresAt")
  )
);

ALTER TABLE "AuthenticationChallenge"
ADD CONSTRAINT "AuthenticationChallenge_secure_shape_check"
CHECK (
  "deviceNonceHash" ~ '^[0-9a-f]{64}$'
  AND "attemptCount" >= 0
  AND "expiresAt" > "createdAt"
  AND ("passwordVerifiedAt" IS NULL OR "passwordVerifiedAt" <= "expiresAt")
  AND (
    "consumedAt" IS NULL
    OR ("consumedAt" >= "createdAt" AND "consumedAt" <= "expiresAt")
  )
);

ALTER TABLE "WebAuthnCredential"
ADD CONSTRAINT "WebAuthnCredential_secure_shape_check"
CHECK (
  octet_length("credentialId") > 0
  AND octet_length("publicKey") > 0
  AND "signCount" >= 0
);

ALTER TABLE "TotpCredential"
ADD CONSTRAINT "TotpCredential_secure_storage_check"
CHECK (
  octet_length("secretCiphertext") >= 29
  AND length(btrim("keyVersion")) > 0
  AND "digits" IN (6, 7, 8)
  AND "period" BETWEEN 15 AND 120
);

ALTER TABLE "MfaRecoveryCode"
ADD CONSTRAINT "MfaRecoveryCode_secure_storage_check"
CHECK (
  "codeHash" ~ '^\$argon2id\$v=[0-9]+\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'
);

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_secure_shape_check"
CHECK (
  "tokenHash" ~ '^[0-9a-f]{64}$'
  AND "csrfTokenHash" ~ '^[0-9a-f]{64}$'
  AND ("ipHash" IS NULL OR "ipHash" ~ '^[0-9a-f]{64}$')
  AND ("userAgentHash" IS NULL OR "userAgentHash" ~ '^[0-9a-f]{64}$')
  AND "securityVersion" >= 0
  AND "lastSeenAt" >= "createdAt"
  AND "lastSeenAt" < "idleExpiresAt"
  AND "idleExpiresAt" > "createdAt"
  AND "idleExpiresAt" <= "expiresAt"
  AND "expiresAt" > "createdAt"
  AND "audience" IN (
    'USER'::"SessionAudience",
    'ADMIN'::"SessionAudience"
  )
  AND (
    ("revokedAt" IS NULL AND "revokeReason" IS NULL)
    OR (
      "revokedAt" IS NOT NULL
      AND "revokeReason" IS NOT NULL
      AND "revokedAt" >= "createdAt"
    )
  )
  AND (
    ("authStrength" = 'PASSWORD'::"SessionAuthStrength" AND "mfaAuthenticatedAt" IS NULL)
    OR (
      "authStrength" = 'PASSWORD_MFA'::"SessionAuthStrength"
      AND "mfaAuthenticatedAt" IS NOT NULL
      AND "mfaAuthenticatedAt" >= "createdAt"
      AND "mfaAuthenticatedAt" <= "expiresAt"
    )
  )
  AND (
    "reAuthenticatedAt" IS NULL
    OR (
      "reAuthenticatedAt" >= "createdAt"
      AND "reAuthenticatedAt" <= "expiresAt"
    )
  )
  AND (
    "audience" <> 'ADMIN'::"SessionAudience"
    OR (
      "authStrength" = 'PASSWORD_MFA'::"SessionAuthStrength"
      AND "mfaAuthenticatedAt" IS NOT NULL
    )
  )
);

CREATE FUNCTION "sylis_guard_auth_session_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."audience" IS DISTINCT FROM OLD."audience"
     OR NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash"
     OR NEW."csrfTokenHash" IS DISTINCT FROM OLD."csrfTokenHash"
     OR NEW."authStrength" IS DISTINCT FROM OLD."authStrength"
     OR NEW."securityVersion" IS DISTINCT FROM OLD."securityVersion"
     OR NEW."mfaAuthenticatedAt" IS DISTINCT FROM OLD."mfaAuthenticatedAt"
     OR NEW."reAuthenticatedAt" IS DISTINCT FROM OLD."reAuthenticatedAt"
     OR NEW."ipHash" IS DISTINCT FROM OLD."ipHash"
     OR NEW."userAgentHash" IS DISTINCT FROM OLD."userAgentHash"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'AUTH_SESSION_BINDING_IMMUTABLE';
  END IF;

  IF OLD."revokedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'AUTH_SESSION_REVOKED_IMMUTABLE';
  END IF;

  IF OLD."expiresAt" <= statement_timestamp()
     OR OLD."idleExpiresAt" <= statement_timestamp() THEN
    IF NEW."revokedAt" IS NULL
       OR NEW."lastSeenAt" IS DISTINCT FROM OLD."lastSeenAt"
       OR NEW."idleExpiresAt" IS DISTINCT FROM OLD."idleExpiresAt"
       OR NEW."deviceLabel" IS DISTINCT FROM OLD."deviceLabel" THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'AUTH_SESSION_EXPIRED_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."lastSeenAt" < OLD."lastSeenAt"
     OR NEW."idleExpiresAt" < OLD."idleExpiresAt" THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'AUTH_SESSION_CLOCK_NON_MONOTONIC';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuthSession_update_guard"
BEFORE UPDATE ON "AuthSession"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_auth_session_update"();

ALTER TABLE "MfaCredential"
ADD CONSTRAINT "MfaCredential_state_shape_check"
CHECK (
  ("verifiedAt" IS NULL OR "verifiedAt" >= "createdAt")
  AND ("lastUsedAt" IS NULL OR "lastUsedAt" >= "createdAt")
  AND ("disabledAt" IS NULL OR "disabledAt" >= "createdAt")
  AND (
    "status" <> 'VERIFIED'::"CredentialStatus"
    OR ("verifiedAt" IS NOT NULL AND "disabledAt" IS NULL)
  )
);

ALTER TABLE "OperatorRoleAssignment"
ADD CONSTRAINT "OperatorRoleAssignment_secure_shape_check"
CHECK (
  length(btrim("reason")) > 0
  AND length(btrim("policyVersion")) > 0
  AND "actionDigest" ~ '^sha256:[0-9a-f]{64}$'
  AND ("expiresAt" IS NULL OR "expiresAt" > "grantedAt")
  AND (
    "source" <> 'ADMIN_COMMAND'::"OperatorRoleAssignmentSource"
    OR (
      "userId" <> "grantedByUserId"
      AND "expiresAt" IS NOT NULL
      AND "expiresAt" <= "grantedAt" + interval '366 days'
    )
  )
  AND (
    ("revokedAt" IS NULL AND "revokedByUserId" IS NULL AND "revocationReason" IS NULL)
    OR (
      "revokedAt" IS NOT NULL
      AND "revokedByUserId" IS NOT NULL
      AND "revocationReason" IS NOT NULL
      AND "revokedAt" >= "grantedAt"
      AND "revokedByUserId" <> "userId"
      AND length(btrim("revocationReason")) > 0
    )
  )
);

CREATE FUNCTION "sylis_guard_operator_bootstrap_state"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'OPERATOR_BOOTSTRAP_STATE_IMMUTABLE';
  END IF;

  IF NEW."singletonKey" <> 'primary'
     OR EXISTS (SELECT 1 FROM "OperatorBootstrapState")
     OR EXISTS (SELECT 1 FROM "OperatorRoleAssignment") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'OPERATOR_BOOTSTRAP_ALREADY_CONSUMED';
  END IF;

  IF NOT "sylis_user_has_usable_mfa"(NEW."operatorUserId") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'OPERATOR_BOOTSTRAP_USABLE_MFA_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "OperatorBootstrapState_write_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "OperatorBootstrapState"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_operator_bootstrap_state"();

CREATE FUNCTION "sylis_guard_bootstrap_role_assignment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bootstrap_state "OperatorBootstrapState"%ROWTYPE;
BEGIN
  IF NEW.source <> 'BOOTSTRAP'::"OperatorRoleAssignmentSource" THEN
    RETURN NEW;
  END IF;

  SELECT * INTO bootstrap_state
  FROM "OperatorBootstrapState"
  WHERE "singletonKey" = 'primary';

  IF bootstrap_state."singletonKey" IS NULL
     OR NEW."userId" <> bootstrap_state."operatorUserId"
     OR NEW."grantedByUserId" <> bootstrap_state."operatorUserId"
     OR NEW."expiresAt" IS NOT NULL
     OR NEW."revokedAt" IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM "OperatorRoleAssignment" assignment
       WHERE assignment.source = 'BOOTSTRAP'::"OperatorRoleAssignmentSource"
         AND assignment.role = NEW.role
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'OPERATOR_BOOTSTRAP_ROLE_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "OperatorRoleAssignment_bootstrap_insert_guard"
BEFORE INSERT ON "OperatorRoleAssignment"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_bootstrap_role_assignment"();

CREATE FUNCTION "sylis_assert_operator_bootstrap"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_count integer;
  distinct_role_count integer;
  bootstrap_policy_version text;
  bootstrap_policy_version_max text;
  audit_count integer;
BEGIN
  SELECT
    count(*),
    count(DISTINCT assignment.role),
    min(assignment."policyVersion"),
    max(assignment."policyVersion")
    INTO
      assignment_count,
      distinct_role_count,
      bootstrap_policy_version,
      bootstrap_policy_version_max
  FROM "OperatorRoleAssignment" assignment
  WHERE assignment.source = 'BOOTSTRAP'::"OperatorRoleAssignmentSource"
    AND assignment."userId" = NEW."operatorUserId"
    AND assignment."grantedByUserId" = NEW."operatorUserId"
    AND assignment."expiresAt" IS NULL
    AND assignment."revokedAt" IS NULL;

  IF assignment_count <> cardinality(enum_range(NULL::"OperatorRole"))
     OR distinct_role_count <> cardinality(enum_range(NULL::"OperatorRole"))
     OR bootstrap_policy_version IS DISTINCT FROM bootstrap_policy_version_max
     OR (SELECT count(*) FROM "OperatorRoleAssignment") <> assignment_count
     OR EXISTS (
       SELECT role
       FROM unnest(enum_range(NULL::"OperatorRole")) AS required(role)
       EXCEPT
       SELECT assignment.role
       FROM "OperatorRoleAssignment" assignment
       WHERE assignment.source = 'BOOTSTRAP'::"OperatorRoleAssignmentSource"
         AND assignment."userId" = NEW."operatorUserId"
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'OPERATOR_BOOTSTRAP_ASSIGNMENTS_INVALID';
  END IF;

  SELECT count(*) INTO audit_count
  FROM "SecurityAuditEvent" event
  WHERE event."actorUserId" = NEW."operatorUserId"
    AND event.category = 'SECURITY'::"SecurityAuditCategory"
    AND event.action = 'operator.bootstrap.completed'
    AND event."actorRole" = 'SECURITY_ADMIN'::"OperatorRole"
    AND event."targetType" = 'User'
    AND event."targetId" = NEW."operatorUserId"
    AND event."actionDigest" = NEW."actionDigest"
    AND event."policyVersion" = bootstrap_policy_version
    AND event.result = 'SUCCEEDED'::"SecurityAuditResult"
    AND event.metadata ->> 'bootstrapStateKey' = NEW."singletonKey";

  IF audit_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'OPERATOR_BOOTSTRAP_AUDIT_REQUIRED';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "OperatorBootstrapState_completion_guard"
AFTER INSERT ON "OperatorBootstrapState"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_operator_bootstrap"();

CREATE FUNCTION "sylis_mfa_credential_has_exact_child"(checked_credential_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "MfaCredential" credential
    WHERE credential.id = checked_credential_id
      AND (
        (
          credential.kind = 'TOTP'::"MfaCredentialKind"
          AND EXISTS (
            SELECT 1 FROM "TotpCredential" totp
            WHERE totp."mfaCredentialId" = credential.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM "WebAuthnCredential" webauthn
            WHERE webauthn."mfaCredentialId" = credential.id
          )
        )
        OR (
          credential.kind = 'WEBAUTHN'::"MfaCredentialKind"
          AND EXISTS (
            SELECT 1 FROM "WebAuthnCredential" webauthn
            WHERE webauthn."mfaCredentialId" = credential.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM "TotpCredential" totp
            WHERE totp."mfaCredentialId" = credential.id
          )
        )
      )
  );
$$;

CREATE FUNCTION "sylis_mfa_credential_is_usable"(checked_credential_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "MfaCredential" credential
    WHERE credential.id = checked_credential_id
      AND credential.status = 'VERIFIED'::"CredentialStatus"
      AND credential."verifiedAt" IS NOT NULL
      AND credential."disabledAt" IS NULL
      AND "sylis_mfa_credential_has_exact_child"(credential.id)
  );
$$;

CREATE FUNCTION "sylis_user_has_usable_mfa"(checked_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "MfaCredential" credential
    WHERE credential."userId" = checked_user_id
      AND "sylis_mfa_credential_is_usable"(credential.id)
  );
$$;

CREATE FUNCTION "sylis_assert_mfa_exact_child"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_credential_id uuid;
  previous_credential_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'MfaCredential' THEN
    IF TG_OP = 'DELETE' THEN
      checked_credential_id := OLD.id;
    ELSE
      checked_credential_id := NEW.id;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      previous_credential_id := OLD.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      checked_credential_id := OLD."mfaCredentialId";
    ELSE
      checked_credential_id := NEW."mfaCredentialId";
    END IF;
    IF TG_OP = 'UPDATE' THEN
      previous_credential_id := OLD."mfaCredentialId";
    END IF;
  END IF;

  IF previous_credential_id IS DISTINCT FROM checked_credential_id
     AND EXISTS (
       SELECT 1 FROM "MfaCredential" WHERE id = previous_credential_id
     )
     AND NOT "sylis_mfa_credential_has_exact_child"(previous_credential_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MFA_CREDENTIAL_EXACT_CHILD_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "MfaCredential" WHERE id = checked_credential_id
  ) AND NOT "sylis_mfa_credential_has_exact_child"(checked_credential_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MFA_CREDENTIAL_EXACT_CHILD_REQUIRED';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "MfaCredential_exact_child_guard"
AFTER INSERT OR UPDATE OR DELETE ON "MfaCredential"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_mfa_exact_child"();

CREATE CONSTRAINT TRIGGER "WebAuthnCredential_exact_child_guard"
AFTER INSERT OR UPDATE OR DELETE ON "WebAuthnCredential"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_mfa_exact_child"();

CREATE CONSTRAINT TRIGGER "TotpCredential_exact_child_guard"
AFTER INSERT OR UPDATE OR DELETE ON "TotpCredential"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_mfa_exact_child"();

CREATE FUNCTION "sylis_guard_operator_role_assignment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'OPERATOR_ROLE_ASSIGNMENT_DELETE_FORBIDDEN';
  END IF;

  IF OLD."revokedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'OPERATOR_ROLE_ASSIGNMENT_REVOKED_IMMUTABLE';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW."grantedByUserId" IS DISTINCT FROM OLD."grantedByUserId"
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW."policyVersion" IS DISTINCT FROM OLD."policyVersion"
     OR NEW."grantedAt" IS DISTINCT FROM OLD."grantedAt"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
     OR NEW."actionDigest" IS DISTINCT FROM OLD."actionDigest" THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'OPERATOR_ROLE_ASSIGNMENT_BINDING_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "OperatorRoleAssignment_update_guard"
BEFORE UPDATE OR DELETE ON "OperatorRoleAssignment"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_operator_role_assignment"();

CREATE FUNCTION "sylis_assert_operator_security"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_user_id uuid;
  previous_user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'OperatorRoleAssignment' THEN
    checked_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END;
    IF TG_OP = 'UPDATE' THEN
      previous_user_id := OLD."userId";
    END IF;
  ELSIF TG_TABLE_NAME = 'MfaCredential' THEN
    checked_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END;
    IF TG_OP = 'UPDATE' THEN
      previous_user_id := OLD."userId";
    END IF;
  ELSIF TG_TABLE_NAME = 'OperatorBootstrapState' THEN
    checked_user_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."operatorUserId"
      ELSE NEW."operatorUserId"
    END;
    IF TG_OP = 'UPDATE' THEN
      previous_user_id := OLD."operatorUserId";
    END IF;
  ELSE
    SELECT credential."userId" INTO checked_user_id
    FROM "MfaCredential" credential
    WHERE credential.id = CASE
      WHEN TG_OP = 'DELETE' THEN OLD."mfaCredentialId"
      ELSE NEW."mfaCredentialId"
    END;
    IF TG_OP = 'UPDATE' THEN
      SELECT credential."userId" INTO previous_user_id
      FROM "MfaCredential" credential
      WHERE credential.id = OLD."mfaCredentialId";
    END IF;
  END IF;

  IF checked_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM "OperatorRoleAssignment" assignment
       WHERE assignment."userId" = checked_user_id
         AND assignment."revokedAt" IS NULL
         AND (assignment."expiresAt" IS NULL OR assignment."expiresAt" > statement_timestamp())
     )
     AND NOT "sylis_user_has_usable_mfa"(checked_user_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ACTIVE_OPERATOR_USABLE_MFA_REQUIRED';
  END IF;

  IF previous_user_id IS DISTINCT FROM checked_user_id
     AND previous_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM "OperatorRoleAssignment" assignment
       WHERE assignment."userId" = previous_user_id
         AND assignment."revokedAt" IS NULL
         AND (assignment."expiresAt" IS NULL OR assignment."expiresAt" > statement_timestamp())
     )
     AND NOT "sylis_user_has_usable_mfa"(previous_user_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ACTIVE_OPERATOR_USABLE_MFA_REQUIRED';
  END IF;

  IF EXISTS (SELECT 1 FROM "OperatorRoleAssignment")
     AND NOT EXISTS (
       SELECT 1
       FROM "OperatorRoleAssignment" assignment
       WHERE assignment.role = 'SECURITY_ADMIN'::"OperatorRole"
         AND assignment."revokedAt" IS NULL
         AND (assignment."expiresAt" IS NULL OR assignment."expiresAt" > statement_timestamp())
         AND "sylis_user_has_usable_mfa"(assignment."userId")
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ACTIVE_SECURITY_ADMIN_REQUIRED';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "OperatorRoleAssignment_security_guard"
AFTER INSERT OR UPDATE OR DELETE ON "OperatorRoleAssignment"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_operator_security"();

CREATE CONSTRAINT TRIGGER "OperatorBootstrapState_security_guard"
AFTER INSERT OR UPDATE OR DELETE ON "OperatorBootstrapState"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_operator_security"();

CREATE CONSTRAINT TRIGGER "MfaCredential_operator_security_guard"
AFTER INSERT OR UPDATE OR DELETE ON "MfaCredential"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_operator_security"();

CREATE CONSTRAINT TRIGGER "WebAuthnCredential_operator_security_guard"
AFTER INSERT OR UPDATE OR DELETE ON "WebAuthnCredential"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_operator_security"();

CREATE CONSTRAINT TRIGGER "TotpCredential_operator_security_guard"
AFTER INSERT OR UPDATE OR DELETE ON "TotpCredential"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_operator_security"();

CREATE FUNCTION "sylis_revoke_admin_sessions_for_identity_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_user_id uuid;
  previous_user_id uuid;
  revoke_reason "SessionRevokeReason";
BEGIN
  IF TG_TABLE_NAME = 'OperatorRoleAssignment' THEN
    IF TG_OP = 'UPDATE' AND NEW."revokedAt" IS NOT DISTINCT FROM OLD."revokedAt" THEN
      RETURN NEW;
    END IF;
    checked_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END;
    IF TG_OP = 'UPDATE' THEN
      previous_user_id := OLD."userId";
    END IF;
    revoke_reason := 'OPERATOR_ROLE_CHANGED'::"SessionRevokeReason";
  ELSIF TG_TABLE_NAME = 'PasswordCredential' THEN
    IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
      RETURN NEW;
    END IF;
    checked_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END;
    IF TG_OP = 'UPDATE' THEN
      previous_user_id := OLD."userId";
    END IF;
    revoke_reason := 'SECURITY_VERSION_CHANGED'::"SessionRevokeReason";
  ELSIF TG_TABLE_NAME = 'MfaCredential' THEN
    IF TG_OP = 'UPDATE'
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW."userId" IS NOT DISTINCT FROM OLD."userId"
       AND NEW.kind IS NOT DISTINCT FROM OLD.kind
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW."verifiedAt" IS NOT DISTINCT FROM OLD."verifiedAt"
       AND NEW."disabledAt" IS NOT DISTINCT FROM OLD."disabledAt"
       AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt" THEN
      RETURN NEW;
    END IF;
    checked_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END;
    IF TG_OP = 'UPDATE' THEN
      previous_user_id := OLD."userId";
    END IF;
    revoke_reason := 'SECURITY_VERSION_CHANGED'::"SessionRevokeReason";
  ELSE
    IF TG_TABLE_NAME = 'WebAuthnCredential' THEN
      IF TG_OP = 'UPDATE'
       AND NEW."mfaCredentialId" IS NOT DISTINCT FROM OLD."mfaCredentialId"
       AND NEW."credentialId" IS NOT DISTINCT FROM OLD."credentialId"
       AND NEW."publicKey" IS NOT DISTINCT FROM OLD."publicKey"
       AND NEW.aaguid IS NOT DISTINCT FROM OLD.aaguid
       AND NEW.transports IS NOT DISTINCT FROM OLD.transports THEN
        RETURN NEW;
      END IF;

    ELSIF TG_TABLE_NAME IN ('TotpCredential', 'MfaRecoveryCode') THEN
      IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
        RETURN NEW;
      END IF;
    END IF;

    SELECT credential."userId" INTO checked_user_id
    FROM "MfaCredential" credential
    WHERE credential.id = CASE
      WHEN TG_OP = 'DELETE' THEN OLD."mfaCredentialId"
      ELSE NEW."mfaCredentialId"
    END;
    IF TG_OP = 'UPDATE' THEN
      SELECT credential."userId" INTO previous_user_id
      FROM "MfaCredential" credential
      WHERE credential.id = OLD."mfaCredentialId";
    END IF;
    revoke_reason := 'SECURITY_VERSION_CHANGED'::"SessionRevokeReason";
  END IF;

  IF checked_user_id IS NOT NULL THEN
    UPDATE "AuthSession"
    SET "revokedAt" = statement_timestamp(),
        "revokeReason" = revoke_reason
    WHERE "userId" = checked_user_id
      AND "audience" = 'ADMIN'::"SessionAudience"
      AND "revokedAt" IS NULL;
  END IF;

  IF previous_user_id IS DISTINCT FROM checked_user_id
     AND previous_user_id IS NOT NULL THEN
    UPDATE "AuthSession"
    SET "revokedAt" = statement_timestamp(),
        "revokeReason" = revoke_reason
    WHERE "userId" = previous_user_id
      AND "audience" = 'ADMIN'::"SessionAudience"
      AND "revokedAt" IS NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "OperatorRoleAssignment_session_revoke"
AFTER INSERT OR UPDATE OR DELETE ON "OperatorRoleAssignment"
FOR EACH ROW EXECUTE FUNCTION "sylis_revoke_admin_sessions_for_identity_change"();

CREATE TRIGGER "PasswordCredential_session_revoke"
AFTER INSERT OR UPDATE OR DELETE ON "PasswordCredential"
FOR EACH ROW EXECUTE FUNCTION "sylis_revoke_admin_sessions_for_identity_change"();

CREATE TRIGGER "MfaCredential_session_revoke"
AFTER INSERT OR UPDATE OR DELETE ON "MfaCredential"
FOR EACH ROW EXECUTE FUNCTION "sylis_revoke_admin_sessions_for_identity_change"();

CREATE TRIGGER "WebAuthnCredential_session_revoke"
AFTER INSERT OR UPDATE OR DELETE ON "WebAuthnCredential"
FOR EACH ROW EXECUTE FUNCTION "sylis_revoke_admin_sessions_for_identity_change"();

CREATE TRIGGER "TotpCredential_session_revoke"
AFTER INSERT OR UPDATE OR DELETE ON "TotpCredential"
FOR EACH ROW EXECUTE FUNCTION "sylis_revoke_admin_sessions_for_identity_change"();

CREATE TRIGGER "MfaRecoveryCode_session_revoke"
AFTER INSERT OR UPDATE OR DELETE ON "MfaRecoveryCode"
FOR EACH ROW EXECUTE FUNCTION "sylis_revoke_admin_sessions_for_identity_change"();

ALTER TABLE "Provenance"
ADD CONSTRAINT "Provenance_content_hash_check"
CHECK ("contentHash" ~ '^sha256:[0-9a-f]{64}$');

ALTER TABLE "ContentEvidence"
ADD CONSTRAINT "ContentEvidence_target_exact_one_check"
CHECK (num_nonnulls("sourceRecordId", "upstreamProvenanceId") = 1),
ADD CONSTRAINT "ContentEvidence_no_self_reference_check"
CHECK ("upstreamProvenanceId" IS NULL OR "upstreamProvenanceId" <> "provenanceId"),
ADD CONSTRAINT "ContentEvidence_kind_target_check"
CHECK (
  ("evidenceKind" = 'DIRECT' AND "sourceRecordId" IS NOT NULL)
  OR ("evidenceKind" = 'GENERATED' AND "upstreamProvenanceId" IS NOT NULL)
  OR "evidenceKind" IN ('DERIVED', 'SUPPORTING', 'CONTRADICTING')
);

CREATE UNIQUE INDEX "ContentEvidence_source_target_key"
ON "ContentEvidence" ("provenanceId", "evidenceKind", "sourceRecordId")
WHERE "sourceRecordId" IS NOT NULL;

CREATE UNIQUE INDEX "ContentEvidence_upstream_target_key"
ON "ContentEvidence" ("provenanceId", "evidenceKind", "upstreamProvenanceId")
WHERE "upstreamProvenanceId" IS NOT NULL;

ALTER TABLE "CandidateRevision"
ADD CONSTRAINT "CandidateRevision_shape_check"
CHECK (
  "revisionNo" > 0
  AND "contentHash" ~ '^sha256:[0-9a-f]{64}$'
  AND "evidenceSetHash" ~ '^sha256:[0-9a-f]{64}$'
);

ALTER TABLE "CandidateRevisionEvidence"
ADD CONSTRAINT "CandidateRevisionEvidence_target_exact_one_check"
CHECK (num_nonnulls("sourceRecordId", "upstreamProvenanceId") = 1),
ADD CONSTRAINT "CandidateRevisionEvidence_kind_target_check"
CHECK (
  ("evidenceKind" = 'DIRECT' AND "sourceRecordId" IS NOT NULL)
  OR ("evidenceKind" = 'GENERATED' AND "upstreamProvenanceId" IS NOT NULL)
  OR "evidenceKind" IN ('DERIVED', 'SUPPORTING', 'CONTRADICTING')
);

CREATE UNIQUE INDEX "CandidateRevisionEvidence_source_target_key"
ON "CandidateRevisionEvidence" ("candidateRevisionId", "evidenceKind", "sourceRecordId")
WHERE "sourceRecordId" IS NOT NULL;

CREATE UNIQUE INDEX "CandidateRevisionEvidence_upstream_target_key"
ON "CandidateRevisionEvidence" ("candidateRevisionId", "evidenceKind", "upstreamProvenanceId")
WHERE "upstreamProvenanceId" IS NOT NULL;

ALTER TABLE "RightsDecision"
ADD CONSTRAINT "RightsDecision_shape_check"
CHECK (
  length(btrim("policyVersion")) > 0
  AND "actionDigest" ~ '^sha256:[0-9a-f]{64}$'
);

ALTER TABLE "RightsDecisionEvidence"
ADD CONSTRAINT "RightsDecisionEvidence_shape_check"
CHECK (
  "referenceUri" ~ '^[A-Za-z][A-Za-z0-9+.-]*:'
  AND "contentHash" ~ '^sha256:[0-9a-f]{64}$'
  AND ("note" IS NULL OR length(btrim("note")) > 0)
);

CREATE FUNCTION "sylis_source_record_has_required_rights"(
  checked_source_record_id uuid,
  require_public_rights boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "SourceRecord" source_record
    JOIN "SourceDatasetVersion" dataset_version
      ON dataset_version.id = source_record."datasetVersionId"
    JOIN "SourceRightsPolicy" rights_policy
      ON rights_policy.id = dataset_version."rightsPolicyId"
    WHERE source_record.id = checked_source_record_id
      AND rights_policy."mayBuild"
      AND (
        NOT require_public_rights
        OR (rights_policy."mayServe" AND rights_policy."mayExport")
      )
  );
$$;

CREATE FUNCTION "sylis_provenance_is_source_backed"(checked_provenance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE provenance_chain(id, path) AS (
    SELECT checked_provenance_id, ARRAY[checked_provenance_id]
    UNION ALL
    SELECT evidence."upstreamProvenanceId", chain.path || evidence."upstreamProvenanceId"
    FROM provenance_chain chain
    JOIN "ContentEvidence" evidence ON evidence."provenanceId" = chain.id
    WHERE evidence."upstreamProvenanceId" IS NOT NULL
      AND NOT evidence."upstreamProvenanceId" = ANY(chain.path)
  )
  SELECT EXISTS (
    SELECT 1
    FROM provenance_chain chain
    JOIN "ContentEvidence" evidence ON evidence."provenanceId" = chain.id
    WHERE evidence."sourceRecordId" IS NOT NULL
      AND "sylis_source_record_has_required_rights"(
        evidence."sourceRecordId",
        true
      )
  );
$$;

CREATE FUNCTION "sylis_assert_provenance_closure"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_provenance_id uuid;
  checked_kind "ProvenanceKind";
BEGIN
  IF TG_OP = 'DELETE' THEN
    checked_provenance_id := OLD.id;
  ELSE
    checked_provenance_id := NEW.id;
  END IF;

  SELECT kind INTO checked_kind
  FROM "Provenance"
  WHERE id = checked_provenance_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "ContentEvidence"
    WHERE "provenanceId" = checked_provenance_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROVENANCE_EVIDENCE_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ContentEvidence" evidence
    WHERE evidence."provenanceId" = checked_provenance_id
      AND (
        (checked_kind = 'SOURCE' AND (
          evidence."evidenceKind" <> 'DIRECT'
          OR evidence."sourceRecordId" IS NULL
        ))
        OR (checked_kind = 'DERIVED' AND evidence."evidenceKind" NOT IN (
          'DERIVED', 'SUPPORTING', 'CONTRADICTING'
        ))
        OR (checked_kind = 'GENERATED' AND (
          evidence."evidenceKind" <> 'GENERATED'
          OR evidence."upstreamProvenanceId" IS NULL
        ))
        OR (checked_kind = 'HUMAN' AND evidence."evidenceKind" = 'GENERATED')
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROVENANCE_KIND_EVIDENCE_MISMATCH';
  END IF;

  IF EXISTS (
    WITH RECURSIVE upstream(id, path, cycle) AS (
      SELECT
        evidence."upstreamProvenanceId",
        ARRAY[checked_provenance_id, evidence."upstreamProvenanceId"],
        evidence."upstreamProvenanceId" = checked_provenance_id
      FROM "ContentEvidence" evidence
      WHERE evidence."provenanceId" = checked_provenance_id
        AND evidence."upstreamProvenanceId" IS NOT NULL
      UNION ALL
      SELECT
        evidence."upstreamProvenanceId",
        upstream.path || evidence."upstreamProvenanceId",
        evidence."upstreamProvenanceId" = ANY(upstream.path)
      FROM upstream
      JOIN "ContentEvidence" evidence ON evidence."provenanceId" = upstream.id
      WHERE evidence."upstreamProvenanceId" IS NOT NULL
        AND NOT upstream.cycle
    )
    SELECT 1 FROM upstream WHERE cycle
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROVENANCE_CYCLE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ContentEvidence" evidence
    WHERE evidence."provenanceId" = checked_provenance_id
      AND evidence."sourceRecordId" IS NOT NULL
      AND NOT "sylis_source_record_has_required_rights"(
        evidence."sourceRecordId",
        true
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROVENANCE_DIRECT_SOURCE_RIGHTS_INVALID';
  END IF;

  IF NOT "sylis_provenance_is_source_backed"(checked_provenance_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROVENANCE_SOURCE_RIGHTS_CLOSURE_INVALID';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "Provenance_closure_guard"
AFTER INSERT OR UPDATE OR DELETE ON "Provenance"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_provenance_closure"();

CREATE FUNCTION "sylis_guard_content_evidence_edge"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_kind "ProvenanceKind";
BEGIN
  SELECT kind INTO parent_kind
  FROM "Provenance"
  WHERE id = NEW."provenanceId";

  IF (
    (parent_kind = 'SOURCE' AND (
      NEW."evidenceKind" <> 'DIRECT'
      OR NEW."sourceRecordId" IS NULL
    ))
    OR (parent_kind = 'DERIVED' AND NEW."evidenceKind" NOT IN (
      'DERIVED', 'SUPPORTING', 'CONTRADICTING'
    ))
    OR (parent_kind = 'GENERATED' AND (
      NEW."evidenceKind" <> 'GENERATED'
      OR NEW."upstreamProvenanceId" IS NULL
    ))
    OR (parent_kind = 'HUMAN' AND NEW."evidenceKind" = 'GENERATED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROVENANCE_KIND_EVIDENCE_MISMATCH';
  END IF;

  IF NEW."upstreamProvenanceId" IS NOT NULL AND EXISTS (
    WITH RECURSIVE upstream(id, path) AS (
      SELECT NEW."upstreamProvenanceId", ARRAY[NEW."upstreamProvenanceId"]
      UNION ALL
      SELECT evidence."upstreamProvenanceId", upstream.path || evidence."upstreamProvenanceId"
      FROM upstream
      JOIN "ContentEvidence" evidence ON evidence."provenanceId" = upstream.id
      WHERE evidence."upstreamProvenanceId" IS NOT NULL
        AND NOT evidence."upstreamProvenanceId" = ANY(upstream.path)
    )
    SELECT 1 FROM upstream WHERE id = NEW."provenanceId"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROVENANCE_CYCLE';
  END IF;

  IF NEW."sourceRecordId" IS NOT NULL
     AND NOT "sylis_source_record_has_required_rights"(
       NEW."sourceRecordId",
       true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROVENANCE_DIRECT_SOURCE_RIGHTS_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ContentEvidence_edge_guard"
BEFORE INSERT ON "ContentEvidence"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_content_evidence_edge"();

CREATE FUNCTION "sylis_assert_candidate_revision_evidence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_revision_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'CandidateRevision' THEN
    checked_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    checked_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."candidateRevisionId" ELSE NEW."candidateRevisionId" END;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "CandidateRevision" WHERE id = checked_revision_id) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "CandidateRevisionEvidence"
    WHERE "candidateRevisionId" = checked_revision_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CANDIDATE_REVISION_EVIDENCE_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "CandidateRevisionEvidence" evidence
    WHERE evidence."candidateRevisionId" = checked_revision_id
      AND (
        (
          evidence."sourceRecordId" IS NOT NULL
          AND NOT "sylis_source_record_has_required_rights"(
            evidence."sourceRecordId",
            false
          )
        )
        OR (
          evidence."upstreamProvenanceId" IS NOT NULL
          AND NOT "sylis_provenance_is_source_backed"(
            evidence."upstreamProvenanceId"
          )
        )
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CANDIDATE_REVISION_EVIDENCE_RIGHTS_INVALID';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "CandidateRevision_evidence_guard"
AFTER INSERT OR UPDATE OR DELETE ON "CandidateRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_candidate_revision_evidence"();

CREATE CONSTRAINT TRIGGER "CandidateRevisionEvidence_evidence_guard"
AFTER INSERT OR UPDATE OR DELETE ON "CandidateRevisionEvidence"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_candidate_revision_evidence"();

CREATE FUNCTION "sylis_assert_rights_decision_evidence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_decision_id uuid;
  decision_row "RightsDecision"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'RightsDecision' THEN
    checked_decision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    checked_decision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."rightsDecisionId" ELSE NEW."rightsDecisionId" END;
  END IF;

  SELECT * INTO decision_row
  FROM "RightsDecision"
  WHERE id = checked_decision_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF (decision_row."mayBuild" OR decision_row."mayServe" OR decision_row."mayExport")
     AND NOT EXISTS (
       SELECT 1 FROM "RightsDecisionEvidence"
       WHERE "rightsDecisionId" = checked_decision_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ALLOW_RIGHTS_DECISION_EVIDENCE_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RightsDecisionEvidence" evidence
    WHERE evidence."rightsDecisionId" = checked_decision_id
      AND evidence."capturedAt" > decision_row."effectiveAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RIGHTS_EVIDENCE_CAPTURED_AFTER_DECISION';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "RightsDecision_evidence_guard"
AFTER INSERT OR UPDATE OR DELETE ON "RightsDecision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_rights_decision_evidence"();

CREATE CONSTRAINT TRIGGER "RightsDecisionEvidence_evidence_guard"
AFTER INSERT OR UPDATE OR DELETE ON "RightsDecisionEvidence"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_rights_decision_evidence"();

CREATE FUNCTION "sylis_content_evidence_is_source_backed"(checked_evidence_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "ContentEvidence" evidence
    WHERE evidence.id = checked_evidence_id
      AND (
        (
          evidence."sourceRecordId" IS NOT NULL
          AND "sylis_source_record_has_required_rights"(
            evidence."sourceRecordId",
            true
          )
        )
        OR (
          evidence."upstreamProvenanceId" IS NOT NULL
          AND "sylis_provenance_is_source_backed"(
            evidence."upstreamProvenanceId"
          )
        )
      )
  );
$$;

CREATE FUNCTION "sylis_assert_cultural_context_citations"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_release_id uuid;
  checked_revision_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'PedagogicalMaterialRevision' THEN
    checked_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
    checked_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    checked_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
    checked_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."materialRevisionId" ELSE NEW."materialRevisionId" END;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "PedagogicalMaterialRevision" revision
    WHERE revision."releaseId" = checked_release_id
      AND revision.id = checked_revision_id
      AND revision.kind = 'CULTURAL_CONTEXT'
  ) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PedagogicalMaterialBlock" block
    WHERE block."releaseId" = checked_release_id
      AND block."materialRevisionId" = checked_revision_id
      AND NOT EXISTS (
        SELECT 1
        FROM "PedagogicalMaterialCitation" citation
        WHERE citation."releaseId" = block."releaseId"
          AND citation."materialBlockId" = block.id
          AND "sylis_content_evidence_is_source_backed"(
            citation."contentEvidenceId"
          )
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CULTURAL_CONTEXT_SOURCE_CITATION_REQUIRED';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialRevision_citation_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_cultural_context_citations"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialBlock_citation_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_cultural_context_citations"();

CREATE FUNCTION "sylis_guard_lexicon_fact_provenance"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_provenance_id uuid;
  checked_kind "ProvenanceKind";
BEGIN
  checked_provenance_id := (to_jsonb(NEW) ->> 'provenanceId')::uuid;
  SELECT kind INTO checked_kind
  FROM "Provenance"
  WHERE id = checked_provenance_id;

  IF checked_kind = 'GENERATED' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'GENERATED_LEXICON_FACT_PROVENANCE_FORBIDDEN';
  END IF;
  IF NOT "sylis_provenance_is_source_backed"(checked_provenance_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEXICON_FACT_PROVENANCE_CLOSURE_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Collocation',
    'CollocationObservation',
    'ConceptDefinition',
    'ConceptExternalIdentifier',
    'ConceptLineage',
    'ConceptRelation',
    'CorpusDatasetVersion',
    'EntryAttestation',
    'EntryExternalIdentifier',
    'EntryFrequencyObservation',
    'EntryLineage',
    'EntryRelation',
    'EtymologyHypothesis',
    'EtymologyLink',
    'EtymonRevision',
    'ExampleSentence',
    'ExampleTranslation',
    'FormAttestation',
    'FormFrequencyObservation',
    'FormRepresentation',
    'InflectionGeneration',
    'InflectionRule',
    'LexicalConceptRevision',
    'LexicalEntryRevision',
    'LexicalForm',
    'LexicalSenseRevision',
    'MediaAsset',
    'MorphologicalAnalysis',
    'ProficiencyEntryClaim',
    'ProficiencyHeadwordClaim',
    'ProficiencySenseClaim',
    'SemanticPredicate',
    'SenseAttestation',
    'SenseCollocation',
    'SenseConceptMembership',
    'SenseDefinition',
    'SenseExample',
    'SenseExternalIdentifier',
    'SenseFrame',
    'SenseFrequencyObservation',
    'SenseLineage',
    'SenseRelation',
    'SenseTranslationText',
    'SenseUsage',
    'SyntacticFrame',
    'TranslationRelation',
    'VocabularyBookItem',
    'WordFormation',
    'WordFormationRule'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I '
      || 'FOR EACH ROW EXECUTE FUNCTION "sylis_guard_lexicon_fact_provenance"()',
      table_name || '_provenance_guard',
      table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE "EntryRelation"
ADD CONSTRAINT "EntryRelation_source_target_distinct_check"
CHECK ("sourceEntryId" <> "targetEntryId"),
ADD CONSTRAINT "EntryRelation_type_direction_check"
CHECK (
  (
    "typeCode" = 'DERIVATIONALLY_RELATED'
    AND direction = 'SYMMETRIC'
    AND "sourceEntryId" < "targetEntryId"
  )
  OR
  (
    "typeCode" IN ('ABBREVIATION_OF', 'VARIANT_OF')
    AND direction = 'DIRECTED'
  )
);

ALTER TABLE "SenseRelation"
ADD CONSTRAINT "SenseRelation_source_target_distinct_check"
CHECK ("sourceSenseId" <> "targetSenseId"),
ADD CONSTRAINT "SenseRelation_type_direction_check"
CHECK (
  (
    "typeCode" IN ('SYNONYM', 'ANTONYM')
    AND direction = 'SYMMETRIC'
    AND "sourceSenseId" < "targetSenseId"
  )
  OR
  ("typeCode" = 'RELATED' AND direction = 'DIRECTED')
);

ALTER TABLE "ConceptRelation"
ADD CONSTRAINT "ConceptRelation_source_target_distinct_check"
CHECK ("sourceConceptId" <> "targetConceptId"),
ADD CONSTRAINT "ConceptRelation_type_direction_check"
CHECK (
  "typeCode" IN ('HYPERNYM', 'HYPONYM')
  AND direction = 'DIRECTED'
);

ALTER TABLE "TranslationRelation"
ADD CONSTRAINT "TranslationRelation_source_target_distinct_check"
CHECK ("sourceSenseId" <> "targetSenseId");

ALTER TABLE "EntryLineage"
ADD CONSTRAINT "EntryLineage_source_target_distinct_check"
CHECK ("sourceEntryId" <> "targetEntryId");

ALTER TABLE "SenseLineage"
ADD CONSTRAINT "SenseLineage_source_target_distinct_check"
CHECK ("sourceSenseId" <> "targetSenseId");

ALTER TABLE "ConceptLineage"
ADD CONSTRAINT "ConceptLineage_source_target_distinct_check"
CHECK ("sourceConceptId" <> "targetConceptId");

ALTER TABLE "LexicalSenseRevision"
ADD CONSTRAINT "LexicalSenseRevision_hierarchy_shape_check"
CHECK (
  "displayOrder" >= 0
  AND ("parentSenseId" IS NULL OR "parentSenseId" <> "senseId")
);

CREATE FUNCTION "sylis_assert_sense_structure"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_release_id uuid;
  checked_sense_id uuid;
  sense_entry_id uuid;
  parent_sense_id uuid;
  parent_entry_id uuid;
  canonical_count integer;
BEGIN
  checked_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
  checked_sense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."senseId" ELSE NEW."senseId" END;

  SELECT "entryId", "parentSenseId"
  INTO sense_entry_id, parent_sense_id
  FROM "LexicalSenseRevision"
  WHERE "releaseId" = checked_release_id
    AND "senseId" = checked_sense_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF parent_sense_id IS NOT NULL THEN
    SELECT "entryId" INTO parent_entry_id
    FROM "LexicalSenseRevision"
    WHERE "releaseId" = checked_release_id
      AND "senseId" = parent_sense_id;
    IF NOT FOUND OR parent_entry_id <> sense_entry_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Sense parent must belong to the same Entry';
    END IF;

    IF EXISTS (
      WITH RECURSIVE ancestors("senseId") AS (
        SELECT "parentSenseId"
        FROM "LexicalSenseRevision"
        WHERE "releaseId" = checked_release_id
          AND "senseId" = checked_sense_id
          AND "parentSenseId" IS NOT NULL
        UNION
        SELECT parent."parentSenseId"
        FROM "LexicalSenseRevision" parent
        JOIN ancestors ON ancestors."senseId" = parent."senseId"
        WHERE parent."releaseId" = checked_release_id
          AND parent."parentSenseId" IS NOT NULL
      )
      SELECT 1 FROM ancestors WHERE "senseId" = checked_sense_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Sense parent hierarchy cannot contain a cycle';
    END IF;
  END IF;

  SELECT count(*) INTO canonical_count
  FROM "SenseConceptMembership"
  WHERE "releaseId" = checked_release_id
    AND "senseId" = checked_sense_id
    AND canonical;
  IF canonical_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Sense must have exactly one canonical Concept membership';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LexicalSenseRevision_structure_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LexicalSenseRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_sense_structure"();

CREATE CONSTRAINT TRIGGER "SenseConceptMembership_structure_guard"
AFTER INSERT OR UPDATE OR DELETE ON "SenseConceptMembership"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_sense_structure"();

ALTER TABLE "ExerciseChoiceResponseConfig"
ADD CONSTRAINT "ExerciseChoiceResponseConfig_selection_bounds_check"
CHECK (
  "minSelections" >= 1
  AND "maxSelections" >= "minSelections"
);

ALTER TABLE "ExerciseExtendedTextResponseConfig"
ADD CONSTRAINT "ExerciseExtendedTextResponseConfig_length_bounds_check"
CHECK (
  "minCharacters" >= 0
  AND ("maxCharacters" IS NULL OR "maxCharacters" >= "minCharacters")
  AND "minWords" >= 0
  AND ("maxWords" IS NULL OR "maxWords" >= "minWords")
);

ALTER TABLE "AssessmentQuotaSelectionRule"
ADD CONSTRAINT "AssessmentQuotaSelectionRule_count_bounds_check"
CHECK (
  ("minCount" IS NOT NULL OR "maxCount" IS NOT NULL)
  AND ("minCount" IS NULL OR "minCount" >= 0)
  AND ("maxCount" IS NULL OR "maxCount" >= 0)
  AND (
    "minCount" IS NULL
    OR "maxCount" IS NULL
    OR "maxCount" >= "minCount"
  )
);

CREATE FUNCTION "sylis_exercise_profile_allowed_v0_0_1"(
  task_kind "ExerciseTaskKind",
  facet "KnowledgeFacet",
  direction "RetrievalDirection",
  evidence_kind "ExerciseEvidenceKind",
  response_kind "ExerciseResponseKind",
  cardinality "ExerciseResponseCardinality",
  placement "ExerciseResponsePlacement",
  grading_mode "ExerciseGradingMode",
  validation_level "ExerciseValidationLevel"
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT (
    CASE task_kind
      WHEN 'FORM_MEANING_MAPPING' THEN
        facet = 'MEANING_FORM_MEANING'
        AND direction IN ('RECEPTIVE', 'PRODUCTIVE', 'BIDIRECTIONAL')
        AND (
          (evidence_kind = 'RECOGNITION' AND response_kind = 'CHOICE' AND cardinality = 'SINGLE' AND placement = 'BLOCK' AND grading_mode = 'EXACT')
          OR (evidence_kind = 'CUED_RECALL' AND response_kind = 'SHORT_TEXT' AND cardinality = 'SINGLE' AND placement = 'BLOCK' AND grading_mode IN ('EXACT', 'SELF_REPORT'))
        )
      WHEN 'SPOKEN_FORM_MAPPING' THEN
        facet = 'FORM_SPOKEN'
        AND direction IN ('RECEPTIVE', 'BIDIRECTIONAL')
        AND (
          (evidence_kind = 'RECOGNITION' AND response_kind = 'CHOICE' AND cardinality = 'SINGLE' AND placement = 'BLOCK' AND grading_mode = 'EXACT')
          OR (evidence_kind = 'CUED_RECALL' AND response_kind = 'SHORT_TEXT' AND cardinality = 'SINGLE' AND placement = 'BLOCK' AND grading_mode = 'EXACT')
        )
      WHEN 'SPOKEN_FORM_PRODUCTION' THEN
        facet = 'FORM_SPOKEN'
        AND direction IN ('PRODUCTIVE', 'BIDIRECTIONAL')
        AND evidence_kind = 'CONSTRAINED_PRODUCTION'
        AND response_kind = 'NO_CAPTURE'
        AND cardinality = 'SINGLE'
        AND placement = 'BLOCK'
        AND grading_mode = 'SELF_REPORT'
      WHEN 'CONTEXTUAL_SENSE_INTERPRETATION' THEN
        facet = 'MEANING_CONCEPT_REFERENT'
        AND direction IN ('RECEPTIVE', 'BIDIRECTIONAL')
        AND evidence_kind = 'CONTEXTUAL_DISCRIMINATION'
        AND (
          (response_kind = 'CHOICE' AND cardinality = 'SINGLE' AND placement = 'BLOCK' AND grading_mode = 'EXACT')
          OR (response_kind = 'SHORT_TEXT' AND cardinality = 'SINGLE' AND placement = 'BLOCK' AND grading_mode = 'SELF_REPORT')
        )
      WHEN 'CONTEXTUAL_FORM_COMPLETION' THEN
        facet = 'FORM_WRITTEN'
        AND direction IN ('PRODUCTIVE', 'BIDIRECTIONAL')
        AND evidence_kind = 'CONSTRAINED_PRODUCTION'
        AND response_kind = 'SHORT_TEXT'
        AND cardinality = 'SINGLE'
        AND placement = 'INLINE'
        AND grading_mode = 'EXACT'
      WHEN 'COLLOCATION_RECALL' THEN
        facet = 'USE_COLLOCATION'
        AND direction IN ('RECEPTIVE', 'PRODUCTIVE', 'BIDIRECTIONAL')
        AND (
          (evidence_kind IN ('RECOGNITION', 'CONTEXTUAL_DISCRIMINATION') AND response_kind = 'CHOICE' AND cardinality = 'SINGLE' AND placement = 'BLOCK' AND grading_mode = 'EXACT')
          OR (evidence_kind IN ('CUED_RECALL', 'CONSTRAINED_PRODUCTION') AND response_kind = 'SHORT_TEXT' AND cardinality = 'SINGLE' AND placement IN ('BLOCK', 'INLINE') AND grading_mode = 'EXACT')
        )
      WHEN 'FRAME_COMPLETION' THEN
        facet = 'USE_GRAMMATICAL_FUNCTION'
        AND direction IN ('RECEPTIVE', 'PRODUCTIVE', 'BIDIRECTIONAL')
        AND (
          (evidence_kind IN ('RECOGNITION', 'CONTEXTUAL_DISCRIMINATION') AND response_kind = 'CHOICE' AND cardinality = 'SINGLE' AND placement = 'BLOCK' AND grading_mode = 'EXACT')
          OR (evidence_kind IN ('CUED_RECALL', 'CONSTRAINED_PRODUCTION') AND response_kind = 'SHORT_TEXT' AND cardinality = 'SINGLE' AND placement IN ('BLOCK', 'INLINE') AND grading_mode = 'EXACT')
        )
      WHEN 'SEMANTIC_RELATION_DISCRIMINATION' THEN
        facet = 'MEANING_ASSOCIATIONS'
        AND direction IN ('RECEPTIVE', 'BIDIRECTIONAL')
        AND evidence_kind IN ('RECOGNITION', 'CONTEXTUAL_DISCRIMINATION')
        AND response_kind = 'CHOICE'
        AND placement = 'BLOCK'
        AND (
          (cardinality = 'SINGLE' AND grading_mode = 'EXACT')
          OR (cardinality = 'MULTIPLE' AND grading_mode = 'WEIGHTED')
        )
      WHEN 'MORPHEME_ANALYSIS' THEN
        facet = 'FORM_WORD_PARTS'
        AND direction IN ('RECEPTIVE', 'BIDIRECTIONAL')
        AND evidence_kind IN ('RECOGNITION', 'CONTEXTUAL_DISCRIMINATION')
        AND response_kind = 'CHOICE'
        AND placement = 'BLOCK'
        AND (
          (cardinality = 'SINGLE' AND grading_mode = 'EXACT')
          OR (cardinality = 'MULTIPLE' AND grading_mode = 'WEIGHTED')
        )
      WHEN 'WORD_FORMATION' THEN
        facet IN ('FORM_WORD_PARTS', 'FORM_WRITTEN')
        AND direction IN ('PRODUCTIVE', 'BIDIRECTIONAL')
        AND evidence_kind = 'CONSTRAINED_PRODUCTION'
        AND response_kind = 'SHORT_TEXT'
        AND cardinality = 'SINGLE'
        AND placement IN ('BLOCK', 'INLINE')
        AND grading_mode = 'EXACT'
      WHEN 'USAGE_CONSTRAINT_DISCRIMINATION' THEN
        facet = 'USE_CONSTRAINTS'
        AND direction IN ('RECEPTIVE', 'BIDIRECTIONAL')
        AND evidence_kind = 'CONTEXTUAL_DISCRIMINATION'
        AND response_kind = 'CHOICE'
        AND placement = 'BLOCK'
        AND (
          (cardinality = 'SINGLE' AND grading_mode = 'EXACT')
          OR (cardinality = 'MULTIPLE' AND grading_mode = 'WEIGHTED')
        )
      WHEN 'SENTENCE_TRANSLATION' THEN
        direction IN ('RECEPTIVE', 'PRODUCTIVE', 'BIDIRECTIONAL')
        AND evidence_kind = 'FREE_PRODUCTION'
        AND response_kind = 'EXTENDED_TEXT'
        AND cardinality = 'SINGLE'
        AND placement = 'BLOCK'
        AND grading_mode = 'SELF_REPORT'
      WHEN 'SENTENCE_PRODUCTION' THEN
        direction IN ('RECEPTIVE', 'PRODUCTIVE', 'BIDIRECTIONAL')
        AND evidence_kind = 'FREE_PRODUCTION'
        AND response_kind = 'EXTENDED_TEXT'
        AND cardinality = 'SINGLE'
        AND placement = 'BLOCK'
        AND grading_mode = 'SELF_REPORT'
      ELSE false
    END
  )
  AND (
    validation_level = 'PRACTICE_ONLY'
    OR (
      validation_level IN ('FORMATIVE_VERIFIED', 'SUMMATIVE_VERIFIED')
      AND grading_mode IN ('EXACT', 'WEIGHTED')
      AND response_kind NOT IN ('EXTENDED_TEXT', 'NO_CAPTURE')
      AND task_kind NOT IN ('SPOKEN_FORM_PRODUCTION', 'SENTENCE_TRANSLATION', 'SENTENCE_PRODUCTION')
    )
  );
$$;

CREATE FUNCTION "sylis_assert_exercise_response_config"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_row jsonb;
  checked_release_id uuid;
  checked_exercise_revision_id uuid;
  task_kind "ExerciseTaskKind";
  objective_facet "KnowledgeFacet";
  objective_direction "RetrievalDirection";
  evidence_kind "ExerciseEvidenceKind";
  expected_kind "ExerciseResponseKind";
  cardinality "ExerciseResponseCardinality";
  placement "ExerciseResponsePlacement";
  grading_mode "ExerciseGradingMode";
  validation_level "ExerciseValidationLevel";
  config_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    checked_row := to_jsonb(OLD);
  ELSE
    checked_row := to_jsonb(NEW);
  END IF;
  checked_release_id := (checked_row ->> 'releaseId')::uuid;
  checked_exercise_revision_id := (
    checked_row ->> CASE
    WHEN TG_TABLE_NAME = 'ExerciseRevision' THEN
      'id'
    ELSE
      'exerciseRevisionId'
    END
  )::uuid;

  SELECT
    exercise."exerciseTaskKind",
    objective."knowledgeFacet",
    objective."retrievalDirection",
    exercise."evidenceKind",
    exercise."responseKind",
    exercise."responseCardinality",
    exercise."responsePlacement",
    exercise."gradingMode",
    exercise."validationLevel"
  INTO
    task_kind,
    objective_facet,
    objective_direction,
    evidence_kind,
    expected_kind,
    cardinality,
    placement,
    grading_mode,
    validation_level
  FROM "ExerciseRevision" exercise
  JOIN "LearningObjectiveRevision" objective
    ON objective."releaseId" = exercise."releaseId"
   AND objective.id = exercise."learningObjectiveRevisionId"
  WHERE exercise."releaseId" = checked_release_id
    AND exercise.id = checked_exercise_revision_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT "sylis_exercise_profile_allowed_v0_0_1"(
    task_kind,
    objective_facet,
    objective_direction,
    evidence_kind,
    expected_kind,
    cardinality,
    placement,
    grading_mode,
    validation_level
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXERCISE_PROFILE_MATRIX_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "ExerciseResponseConfig"
    WHERE "releaseId" = checked_release_id
      AND "exerciseRevisionId" = checked_exercise_revision_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXERCISE_RESPONSE_CONFIG_MISSING';
  END IF;

  SELECT count(*) INTO config_count
  FROM (
    SELECT 1 FROM "ExerciseChoiceResponseConfig" WHERE "releaseId" = checked_release_id AND "exerciseRevisionId" = checked_exercise_revision_id
    UNION ALL
    SELECT 1 FROM "ExerciseShortTextResponseConfig" WHERE "releaseId" = checked_release_id AND "exerciseRevisionId" = checked_exercise_revision_id
    UNION ALL
    SELECT 1 FROM "ExerciseExtendedTextResponseConfig" WHERE "releaseId" = checked_release_id AND "exerciseRevisionId" = checked_exercise_revision_id
    UNION ALL
    SELECT 1 FROM "ExerciseNoCaptureResponseConfig" WHERE "releaseId" = checked_release_id AND "exerciseRevisionId" = checked_exercise_revision_id
  ) AS configs;

  IF config_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXERCISE_RESPONSE_CONFIG_COUNT_INVALID';
  END IF;

  IF (
    expected_kind = 'CHOICE'::"ExerciseResponseKind"
    AND NOT EXISTS (SELECT 1 FROM "ExerciseChoiceResponseConfig" WHERE "releaseId" = checked_release_id AND "exerciseRevisionId" = checked_exercise_revision_id)
  ) OR (
    expected_kind = 'SHORT_TEXT'::"ExerciseResponseKind"
    AND NOT EXISTS (SELECT 1 FROM "ExerciseShortTextResponseConfig" WHERE "releaseId" = checked_release_id AND "exerciseRevisionId" = checked_exercise_revision_id)
  ) OR (
    expected_kind = 'EXTENDED_TEXT'::"ExerciseResponseKind"
    AND NOT EXISTS (SELECT 1 FROM "ExerciseExtendedTextResponseConfig" WHERE "releaseId" = checked_release_id AND "exerciseRevisionId" = checked_exercise_revision_id)
  ) OR (
    expected_kind = 'NO_CAPTURE'::"ExerciseResponseKind"
    AND NOT EXISTS (SELECT 1 FROM "ExerciseNoCaptureResponseConfig" WHERE "releaseId" = checked_release_id AND "exerciseRevisionId" = checked_exercise_revision_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXERCISE_RESPONSE_CONFIG_KIND_MISMATCH';
  END IF;

  IF expected_kind = 'CHOICE'::"ExerciseResponseKind"
     AND NOT EXISTS (
       SELECT 1
       FROM "ExerciseChoiceResponseConfig"
       WHERE "releaseId" = checked_release_id
         AND "exerciseRevisionId" = checked_exercise_revision_id
         AND "minSelections" = 1
         AND (
           (cardinality = 'SINGLE' AND "maxSelections" = 1)
           OR (cardinality = 'MULTIPLE' AND "maxSelections" >= 2)
         )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXERCISE_CHOICE_CARDINALITY_CONFIG_INVALID';
  END IF;

  IF grading_mode = 'SELF_REPORT'::"ExerciseGradingMode"
     AND (
       (
         expected_kind = 'EXTENDED_TEXT'::"ExerciseResponseKind"
         AND NOT EXISTS (
           SELECT 1 FROM "ExerciseRubricCriterion"
           WHERE "releaseId" = checked_release_id
             AND "exerciseRevisionId" = checked_exercise_revision_id
         )
       )
       OR
       (
         expected_kind <> 'EXTENDED_TEXT'::"ExerciseResponseKind"
         AND NOT EXISTS (
           SELECT 1 FROM "ExerciseStimulusRef"
           WHERE "releaseId" = checked_release_id
             AND "exerciseRevisionId" = checked_exercise_revision_id
             AND "roleCode" = 'REVEAL'
         )
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SELF_REPORT_REVEAL_CONTENT_MISSING';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ExerciseRevision_response_config_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_response_config"();

CREATE CONSTRAINT TRIGGER "ExerciseResponseConfig_typed_config_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseResponseConfig"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_response_config"();

CREATE CONSTRAINT TRIGGER "ExerciseChoiceResponseConfig_typed_config_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseChoiceResponseConfig"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_response_config"();

CREATE CONSTRAINT TRIGGER "ExerciseShortTextResponseConfig_typed_config_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseShortTextResponseConfig"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_response_config"();

CREATE CONSTRAINT TRIGGER "ExerciseExtendedTextResponseConfig_typed_config_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseExtendedTextResponseConfig"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_response_config"();

CREATE CONSTRAINT TRIGGER "ExerciseNoCaptureResponseConfig_typed_config_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseNoCaptureResponseConfig"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_response_config"();

CREATE CONSTRAINT TRIGGER "ExerciseStimulusRef_response_config_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseStimulusRef"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_response_config"();

CREATE CONSTRAINT TRIGGER "ExerciseRubricCriterion_response_config_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseRubricCriterion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_response_config"();

ALTER TABLE "ExerciseAttempt"
ADD CONSTRAINT "ExerciseAttempt_context_check"
CHECK (
  ("contextKind" = 'STUDY' AND "dailyStudyPlanItemId" IS NOT NULL AND "assessmentSessionItemId" IS NULL)
  OR
  ("contextKind" = 'ASSESSMENT' AND "dailyStudyPlanItemId" IS NULL AND "assessmentSessionItemId" IS NOT NULL)
),
ADD CONSTRAINT "ExerciseAttempt_status_shape_check"
CHECK (
  "attemptNo" > 0
  AND "maxScore" >= 0
  AND btrim("idempotencyKey") <> ''
  AND (
    ("status" = 'PRESENTED' AND "score" IS NULL AND "correct" IS NULL AND "submittedAt" IS NULL)
    OR
    (
      "status" = 'SUBMITTED'
      AND "score" IS NOT NULL
      AND "score" >= 0
      AND "score" <= "maxScore"
      AND "submittedAt" IS NOT NULL
      AND "submittedAt" >= "presentedAt"
    )
    OR
    ("status" IN ('ABANDONED', 'EXPIRED') AND "score" IS NULL AND "correct" IS NULL AND "submittedAt" IS NULL)
  )
);

CREATE FUNCTION "sylis_guard_exercise_attempt_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ExerciseAttempt cannot be deleted';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['status', 'score', 'correct', 'submittedAt'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'score', 'correct', 'submittedAt']) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ExerciseAttempt binding fields are immutable';
  END IF;

  IF OLD."status" <> 'PRESENTED'
     OR NEW."status" NOT IN ('SUBMITTED', 'ABANDONED', 'EXPIRED') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'invalid ExerciseAttempt status transition: %s -> %s',
        OLD."status",
        NEW."status"
      );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ExerciseAttempt_update_guard"
BEFORE UPDATE OR DELETE ON "ExerciseAttempt"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_exercise_attempt_update"();

CREATE FUNCTION "sylis_assert_exercise_attempt_shape_by_id"(checked_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_row "ExerciseAttempt"%ROWTYPE;
  response_kind "ExerciseResponseKind";
  grading_mode "ExerciseGradingMode";
  capture_policy "ExerciseCapturePolicy";
  exercise_max_score numeric(8, 3);
  presented_count integer;
  selected_count integer;
  text_count integer;
  self_report_count integer;
  retained_text_count integer;
  reported_correct boolean;
  choice_min integer;
  choice_max integer;
BEGIN
  SELECT * INTO attempt_row
  FROM "ExerciseAttempt"
  WHERE id = checked_attempt_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT "responseKind", "gradingMode", "maxScore"
  INTO response_kind, grading_mode, exercise_max_score
  FROM "ExerciseRevision"
  WHERE "releaseId" = attempt_row."releaseId"
    AND id = attempt_row."exerciseRevisionId";
  IF NOT FOUND OR exercise_max_score <> attempt_row."maxScore" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ExerciseAttempt must preserve its ExerciseRevision max score';
  END IF;

  IF attempt_row."contextKind" = 'STUDY' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "DailyStudyPlanItem" item
      JOIN "DailyStudyPlan" plan
        ON plan."releaseId" = item."releaseId"
       AND plan.id = item."planId"
      WHERE item."releaseId" = attempt_row."releaseId"
        AND item.id = attempt_row."dailyStudyPlanItemId"
        AND item."objectiveRevisionId" = (
          SELECT "learningObjectiveRevisionId"
          FROM "ExerciseRevision"
          WHERE "releaseId" = attempt_row."releaseId"
            AND id = attempt_row."exerciseRevisionId"
        )
        AND plan."userId" = attempt_row."userId"
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'STUDY ExerciseAttempt must match the plan owner and objective';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM "AssessmentSessionItem" item
    JOIN "AssessmentSession" session
      ON session."releaseId" = item."releaseId"
     AND session.id = item."sessionId"
    WHERE item."releaseId" = attempt_row."releaseId"
      AND item.id = attempt_row."assessmentSessionItemId"
      AND item."exerciseRevisionId" = attempt_row."exerciseRevisionId"
      AND session."userId" = attempt_row."userId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSESSMENT ExerciseAttempt must match the session owner and exercise';
  END IF;

  SELECT
    (SELECT count(*) FROM "AttemptPresentedChoice" WHERE "releaseId" = attempt_row."releaseId" AND "attemptId" = attempt_row.id),
    (SELECT count(*) FROM "AttemptSelectedChoice" WHERE "releaseId" = attempt_row."releaseId" AND "attemptId" = attempt_row.id),
    (SELECT count(*) FROM "AttemptTextResponse" WHERE "releaseId" = attempt_row."releaseId" AND "attemptId" = attempt_row.id),
    (SELECT count(*) FROM "AttemptSelfReport" WHERE "releaseId" = attempt_row."releaseId" AND "attemptId" = attempt_row.id),
    (SELECT count(*) FROM "AttemptTextResponse" WHERE "releaseId" = attempt_row."releaseId" AND "attemptId" = attempt_row.id AND "retentionMode" = 'ENCRYPTED_CONTENT')
  INTO presented_count, selected_count, text_count, self_report_count, retained_text_count;

  IF response_kind = 'SHORT_TEXT' THEN
    SELECT "capturePolicy" INTO capture_policy
    FROM "ExerciseShortTextResponseConfig"
    WHERE "releaseId" = attempt_row."releaseId"
      AND "exerciseRevisionId" = attempt_row."exerciseRevisionId";
  ELSIF response_kind = 'EXTENDED_TEXT' THEN
    SELECT "capturePolicy" INTO capture_policy
    FROM "ExerciseExtendedTextResponseConfig"
    WHERE "releaseId" = attempt_row."releaseId"
      AND "exerciseRevisionId" = attempt_row."exerciseRevisionId";
  END IF;

  IF response_kind = 'CHOICE' THEN
    SELECT "minSelections", "maxSelections"
    INTO choice_min, choice_max
    FROM "ExerciseChoiceResponseConfig"
    WHERE "releaseId" = attempt_row."releaseId"
      AND "exerciseRevisionId" = attempt_row."exerciseRevisionId";
    IF NOT FOUND OR presented_count < choice_max THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'CHOICE ExerciseAttempt must present enough choices for its response config';
    END IF;
  ELSIF presented_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'non-CHOICE ExerciseAttempt cannot contain presented choices';
  END IF;

  IF attempt_row."status" = 'SUBMITTED' THEN
    IF response_kind = 'CHOICE' THEN
      IF selected_count < choice_min OR selected_count > choice_max
         OR text_count <> 0 OR self_report_count <> 0
         OR attempt_row."correct" IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'submitted CHOICE attempt has an invalid response shape';
      END IF;
    ELSIF response_kind = 'SHORT_TEXT' THEN
      IF selected_count <> 0 OR text_count <> 1
         OR (capture_policy = 'REQUIRED' AND retained_text_count <> 1)
         OR (grading_mode = 'SELF_REPORT' AND (self_report_count <> 1 OR attempt_row."correct" IS NOT NULL))
         OR (grading_mode = 'EXACT' AND (self_report_count <> 0 OR attempt_row."correct" IS NULL)) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'submitted SHORT_TEXT attempt has an invalid response shape';
      END IF;
    ELSIF response_kind = 'EXTENDED_TEXT' THEN
      IF selected_count <> 0 OR text_count <> 1 OR self_report_count <> 1
         OR (capture_policy = 'REQUIRED' AND retained_text_count <> 1)
         OR grading_mode <> 'SELF_REPORT'
         OR attempt_row."correct" IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'submitted EXTENDED_TEXT attempt has an invalid response shape';
      END IF;
    ELSIF selected_count <> 0 OR text_count <> 0 OR self_report_count <> 1
          OR attempt_row."correct" IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'submitted NO_CAPTURE attempt has an invalid response shape';
    END IF;

    IF grading_mode = 'SELF_REPORT' THEN
      SELECT "reportedCorrect" INTO reported_correct
      FROM "AttemptSelfReport"
      WHERE "releaseId" = attempt_row."releaseId"
        AND "attemptId" = attempt_row.id;
      IF NOT FOUND OR attempt_row.score <> (CASE WHEN reported_correct THEN attempt_row."maxScore" ELSE 0 END) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'SELF_REPORT attempt score must match the reported outcome';
      END IF;
    END IF;
  ELSIF selected_count <> 0 OR text_count <> 0 OR self_report_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'non-submitted ExerciseAttempt cannot contain a response';
  END IF;
END;
$$;

CREATE FUNCTION "sylis_assert_exercise_attempt_shape"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_attempt_id uuid;
  trigger_row jsonb;
BEGIN
  trigger_row := CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
    ELSE to_jsonb(NEW)
  END;
  checked_attempt_id := CASE
    WHEN TG_TABLE_NAME = 'ExerciseAttempt' THEN (trigger_row ->> 'id')::uuid
    ELSE (trigger_row ->> 'attemptId')::uuid
  END;
  PERFORM "sylis_assert_exercise_attempt_shape_by_id"(checked_attempt_id);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ExerciseAttempt_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseAttempt"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_attempt_shape"();

CREATE CONSTRAINT TRIGGER "AttemptPresentedChoice_attempt_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AttemptPresentedChoice"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_attempt_shape"();

CREATE CONSTRAINT TRIGGER "AttemptSelectedChoice_attempt_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AttemptSelectedChoice"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_attempt_shape"();

CREATE CONSTRAINT TRIGGER "AttemptTextResponse_attempt_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AttemptTextResponse"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_attempt_shape"();

CREATE CONSTRAINT TRIGGER "AttemptSelfReport_attempt_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AttemptSelfReport"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_exercise_attempt_shape"();

ALTER TABLE "ReviewEvent"
ADD CONSTRAINT "ReviewEvent_rating_check"
CHECK ("rating" BETWEEN 1 AND 4 AND btrim("idempotencyKey") <> '');

ALTER TABLE "ReviewStateSnapshot"
ADD CONSTRAINT "ReviewStateSnapshot_value_check"
CHECK (
  "fsrsState" BETWEEN 0 AND 3
  AND "stability" >= 0
  AND "difficulty" >= 0
  AND "elapsedDays" >= 0
  AND "scheduledDays" >= 0
);

CREATE FUNCTION "sylis_assert_review_event"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_review_id uuid;
  trigger_row jsonb;
  review_row "ReviewEvent"%ROWTYPE;
  before_count integer;
  after_count integer;
BEGIN
  trigger_row := CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
    ELSE to_jsonb(NEW)
  END;
  checked_review_id := CASE
    WHEN TG_TABLE_NAME = 'ReviewEvent' THEN (trigger_row ->> 'id')::uuid
    ELSE (trigger_row ->> 'reviewId')::uuid
  END;

  SELECT * INTO review_row
  FROM "ReviewEvent"
  WHERE id = checked_review_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "ExerciseAttempt" attempt
    JOIN "DailyStudyPlanItem" plan_item
      ON plan_item."releaseId" = attempt."releaseId"
     AND plan_item.id = attempt."dailyStudyPlanItemId"
    JOIN "ExerciseRevision" exercise
      ON exercise."releaseId" = attempt."releaseId"
     AND exercise.id = attempt."exerciseRevisionId"
    WHERE attempt."releaseId" = review_row."releaseId"
      AND attempt.id = review_row."attemptId"
      AND attempt."userId" = review_row."userId"
      AND attempt."contextKind" = 'STUDY'
      AND attempt."status" = 'SUBMITTED'
      AND attempt."submittedAt" IS NOT NULL
      AND attempt."submittedAt" <= review_row."reviewedAt"
      AND plan_item."objectiveRevisionId" = review_row."objectiveRevisionId"
      AND exercise."learningObjectiveRevisionId" = review_row."objectiveRevisionId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ReviewEvent must reference a matching submitted STUDY attempt';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "FSRSParameterSet"
    WHERE id = review_row."parameterSetId"
      AND "effectiveAt" <= review_row."reviewedAt"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ReviewEvent parameter set must be effective at review time';
  END IF;

  SELECT
    count(*) FILTER (WHERE phase = 'BEFORE'),
    count(*) FILTER (WHERE phase = 'AFTER')
  INTO before_count, after_count
  FROM "ReviewStateSnapshot"
  WHERE "releaseId" = review_row."releaseId"
    AND "reviewId" = review_row.id;

  IF before_count <> 1 OR after_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ReviewEvent must have exactly one BEFORE and one AFTER snapshot';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ReviewEvent_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ReviewEvent"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_review_event"();

CREATE CONSTRAINT TRIGGER "ReviewStateSnapshot_review_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ReviewStateSnapshot"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_review_event"();

ALTER TABLE "AttemptSelfReport"
ADD CONSTRAINT "AttemptSelfReport_reveal_acknowledgement_check"
CHECK ("revealAcknowledgedAt" <= "createdAt");

ALTER TABLE "AttemptTextResponse"
ADD CONSTRAINT "AttemptTextResponse_payload_check"
CHECK (
  "purpose" = 'EXERCISE_RESPONSE'
  AND "normalizedHash" ~ '^[0-9a-f]{64}$'
  AND (
    (
      "retentionMode" = 'HASH_ONLY'
      AND "ciphertext" IS NULL
      AND "keyVersion" IS NULL
      AND "consentRecordId" IS NULL
    )
    OR
    (
      "retentionMode" = 'ENCRYPTED_CONTENT'
      AND octet_length("ciphertext") > 0
      AND btrim("keyVersion") <> ''
      AND "consentRecordId" IS NOT NULL
    )
  )
);

CREATE FUNCTION "sylis_assert_attempt_text_response"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN NULL;
  END IF;

  IF NEW."retentionMode" = 'HASH_ONLY' THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "ExerciseAttempt" attempt
    JOIN "ExerciseRevision" exercise
      ON exercise."releaseId" = attempt."releaseId"
     AND exercise.id = attempt."exerciseRevisionId"
    JOIN "ConsentRecord" consent
      ON consent.id = NEW."consentRecordId"
    WHERE attempt."releaseId" = NEW."releaseId"
      AND attempt.id = NEW."attemptId"
      AND exercise."responseKind" IN ('SHORT_TEXT', 'EXTENDED_TEXT')
      AND consent."userId" = attempt."userId"
      AND consent."purpose" = 'LEARNING_RESPONSE_RETENTION'
      AND consent."decision" = 'GRANTED'
      AND 'LEARNING_RESPONSE' = ANY(consent."categories")
      AND NOT EXISTS (
        SELECT 1
        FROM "ConsentRecord" later
        WHERE later."userId" = consent."userId"
          AND later."purpose" = consent."purpose"
          AND (
            later."occurredAt" > consent."occurredAt"
            OR (later."occurredAt" = consent."occurredAt" AND later.id > consent.id)
          )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AttemptTextResponse requires the owner latest granted learning-response consent';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AttemptTextResponse_consent_guard"
AFTER INSERT OR UPDATE ON "AttemptTextResponse"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_attempt_text_response"();

CREATE FUNCTION "sylis_assert_assessment_selection_rule"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_release_id uuid;
  checked_rule_id uuid;
  expected_kind "AssessmentSelectionRuleKind";
  detail_count integer;
BEGIN
  checked_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
  IF TG_TABLE_NAME = 'AssessmentSelectionRule' THEN
    checked_rule_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    checked_rule_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."ruleId" ELSE NEW."ruleId" END;
  END IF;

  SELECT "ruleKind" INTO expected_kind
  FROM "AssessmentSelectionRule"
  WHERE "releaseId" = checked_release_id AND "id" = checked_rule_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO detail_count
  FROM (
    SELECT 1 FROM "AssessmentQuotaSelectionRule" WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id
    UNION ALL
    SELECT 1 FROM "AssessmentScopeSelectionRule" WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id
    UNION ALL
    SELECT 1 FROM "AssessmentPinnedItemSelectionRule" WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id
  ) AS details;

  IF detail_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSESSMENT_SELECTION_RULE_DETAIL_COUNT_INVALID';
  END IF;

  IF (
    expected_kind = 'QUOTA'::"AssessmentSelectionRuleKind"
    AND NOT EXISTS (SELECT 1 FROM "AssessmentQuotaSelectionRule" WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id)
  ) OR (
    expected_kind = 'SCOPE'::"AssessmentSelectionRuleKind"
    AND NOT EXISTS (SELECT 1 FROM "AssessmentScopeSelectionRule" WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id)
  ) OR (
    expected_kind = 'PINNED_ITEM'::"AssessmentSelectionRuleKind"
    AND NOT EXISTS (SELECT 1 FROM "AssessmentPinnedItemSelectionRule" WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSESSMENT_SELECTION_RULE_KIND_MISMATCH';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AssessmentSelectionRule_detail_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentSelectionRule"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_assessment_selection_rule"();

CREATE CONSTRAINT TRIGGER "AssessmentQuotaSelectionRule_detail_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentQuotaSelectionRule"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_assessment_selection_rule"();

CREATE CONSTRAINT TRIGGER "AssessmentScopeSelectionRule_detail_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentScopeSelectionRule"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_assessment_selection_rule"();

CREATE CONSTRAINT TRIGGER "AssessmentPinnedItemSelectionRule_detail_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentPinnedItemSelectionRule"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_assessment_selection_rule"();

CREATE FUNCTION "sylis_assert_assessment_scope_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_release_id uuid;
  checked_rule_id uuid;
  expected_kind "AssessmentSelectionScopeKind";
  target_count integer;
BEGIN
  checked_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
  checked_rule_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."ruleId" ELSE NEW."ruleId" END;

  SELECT "scopeKind" INTO expected_kind
  FROM "AssessmentScopeSelectionRule"
  WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO target_count
  FROM (
    SELECT 1 FROM "AssessmentBookEditionScopeRule" WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id
    UNION ALL
    SELECT 1 FROM "AssessmentProficiencyLevelScopeRule" WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id
  ) AS targets;

  IF target_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSESSMENT_SCOPE_TARGET_COUNT_INVALID';
  END IF;

  IF (
    expected_kind = 'BOOK_EDITION'::"AssessmentSelectionScopeKind"
    AND NOT EXISTS (SELECT 1 FROM "AssessmentBookEditionScopeRule" WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id)
  ) OR (
    expected_kind = 'PROFICIENCY_LEVEL'::"AssessmentSelectionScopeKind"
    AND NOT EXISTS (SELECT 1 FROM "AssessmentProficiencyLevelScopeRule" WHERE "releaseId" = checked_release_id AND "ruleId" = checked_rule_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSESSMENT_SCOPE_TARGET_KIND_MISMATCH';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AssessmentScopeSelectionRule_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentScopeSelectionRule"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_assessment_scope_target"();

CREATE CONSTRAINT TRIGGER "AssessmentBookEditionScopeRule_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentBookEditionScopeRule"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_assessment_scope_target"();

CREATE CONSTRAINT TRIGGER "AssessmentProficiencyLevelScopeRule_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentProficiencyLevelScopeRule"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_assessment_scope_target"();

ALTER TABLE "ReadingDocumentRevision"
ADD CONSTRAINT "ReadingDocumentRevision_content_hash_check"
CHECK ("contentHash" ~ '^sha256:[0-9a-f]{64}$');

ALTER TABLE "LexicalAnnotation"
ADD CONSTRAINT "LexicalAnnotation_selector_shape_check"
CHECK (
  "startOffset" >= 0
  AND "endOffset" > "startOffset"
  AND "prefixLength" >= 0
  AND "prefixLength" <= 64
  AND "prefixLength" <= "startOffset"
  AND "suffixLength" >= 0
  AND "suffixLength" <= 64
  AND "revisionContentHash" ~ '^sha256:[0-9a-f]{64}$'
  AND "exactTextHash" ~ '^sha256:[0-9a-f]{64}$'
  AND "prefixTextHash" ~ '^sha256:[0-9a-f]{64}$'
  AND "suffixTextHash" ~ '^sha256:[0-9a-f]{64}$'
  AND "confidence" <> 'NaN'::double precision
  AND "confidence" >= 0
  AND "confidence" <= 1
);

CREATE FUNCTION "sylis_reject_lexical_annotation_selector_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    OLD."revisionId",
    OLD."revisionContentHash",
    OLD."offsetUnit",
    OLD."startOffset",
    OLD."endOffset",
    OLD."exactTextHash",
    OLD."prefixLength",
    OLD."prefixTextHash",
    OLD."suffixLength",
    OLD."suffixTextHash"
  ) IS DISTINCT FROM ROW(
    NEW."revisionId",
    NEW."revisionContentHash",
    NEW."offsetUnit",
    NEW."startOffset",
    NEW."endOffset",
    NEW."exactTextHash",
    NEW."prefixLength",
    NEW."prefixTextHash",
    NEW."suffixLength",
    NEW."suffixTextHash"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'LEXICAL_ANNOTATION_SELECTOR_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LexicalAnnotation_selector_immutable"
BEFORE UPDATE ON "LexicalAnnotation"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_lexical_annotation_selector_mutation"();

CREATE FUNCTION "sylis_assert_lexical_annotation_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_annotation_id uuid;
  expected_kind "LexicalAnnotationTargetKind";
  target_count integer;
BEGIN
  IF TG_TABLE_NAME = 'LexicalAnnotation' THEN
    checked_annotation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    checked_annotation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."annotationId" ELSE NEW."annotationId" END;
  END IF;

  SELECT "targetKind" INTO expected_kind
  FROM "LexicalAnnotation"
  WHERE id = checked_annotation_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO target_count
  FROM (
    SELECT 1 FROM "LexicalAnnotationHeadwordTarget" WHERE "annotationId" = checked_annotation_id
    UNION ALL
    SELECT 1 FROM "LexicalAnnotationEntryTarget" WHERE "annotationId" = checked_annotation_id
    UNION ALL
    SELECT 1 FROM "LexicalAnnotationSenseTarget" WHERE "annotationId" = checked_annotation_id
    UNION ALL
    SELECT 1 FROM "LexicalAnnotationCollocationTarget" WHERE "annotationId" = checked_annotation_id
    UNION ALL
    SELECT 1 FROM "LexicalAnnotationObjectiveTarget" WHERE "annotationId" = checked_annotation_id
  ) AS targets;

  IF target_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEXICAL_ANNOTATION_TARGET_COUNT_INVALID';
  END IF;

  IF (
    expected_kind = 'HEADWORD'::"LexicalAnnotationTargetKind"
    AND NOT EXISTS (SELECT 1 FROM "LexicalAnnotationHeadwordTarget" WHERE "annotationId" = checked_annotation_id)
  ) OR (
    expected_kind = 'ENTRY'::"LexicalAnnotationTargetKind"
    AND NOT EXISTS (SELECT 1 FROM "LexicalAnnotationEntryTarget" WHERE "annotationId" = checked_annotation_id)
  ) OR (
    expected_kind = 'SENSE'::"LexicalAnnotationTargetKind"
    AND NOT EXISTS (SELECT 1 FROM "LexicalAnnotationSenseTarget" WHERE "annotationId" = checked_annotation_id)
  ) OR (
    expected_kind = 'COLLOCATION'::"LexicalAnnotationTargetKind"
    AND NOT EXISTS (SELECT 1 FROM "LexicalAnnotationCollocationTarget" WHERE "annotationId" = checked_annotation_id)
  ) OR (
    expected_kind = 'OBJECTIVE'::"LexicalAnnotationTargetKind"
    AND NOT EXISTS (SELECT 1 FROM "LexicalAnnotationObjectiveTarget" WHERE "annotationId" = checked_annotation_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEXICAL_ANNOTATION_TARGET_KIND_MISMATCH';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LexicalAnnotation_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LexicalAnnotation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_lexical_annotation_target"();

CREATE CONSTRAINT TRIGGER "LexicalAnnotationHeadwordTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LexicalAnnotationHeadwordTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_lexical_annotation_target"();

CREATE CONSTRAINT TRIGGER "LexicalAnnotationEntryTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LexicalAnnotationEntryTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_lexical_annotation_target"();

CREATE CONSTRAINT TRIGGER "LexicalAnnotationSenseTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LexicalAnnotationSenseTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_lexical_annotation_target"();

CREATE CONSTRAINT TRIGGER "LexicalAnnotationCollocationTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LexicalAnnotationCollocationTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_lexical_annotation_target"();

CREATE CONSTRAINT TRIGGER "LexicalAnnotationObjectiveTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LexicalAnnotationObjectiveTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_lexical_annotation_target"();

ALTER TABLE "DocumentOrigin"
ADD CONSTRAINT "DocumentOrigin_shape_check"
CHECK (
  length(btrim("sourceKey")) BETWEEN 1 AND 200
  AND ("retiredAt" IS NULL OR "retiredAt" >= "createdAt")
  AND (
    (
      "retentionPolicy" = 'FIXED_WINDOW'::"DocumentRetentionPolicy"
      AND "retentionDays" IS NOT NULL
      AND "retentionDays" BETWEEN 1 AND 3650
    )
    OR ("retentionPolicy" <> 'FIXED_WINDOW'::"DocumentRetentionPolicy" AND "retentionDays" IS NULL)
  )
  AND (
    NOT "attributionRequired"
    OR length(btrim(COALESCE("attributionText", ''))) > 0
  )
  AND (
    "rightsPolicy" NOT IN (
      'PUBLIC_DOMAIN'::"DocumentRightsPolicy",
      'SOURCE_TERMS'::"DocumentRightsPolicy",
      'LICENSED'::"DocumentRightsPolicy"
    )
    OR length(btrim(COALESCE("rightsReferenceUrl", ''))) > 0
  )
);

CREATE FUNCTION "sylis_guard_document_origin_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF ROW(
    NEW.id,
    NEW.kind,
    NEW."sourceKey",
    NEW."rightsPolicy",
    NEW."rightsReferenceUrl",
    NEW."retentionPolicy",
    NEW."retentionDays",
    NEW."attributionRequired",
    NEW."attributionText",
    NEW."attributionUrl",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.kind,
    OLD."sourceKey",
    OLD."rightsPolicy",
    OLD."rightsReferenceUrl",
    OLD."retentionPolicy",
    OLD."retentionDays",
    OLD."attributionRequired",
    OLD."attributionText",
    OLD."attributionUrl",
    OLD."createdAt"
  ) OR OLD."retiredAt" IS NOT NULL OR NEW."retiredAt" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'DOCUMENT_ORIGIN_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentOrigin_update_guard"
BEFORE UPDATE ON "DocumentOrigin"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_document_origin_update"();

ALTER TABLE "ReadingDocument"
ADD CONSTRAINT "ReadingDocument_lifecycle_check"
CHECK (
  ("externalKey" IS NULL OR length(btrim("externalKey")) > 0)
  AND (
    (status = 'WITHDRAWN'::"ReadingDocumentStatus" AND "retiredAt" IS NOT NULL)
    OR (status <> 'WITHDRAWN'::"ReadingDocumentStatus" AND "retiredAt" IS NULL)
  )
  AND ("retiredAt" IS NULL OR "retiredAt" >= "createdAt")
  AND (status <> 'PUBLISHED'::"ReadingDocumentStatus" OR "currentRevisionId" IS NOT NULL)
);

CREATE FUNCTION "sylis_guard_reading_document_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.id,
    NEW."originId",
    NEW."ownerUserId",
    NEW."externalKey",
    NEW.visibility,
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD."originId",
    OLD."ownerUserId",
    OLD."externalKey",
    OLD.visibility,
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'READING_DOCUMENT_IDENTITY_IMMUTABLE';
  END IF;
  IF OLD.status = 'WITHDRAWN'::"ReadingDocumentStatus"
     AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'READING_DOCUMENT_WITHDRAWN_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReadingDocument_update_guard"
BEFORE UPDATE ON "ReadingDocument"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_reading_document_update"();

CREATE FUNCTION "sylis_assert_reading_document_origin"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  origin_kind "DocumentOriginKind";
BEGIN
  SELECT kind INTO origin_kind
  FROM "DocumentOrigin"
  WHERE id = NEW."originId";
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF origin_kind IN (
       'AI_GENERATED'::"DocumentOriginKind",
       'USER_AUTHORED'::"DocumentOriginKind"
     ) AND (NEW."ownerUserId" IS NULL OR NEW.visibility <> 'PRIVATE'::"ReadingDocumentVisibility") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READING_DOCUMENT_PRIVATE_ORIGIN_INVALID';
  END IF;
  IF origin_kind IN (
       'REDDIT'::"DocumentOriginKind",
       'CURATED'::"DocumentOriginKind"
     ) AND (NEW."ownerUserId" IS NOT NULL OR NEW.visibility <> 'PUBLIC'::"ReadingDocumentVisibility") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READING_DOCUMENT_PUBLIC_ORIGIN_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ReadingDocument_origin_guard"
AFTER INSERT OR UPDATE ON "ReadingDocument"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_reading_document_origin"();

CREATE FUNCTION "sylis_assert_reddit_document_metadata"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_document_id uuid;
  origin_kind "DocumentOriginKind";
  metadata_count integer;
  trigger_row jsonb;
BEGIN
  trigger_row := CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
    ELSE to_jsonb(NEW)
  END;
  checked_document_id := CASE
    WHEN TG_TABLE_NAME = 'ReadingDocument' THEN (trigger_row ->> 'id')::uuid
    ELSE (trigger_row ->> 'documentId')::uuid
  END;

  SELECT origin.kind INTO origin_kind
  FROM "ReadingDocument" document
  JOIN "DocumentOrigin" origin ON origin.id = document."originId"
  WHERE document.id = checked_document_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO metadata_count
  FROM "RedditDocumentMetadata"
  WHERE "documentId" = checked_document_id;
  IF (origin_kind = 'REDDIT'::"DocumentOriginKind" AND metadata_count <> 1)
     OR (origin_kind <> 'REDDIT'::"DocumentOriginKind" AND metadata_count <> 0) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READING_DOCUMENT_REDDIT_METADATA_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ReadingDocument_reddit_metadata_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ReadingDocument"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_reddit_document_metadata"();

CREATE CONSTRAINT TRIGGER "RedditDocumentMetadata_origin_guard"
AFTER INSERT OR UPDATE OR DELETE ON "RedditDocumentMetadata"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_reddit_document_metadata"();

ALTER TABLE "ReadingDocumentRevision"
ADD CONSTRAINT "ReadingDocumentRevision_shape_check"
CHECK (
  "revisionNo" > 0
  AND length(btrim("languageTag")) > 0
  AND length(btrim(title)) > 0
  AND length(btrim("keyVersion")) > 0
  AND "wordCount" >= 0
  AND ("publishedAt" IS NULL OR "publishedAt" >= "createdAt")
  AND ("withdrawnAt" IS NULL OR ("publishedAt" IS NOT NULL AND "withdrawnAt" >= "publishedAt"))
);

ALTER TABLE "ReadingActivity"
ADD CONSTRAINT "ReadingActivity_shape_check"
CHECK (
  "eventVersion" > 0
  AND (position IS NULL OR position >= 0)
  AND (
    progress IS NULL
    OR (
      progress <> 'NaN'::double precision
      AND progress >= 0
      AND progress <= 1
    )
  )
  AND ("learnedWordCount" IS NULL OR "learnedWordCount" >= 0)
  AND ("totalReadSeconds" IS NULL OR "totalReadSeconds" >= 0)
  AND (kind <> 'PROGRESS'::"ReadingActivityKind" OR (position IS NOT NULL AND progress IS NOT NULL))
  AND (kind <> 'COMPLETE'::"ReadingActivityKind" OR progress = 1)
  AND (kind <> 'LOOKUP'::"ReadingActivityKind" OR (position IS NOT NULL AND progress IS NULL))
);

CREATE FUNCTION "sylis_guard_reading_activity_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_version integer;
BEGIN
  SELECT COALESCE(max("eventVersion"), 0) + 1 INTO expected_version
  FROM "ReadingActivity"
  WHERE "userId" = NEW."userId" AND "documentId" = NEW."documentId";
  IF NEW."eventVersion" <> expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READING_ACTIVITY_EVENT_VERSION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReadingActivity_insert_guard"
BEFORE INSERT ON "ReadingActivity"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_reading_activity_insert"();

ALTER TABLE "ReadingProgress"
ADD CONSTRAINT "ReadingProgress_shape_check"
CHECK (
  progress <> 'NaN'::double precision
  AND progress >= 0
  AND progress <= 1
  AND position >= 0
  AND "learnedWordCount" >= 0
  AND ("totalReadSeconds" IS NULL OR "totalReadSeconds" >= 0)
  AND "eventVersion" > 0
  AND "lastReadAt" >= "startedAt"
  AND ("completedAt" IS NULL OR "completedAt" BETWEEN "startedAt" AND "lastReadAt")
);

CREATE FUNCTION "sylis_assert_reading_progress_projection"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_user_id uuid;
  checked_document_id uuid;
  projection "ReadingProgress"%ROWTYPE;
  latest_activity "ReadingActivity"%ROWTYPE;
  expected_progress double precision;
  expected_position integer;
  expected_learned_word_count integer;
  expected_total_read_seconds integer;
  expected_started_at timestamptz;
  expected_completed_at timestamptz;
BEGIN
  checked_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END;
  checked_document_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."documentId" ELSE NEW."documentId" END;

  SELECT * INTO projection
  FROM "ReadingProgress"
  WHERE "userId" = checked_user_id AND "documentId" = checked_document_id;
  SELECT * INTO latest_activity
  FROM "ReadingActivity"
  WHERE "userId" = checked_user_id AND "documentId" = checked_document_id
  ORDER BY "eventVersion" DESC
  LIMIT 1;

  IF projection."userId" IS NULL AND latest_activity.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF projection."userId" IS NULL OR latest_activity.id IS NULL
     OR projection."eventVersion" <> latest_activity."eventVersion"
     OR projection."revisionId" <> latest_activity."revisionId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READING_PROGRESS_EVENT_CLOSURE_INVALID';
  END IF;

  SELECT max(activity.progress) INTO expected_progress
  FROM "ReadingActivity" activity
  WHERE activity."userId" = checked_user_id
    AND activity."documentId" = checked_document_id
    AND activity."revisionId" = latest_activity."revisionId"
    AND activity.progress IS NOT NULL;
  SELECT max(activity.position) INTO expected_position
  FROM "ReadingActivity" activity
  WHERE activity."userId" = checked_user_id
    AND activity."documentId" = checked_document_id
    AND activity."revisionId" = latest_activity."revisionId"
    AND activity.position IS NOT NULL;
  SELECT max(activity."learnedWordCount") INTO expected_learned_word_count
  FROM "ReadingActivity" activity
  WHERE activity."userId" = checked_user_id
    AND activity."documentId" = checked_document_id
    AND activity."revisionId" = latest_activity."revisionId"
    AND activity."learnedWordCount" IS NOT NULL;
  SELECT max(activity."totalReadSeconds") INTO expected_total_read_seconds
  FROM "ReadingActivity" activity
  WHERE activity."userId" = checked_user_id
    AND activity."documentId" = checked_document_id
    AND activity."revisionId" = latest_activity."revisionId"
    AND activity."totalReadSeconds" IS NOT NULL;
  SELECT min(activity."occurredAt") INTO expected_started_at
  FROM "ReadingActivity" activity
  WHERE activity."userId" = checked_user_id AND activity."documentId" = checked_document_id;
  SELECT min(activity."occurredAt") INTO expected_completed_at
  FROM "ReadingActivity" activity
  WHERE activity."userId" = checked_user_id
    AND activity."documentId" = checked_document_id
    AND activity."revisionId" = latest_activity."revisionId"
    AND activity.kind = 'COMPLETE'::"ReadingActivityKind";

  IF projection.progress IS DISTINCT FROM COALESCE(expected_progress, 0)
     OR projection.position IS DISTINCT FROM COALESCE(expected_position, 0)
     OR projection."learnedWordCount" IS DISTINCT FROM COALESCE(expected_learned_word_count, 0)
     OR projection."totalReadSeconds" IS DISTINCT FROM expected_total_read_seconds
     OR projection."startedAt" IS DISTINCT FROM expected_started_at
     OR projection."lastReadAt" IS DISTINCT FROM latest_activity."occurredAt"
     OR projection."completedAt" IS DISTINCT FROM expected_completed_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READING_PROGRESS_PROJECTION_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ReadingActivity_progress_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ReadingActivity"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_reading_progress_projection"();

CREATE CONSTRAINT TRIGGER "ReadingProgress_activity_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ReadingProgress"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_reading_progress_projection"();

ALTER TABLE "ReadingCollection"
ADD CONSTRAINT "ReadingCollection_shape_check"
CHECK (
  length(btrim("identityKey")) BETWEEN 1 AND 100
  AND length(btrim(title)) BETWEEN 1 AND 200
);

CREATE FUNCTION "sylis_guard_reading_collection_item"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tag text;
BEGIN
  IF cardinality(NEW.tags) > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READING_COLLECTION_TAG_COUNT_INVALID';
  END IF;
  FOREACH tag IN ARRAY NEW.tags LOOP
    IF length(btrim(tag)) NOT BETWEEN 1 AND 40 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READING_COLLECTION_TAG_INVALID';
    END IF;
  END LOOP;
  IF cardinality(NEW.tags) <> cardinality(ARRAY(SELECT DISTINCT value FROM unnest(NEW.tags) value)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READING_COLLECTION_TAG_DUPLICATE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReadingCollectionItem_shape_guard"
BEFORE INSERT OR UPDATE ON "ReadingCollectionItem"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_reading_collection_item"();

ALTER TABLE "ReadingTarget"
ADD CONSTRAINT "ReadingTarget_shape_check"
CHECK (
  rank BETWEEN 1 AND 8
  AND "policyVersion" ~ '^reading-targets/v[1-9][0-9]*$'
);

CREATE FUNCTION "sylis_assert_reading_target_memory"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "UserObjectiveMemoryState" memory
    WHERE memory."userId" = NEW."userId"
      AND memory."releaseId" = NEW."releaseId"
      AND memory."objectiveRevisionId" = NEW."objectiveRevisionId"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READING_TARGET_USER_OBJECTIVE_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ReadingTarget_memory_guard"
AFTER INSERT OR UPDATE ON "ReadingTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_reading_target_memory"();

ALTER TABLE "ContentDeletionRequest"
ADD CONSTRAINT "ContentDeletionRequest_retention_window_check"
CHECK ("purgeAfter" >= "hiddenAt");

CREATE FUNCTION "sylis_assert_content_deletion_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_request_id uuid;
  expected_kind "ContentDeletionTargetKind";
  requester_id uuid;
  target_count integer;
BEGIN
  IF TG_TABLE_NAME = 'ContentDeletionRequest' THEN
    IF TG_OP = 'DELETE' THEN
      checked_request_id := OLD.id;
    ELSE
      checked_request_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      checked_request_id := OLD."requestId";
    ELSE
      checked_request_id := NEW."requestId";
    END IF;
  END IF;

  SELECT "targetKind", "requestedByUserId"
  INTO expected_kind, requester_id
  FROM "ContentDeletionRequest"
  WHERE id = checked_request_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO target_count
  FROM (
    SELECT 1 FROM "ContentDeletionAssetTarget" WHERE "requestId" = checked_request_id
    UNION ALL
    SELECT 1 FROM "ContentDeletionModelExchangeTarget" WHERE "requestId" = checked_request_id
    UNION ALL
    SELECT 1 FROM "ContentDeletionSessionTarget" WHERE "requestId" = checked_request_id
    UNION ALL
    SELECT 1 FROM "ContentDeletionUserTarget" WHERE "requestId" = checked_request_id
  ) AS targets;

  IF target_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTENT_DELETION_TARGET_COUNT_INVALID';
  END IF;

  IF (
    expected_kind = 'ASSET'::"ContentDeletionTargetKind"
    AND NOT EXISTS (
      SELECT 1
      FROM "ContentDeletionAssetTarget" target
      JOIN "ContentAsset" asset ON asset.id = target."assetId"
      WHERE target."requestId" = checked_request_id
        AND asset."ownerUserId" = requester_id
    )
  ) OR (
    expected_kind = 'MODEL_EXCHANGE'::"ContentDeletionTargetKind"
    AND NOT EXISTS (
      SELECT 1
      FROM "ContentDeletionModelExchangeTarget" target
      JOIN "ModelExchange" exchange ON exchange.id = target."modelExchangeId"
      JOIN "ModelInvocation" invocation ON invocation.id = exchange."invocationId"
      JOIN "ModelExecutionPermit" permit ON permit.id = invocation."permitId"
      WHERE target."requestId" = checked_request_id
        AND permit."ownerUserId" = requester_id
    )
  ) OR (
    expected_kind = 'SESSION'::"ContentDeletionTargetKind"
    AND NOT EXISTS (
      SELECT 1
      FROM "ContentDeletionSessionTarget" target
      JOIN "AgentSession" session ON session.id = target."sessionId"
      WHERE target."requestId" = checked_request_id
        AND session."userId" = requester_id
    )
  ) OR (
    expected_kind = 'USER'::"ContentDeletionTargetKind"
    AND NOT EXISTS (
      SELECT 1
      FROM "ContentDeletionUserTarget" target
      WHERE target."requestId" = checked_request_id
        AND target."userId" = requester_id
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTENT_DELETION_TARGET_KIND_OR_OWNER_MISMATCH';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ContentDeletionRequest_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentDeletionRequest"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_deletion_target"();

CREATE CONSTRAINT TRIGGER "ContentDeletionAssetTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentDeletionAssetTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_deletion_target"();

CREATE CONSTRAINT TRIGGER "ContentDeletionModelExchangeTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentDeletionModelExchangeTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_deletion_target"();

CREATE CONSTRAINT TRIGGER "ContentDeletionSessionTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentDeletionSessionTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_deletion_target"();

CREATE CONSTRAINT TRIGGER "ContentDeletionUserTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentDeletionUserTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_deletion_target"();

CREATE FUNCTION "sylis_guard_credential_revision_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cryptoshred boolean;
BEGIN
  cryptoshred :=
    OLD."kekVersion" <> 'purged'
    AND NEW."kekVersion" = 'purged'
    AND NEW.status = 'REVOKED'
    AND NEW."revokedAt" IS NOT NULL
    AND NEW."maskedHint" = 'purged'
    AND NEW.metadata = '{}'::jsonb
    AND NEW.fingerprint ~ '^sha256:[0-9a-f]{64}$';

  IF ROW(
    NEW.id,
    NEW."profileId",
    NEW."revisionNo",
    NEW."credentialType",
    NEW."aadSchemaVersion",
    NEW."fingerprintVersion",
    NEW."expiresAt",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD."profileId",
    OLD."revisionNo",
    OLD."credentialType",
    OLD."aadSchemaVersion",
    OLD."fingerprintVersion",
    OLD."expiresAt",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CREDENTIAL_REVISION_BINDING_IMMUTABLE';
  END IF;

  IF NOT cryptoshred AND ROW(
    NEW.ciphertext,
    NEW.nonce,
    NEW."authTag",
    NEW."encryptedDek",
    NEW."dekNonce",
    NEW."dekAuthTag",
    NEW."kekVersion",
    NEW.fingerprint,
    NEW."maskedHint",
    NEW.metadata
  ) IS DISTINCT FROM ROW(
    OLD.ciphertext,
    OLD.nonce,
    OLD."authTag",
    OLD."encryptedDek",
    OLD."dekNonce",
    OLD."dekAuthTag",
    OLD."kekVersion",
    OLD.fingerprint,
    OLD."maskedHint",
    OLD.metadata
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CREDENTIAL_REVISION_CONTENT_IMMUTABLE';
  END IF;

  IF cryptoshred THEN
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status
    AND NEW."validatedAt" IS NOT DISTINCT FROM OLD."validatedAt"
    AND NEW."revokedAt" IS NOT DISTINCT FROM OLD."revokedAt" THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'PENDING'
    AND NEW.status = 'VERIFIED'
    AND OLD."validatedAt" IS NULL
    AND NEW."validatedAt" IS NOT NULL
    AND NEW."revokedAt" IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'VERIFIED'
    AND NEW.status = 'RETIRED'
    AND NEW."validatedAt" IS NOT DISTINCT FROM OLD."validatedAt"
    AND NEW."revokedAt" IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('PENDING', 'VERIFIED', 'RETIRED', 'EXPIRED')
    AND NEW.status = 'REVOKED'
    AND NEW."validatedAt" IS NOT DISTINCT FROM OLD."validatedAt"
    AND OLD."revokedAt" IS NULL
    AND NEW."revokedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('PENDING', 'VERIFIED')
    AND NEW.status = 'EXPIRED'
    AND NEW."validatedAt" IS NOT DISTINCT FROM OLD."validatedAt"
    AND NEW."revokedAt" IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CREDENTIAL_REVISION_TRANSITION_INVALID';
END;
$$;

CREATE TRIGGER "CredentialRevision_update_guard"
BEFORE UPDATE ON "CredentialRevision"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_credential_revision_update"();

CREATE FUNCTION "sylis_reject_credential_revision_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CREDENTIAL_REVISION_DELETE_FORBIDDEN';
END;
$$;

CREATE TRIGGER "CredentialRevision_delete_guard"
BEFORE DELETE ON "CredentialRevision"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_credential_revision_delete"();

CREATE FUNCTION "sylis_assert_credential_profile_current_revision"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_profile_id uuid;
  checked_profile "CredentialProfile"%ROWTYPE;
  checked_revision "CredentialRevision"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'CredentialProfile' THEN
    IF TG_OP = 'DELETE' THEN
      checked_profile_id := OLD.id;
    ELSE
      checked_profile_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      checked_profile_id := OLD."profileId";
    ELSE
      checked_profile_id := NEW."profileId";
    END IF;
  END IF;
  SELECT * INTO checked_profile FROM "CredentialProfile" WHERE id = checked_profile_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF checked_profile.status = 'VERIFIED' AND checked_profile."currentRevisionId" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CREDENTIAL_CURRENT_REVISION_REQUIRED';
  END IF;
  IF checked_profile."currentRevisionId" IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO checked_revision
  FROM "CredentialRevision"
  WHERE id = checked_profile."currentRevisionId"
    AND "profileId" = checked_profile.id;
  IF NOT FOUND
    OR (checked_profile.status = 'VERIFIED' AND checked_revision.status <> 'VERIFIED')
    OR (checked_profile.status = 'REVOKED' AND checked_revision.status <> 'REVOKED') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CREDENTIAL_CURRENT_REVISION_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "CredentialProfile_current_revision_guard"
AFTER INSERT OR UPDATE OF status, "currentRevisionId" ON "CredentialProfile"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_credential_profile_current_revision"();

CREATE CONSTRAINT TRIGGER "CredentialRevision_current_profile_guard"
AFTER INSERT OR UPDATE OF status, "profileId" OR DELETE ON "CredentialRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_credential_profile_current_revision"();

CREATE FUNCTION "sylis_guard_model_execution_permit_credential"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_revision "CredentialRevision"%ROWTYPE;
  checked_profile "CredentialProfile"%ROWTYPE;
  checked_route_provider text;
BEGIN
  SELECT * INTO checked_revision
  FROM "CredentialRevision"
  WHERE id = NEW."credentialRevisionId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'MODEL_PERMIT_CREDENTIAL_INVALID';
  END IF;
  SELECT * INTO checked_profile
  FROM "CredentialProfile"
  WHERE id = checked_revision."profileId"
  FOR SHARE;
  SELECT "providerKey" INTO checked_route_provider
  FROM "ProviderRouteRelease"
  WHERE id = NEW."routeReleaseId";
  IF checked_revision.status <> 'VERIFIED'
    OR checked_revision."revokedAt" IS NOT NULL
    OR (checked_revision."expiresAt" IS NOT NULL AND checked_revision."expiresAt" <= NEW."expiresAt")
    OR checked_profile.status <> 'VERIFIED'
    OR checked_profile."currentRevisionId" IS DISTINCT FROM checked_revision.id
    OR checked_profile."providerKey" IS DISTINCT FROM checked_route_provider
    OR (checked_profile."ownerKind" = 'USER' AND checked_profile."ownerUserId" IS DISTINCT FROM NEW."ownerUserId") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_PERMIT_CREDENTIAL_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ModelExecutionPermit_credential_insert_guard"
BEFORE INSERT ON "ModelExecutionPermit"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_model_execution_permit_credential"();

CREATE FUNCTION "sylis_assert_no_invalid_issued_credential_permit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_profile_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'CredentialProfile' THEN
    checked_profile_id := NEW.id;
  ELSE
    checked_profile_id := NEW."profileId";
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "ModelExecutionPermit" permit
    JOIN "CredentialRevision" revision ON revision.id = permit."credentialRevisionId"
    JOIN "CredentialProfile" profile ON profile.id = revision."profileId"
    JOIN "ProviderRouteRelease" route ON route.id = permit."routeReleaseId"
    WHERE profile.id = checked_profile_id
      AND permit.status = 'ISSUED'
      AND (
        revision.status <> 'VERIFIED'
        OR revision."revokedAt" IS NOT NULL
        OR (revision."expiresAt" IS NOT NULL AND revision."expiresAt" <= permit."expiresAt")
        OR profile.status <> 'VERIFIED'
        OR profile."currentRevisionId" IS DISTINCT FROM revision.id
        OR profile."providerKey" IS DISTINCT FROM route."providerKey"
        OR (profile."ownerKind" = 'USER' AND profile."ownerUserId" IS DISTINCT FROM permit."ownerUserId")
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CREDENTIAL_REVOCATION_HAS_ISSUED_PERMIT';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "CredentialProfile_issued_permit_guard"
AFTER UPDATE OF status, "currentRevisionId" ON "CredentialProfile"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_no_invalid_issued_credential_permit"();

CREATE CONSTRAINT TRIGGER "CredentialRevision_issued_permit_guard"
AFTER UPDATE OF status, "revokedAt", "expiresAt" ON "CredentialRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_no_invalid_issued_credential_permit"();

ALTER TABLE "ModelExecutionPermit"
ADD CONSTRAINT "ModelExecutionPermit_budget_and_expiry_check"
CHECK (
  "maxInputTokens" > 0
  AND "maxOutputTokens" > 0
  AND "maxCostMicros" >= 0
  AND "expiresAt" > "createdAt"
);

ALTER TABLE "ModelExecutionPermit"
ADD CONSTRAINT "ModelExecutionPermit_state_shape_check"
CHECK (
  (
    "status" IN ('ISSUED', 'EXPIRED', 'REVOKED')
    AND "claimedAt" IS NULL
    AND "consumedAt" IS NULL
  )
  OR (
    "status" = 'CLAIMED'
    AND "claimedAt" IS NOT NULL
    AND "claimedAt" < "expiresAt"
    AND "consumedAt" IS NULL
  )
  OR (
    "status" = 'CONSUMED'
    AND "claimedAt" IS NOT NULL
    AND "consumedAt" IS NOT NULL
    AND "consumedAt" >= "claimedAt"
  )
);

CREATE FUNCTION "sylis_guard_model_execution_permit_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW."callerServiceKey",
    NEW."purpose",
    NEW."ownerType",
    NEW."ownerUserId",
    NEW."routeReleaseId",
    NEW."credentialRevisionId",
    NEW."capabilityReleaseId",
    NEW."operation",
    NEW."inputDigest",
    NEW."maxInputTokens",
    NEW."maxOutputTokens",
    NEW."maxCostMicros",
    NEW."retentionMode",
    NEW."requestKey",
    NEW."expiresAt",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."callerServiceKey",
    OLD."purpose",
    OLD."ownerType",
    OLD."ownerUserId",
    OLD."routeReleaseId",
    OLD."credentialRevisionId",
    OLD."capabilityReleaseId",
    OLD."operation",
    OLD."inputDigest",
    OLD."maxInputTokens",
    OLD."maxOutputTokens",
    OLD."maxCostMicros",
    OLD."retentionMode",
    OLD."requestKey",
    OLD."expiresAt",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MODEL_EXECUTION_PERMIT_BINDING_IMMUTABLE';
  END IF;

  IF NEW."status" = OLD."status" THEN
    IF ROW(NEW."claimedAt", NEW."consumedAt", NEW."claimTokenHash")
       IS DISTINCT FROM
       ROW(OLD."claimedAt", OLD."consumedAt", OLD."claimTokenHash") THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MODEL_EXECUTION_PERMIT_STATE_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'ISSUED'
     AND NEW."status" = 'CLAIMED'
     AND OLD."claimedAt" IS NULL
     AND NEW."claimedAt" IS NOT NULL
     AND NEW."claimedAt" < OLD."expiresAt"
     AND NEW."consumedAt" IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'ISSUED'
     AND NEW."status" IN ('EXPIRED', 'REVOKED')
     AND NEW."claimedAt" IS NULL
     AND NEW."consumedAt" IS NULL
     AND NEW."claimTokenHash" IS NOT DISTINCT FROM OLD."claimTokenHash" THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'CLAIMED'
     AND NEW."status" = 'CONSUMED'
     AND NEW."claimedAt" IS NOT DISTINCT FROM OLD."claimedAt"
     AND NEW."consumedAt" IS NOT NULL
     AND NEW."consumedAt" >= NEW."claimedAt"
     AND NEW."claimTokenHash" IS NOT DISTINCT FROM OLD."claimTokenHash" THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MODEL_EXECUTION_PERMIT_TRANSITION_INVALID';
END;
$$;

CREATE TRIGGER "ModelExecutionPermit_update_guard"
BEFORE UPDATE ON "ModelExecutionPermit"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_model_execution_permit_update"();

CREATE FUNCTION "sylis_guard_model_invocation_permit_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  permit_purpose "ModelPurposeKind";
  permit_owner_type "ModelExecutionOwnerType";
  permit_owner_id uuid;
  permit_route_release_id uuid;
  permit_credential_revision_id uuid;
  permit_input_digest text;
  permit_status "ModelPermitStatus";
BEGIN
  SELECT
    permit."purpose",
    permit."ownerType",
    CASE permit."ownerType"
      WHEN 'AGENT_RUN' THEN agent_target."agentRunId"
      WHEN 'BUILD_RUN' THEN build_target."buildRunId"
      WHEN 'EVALUATION_RUN' THEN evaluation_target."evaluationRunId"
      WHEN 'ASSET_REVISION' THEN asset_target."assetRevisionId"
    END,
    permit."routeReleaseId",
    permit."credentialRevisionId",
    permit."inputDigest",
    permit."status"
  INTO
    permit_purpose,
    permit_owner_type,
    permit_owner_id,
    permit_route_release_id,
    permit_credential_revision_id,
    permit_input_digest,
    permit_status
  FROM "ModelExecutionPermit" permit
  LEFT JOIN "ModelExecutionPermitAgentRunTarget" agent_target
    ON agent_target."permitId" = permit.id
  LEFT JOIN "ModelExecutionPermitBuildRunTarget" build_target
    ON build_target."permitId" = permit.id
  LEFT JOIN "ModelExecutionPermitEvaluationRunTarget" evaluation_target
    ON evaluation_target."permitId" = permit.id
  LEFT JOIN "ModelExecutionPermitAssetRevisionTarget" asset_target
    ON asset_target."permitId" = permit.id
  WHERE permit.id = NEW."permitId";

  IF NOT FOUND
     OR permit_status NOT IN ('CLAIMED', 'CONSUMED')
     OR permit_owner_id IS NULL
     OR NEW."purpose" IS DISTINCT FROM permit_purpose
     OR NEW."ownerType" IS DISTINCT FROM permit_owner_type
     OR NEW."ownerId" IS DISTINCT FROM permit_owner_id
     OR NEW."routeReleaseId" IS DISTINCT FROM permit_route_release_id
     OR NEW."credentialRevisionId" IS DISTINCT FROM permit_credential_revision_id
     OR NEW."inputDigest" IS DISTINCT FROM permit_input_digest THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_INVOCATION_PERMIT_BINDING_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ModelInvocation_permit_binding_insert_guard"
BEFORE INSERT ON "ModelInvocation"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_model_invocation_permit_binding"();

CREATE TRIGGER "ModelInvocation_permit_binding_update_guard"
BEFORE UPDATE OF
  "permitId",
  "purpose",
  "ownerType",
  "ownerId",
  "routeReleaseId",
  "credentialRevisionId",
  "inputDigest"
ON "ModelInvocation"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_model_invocation_permit_binding"();

CREATE FUNCTION "sylis_assert_model_execution_permit_claim"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_permit_id uuid;
  checked_status "ModelPermitStatus";
  invocation_count integer;
BEGIN
  IF TG_TABLE_NAME = 'ModelExecutionPermit' THEN
    IF TG_OP = 'DELETE' THEN
      checked_permit_id := OLD.id;
    ELSE
      checked_permit_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      checked_permit_id := OLD."permitId";
    ELSE
      checked_permit_id := NEW."permitId";
    END IF;
  END IF;

  SELECT "status" INTO checked_status
  FROM "ModelExecutionPermit"
  WHERE id = checked_permit_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO invocation_count
  FROM "ModelInvocation"
  WHERE "permitId" = checked_permit_id;

  IF checked_status IN ('CLAIMED', 'CONSUMED') AND invocation_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_EXECUTION_PERMIT_INVOCATION_COUNT_INVALID';
  END IF;
  IF checked_status IN ('ISSUED', 'EXPIRED', 'REVOKED') AND invocation_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_EXECUTION_PERMIT_UNCLAIMED_HAS_INVOCATION';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ModelExecutionPermit_claim_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ModelExecutionPermit"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_model_execution_permit_claim"();

CREATE CONSTRAINT TRIGGER "ModelInvocation_permit_claim_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ModelInvocation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_model_execution_permit_claim"();

CREATE FUNCTION "sylis_assert_model_execution_permit_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_permit_id uuid;
  expected_purpose "ModelPurposeKind";
  expected_owner_type "ModelExecutionOwnerType";
  expected_owner_user_id uuid;
  target_count integer;
BEGIN
  IF TG_TABLE_NAME = 'ModelExecutionPermit' THEN
    IF TG_OP = 'DELETE' THEN
      checked_permit_id := OLD.id;
    ELSE
      checked_permit_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      checked_permit_id := OLD."permitId";
    ELSE
      checked_permit_id := NEW."permitId";
    END IF;
  END IF;

  SELECT purpose, "ownerType", "ownerUserId"
  INTO expected_purpose, expected_owner_type, expected_owner_user_id
  FROM "ModelExecutionPermit"
  WHERE id = checked_permit_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO target_count
  FROM (
    SELECT 1 FROM "ModelExecutionPermitAgentRunTarget" WHERE "permitId" = checked_permit_id
    UNION ALL
    SELECT 1 FROM "ModelExecutionPermitBuildRunTarget" WHERE "permitId" = checked_permit_id
    UNION ALL
    SELECT 1 FROM "ModelExecutionPermitEvaluationRunTarget" WHERE "permitId" = checked_permit_id
    UNION ALL
    SELECT 1 FROM "ModelExecutionPermitAssetRevisionTarget" WHERE "permitId" = checked_permit_id
  ) AS targets;

  IF target_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_EXECUTION_PERMIT_TARGET_COUNT_INVALID';
  END IF;

  IF (
    expected_purpose = 'AGENT_RUN'::"ModelPurposeKind"
    AND expected_owner_type = 'AGENT_RUN'::"ModelExecutionOwnerType"
    AND expected_owner_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "ModelExecutionPermitAgentRunTarget" target
      JOIN "AgentRun" run ON run.id = target."agentRunId"
      JOIN "AgentSession" session ON session.id = run."sessionId"
      WHERE target."permitId" = checked_permit_id
        AND session."userId" = expected_owner_user_id
    )
  ) OR (
    expected_purpose = 'LEXICON_BUILD'::"ModelPurposeKind"
    AND expected_owner_type = 'BUILD_RUN'::"ModelExecutionOwnerType"
    AND expected_owner_user_id IS NULL
    AND EXISTS (SELECT 1 FROM "ModelExecutionPermitBuildRunTarget" WHERE "permitId" = checked_permit_id)
  ) OR (
    expected_purpose = 'AGENT_EVALUATION'::"ModelPurposeKind"
    AND expected_owner_type = 'EVALUATION_RUN'::"ModelExecutionOwnerType"
    AND expected_owner_user_id IS NULL
    AND EXISTS (SELECT 1 FROM "ModelExecutionPermitEvaluationRunTarget" WHERE "permitId" = checked_permit_id)
  ) OR (
    expected_purpose = 'ASSET_PROCESSING'::"ModelPurposeKind"
    AND expected_owner_type = 'ASSET_REVISION'::"ModelExecutionOwnerType"
    AND expected_owner_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "ModelExecutionPermitAssetRevisionTarget" target
      JOIN "ContentAssetRevision" revision ON revision.id = target."assetRevisionId"
      JOIN "ContentAsset" asset ON asset.id = revision."assetId"
      WHERE target."permitId" = checked_permit_id
        AND asset."ownerUserId" = expected_owner_user_id
    )
  ) THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_EXECUTION_PERMIT_PURPOSE_OWNER_MISMATCH';
END;
$$;

CREATE CONSTRAINT TRIGGER "ModelExecutionPermit_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ModelExecutionPermit"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_model_execution_permit_target"();

CREATE CONSTRAINT TRIGGER "ModelExecutionPermitAgentRunTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ModelExecutionPermitAgentRunTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_model_execution_permit_target"();

CREATE CONSTRAINT TRIGGER "ModelExecutionPermitBuildRunTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ModelExecutionPermitBuildRunTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_model_execution_permit_target"();

CREATE CONSTRAINT TRIGGER "ModelExecutionPermitEvaluationRunTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ModelExecutionPermitEvaluationRunTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_model_execution_permit_target"();

CREATE CONSTRAINT TRIGGER "ModelExecutionPermitAssetRevisionTarget_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ModelExecutionPermitAssetRevisionTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_model_execution_permit_target"();

CREATE FUNCTION "sylis_assert_etymology_link_endpoints"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_release_id uuid;
  checked_link_id uuid;
  source_count integer;
  target_count integer;
BEGIN
  checked_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
  IF TG_TABLE_NAME = 'EtymologyLink' THEN
    checked_link_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    checked_link_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."linkId" ELSE NEW."linkId" END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "EtymologyLink"
    WHERE "releaseId" = checked_release_id AND "id" = checked_link_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO source_count
  FROM (
    SELECT 1 FROM "EtymologyLinkSourceEntry" WHERE "releaseId" = checked_release_id AND "linkId" = checked_link_id
    UNION ALL
    SELECT 1 FROM "EtymologyLinkSourceEtymon" WHERE "releaseId" = checked_release_id AND "linkId" = checked_link_id
  ) AS sources;

  SELECT count(*) INTO target_count
  FROM (
    SELECT 1 FROM "EtymologyLinkTargetEntry" WHERE "releaseId" = checked_release_id AND "linkId" = checked_link_id
    UNION ALL
    SELECT 1 FROM "EtymologyLinkTargetEtymon" WHERE "releaseId" = checked_release_id AND "linkId" = checked_link_id
  ) AS targets;

  IF source_count <> 1 OR target_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ETYMOLOGY_LINK_ENDPOINT_COUNT_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "EtymologyLinkSourceEntry" source
    JOIN "EtymologyLinkTargetEntry" target
      ON target."releaseId" = source."releaseId"
     AND target."linkId" = source."linkId"
     AND target."entryId" = source."entryId"
    WHERE source."releaseId" = checked_release_id AND source."linkId" = checked_link_id
  ) OR EXISTS (
    SELECT 1
    FROM "EtymologyLinkSourceEtymon" source
    JOIN "EtymologyLinkTargetEtymon" target
      ON target."releaseId" = source."releaseId"
     AND target."linkId" = source."linkId"
     AND target."etymonId" = source."etymonId"
    WHERE source."releaseId" = checked_release_id AND source."linkId" = checked_link_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ETYMOLOGY_LINK_SELF_REFERENCE';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "EtymologyLink_endpoint_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "EtymologyLink"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_etymology_link_endpoints"();

CREATE CONSTRAINT TRIGGER "EtymologyLinkSourceEntry_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "EtymologyLinkSourceEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_etymology_link_endpoints"();

CREATE CONSTRAINT TRIGGER "EtymologyLinkSourceEtymon_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "EtymologyLinkSourceEtymon"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_etymology_link_endpoints"();

CREATE CONSTRAINT TRIGGER "EtymologyLinkTargetEntry_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "EtymologyLinkTargetEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_etymology_link_endpoints"();

CREATE CONSTRAINT TRIGGER "EtymologyLinkTargetEtymon_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "EtymologyLinkTargetEtymon"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_etymology_link_endpoints"();

CREATE FUNCTION "sylis_assert_material_block_content"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_release_id uuid;
  checked_block_id uuid;
  content_count integer;
BEGIN
  checked_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
  IF TG_TABLE_NAME = 'PedagogicalMaterialBlock' THEN
    checked_block_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    checked_block_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."blockId" ELSE NEW."blockId" END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "PedagogicalMaterialBlock"
    WHERE "releaseId" = checked_release_id AND "id" = checked_block_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO content_count
  FROM (
    SELECT 1 FROM "PedagogicalMaterialTextBlock" WHERE "releaseId" = checked_release_id AND "blockId" = checked_block_id
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialExampleBlock" WHERE "releaseId" = checked_release_id AND "blockId" = checked_block_id
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialMediaBlock" WHERE "releaseId" = checked_release_id AND "blockId" = checked_block_id
  ) AS content;

  IF content_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PEDAGOGICAL_MATERIAL_BLOCK_CONTENT_COUNT_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialBlock_content_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_block_content"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialTextBlock_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialTextBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_block_content"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialExampleBlock_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialExampleBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_block_content"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialMediaBlock_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMediaBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_block_content"();

CREATE FUNCTION "sylis_assert_stimulus_block_content"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_row jsonb;
  checked_release_id uuid;
  checked_block_id uuid;
  content_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    checked_row := to_jsonb(OLD);
  ELSE
    checked_row := to_jsonb(NEW);
  END IF;
  checked_release_id := (checked_row ->> 'releaseId')::uuid;
  checked_block_id := (
    checked_row ->> CASE
    WHEN TG_TABLE_NAME = 'AssessmentStimulusBlock' THEN
      'id'
    ELSE
      'blockId'
    END
  )::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM "AssessmentStimulusBlock"
    WHERE "releaseId" = checked_release_id AND "id" = checked_block_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO content_count
  FROM (
    SELECT 1 FROM "AssessmentStimulusTextBlock" WHERE "releaseId" = checked_release_id AND "blockId" = checked_block_id
    UNION ALL
    SELECT 1 FROM "AssessmentStimulusExampleBlock" WHERE "releaseId" = checked_release_id AND "blockId" = checked_block_id
    UNION ALL
    SELECT 1 FROM "AssessmentStimulusMediaBlock" WHERE "releaseId" = checked_release_id AND "blockId" = checked_block_id
    UNION ALL
    SELECT 1 FROM "AssessmentStimulusMaterialBlock" WHERE "releaseId" = checked_release_id AND "blockId" = checked_block_id
  ) AS content;

  IF content_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASSESSMENT_STIMULUS_BLOCK_CONTENT_COUNT_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AssessmentStimulusBlock_content_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentStimulusBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_stimulus_block_content"();

CREATE CONSTRAINT TRIGGER "AssessmentStimulusTextBlock_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentStimulusTextBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_stimulus_block_content"();

CREATE CONSTRAINT TRIGGER "AssessmentStimulusExampleBlock_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentStimulusExampleBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_stimulus_block_content"();

CREATE CONSTRAINT TRIGGER "AssessmentStimulusMediaBlock_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentStimulusMediaBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_stimulus_block_content"();

CREATE CONSTRAINT TRIGGER "AssessmentStimulusMaterialBlock_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AssessmentStimulusMaterialBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_stimulus_block_content"();

CREATE FUNCTION "sylis_assert_material_mention_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_release_id uuid;
  checked_mention_id uuid;
  target_count integer;
  block_text text;
  checked_start integer;
  checked_end integer;
BEGIN
  checked_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
  IF TG_TABLE_NAME = 'PedagogicalMaterialMention' THEN
    checked_mention_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    checked_mention_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."mentionId" ELSE NEW."mentionId" END;
  END IF;

  SELECT mention."startOffset", mention."endOffset", text_block."text"
  INTO checked_start, checked_end, block_text
  FROM "PedagogicalMaterialMention" mention
  JOIN "PedagogicalMaterialTextBlock" text_block
    ON text_block."releaseId" = mention."releaseId"
   AND text_block."blockId" = mention."materialBlockId"
  WHERE mention."releaseId" = checked_release_id AND mention."id" = checked_mention_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO target_count
  FROM (
    SELECT 1 FROM "PedagogicalMaterialMentionHeadwordTarget" WHERE "releaseId" = checked_release_id AND "mentionId" = checked_mention_id
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialMentionEntryTarget" WHERE "releaseId" = checked_release_id AND "mentionId" = checked_mention_id
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialMentionFormTarget" WHERE "releaseId" = checked_release_id AND "mentionId" = checked_mention_id
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialMentionSenseTarget" WHERE "releaseId" = checked_release_id AND "mentionId" = checked_mention_id
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialMentionConceptTarget" WHERE "releaseId" = checked_release_id AND "mentionId" = checked_mention_id
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialMentionSenseExampleTarget" WHERE "releaseId" = checked_release_id AND "mentionId" = checked_mention_id
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialMentionCollocationTarget" WHERE "releaseId" = checked_release_id AND "mentionId" = checked_mention_id
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialMentionFrameTarget" WHERE "releaseId" = checked_release_id AND "mentionId" = checked_mention_id
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialMentionMorphemeTarget" WHERE "releaseId" = checked_release_id AND "mentionId" = checked_mention_id
  ) AS targets;

  IF target_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PEDAGOGICAL_MATERIAL_MENTION_TARGET_COUNT_INVALID';
  END IF;
  IF checked_start < 0 OR checked_end <= checked_start OR checked_end > char_length(block_text) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PEDAGOGICAL_MATERIAL_MENTION_OFFSET_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialMention_target_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMention"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_mention_target"();

CREATE CONSTRAINT TRIGGER "PMMentionHeadwordTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMentionHeadwordTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_mention_target"();

CREATE CONSTRAINT TRIGGER "PMMentionEntryTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMentionEntryTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_mention_target"();

CREATE CONSTRAINT TRIGGER "PMMentionFormTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMentionFormTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_mention_target"();

CREATE CONSTRAINT TRIGGER "PMMentionSenseTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMentionSenseTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_mention_target"();

CREATE CONSTRAINT TRIGGER "PMMentionConceptTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMentionConceptTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_mention_target"();

CREATE CONSTRAINT TRIGGER "PMMentionSenseExampleTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMentionSenseExampleTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_mention_target"();

CREATE CONSTRAINT TRIGGER "PMMentionCollocationTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMentionCollocationTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_mention_target"();

CREATE CONSTRAINT TRIGGER "PMMentionFrameTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMentionFrameTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_mention_target"();

CREATE CONSTRAINT TRIGGER "PMMentionMorphemeTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMentionMorphemeTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_mention_target"();

CREATE UNIQUE INDEX "Notebook_one_default_per_user_key"
ON "Notebook" ("userId")
WHERE "isDefault" = true AND "retiredAt" IS NULL;

CREATE UNIQUE INDEX "Notebook_active_name_key"
ON "Notebook" ("userId", lower("name"))
WHERE "retiredAt" IS NULL;

ALTER TABLE "CredentialProfile"
ADD CONSTRAINT "CredentialProfile_owner_xor_check"
CHECK (
  ("ownerKind" = 'USER' AND "ownerUserId" IS NOT NULL)
  OR ("ownerKind" = 'PLATFORM' AND "ownerUserId" IS NULL)
);

ALTER TABLE "ModelContentBody"
ADD CONSTRAINT "ModelContentBody_owner_xor_check"
CHECK (
  (
    "ownerKind" IN (
      'AGENT_INSTRUCTION',
      'AGENT_MESSAGE',
      'AGENT_PROPOSAL',
      'AGENT_ARTIFACT',
      'AGENT_MEMORY',
      'AGENT_TOOL_INPUT',
      'AGENT_TOOL_RESULT',
      'ASSET_PROCESSING'
    )
    AND "ownerUserId" IS NOT NULL
    AND (
      ("ownerKind" = 'ASSET_PROCESSING' AND "ownerResourceId" IS NOT NULL)
      OR ("ownerKind" <> 'ASSET_PROCESSING' AND "ownerResourceId" IS NULL)
    )
    AND "visibility" = 'USER'
    AND "retentionClass" IN ('TRANSIENT', 'USER_CONTROLLED')
    AND (
      ("ownerKind" IN (
        'AGENT_INSTRUCTION',
        'AGENT_MESSAGE',
        'AGENT_PROPOSAL',
        'AGENT_ARTIFACT',
        'AGENT_MEMORY',
        'AGENT_TOOL_INPUT',
        'AGENT_TOOL_RESULT'
      ) AND "purpose" = 'AGENT_RUN')
      OR ("ownerKind" = 'ASSET_PROCESSING' AND "purpose" = 'ASSET_PROCESSING')
    )
  )
  OR (
    "ownerKind" IN ('EVALUATION', 'LEXICON_BUILD', 'SYSTEM')
    AND "ownerUserId" IS NULL
    AND "visibility" = 'INTERNAL'
    AND "retentionClass" IN ('TRANSIENT', 'RELEASE_EVIDENCE', 'AUDIT')
    AND (
      ("ownerKind" = 'EVALUATION' AND "ownerResourceId" IS NOT NULL AND "purpose" = 'AGENT_EVALUATION')
      OR ("ownerKind" = 'LEXICON_BUILD' AND "ownerResourceId" IS NOT NULL AND "purpose" = 'LEXICON_BUILD')
      OR "ownerKind" = 'SYSTEM'
    )
  )
);

ALTER TABLE "ModelContentBody"
ADD CONSTRAINT "ModelContentBody_envelope_and_lifecycle_check"
CHECK (
  octet_length("ciphertext") > 0
  AND octet_length("nonce") = 12
  AND octet_length("authTag") = 16
  AND octet_length("encryptedDek") > 0
  AND octet_length("dekNonce") = 12
  AND octet_length("dekAuthTag") = 16
  AND btrim("requestKey") <> ''
  AND length("requestKey") <= 512
  AND "aadSchemaVersion" = 'model-content-body/1'
  AND "contentHash" ~ '^sha256:[0-9a-f]{64}$'
  AND (
    (
      "purgedAt" IS NULL
      AND "kekVersion" <> 'purged'
      AND (
        ("hiddenAt" IS NULL AND "purgeAfter" IS NULL)
        OR ("hiddenAt" IS NOT NULL AND "purgeAfter" IS NOT NULL AND "purgeAfter" >= "hiddenAt")
      )
    )
    OR (
      "purgedAt" IS NOT NULL
      AND "kekVersion" = 'purged'
      AND "hiddenAt" IS NOT NULL
      AND "purgeAfter" IS NOT NULL
      AND "purgedAt" >= "purgeAfter"
    )
  )
);

CREATE FUNCTION "sylis_guard_model_content_body_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MODEL_CONTENT_BODY_DELETE_FORBIDDEN';
  END IF;

  IF ROW(
    NEW."ownerKind",
    NEW."ownerUserId",
    NEW."ownerResourceId",
    NEW."purpose",
    NEW."requestKey",
    NEW."visibility",
    NEW."retentionClass",
    NEW."aadSchemaVersion",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."ownerKind",
    OLD."ownerUserId",
    OLD."ownerResourceId",
    OLD."purpose",
    OLD."requestKey",
    OLD."visibility",
    OLD."retentionClass",
    OLD."aadSchemaVersion",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MODEL_CONTENT_BODY_BINDING_IMMUTABLE';
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF OLD."hiddenAt" IS NULL
    AND OLD."purgeAfter" IS NULL
    AND OLD."purgedAt" IS NULL
    AND NEW."hiddenAt" IS NOT NULL
    AND NEW."purgeAfter" IS NOT NULL
    AND NEW."purgedAt" IS NULL
    AND ROW(
      NEW."ciphertext", NEW."nonce", NEW."authTag", NEW."encryptedDek",
      NEW."dekNonce", NEW."dekAuthTag", NEW."kekVersion", NEW."contentHash",
      NEW."sealedAt"
    ) IS NOT DISTINCT FROM ROW(
      OLD."ciphertext", OLD."nonce", OLD."authTag", OLD."encryptedDek",
      OLD."dekNonce", OLD."dekAuthTag", OLD."kekVersion", OLD."contentHash",
      OLD."sealedAt"
    ) THEN
    RETURN NEW;
  END IF;

  IF OLD."sealedAt" IS NULL
    AND NEW."sealedAt" IS NOT NULL
    AND ROW(
      NEW."ciphertext", NEW."nonce", NEW."authTag", NEW."encryptedDek",
      NEW."dekNonce", NEW."dekAuthTag", NEW."kekVersion", NEW."contentHash",
      NEW."hiddenAt", NEW."purgeAfter", NEW."purgedAt"
    ) IS NOT DISTINCT FROM ROW(
      OLD."ciphertext", OLD."nonce", OLD."authTag", OLD."encryptedDek",
      OLD."dekNonce", OLD."dekAuthTag", OLD."kekVersion", OLD."contentHash",
      OLD."hiddenAt", OLD."purgeAfter", OLD."purgedAt"
    ) THEN
    RETURN NEW;
  END IF;

  IF OLD."purgedAt" IS NULL
    AND NEW."purgedAt" IS NOT NULL
    AND NEW."kekVersion" = 'purged'
    AND NEW."hiddenAt" IS NOT NULL
    AND NEW."purgeAfter" IS NOT NULL
    AND NEW."purgedAt" >= NEW."purgeAfter" THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MODEL_CONTENT_BODY_TRANSITION_INVALID';
END;
$$;

CREATE TRIGGER "ModelContentBody_update_guard"
BEFORE UPDATE OR DELETE ON "ModelContentBody"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_model_content_body_update"();

ALTER TABLE "ModelExchangePart"
ADD CONSTRAINT "ModelExchangePart_normalized_shape_check"
CHECK (
  "sequence" >= 0
  AND "role" <> 'SYSTEM'
  AND "visibility" = 'USER'
  AND "retentionClass" = 'USER_CONTROLLED'
  AND "redactionVersion" = 'model-exchange-redaction/1'
  AND (
    ("kind" = 'TEXT' AND "contentBodyId" IS NOT NULL AND "assetRevisionId" IS NULL AND "schemaName" IS NULL AND "toolKey" IS NULL)
    OR ("kind" = 'JSON' AND "contentBodyId" IS NOT NULL AND "assetRevisionId" IS NULL AND btrim("schemaName") <> '' AND "toolKey" IS NULL)
    OR ("kind" = 'ASSET_REFERENCE' AND "contentBodyId" IS NULL AND "assetRevisionId" IS NOT NULL AND "schemaName" IS NULL AND "toolKey" IS NULL)
    OR ("kind" IN ('TOOL_CALL', 'TOOL_RESULT') AND "contentBodyId" IS NOT NULL AND "assetRevisionId" IS NULL AND "schemaName" IS NULL AND btrim("toolKey") <> '')
    OR ("purgedAt" IS NOT NULL AND "contentBodyId" IS NULL AND "assetRevisionId" IS NULL)
  )
  AND ("languageTag" IS NULL OR ("kind" = 'TEXT' AND "languageTag" ~ '^[A-Za-z0-9-]{2,35}$'))
  AND (
    ("purgedAt" IS NULL AND (("hiddenAt" IS NULL AND "purgeAfter" IS NULL) OR ("hiddenAt" IS NOT NULL AND "purgeAfter" IS NOT NULL AND "purgeAfter" >= "hiddenAt")))
    OR ("purgedAt" IS NOT NULL AND "hiddenAt" IS NOT NULL AND "purgeAfter" IS NOT NULL AND "purgedAt" >= "purgeAfter")
  )
);

CREATE FUNCTION "sylis_assert_model_exchange_part_consent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ModelExchange" exchange
    JOIN "ModelInvocation" invocation ON invocation.id = exchange."invocationId"
    JOIN "ModelExecutionPermit" permit ON permit.id = invocation."permitId"
    JOIN "ConsentRecord" consent ON consent.id = NEW."consentRecordId"
    LEFT JOIN "ModelContentBody" body ON body.id = NEW."contentBodyId"
    WHERE exchange.id = NEW."exchangeId"
      AND NEW."purgedAt" IS NULL
      AND permit."ownerUserId" IS NOT NULL
      AND consent."userId" = permit."ownerUserId"
      AND consent."purpose" = 'OPTIONAL_MODEL_EXCHANGE'
      AND consent."decision" = 'GRANTED'
      AND consent."occurredAt" <= NEW."createdAt"
      AND (
        CASE
          WHEN NEW."kind" = 'ASSET_REFERENCE' THEN 'ASSET_CONTENT'
          WHEN NEW."role" = 'USER' OR NEW."kind" = 'TOOL_CALL' THEN 'MODEL_INPUT'
          ELSE 'MODEL_OUTPUT'
        END
      )::"ConsentDataCategory" = ANY(consent."categories")
      AND NOT EXISTS (
        SELECT 1
        FROM "ConsentRecord" later
        WHERE later."userId" = consent."userId"
          AND later."purpose" = consent."purpose"
          AND (
            later."occurredAt" > consent."occurredAt"
            OR (later."occurredAt" = consent."occurredAt" AND later.id > consent.id)
          )
      )
      AND (
        NEW."contentBodyId" IS NULL
        OR (
          body."ownerUserId" = permit."ownerUserId"
          AND body."visibility" = 'USER'
          AND body."hiddenAt" IS NULL
          AND body."purgedAt" IS NULL
        )
      )
      AND (
        NEW."finishReason" IS NULL
        OR (exchange."exchangeKind" = 'RESPONSE' AND NEW."role" = 'ASSISTANT')
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_EXCHANGE_PART_CONSENT_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ModelExchangePart_consent_guard"
AFTER INSERT ON "ModelExchangePart"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_model_exchange_part_consent"();

CREATE FUNCTION "sylis_guard_model_exchange_part_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MODEL_EXCHANGE_PART_DELETE_FORBIDDEN';
  END IF;

  IF ROW(
    NEW."exchangeId", NEW."sequence", NEW."role", NEW."kind",
    NEW."consentRecordId", NEW."visibility", NEW."languageTag", NEW."schemaName",
    NEW."toolKey", NEW."finishReason", NEW."redactionVersion",
    NEW."retentionClass", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."exchangeId", OLD."sequence", OLD."role", OLD."kind",
    OLD."consentRecordId", OLD."visibility", OLD."languageTag", OLD."schemaName",
    OLD."toolKey", OLD."finishReason", OLD."redactionVersion",
    OLD."retentionClass", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MODEL_EXCHANGE_PART_BINDING_IMMUTABLE';
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF OLD."hiddenAt" IS NULL
    AND OLD."purgeAfter" IS NULL
    AND OLD."purgedAt" IS NULL
    AND NEW."hiddenAt" IS NOT NULL
    AND NEW."purgeAfter" IS NOT NULL
    AND NEW."purgedAt" IS NULL
    AND NEW."contentBodyId" IS NOT DISTINCT FROM OLD."contentBodyId"
    AND NEW."assetRevisionId" IS NOT DISTINCT FROM OLD."assetRevisionId" THEN
    RETURN NEW;
  END IF;

  IF OLD."hiddenAt" IS NOT NULL
    AND OLD."purgeAfter" IS NOT NULL
    AND OLD."purgedAt" IS NULL
    AND NEW."hiddenAt" IS NOT DISTINCT FROM OLD."hiddenAt"
    AND NEW."purgeAfter" IS NOT NULL
    AND NEW."purgeAfter" <= OLD."purgeAfter"
    AND NEW."purgedAt" IS NULL
    AND NEW."contentBodyId" IS NOT DISTINCT FROM OLD."contentBodyId"
    AND NEW."assetRevisionId" IS NOT DISTINCT FROM OLD."assetRevisionId" THEN
    RETURN NEW;
  END IF;

  IF OLD."purgedAt" IS NULL
    AND NEW."purgedAt" IS NOT NULL
    AND NEW."contentBodyId" IS NULL
    AND NEW."assetRevisionId" IS NULL
    AND NEW."hiddenAt" IS NOT NULL
    AND NEW."purgeAfter" IS NOT NULL
    AND NEW."purgedAt" >= NEW."purgeAfter" THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MODEL_EXCHANGE_PART_TRANSITION_INVALID';
END;
$$;

CREATE TRIGGER "ModelExchangePart_update_guard"
BEFORE UPDATE OR DELETE ON "ModelExchangePart"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_model_exchange_part_update"();

CREATE FUNCTION "sylis_assert_optional_exchange_consent_withdrawal"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."purpose" = 'OPTIONAL_MODEL_EXCHANGE'
    AND NEW."decision" = 'WITHDRAWN'
    AND EXISTS (
      SELECT 1
      FROM "ModelExchangePart" part
      JOIN "ModelExchange" exchange ON exchange.id = part."exchangeId"
      JOIN "ModelInvocation" invocation ON invocation.id = exchange."invocationId"
      JOIN "ModelExecutionPermit" permit ON permit.id = invocation."permitId"
      WHERE permit."ownerUserId" = NEW."userId"
        AND part."purgedAt" IS NULL
        AND (
          part."hiddenAt" IS NULL
          OR part."purgeAfter" IS NULL
          OR part."purgeAfter" > NEW."occurredAt" + interval '30 days'
        )
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_EXCHANGE_WITHDRAWAL_NOT_APPLIED';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ConsentRecord_optional_exchange_withdrawal_guard"
AFTER INSERT ON "ConsentRecord"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_optional_exchange_consent_withdrawal"();

ALTER TABLE "JobProgressEvent"
ADD CONSTRAINT "JobProgressEvent_counter_check"
CHECK (
  "sequence" > 0
  AND "processed" >= 0
  AND ("total" IS NULL OR "total" >= "processed")
  AND ("ratePerSecond" IS NULL OR "ratePerSecond" >= 0)
  AND ("etaSeconds" IS NULL OR "etaSeconds" >= 0)
  AND ("tokens" IS NULL OR "tokens" >= 0)
  AND ("costMicros" IS NULL OR "costMicros" >= 0)
);

ALTER TABLE "JobCheckpoint"
ADD CONSTRAINT "JobCheckpoint_storage_xor_check"
CHECK (
  "sequence" > 0
  AND (("stateCiphertext" IS NOT NULL)::int + ("objectRef" IS NOT NULL)::int = 1)
);

ALTER TABLE "Job"
ADD CONSTRAINT "Job_result_status_check"
CHECK ("resultRef" IS NULL OR "status" = 'SUCCEEDED');

CREATE SEQUENCE "job_fencing_token_seq" AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE FUNCTION "sylis_assert_book_item_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_row jsonb;
  checked_item_id uuid;
  target_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    checked_row := to_jsonb(OLD);
  ELSE
    checked_row := to_jsonb(NEW);
  END IF;
  checked_item_id := (
    checked_row ->> CASE
    WHEN TG_TABLE_NAME = 'VocabularyBookItem' THEN
      'id'
    ELSE
      'itemId'
    END
  )::uuid;

  IF NOT EXISTS (SELECT 1 FROM "VocabularyBookItem" WHERE "id" = checked_item_id) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO target_count
  FROM (
    SELECT 1 FROM "VocabularyBookItemHeadwordTarget" WHERE "itemId" = checked_item_id
    UNION ALL
    SELECT 1 FROM "VocabularyBookItemEntryTarget" WHERE "itemId" = checked_item_id
  ) AS targets;

  IF target_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'VOCABULARY_BOOK_ITEM_TARGET_COUNT_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "VocabularyBookItem_target_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "VocabularyBookItem"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_book_item_target"();

CREATE CONSTRAINT TRIGGER "VocabularyBookItemHeadwordTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "VocabularyBookItemHeadwordTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_book_item_target"();

CREATE CONSTRAINT TRIGGER "VocabularyBookItemEntryTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "VocabularyBookItemEntryTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_book_item_target"();

CREATE FUNCTION "sylis_assert_objective_primary_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_row jsonb;
  checked_release_id uuid;
  checked_revision_id uuid;
  objective_facet "KnowledgeFacet";
  objective_direction "RetrievalDirection";
  primary_count integer;
  primary_kind text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    checked_row := to_jsonb(OLD);
  ELSE
    checked_row := to_jsonb(NEW);
  END IF;
  checked_release_id := (checked_row ->> 'releaseId')::uuid;
  checked_revision_id := (
    checked_row ->> CASE
    WHEN TG_TABLE_NAME = 'LearningObjectiveRevision' THEN
      'id'
    ELSE
      'objectiveRevisionId'
    END
  )::uuid;

  SELECT "knowledgeFacet", "retrievalDirection"
  INTO objective_facet, objective_direction
  FROM "LearningObjectiveRevision"
  WHERE "releaseId" = checked_release_id AND "id" = checked_revision_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*), min("subjectKind") INTO primary_count, primary_kind
  FROM (
    SELECT 'SENSE'::text AS "subjectKind" FROM "LearningObjectiveSenseSubject" WHERE "releaseId" = checked_release_id AND "objectiveRevisionId" = checked_revision_id AND "subjectRole" = 'PRIMARY'
    UNION ALL
    SELECT 'FORM'::text FROM "LearningObjectiveFormSubject" WHERE "releaseId" = checked_release_id AND "objectiveRevisionId" = checked_revision_id AND "subjectRole" = 'PRIMARY'
    UNION ALL
    SELECT 'COLLOCATION'::text FROM "LearningObjectiveCollocationSubject" WHERE "releaseId" = checked_release_id AND "objectiveRevisionId" = checked_revision_id AND "subjectRole" = 'PRIMARY'
    UNION ALL
    SELECT 'FRAME'::text FROM "LearningObjectiveFrameSubject" WHERE "releaseId" = checked_release_id AND "objectiveRevisionId" = checked_revision_id AND "subjectRole" = 'PRIMARY'
    UNION ALL
    SELECT 'SENSE_EXAMPLE'::text FROM "LearningObjectiveExampleSubject" WHERE "releaseId" = checked_release_id AND "objectiveRevisionId" = checked_revision_id AND "subjectRole" = 'PRIMARY'
  ) AS targets;

  IF primary_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OBJECTIVE_PRIMARY_TARGET_COUNT_INVALID';
  END IF;

  IF objective_direction NOT IN ('RECEPTIVE', 'PRODUCTIVE', 'BIDIRECTIONAL')
     OR NOT (
       (objective_facet IN ('FORM_SPOKEN', 'FORM_WRITTEN', 'FORM_WORD_PARTS') AND primary_kind = 'FORM')
       OR (objective_facet IN ('MEANING_FORM_MEANING', 'MEANING_ASSOCIATIONS') AND primary_kind = 'SENSE')
       OR (objective_facet = 'MEANING_CONCEPT_REFERENT' AND primary_kind IN ('SENSE', 'SENSE_EXAMPLE'))
       OR (objective_facet = 'USE_GRAMMATICAL_FUNCTION' AND primary_kind IN ('FORM', 'FRAME'))
       OR (objective_facet = 'USE_COLLOCATION' AND primary_kind = 'COLLOCATION')
       OR (objective_facet = 'USE_CONSTRAINTS' AND primary_kind IN ('SENSE', 'SENSE_EXAMPLE'))
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OBJECTIVE_FACET_DIRECTION_SUBJECT_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LearningObjectiveRevision_primary_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LearningObjectiveRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_objective_primary_target"();

CREATE CONSTRAINT TRIGGER "LearningObjectiveSenseSubject_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LearningObjectiveSenseSubject"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_objective_primary_target"();

CREATE CONSTRAINT TRIGGER "LearningObjectiveFormSubject_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LearningObjectiveFormSubject"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_objective_primary_target"();

CREATE CONSTRAINT TRIGGER "LearningObjectiveCollocationSubject_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LearningObjectiveCollocationSubject"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_objective_primary_target"();

CREATE CONSTRAINT TRIGGER "LearningObjectiveFrameSubject_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LearningObjectiveFrameSubject"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_objective_primary_target"();

CREATE CONSTRAINT TRIGGER "LearningObjectiveExampleSubject_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LearningObjectiveExampleSubject"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_objective_primary_target"();

CREATE FUNCTION "sylis_assert_published_objective_exercise"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_row jsonb;
  checked_release_id uuid;
  checked_revision_id uuid;
  objective_status "RevisionStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    checked_row := to_jsonb(OLD);
  ELSE
    checked_row := to_jsonb(NEW);
  END IF;
  checked_release_id := (checked_row ->> 'releaseId')::uuid;
  checked_revision_id := (
    checked_row ->> CASE
    WHEN TG_TABLE_NAME = 'LearningObjectiveRevision' THEN
      'id'
    ELSE
      'learningObjectiveRevisionId'
    END
  )::uuid;

  SELECT "status" INTO objective_status
  FROM "LearningObjectiveRevision"
  WHERE "releaseId" = checked_release_id AND "id" = checked_revision_id;
  IF NOT FOUND OR objective_status <> 'PUBLISHED' THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "ExerciseRevision"
    WHERE "releaseId" = checked_release_id
      AND "learningObjectiveRevisionId" = checked_revision_id
      AND "status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PUBLISHED_OBJECTIVE_EXERCISE_MISSING';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LearningObjectiveRevision_published_exercise_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LearningObjectiveRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_published_objective_exercise"();

CREATE CONSTRAINT TRIGGER "ExerciseRevision_published_objective_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_published_objective_exercise"();

CREATE FUNCTION "sylis_assert_material_primary_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_release_id uuid;
  checked_revision_id uuid;
  primary_count integer;
BEGIN
  checked_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
  IF TG_TABLE_NAME = 'PedagogicalMaterialRevision' THEN
    checked_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    checked_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."materialRevisionId" ELSE NEW."materialRevisionId" END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "PedagogicalMaterialRevision"
    WHERE "releaseId" = checked_release_id AND "id" = checked_revision_id
  ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "PedagogicalMaterialRevision" revision
    JOIN "PedagogicalMaterial" material ON material.id = revision."materialId"
    JOIN "LexiconRelease" release ON release.id = revision."releaseId"
    WHERE revision."releaseId" = checked_release_id
      AND revision.id = checked_revision_id
      AND material."lexiconId" = release."lexiconId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PEDAGOGICAL_MATERIAL_RELEASE_SCOPE_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PedagogicalMaterialMorphemeTarget" target
    JOIN "Morpheme" morpheme ON morpheme.id = target."morphemeId"
    JOIN "LexiconRelease" release ON release.id = target."releaseId"
    WHERE target."releaseId" = checked_release_id
      AND target."materialRevisionId" = checked_revision_id
      AND morpheme."lexiconId" <> release."lexiconId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PEDAGOGICAL_MATERIAL_MORPHEME_SCOPE_INVALID';
  END IF;

  SELECT count(*) INTO primary_count
  FROM (
    SELECT 1 FROM "PedagogicalMaterialEntryTarget" WHERE "releaseId" = checked_release_id AND "materialRevisionId" = checked_revision_id AND "targetRole" = 'PRIMARY'
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialSenseTarget" WHERE "releaseId" = checked_release_id AND "materialRevisionId" = checked_revision_id AND "targetRole" = 'PRIMARY'
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialFormTarget" WHERE "releaseId" = checked_release_id AND "materialRevisionId" = checked_revision_id AND "targetRole" = 'PRIMARY'
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialMorphemeTarget" WHERE "releaseId" = checked_release_id AND "materialRevisionId" = checked_revision_id AND "targetRole" = 'PRIMARY'
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialWordFormationTarget" WHERE "releaseId" = checked_release_id AND "materialRevisionId" = checked_revision_id AND "targetRole" = 'PRIMARY'
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialCollocationTarget" WHERE "releaseId" = checked_release_id AND "materialRevisionId" = checked_revision_id AND "targetRole" = 'PRIMARY'
    UNION ALL
    SELECT 1 FROM "PedagogicalMaterialLearningObjectiveTarget" WHERE "releaseId" = checked_release_id AND "materialRevisionId" = checked_revision_id AND "targetRole" = 'PRIMARY'
  ) AS targets;

  IF primary_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PEDAGOGICAL_MATERIAL_PRIMARY_TARGET_COUNT_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialRevision_primary_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_primary_target"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialEntryTarget_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialEntryTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_primary_target"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialSenseTarget_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialSenseTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_primary_target"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialFormTarget_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialFormTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_primary_target"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialMorphemeTarget_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialMorphemeTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_primary_target"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialWordFormationTarget_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialWordFormationTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_primary_target"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialCollocationTarget_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialCollocationTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_primary_target"();

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialLearningObjectiveTarget_primary_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialLearningObjectiveTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_material_primary_target"();

CREATE FUNCTION "sylis_assert_content_evaluation_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_release_id uuid;
  checked_evaluation_id uuid;
  evaluation_status "ContentEvaluationStatus";
  target_count integer;
BEGIN
  checked_release_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
  IF TG_TABLE_NAME = 'ContentProfileEvaluation' THEN
    checked_evaluation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    checked_evaluation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."evaluationId" ELSE NEW."evaluationId" END;
  END IF;

  SELECT status INTO evaluation_status
  FROM "ContentProfileEvaluation"
    WHERE "releaseId" = checked_release_id AND "id" = checked_evaluation_id
  ;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO target_count
  FROM (
    SELECT 1 FROM "ContentProfileEvaluationHeadwordTarget" WHERE "releaseId" = checked_release_id AND "evaluationId" = checked_evaluation_id
    UNION ALL
    SELECT 1 FROM "ContentProfileEvaluationEntryTarget" WHERE "releaseId" = checked_release_id AND "evaluationId" = checked_evaluation_id
    UNION ALL
    SELECT 1 FROM "ContentProfileEvaluationFormTarget" WHERE "releaseId" = checked_release_id AND "evaluationId" = checked_evaluation_id
    UNION ALL
    SELECT 1 FROM "ContentProfileEvaluationSenseTarget" WHERE "releaseId" = checked_release_id AND "evaluationId" = checked_evaluation_id
    UNION ALL
    SELECT 1 FROM "ContentProfileEvaluationConceptTarget" WHERE "releaseId" = checked_release_id AND "evaluationId" = checked_evaluation_id
    UNION ALL
    SELECT 1 FROM "ContentProfileEvaluationLearningObjectiveTarget" WHERE "releaseId" = checked_release_id AND "evaluationId" = checked_evaluation_id
    UNION ALL
    SELECT 1 FROM "ContentProfileEvaluationPedagogicalMaterialTarget" WHERE "releaseId" = checked_release_id AND "evaluationId" = checked_evaluation_id
    UNION ALL
    SELECT 1 FROM "ContentProfileEvaluationExerciseTarget" WHERE "releaseId" = checked_release_id AND "evaluationId" = checked_evaluation_id
    UNION ALL
    SELECT 1 FROM "ContentProfileEvaluationBookEditionTarget" WHERE "releaseId" = checked_release_id AND "evaluationId" = checked_evaluation_id
  ) AS targets;

  IF target_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONTENT_PROFILE_EVALUATION_TARGET_COUNT_INVALID';
  END IF;

  IF evaluation_status = 'NOT_APPLICABLE'
     AND NOT EXISTS (
       SELECT 1
       FROM "ContentRequirementEvaluation"
       WHERE "releaseId" = checked_release_id
         AND "evaluationId" = checked_evaluation_id
         AND status = 'NOT_APPLICABLE'
         AND btrim("reasonCode") <> ''
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'NOT_APPLICABLE profile evaluation requires a rule reason';
  END IF;
  RETURN NULL;
END;
$$;

ALTER TABLE "ContentRequirementEvaluation"
ADD CONSTRAINT "ContentRequirementEvaluation_reason_check"
CHECK (
  "evidenceCount" >= 0
  AND (
    status <> 'NOT_APPLICABLE'
    OR ("reasonCode" IS NOT NULL AND btrim("reasonCode") <> '')
  )
);

CREATE CONSTRAINT TRIGGER "ContentProfileEvaluation_target_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentProfileEvaluation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE CONSTRAINT TRIGGER "CPEHeadwordTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentProfileEvaluationHeadwordTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE CONSTRAINT TRIGGER "CPEEntryTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentProfileEvaluationEntryTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE CONSTRAINT TRIGGER "CPEFormTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentProfileEvaluationFormTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE CONSTRAINT TRIGGER "CPESenseTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentProfileEvaluationSenseTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE CONSTRAINT TRIGGER "CPEConceptTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentProfileEvaluationConceptTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE CONSTRAINT TRIGGER "CPELearningObjectiveTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentProfileEvaluationLearningObjectiveTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE CONSTRAINT TRIGGER "CPEPedagogicalMaterialTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentProfileEvaluationPedagogicalMaterialTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE CONSTRAINT TRIGGER "CPEExerciseTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentProfileEvaluationExerciseTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE CONSTRAINT TRIGGER "CPEBookEditionTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentProfileEvaluationBookEditionTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE CONSTRAINT TRIGGER "ContentRequirementEvaluation_profile_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ContentRequirementEvaluation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_evaluation_target"();

CREATE FUNCTION "sylis_assert_proficiency_claim_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_claim_id uuid;
  target_count integer;
BEGIN
  checked_claim_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  SELECT count(*) INTO target_count
  FROM (
    SELECT 1 FROM "ProficiencyHeadwordClaim" WHERE "id" = checked_claim_id
    UNION ALL
    SELECT 1 FROM "ProficiencyEntryClaim" WHERE "id" = checked_claim_id
    UNION ALL
    SELECT 1 FROM "ProficiencySenseClaim" WHERE "id" = checked_claim_id
  ) AS claims;

  IF target_count > 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROFICIENCY_CLAIM_TARGET_NOT_UNIQUE';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ProficiencyHeadwordClaim_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ProficiencyHeadwordClaim"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_proficiency_claim_target"();

CREATE CONSTRAINT TRIGGER "ProficiencyEntryClaim_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ProficiencyEntryClaim"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_proficiency_claim_target"();

CREATE CONSTRAINT TRIGGER "ProficiencySenseClaim_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ProficiencySenseClaim"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_proficiency_claim_target"();

CREATE FUNCTION "sylis_assert_collected_revision_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_revision_id uuid;
  target_count integer;
BEGIN
  IF TG_TABLE_NAME = 'CollectedLexicalItemRevision' THEN
    checked_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    checked_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."revisionId" ELSE NEW."revisionId" END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "CollectedLexicalItemRevision" WHERE "id" = checked_revision_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT count(*)
  INTO target_count
  FROM (
    SELECT "revisionId" FROM "CollectedRevisionHeadwordTarget" WHERE "revisionId" = checked_revision_id
    UNION ALL
    SELECT "revisionId" FROM "CollectedRevisionEntryTarget" WHERE "revisionId" = checked_revision_id
    UNION ALL
    SELECT "revisionId" FROM "CollectedRevisionSenseTarget" WHERE "revisionId" = checked_revision_id
    UNION ALL
    SELECT "revisionId" FROM "CollectedRevisionCollocationTarget" WHERE "revisionId" = checked_revision_id
  ) AS targets;

  IF target_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'COLLECTED_REVISION_TARGET_COUNT_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "CollectedLexicalItemRevision_target_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "CollectedLexicalItemRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_collected_revision_target"();

CREATE CONSTRAINT TRIGGER "CollectedRevisionHeadwordTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "CollectedRevisionHeadwordTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_collected_revision_target"();

CREATE CONSTRAINT TRIGGER "CollectedRevisionEntryTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "CollectedRevisionEntryTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_collected_revision_target"();

CREATE CONSTRAINT TRIGGER "CollectedRevisionSenseTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "CollectedRevisionSenseTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_collected_revision_target"();

CREATE CONSTRAINT TRIGGER "CollectedRevisionCollocationTarget_count_guard"
AFTER INSERT OR UPDATE OR DELETE ON "CollectedRevisionCollocationTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_collected_revision_target"();

ALTER TABLE "CollectedLexicalItemRevision"
ADD CONSTRAINT "CollectedLexicalItemRevision_shape_check"
CHECK (
  "revisionNo" > 0
  AND "contentHash" ~ '^[0-9a-f]{64}$'
);

CREATE FUNCTION "sylis_assert_collected_item_current_revision"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_row "CollectedLexicalItem"%ROWTYPE;
BEGIN
  SELECT * INTO item_row
  FROM "CollectedLexicalItem"
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF item_row."currentRevisionId" IS NULL
     OR item_row.position < 0
     OR NOT EXISTS (
       SELECT 1
       FROM "CollectedLexicalItemRevision" revision
       WHERE revision."collectedItemId" = item_row.id
         AND revision.id = item_row."currentRevisionId"
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'CollectedLexicalItem requires a same-item current revision and non-negative position';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "CollectedLexicalItem_current_revision_guard"
AFTER INSERT OR UPDATE OR DELETE ON "CollectedLexicalItem"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_collected_item_current_revision"();

ALTER TABLE "SupportGrant"
ADD CONSTRAINT "SupportGrant_principal_check"
CHECK ("userId" <> "supportUserId");

ALTER TABLE "SupportGrant"
ADD CONSTRAINT "SupportGrant_purpose_details_check"
CHECK (length(btrim("purposeDetails")) BETWEEN 1 AND 1000);

ALTER TABLE "SupportGrant"
ADD CONSTRAINT "SupportGrant_expiry_check"
CHECK (
  "expiresAt" > "createdAt"
  AND "expiresAt" <= "createdAt" + interval '24 hours'
  AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);

-- Keep support access closed even if SupportResourceKind gains new values.
ALTER TABLE "SupportGrant"
ADD CONSTRAINT "SupportGrant_resource_allowlist_check"
CHECK (
  "resourceKind" IN (
    'READING_DOCUMENT_REVISION',
    'CONTENT_ASSET_REVISION',
    'COLLECTED_LEXICAL_ITEM_REVISION',
    'EXERCISE_ATTEMPT_TEXT_ARTIFACT',
    'DIAGNOSTIC_BUNDLE_REVISION'
  )
);

ALTER TABLE "DataAccessAuditEvent"
ADD CONSTRAINT "DataAccessAuditEvent_resource_allowlist_check"
CHECK (
  "resourceKind" IN (
    'READING_DOCUMENT_REVISION',
    'CONTENT_ASSET_REVISION',
    'COLLECTED_LEXICAL_ITEM_REVISION',
    'EXERCISE_ATTEMPT_TEXT_ARTIFACT',
    'DIAGNOSTIC_BUNDLE_REVISION'
  )
);

CREATE FUNCTION "sylis_due_user_content_delete"(owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT owner_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "User" app_user
      JOIN "ContentDeletionUserTarget" target
        ON target."userId" = app_user.id
      JOIN "ContentDeletionRequest" request
        ON request.id = target."requestId"
       AND request."targetKind" = 'USER'::"ContentDeletionTargetKind"
       AND request."requestedByUserId" = app_user.id
      WHERE app_user.id = owner_user_id
        AND app_user.status = 'DELETED'::"UserStatus"
        AND request.status = 'RUNNING'::"ContentDeletionStatus"
        AND request."purgeAfter" <= CURRENT_TIMESTAMP
    );
$$;

CREATE FUNCTION "sylis_guard_support_grant_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF "sylis_due_user_content_delete"(OLD."userId") THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SUPPORT_GRANT_DELETE_FORBIDDEN';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."supportUserId" IS DISTINCT FROM OLD."supportUserId"
     OR NEW."resourceKind" IS DISTINCT FROM OLD."resourceKind"
     OR NEW."resourceId" IS DISTINCT FROM OLD."resourceId"
     OR NEW."resourceRevisionId" IS DISTINCT FROM OLD."resourceRevisionId"
     OR NEW."purpose" IS DISTINCT FROM OLD."purpose"
     OR NEW."purposeDetails" IS DISTINCT FROM OLD."purposeDetails"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
     OR NEW."actionDigest" IS DISTINCT FROM OLD."actionDigest"
     OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SUPPORT_GRANT_BINDING_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "SupportGrant_update_guard"
BEFORE UPDATE OR DELETE ON "SupportGrant"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_support_grant_update"();

CREATE FUNCTION "sylis_assert_support_grant_target"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_grant_id uuid;
  owner_user_id uuid;
  support_user_id uuid;
  resource_kind "SupportResourceKind";
  resource_id uuid;
  resource_revision_id uuid;
  grant_created_at timestamptz;
  grant_expires_at timestamptz;
  target_count integer;
  target_valid boolean;
BEGIN
  IF TG_TABLE_NAME = 'SupportGrant' THEN
    checked_grant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    checked_grant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."grantId" ELSE NEW."grantId" END;
  END IF;

  SELECT
    "userId",
    "supportUserId",
    "resourceKind",
    "resourceId",
    "resourceRevisionId",
    "createdAt",
    "expiresAt"
  INTO
    owner_user_id,
    support_user_id,
    resource_kind,
    resource_id,
    resource_revision_id,
    grant_created_at,
    grant_expires_at
  FROM "SupportGrant"
  WHERE id = checked_grant_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "User" operator
    JOIN "OperatorRoleAssignment" assignment
      ON assignment."userId" = operator.id
     AND assignment.role = 'SUPPORT'
     AND assignment."grantedAt" <= grant_created_at
     AND assignment."revokedAt" IS NULL
     AND (assignment."expiresAt" IS NULL OR assignment."expiresAt" >= grant_expires_at)
    WHERE operator.id = support_user_id
      AND operator.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SUPPORT_GRANT_OPERATOR_INVALID';
  END IF;

  SELECT count(*) INTO target_count
  FROM (
    SELECT "grantId" FROM "SupportGrantReadingDocumentRevisionTarget" WHERE "grantId" = checked_grant_id
    UNION ALL
    SELECT "grantId" FROM "SupportGrantContentAssetRevisionTarget" WHERE "grantId" = checked_grant_id
    UNION ALL
    SELECT "grantId" FROM "SupportGrantCollectedLexicalItemRevisionTarget" WHERE "grantId" = checked_grant_id
    UNION ALL
    SELECT "grantId" FROM "SupportGrantExerciseAttemptTextTarget" WHERE "grantId" = checked_grant_id
    UNION ALL
    SELECT "grantId" FROM "SupportGrantDiagnosticBundleRevisionTarget" WHERE "grantId" = checked_grant_id
  ) AS targets;
  IF target_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SUPPORT_GRANT_TARGET_COUNT_INVALID';
  END IF;

  target_valid := CASE resource_kind
    WHEN 'READING_DOCUMENT_REVISION' THEN EXISTS (
      SELECT 1
      FROM "SupportGrantReadingDocumentRevisionTarget" target
      JOIN "ReadingDocumentRevision" revision
        ON revision."documentId" = target."documentId"
       AND revision.id = target."revisionId"
      JOIN "ReadingDocument" document ON document.id = revision."documentId"
      WHERE target."grantId" = checked_grant_id
        AND target."documentId" = resource_id
        AND target."revisionId" = resource_revision_id
        AND document."ownerUserId" = owner_user_id
    )
    WHEN 'CONTENT_ASSET_REVISION' THEN EXISTS (
      SELECT 1
      FROM "SupportGrantContentAssetRevisionTarget" target
      JOIN "ContentAssetRevision" revision
        ON revision."assetId" = target."assetId"
       AND revision.id = target."revisionId"
      JOIN "ContentAsset" asset ON asset.id = revision."assetId"
      WHERE target."grantId" = checked_grant_id
        AND target."assetId" = resource_id
        AND target."revisionId" = resource_revision_id
        AND asset."ownerUserId" = owner_user_id
        AND revision.status <> 'PURGED'
    )
    WHEN 'COLLECTED_LEXICAL_ITEM_REVISION' THEN EXISTS (
      SELECT 1
      FROM "SupportGrantCollectedLexicalItemRevisionTarget" target
      JOIN "CollectedLexicalItemRevision" revision
        ON revision."collectedItemId" = target."collectedItemId"
       AND revision.id = target."revisionId"
      JOIN "CollectedLexicalItem" item ON item.id = revision."collectedItemId"
      JOIN "Notebook" notebook ON notebook.id = item."notebookId"
      WHERE target."grantId" = checked_grant_id
        AND target."collectedItemId" = resource_id
        AND target."revisionId" = resource_revision_id
        AND notebook."userId" = owner_user_id
    )
    WHEN 'EXERCISE_ATTEMPT_TEXT_ARTIFACT' THEN EXISTS (
      SELECT 1
      FROM "SupportGrantExerciseAttemptTextTarget" target
      JOIN "AttemptTextResponse" response ON response."attemptId" = target."attemptId"
      JOIN "ExerciseAttempt" attempt
        ON attempt."releaseId" = response."releaseId"
       AND attempt.id = response."attemptId"
      WHERE target."grantId" = checked_grant_id
        AND target."attemptId" = resource_id
        AND target."attemptId" = resource_revision_id
        AND attempt."userId" = owner_user_id
        AND response."retentionMode" = 'ENCRYPTED_CONTENT'
    )
    WHEN 'DIAGNOSTIC_BUNDLE_REVISION' THEN EXISTS (
      SELECT 1
      FROM "SupportGrantDiagnosticBundleRevisionTarget" target
      JOIN "DiagnosticBundleRevision" revision
        ON revision."bundleId" = target."bundleId"
       AND revision.id = target."revisionId"
      JOIN "DiagnosticBundle" bundle ON bundle.id = revision."bundleId"
      WHERE target."grantId" = checked_grant_id
        AND target."bundleId" = resource_id
        AND target."revisionId" = resource_revision_id
        AND bundle."ownerUserId" = owner_user_id
        AND revision.status = 'CONFIRMED'
    )
  END;

  IF target_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SUPPORT_GRANT_TARGET_BINDING_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "SupportGrant_target_guard"
AFTER INSERT OR UPDATE OR DELETE ON "SupportGrant"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_support_grant_target"();

CREATE CONSTRAINT TRIGGER "SGReadingRevisionTarget_guard"
AFTER INSERT OR UPDATE OR DELETE ON "SupportGrantReadingDocumentRevisionTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_support_grant_target"();

CREATE CONSTRAINT TRIGGER "SGAssetRevisionTarget_guard"
AFTER INSERT OR UPDATE OR DELETE ON "SupportGrantContentAssetRevisionTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_support_grant_target"();

CREATE CONSTRAINT TRIGGER "SGCollectedRevisionTarget_guard"
AFTER INSERT OR UPDATE OR DELETE ON "SupportGrantCollectedLexicalItemRevisionTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_support_grant_target"();

CREATE CONSTRAINT TRIGGER "SGAttemptTextTarget_guard"
AFTER INSERT OR UPDATE OR DELETE ON "SupportGrantExerciseAttemptTextTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_support_grant_target"();

CREATE CONSTRAINT TRIGGER "SGDiagnosticRevisionTarget_guard"
AFTER INSERT OR UPDATE OR DELETE ON "SupportGrantDiagnosticBundleRevisionTarget"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_support_grant_target"();

CREATE FUNCTION "sylis_assert_data_access_audit_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  support_grant "SupportGrant"%ROWTYPE;
BEGIN
  SELECT * INTO support_grant
  FROM "SupportGrant"
  WHERE id = NEW."supportGrantId";

  IF NOT FOUND
     OR NEW."ownerUserId" IS DISTINCT FROM support_grant."userId"
     OR NEW.purpose IS DISTINCT FROM support_grant.purpose
     OR NEW."resourceKind" IS DISTINCT FROM support_grant."resourceKind"
     OR NEW."resourceId" IS DISTINCT FROM support_grant."resourceId"
     OR NEW."resourceRevisionId" IS DISTINCT FROM support_grant."resourceRevisionId" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DATA_ACCESS_AUDIT_GRANT_BINDING_INVALID';
  END IF;

  IF NEW.result IN ('SUCCEEDED', 'FAILED') THEN
    IF NEW."actorUserId" IS DISTINCT FROM support_grant."supportUserId"
       OR NEW."occurredAt" < support_grant."createdAt"
       OR NEW."occurredAt" >= support_grant."expiresAt"
       OR (
         support_grant."revokedAt" IS NOT NULL
         AND NEW."occurredAt" >= support_grant."revokedAt"
       )
       OR NOT EXISTS (
         SELECT 1
         FROM "User" operator
         JOIN "OperatorRoleAssignment" assignment
           ON assignment."userId" = operator.id
          AND assignment.role = 'SUPPORT'
          AND assignment."grantedAt" <= NEW."occurredAt"
          AND (
            assignment."revokedAt" IS NULL
            OR assignment."revokedAt" > NEW."occurredAt"
          )
          AND (
            assignment."expiresAt" IS NULL
            OR assignment."expiresAt" > NEW."occurredAt"
          )
         WHERE operator.id = support_grant."supportUserId"
           AND operator.status = 'ACTIVE'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'DATA_ACCESS_AUDIT_AUTHORIZATION_INVALID';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "DataAccessAuditEvent_grant_binding_guard"
AFTER INSERT ON "DataAccessAuditEvent"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_data_access_audit_binding"();

ALTER TABLE "BuildRun"
ADD CONSTRAINT "BuildRun_mode_profile_check" CHECK (
  (
    "mode" = 'PILOT'
    AND "compileProfile" = 'PILOT_200'
    AND "pilotEvidenceRunId" IS NULL
    AND "forecastHash" IS NULL
  )
  OR (
    "mode" = 'FULL'
    AND "compileProfile" = 'CORE_20000'
    AND "pilotEvidenceRunId" IS NOT NULL
    AND "forecastHash" IS NOT NULL
  )
);

ALTER TABLE "BuildRun"
ADD CONSTRAINT "BuildRun_model_policy_check" CHECK (
  jsonb_typeof("modelPolicy") = 'object'
  AND "budgetMicros" >= 0
  AND COALESCE(
    ("modelPolicy" -> 'enabled') IN ('true'::jsonb, 'false'::jsonb),
    false
  )
  AND (
    ("modelPolicy" -> 'enabled') = 'false'::jsonb
    OR (
      "providerRouteReleaseId" IS NOT NULL
      AND "credentialRevisionId" IS NOT NULL
      AND "budgetMicros" > 0
    )
  )
);

ALTER TABLE "BuildRun"
ADD CONSTRAINT "BuildRun_artifact_state_check" CHECK (
  (
    "status" = 'ARTIFACT_PUBLISHED'
    AND "artifactUri" IS NOT NULL
    AND "artifactHash" IS NOT NULL
    AND "compilerRunId" IS NOT NULL
    AND "completedAt" IS NOT NULL
  )
  OR (
    "status" <> 'ARTIFACT_PUBLISHED'
    AND "artifactUri" IS NULL
    AND "artifactHash" IS NULL
    AND "reportUri" IS NULL
    AND "compilerRunId" IS NULL
    AND "completedAt" IS NULL
  )
);

ALTER TABLE "BuildRunActivation"
ADD CONSTRAINT "BuildRunActivation_shape_check" CHECK (
  "sequence" >= 0
  AND (
    (
      "reason" IN ('INITIAL', 'USER_RETRY')
      AND "reviewBatchId" IS NULL
      AND "budgetApprovalId" IS NULL
    )
    OR (
      "reason" = 'REVIEW_RESUME'
      AND "reviewBatchId" IS NOT NULL
      AND "budgetApprovalId" IS NULL
    )
    OR (
      "reason" = 'BUDGET_RESUME'
      AND "reviewBatchId" IS NULL
      AND "budgetApprovalId" IS NOT NULL
    )
  )
);

ALTER TABLE "BudgetApproval"
ADD CONSTRAINT "BudgetApproval_shape_check" CHECK (
  "sequence" >= 0
  AND "approvedBudgetMicros" >= 0
  AND length(btrim("forecastHash")) > 0
  AND length(btrim("actionDigest")) > 0
  AND length(btrim("idempotencyKey")) > 0
  AND length(btrim("requestHash")) > 0
  AND length(btrim("reason")) > 0
);

ALTER TABLE "PublishRun"
ADD CONSTRAINT "PublishRun_state_check" CHECK (
  (
    "status" IN ('DRAFT', 'QUEUED', 'RUNNING')
    AND "completedAt" IS NULL
  )
  OR (
    "status" IN ('SUCCEEDED', 'FAILED', 'CANCELLED')
    AND "completedAt" IS NOT NULL
  )
);

ALTER TABLE "PublishRun"
ADD CONSTRAINT "PublishRun_result_shape_check" CHECK (
  (
    "mode" = 'PUBLISH'
    AND (
      (
        "status" = 'SUCCEEDED'
        AND "releaseId" IS NOT NULL
        AND "importedCounts" IS NOT NULL
        AND "validation" IS NOT NULL
      )
      OR (
        "status" <> 'SUCCEEDED'
        AND "releaseId" IS NULL
        AND "importedCounts" IS NULL
        AND "validation" IS NULL
      )
    )
  )
  OR (
    "mode" = 'VALIDATE'
    AND "releaseId" IS NOT NULL
    AND "importedCounts" IS NULL
    AND (
      ("status" = 'SUCCEEDED' AND "validation" IS NOT NULL)
      OR ("status" <> 'SUCCEEDED' AND "validation" IS NULL)
    )
  )
);

CREATE UNIQUE INDEX "BuildRunActivation_initial_once"
ON "BuildRunActivation"("buildRunId")
WHERE "reason" = 'INITIAL';

CREATE UNIQUE INDEX "LexiconReleaseActivation_approvalId_key"
ON "LexiconReleaseActivation"("approvalId");

CREATE FUNCTION "sylis_guard_build_run_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'BUILD_RUN_DELETE_FORBIDDEN';
  END IF;

  IF ROW(
    NEW."mode",
    NEW."manifestUri",
    NEW."inputManifestHash",
    NEW."compileProfile",
    NEW."providerRouteReleaseId",
    NEW."credentialRevisionId",
    NEW."modelPolicy",
    NEW."forecastHash",
    NEW."codeVersion",
    NEW."schemaVersion",
    NEW."requestHash",
    NEW."pilotEvidenceRunId",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."mode",
    OLD."manifestUri",
    OLD."inputManifestHash",
    OLD."compileProfile",
    OLD."providerRouteReleaseId",
    OLD."credentialRevisionId",
    OLD."modelPolicy",
    OLD."forecastHash",
    OLD."codeVersion",
    OLD."schemaVersion",
    OLD."requestHash",
    OLD."pilotEvidenceRunId",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'BUILD_RUN_INPUT_IMMUTABLE';
  END IF;

  IF OLD."status" IN ('ARTIFACT_PUBLISHED', 'REJECTED')
    AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'BUILD_RUN_TERMINAL_IMMUTABLE';
  END IF;

  IF NEW."budgetMicros" IS DISTINCT FROM OLD."budgetMicros" THEN
    IF NEW."budgetMicros" < OLD."budgetMicros"
      OR OLD."status" <> 'BUDGET_APPROVAL_PENDING'
      OR NEW."status" <> 'APPROVED'
      OR NOT EXISTS (
        SELECT 1
        FROM "BudgetApproval" approval
        WHERE approval."buildRunId" = NEW."id"
          AND approval."approvedBudgetMicros" = NEW."budgetMicros"
      ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'BUILD_RUN_BUDGET_CHANGE_INVALID';
    END IF;
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status"
    AND NOT (
      (OLD."status" = 'PROPOSED' AND NEW."status" IN ('BUDGET_APPROVAL_PENDING', 'APPROVED', 'REJECTED'))
      OR (OLD."status" = 'BUDGET_APPROVAL_PENDING' AND NEW."status" IN ('APPROVED', 'REJECTED'))
      OR (OLD."status" = 'APPROVED' AND NEW."status" IN ('BUDGET_APPROVAL_PENDING', 'ARTIFACT_PUBLISHED', 'REJECTED'))
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format('BUILD_RUN_TRANSITION_INVALID:%s:%s', OLD."status", NEW."status");
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "BuildRun_update_guard"
BEFORE UPDATE OR DELETE ON "BuildRun"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_build_run_update"();

CREATE FUNCTION "sylis_guard_publish_run_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PUBLISH_RUN_DELETE_FORBIDDEN';
  END IF;

  IF ROW(
    NEW."jobId",
    NEW."artifactUri",
    NEW."artifactHash",
    NEW."expectedSchema",
    NEW."mode",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."jobId",
    OLD."artifactUri",
    OLD."artifactHash",
    OLD."expectedSchema",
    OLD."mode",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PUBLISH_RUN_INPUT_IMMUTABLE';
  END IF;

  IF OLD."status" IN ('SUCCEEDED', 'CANCELLED')
    AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PUBLISH_RUN_TERMINAL_IMMUTABLE';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status"
    AND NOT (
      (OLD."status" = 'DRAFT' AND NEW."status" IN ('QUEUED', 'CANCELLED'))
      OR (OLD."status" = 'QUEUED' AND NEW."status" IN ('RUNNING', 'CANCELLED'))
      OR (OLD."status" = 'RUNNING' AND NEW."status" IN ('SUCCEEDED', 'FAILED', 'CANCELLED'))
      OR (OLD."status" = 'FAILED' AND NEW."status" = 'RUNNING')
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format('PUBLISH_RUN_TRANSITION_INVALID:%s:%s', OLD."status", NEW."status");
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "PublishRun_update_guard"
BEFORE UPDATE OR DELETE ON "PublishRun"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_publish_run_update"();

ALTER TABLE "LexiconReleaseActivation"
ADD CONSTRAINT "LexiconReleaseActivation_reason_check" CHECK (
  length(btrim("reason")) > 0
  AND "fromReleaseId" IS DISTINCT FROM "toReleaseId"
);

CREATE FUNCTION "sylis_assert_pipeline_job_by_id"(checked_job_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  checked_job "Job"%ROWTYPE;
  relation_count bigint;
BEGIN
  SELECT * INTO checked_job
  FROM "Job"
  WHERE "id" = checked_job_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF checked_job."ownerType" = 'BUILD_RUN'
    OR checked_job."kind" = 'LEXICON_BUILD' THEN
    SELECT count(*)
    INTO relation_count
    FROM "BuildRunActivation" activation
    WHERE activation."jobId" = checked_job.id;

    IF checked_job."ownerType" <> 'BUILD_RUN'
      OR checked_job."kind" <> 'LEXICON_BUILD'
      OR relation_count <> 1
      OR NOT EXISTS (
        SELECT 1
        FROM "BuildRunActivation" activation
        WHERE activation."jobId" = checked_job.id
          AND activation."buildRunId" = checked_job."ownerId"
      )
      OR checked_job."inputRef" IS DISTINCT FROM jsonb_build_object(
        'requestId',
        checked_job."ownerId"::text
      ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILD_RUN_JOB_BINDING_INVALID';
    END IF;
  END IF;

  IF checked_job."ownerType" = 'PUBLISH_RUN'
    OR checked_job."kind" IN ('LEXICON_PUBLISH', 'LEXICON_VALIDATE') THEN
    SELECT count(*)
    INTO relation_count
    FROM "PublishRun" run
    WHERE run."jobId" = checked_job.id;

    IF checked_job."ownerType" <> 'PUBLISH_RUN'
      OR checked_job."kind" NOT IN ('LEXICON_PUBLISH', 'LEXICON_VALIDATE')
      OR relation_count <> 1
      OR NOT EXISTS (
        SELECT 1
        FROM "PublishRun" run
        WHERE run."jobId" = checked_job.id
          AND run.id = checked_job."ownerId"
      )
      OR checked_job."inputRef" IS DISTINCT FROM jsonb_build_object(
        'requestId',
        checked_job."ownerId"::text
      ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PUBLISH_RUN_JOB_BINDING_INVALID';
    END IF;
  END IF;
END;
$$;

CREATE FUNCTION "sylis_assert_build_run_pipeline_by_id"(checked_build_run_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  checked_run "BuildRun"%ROWTYPE;
  pilot_run "BuildRun"%ROWTYPE;
  activation_count bigint;
  minimum_sequence integer;
  maximum_sequence integer;
  approval_count bigint;
  minimum_approval_sequence integer;
  maximum_approval_sequence integer;
BEGIN
  SELECT * INTO checked_run
  FROM "BuildRun"
  WHERE "id" = checked_build_run_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF checked_run."mode" = 'FULL' THEN
    SELECT * INTO pilot_run
    FROM "BuildRun"
    WHERE "id" = checked_run."pilotEvidenceRunId";

    IF NOT FOUND
      OR pilot_run."mode" <> 'PILOT'
      OR pilot_run."compileProfile" <> 'PILOT_200'
      OR pilot_run."status" <> 'ARTIFACT_PUBLISHED'
      OR pilot_run."inputManifestHash" IS DISTINCT FROM checked_run."inputManifestHash"
      OR pilot_run."codeVersion" IS DISTINCT FROM checked_run."codeVersion"
      OR pilot_run."schemaVersion" IS DISTINCT FROM checked_run."schemaVersion"
      OR pilot_run."providerRouteReleaseId" IS DISTINCT FROM checked_run."providerRouteReleaseId"
      OR pilot_run."credentialRevisionId" IS DISTINCT FROM checked_run."credentialRevisionId"
      OR pilot_run."modelPolicy" IS DISTINCT FROM checked_run."modelPolicy" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FULL_BUILD_PILOT_EVIDENCE_INVALID';
    END IF;
  END IF;

  SELECT count(*), min("sequence"), max("sequence")
  INTO activation_count, minimum_sequence, maximum_sequence
  FROM "BuildRunActivation"
  WHERE "buildRunId" = checked_run.id;

  IF activation_count > 0
    AND (minimum_sequence <> 0 OR maximum_sequence <> activation_count - 1) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILD_RUN_ACTIVATION_SEQUENCE_INVALID';
  END IF;

  IF checked_run."status" = 'PROPOSED' AND activation_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROPOSED_BUILD_RUN_ACTIVATION_FORBIDDEN';
  END IF;

  IF checked_run."status" IN ('APPROVED', 'ARTIFACT_PUBLISHED')
    AND activation_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILD_RUN_ACTIVATION_REQUIRED';
  END IF;

  IF checked_run."mode" = 'FULL'
    AND checked_run."status" IN ('APPROVED', 'ARTIFACT_PUBLISHED')
    AND NOT EXISTS (
      SELECT 1
      FROM "BuildRunActivation" activation
      JOIN "BudgetApproval" approval
        ON approval.id = activation."budgetApprovalId"
       AND approval."buildRunId" = activation."buildRunId"
      WHERE activation."buildRunId" = checked_run.id
        AND activation."reason" = 'BUDGET_RESUME'
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FULL_BUILD_BUDGET_APPROVAL_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "BuildRunActivation" activation
    WHERE activation."buildRunId" = checked_run.id
      AND activation."reason" = 'INITIAL'
      AND (
        checked_run."mode" <> 'PILOT'
        OR activation."sequence" <> 0
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILD_RUN_INITIAL_ACTIVATION_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "BuildRunActivation" activation
    JOIN "Job" job ON job.id = activation."jobId"
    WHERE activation."buildRunId" = checked_run.id
      AND (
        job."kind" <> 'LEXICON_BUILD'
        OR job."ownerType" <> 'BUILD_RUN'
        OR job."ownerId" <> checked_run.id
        OR job."inputRef" IS DISTINCT FROM jsonb_build_object(
          'requestId',
          checked_run.id::text
        )
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILD_RUN_JOB_BINDING_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "BuildRunActivation" activation
    LEFT JOIN "ReviewBatch" batch ON batch.id = activation."reviewBatchId"
    WHERE activation."buildRunId" = checked_run.id
      AND activation."reason" = 'REVIEW_RESUME'
      AND (
        batch.id IS NULL
        OR batch."buildRunId" <> checked_run.id
        OR batch."status" NOT IN ('APPROVED', 'REJECTED')
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILD_RUN_REVIEW_ACTIVATION_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "BuildRunActivation" activation
    LEFT JOIN "BudgetApproval" approval
      ON approval.id = activation."budgetApprovalId"
     AND approval."buildRunId" = activation."buildRunId"
    WHERE activation."buildRunId" = checked_run.id
      AND activation."reason" = 'BUDGET_RESUME'
      AND (
        approval.id IS NULL
        OR approval."forecastHash" IS DISTINCT FROM checked_run."forecastHash"
        OR approval."approvedBudgetMicros" > checked_run."budgetMicros"
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILD_RUN_BUDGET_ACTIVATION_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "BudgetApproval" approval
    WHERE approval."buildRunId" = checked_run.id
      AND NOT EXISTS (
        SELECT 1
        FROM "BuildRunActivation" activation
        WHERE activation."buildRunId" = approval."buildRunId"
          AND activation."budgetApprovalId" = approval.id
          AND activation."reason" = 'BUDGET_RESUME'
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUDGET_APPROVAL_ACTIVATION_REQUIRED';
  END IF;

  SELECT count(*), min("sequence"), max("sequence")
  INTO approval_count, minimum_approval_sequence, maximum_approval_sequence
  FROM "BudgetApproval"
  WHERE "buildRunId" = checked_run.id;

  IF approval_count > 0
    AND (
      minimum_approval_sequence <> 0
      OR maximum_approval_sequence <> approval_count - 1
      OR EXISTS (
        SELECT 1
        FROM (
          SELECT
            "approvedBudgetMicros",
            lag("approvedBudgetMicros") OVER (ORDER BY "sequence") AS previous_budget
          FROM "BudgetApproval"
          WHERE "buildRunId" = checked_run.id
        ) ordered_approval
        WHERE ordered_approval.previous_budget IS NOT NULL
          AND ordered_approval."approvedBudgetMicros" < ordered_approval.previous_budget
      )
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUDGET_APPROVAL_SEQUENCE_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ReviewBatch" batch
    WHERE batch."buildRunId" = checked_run.id
      AND (
        (
          batch."status" IN ('APPROVED', 'REJECTED')
          AND NOT EXISTS (
            SELECT 1
            FROM "BuildRunActivation" activation
            WHERE activation."reviewBatchId" = batch.id
              AND activation."buildRunId" = checked_run.id
              AND activation."reason" = 'REVIEW_RESUME'
          )
        )
        OR (
          batch."status" NOT IN ('APPROVED', 'REJECTED')
          AND EXISTS (
            SELECT 1
            FROM "BuildRunActivation" activation
            WHERE activation."reviewBatchId" = batch.id
          )
        )
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REVIEW_BATCH_ACTIVATION_STATE_INVALID';
  END IF;
END;
$$;

CREATE FUNCTION "sylis_assert_build_run_pipeline"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_build_run_id uuid;
  new_build_run_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'BuildRun' THEN
    IF TG_OP <> 'INSERT' THEN
      old_build_run_id := OLD."id";
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_build_run_id := NEW."id";
    END IF;
  ELSIF TG_TABLE_NAME IN ('BuildRunActivation', 'BudgetApproval', 'ReviewBatch') THEN
    IF TG_OP <> 'INSERT' THEN
      old_build_run_id := OLD."buildRunId";
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_build_run_id := NEW."buildRunId";
    END IF;
  END IF;

  IF old_build_run_id IS NOT NULL THEN
    PERFORM "sylis_assert_build_run_pipeline_by_id"(old_build_run_id);
  END IF;
  IF new_build_run_id IS NOT NULL
    AND new_build_run_id IS DISTINCT FROM old_build_run_id THEN
    PERFORM "sylis_assert_build_run_pipeline_by_id"(new_build_run_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "BuildRun_pipeline_guard"
AFTER INSERT OR UPDATE OR DELETE ON "BuildRun"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_build_run_pipeline"();

CREATE CONSTRAINT TRIGGER "BuildRunActivation_pipeline_guard"
AFTER INSERT OR UPDATE OR DELETE ON "BuildRunActivation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_build_run_pipeline"();

CREATE CONSTRAINT TRIGGER "BudgetApproval_pipeline_guard"
AFTER INSERT OR UPDATE OR DELETE ON "BudgetApproval"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_build_run_pipeline"();

CREATE CONSTRAINT TRIGGER "ReviewBatch_build_run_pipeline_guard"
AFTER INSERT OR UPDATE OR DELETE ON "ReviewBatch"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_build_run_pipeline"();

CREATE FUNCTION "sylis_assert_publish_run_pipeline_by_id"(checked_publish_run_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  checked_run "PublishRun"%ROWTYPE;
BEGIN
  SELECT * INTO checked_run
  FROM "PublishRun"
  WHERE "id" = checked_publish_run_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM "sylis_assert_pipeline_job_by_id"(checked_run."jobId");

  IF EXISTS (
    SELECT 1
    FROM "Job" job
    WHERE job.id = checked_run."jobId"
      AND (
        (checked_run."mode" = 'PUBLISH' AND job."kind" <> 'LEXICON_PUBLISH')
        OR (checked_run."mode" = 'VALIDATE' AND job."kind" <> 'LEXICON_VALIDATE')
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PUBLISH_RUN_JOB_KIND_INVALID';
  END IF;

  IF checked_run."mode" = 'PUBLISH'
    AND NOT EXISTS (
      SELECT 1
      FROM "BuildRun" build_run
      WHERE build_run."status" = 'ARTIFACT_PUBLISHED'
        AND build_run."artifactUri" = checked_run."artifactUri"
        AND build_run."artifactHash" = checked_run."artifactHash"
        AND build_run."schemaVersion" = checked_run."expectedSchema"
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PUBLISH_RUN_ARTIFACT_NOT_PUBLISHED';
  END IF;

  IF checked_run."mode" = 'VALIDATE'
    AND NOT EXISTS (
      SELECT 1
      FROM "LexiconRelease" release
      WHERE release.id = checked_run."releaseId"
        AND release."compressedArtifactHash" = checked_run."artifactHash"
        AND checked_run."artifactUri" = 'release://' || release.id::text
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'VALIDATION_RUN_ARTIFACT_INVALID';
  END IF;

  IF checked_run."status" = 'SUCCEEDED'
    AND NOT EXISTS (
      SELECT 1
      FROM "LexiconRelease" release
      WHERE release.id = checked_run."releaseId"
        AND release."compressedArtifactHash" = checked_run."artifactHash"
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PUBLISH_RUN_RELEASE_ARTIFACT_MISMATCH';
  END IF;
END;
$$;

CREATE FUNCTION "sylis_assert_publish_run_pipeline"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM "sylis_assert_publish_run_pipeline_by_id"(OLD."id");
  END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW."id" IS DISTINCT FROM OLD."id") THEN
    PERFORM "sylis_assert_publish_run_pipeline_by_id"(NEW."id");
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PublishRun_pipeline_guard"
AFTER INSERT OR UPDATE OR DELETE ON "PublishRun"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_publish_run_pipeline"();

CREATE FUNCTION "sylis_assert_pipeline_job"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM "sylis_assert_pipeline_job_by_id"(OLD."id");
    IF OLD."ownerType" = 'BUILD_RUN' OR OLD."kind" = 'LEXICON_BUILD' THEN
      PERFORM "sylis_assert_build_run_pipeline_by_id"(activation."buildRunId")
      FROM "BuildRunActivation" activation
      WHERE activation."jobId" = OLD."id";
    END IF;
    IF OLD."ownerType" = 'PUBLISH_RUN'
      OR OLD."kind" IN ('LEXICON_PUBLISH', 'LEXICON_VALIDATE') THEN
      PERFORM "sylis_assert_publish_run_pipeline_by_id"(run.id)
      FROM "PublishRun" run
      WHERE run."jobId" = OLD."id";
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM "sylis_assert_pipeline_job_by_id"(NEW."id");
    IF NEW."ownerType" = 'BUILD_RUN' OR NEW."kind" = 'LEXICON_BUILD' THEN
      PERFORM "sylis_assert_build_run_pipeline_by_id"(activation."buildRunId")
      FROM "BuildRunActivation" activation
      WHERE activation."jobId" = NEW."id";
    END IF;
    IF NEW."ownerType" = 'PUBLISH_RUN'
      OR NEW."kind" IN ('LEXICON_PUBLISH', 'LEXICON_VALIDATE') THEN
      PERFORM "sylis_assert_publish_run_pipeline_by_id"(run.id)
      FROM "PublishRun" run
      WHERE run."jobId" = NEW."id";
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "Job_pipeline_guard"
AFTER INSERT OR UPDATE OR DELETE ON "Job"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_pipeline_job"();

CREATE FUNCTION "sylis_lexicon_release_has_active_source_restriction"(
  checked_release_id uuid,
  checked_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "LexiconReleaseSourceInput" source_input
    JOIN "SourceDatasetVersion" dataset_version
      ON dataset_version.id = source_input."sourceDatasetVersionId"
    JOIN "SourceRestriction" restriction
      ON restriction."rightsPolicyId" = dataset_version."rightsPolicyId"
      AND (
        restriction."datasetVersionId" IS NULL
        OR restriction."datasetVersionId" = dataset_version.id
      )
    WHERE source_input."releaseId" = checked_release_id
      AND restriction."effectiveAt" <= checked_at
  )
$$;

CREATE FUNCTION "sylis_guard_source_restriction_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."datasetVersionId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "SourceDatasetVersion" dataset_version
      WHERE dataset_version.id = NEW."datasetVersionId"
        AND dataset_version."rightsPolicyId" = NEW."rightsPolicyId"
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'SOURCE_RESTRICTION_POLICY_VERSION_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "SourceRestriction_policy_version_guard"
BEFORE INSERT ON "SourceRestriction"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_source_restriction_insert"();

CREATE FUNCTION "sylis_assert_lexicon_release_activation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_activation "LexiconReleaseActivation"%ROWTYPE;
  checked_activation_id uuid;
  checked_approval "ApprovalRequest"%ROWTYPE;
  checked_release "LexiconRelease"%ROWTYPE;
  active_release_id uuid;
  from_release_lexicon_id uuid;
  approval_count bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    checked_activation_id := OLD."id";
  ELSE
    checked_activation_id := NEW."id";
  END IF;

  SELECT * INTO checked_activation
  FROM "LexiconReleaseActivation"
  WHERE "id" = checked_activation_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO checked_approval
  FROM "ApprovalRequest"
  WHERE "id" = checked_activation."approvalId";

  SELECT * INTO checked_release
  FROM "LexiconRelease"
  WHERE "id" = checked_activation."toReleaseId";

  SELECT "activeReleaseId" INTO active_release_id
  FROM "Lexicon"
  WHERE "id" = checked_activation."lexiconId";

  IF checked_approval.id IS NULL
    OR checked_approval."actionType" <> 'ACTIVATE_LEXICON_RELEASE'
    OR checked_approval."targetRevision" <> checked_activation."toReleaseId"::text
    OR checked_approval."status" <> 'EXECUTED'
    OR checked_activation."createdAt" > checked_approval."expiresAt"
    OR checked_release.id IS NULL
    OR checked_release."lexiconId" <> checked_activation."lexiconId"
    OR checked_release."status" <> 'VALIDATED'
    OR active_release_id IS DISTINCT FROM checked_activation."toReleaseId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEXICON_RELEASE_ACTIVATION_APPROVAL_INVALID';
  END IF;

  IF checked_activation."fromReleaseId" IS NOT NULL THEN
    SELECT "lexiconId" INTO from_release_lexicon_id
    FROM "LexiconRelease"
    WHERE "id" = checked_activation."fromReleaseId";
    IF from_release_lexicon_id IS DISTINCT FROM checked_activation."lexiconId" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEXICON_RELEASE_ACTIVATION_FROM_RELEASE_INVALID';
    END IF;
  END IF;

  SELECT count(*) INTO approval_count
  FROM "ApprovalDecision" decision
  WHERE decision."requestId" = checked_approval.id
    AND decision."decision" = 'APPROVE'
    AND decision."actionDigest" = checked_approval."actionDigest";

  IF approval_count < checked_approval."requiredQuorum" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEXICON_RELEASE_ACTIVATION_QUORUM_INVALID';
  END IF;
  IF "sylis_lexicon_release_has_active_source_restriction"(
    checked_release.id,
    checked_activation."createdAt"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LEXICON_RELEASE_ACTIVATION_SOURCE_RESTRICTED';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LexiconReleaseActivation_approval_guard"
AFTER INSERT OR UPDATE OR DELETE ON "LexiconReleaseActivation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_lexicon_release_activation"();

ALTER TABLE "DiagnosticBundleRevision"
ADD CONSTRAINT "DiagnosticBundleRevision_confirmation_shape_check"
CHECK (
  (
    "status" = 'DRAFT'
    AND "confirmedFromRevisionId" IS NULL
    AND "confirmedAt" IS NULL
  )
  OR (
    "status" = 'CONFIRMED'
    AND "confirmedFromRevisionId" IS NOT NULL
    AND "confirmedAt" IS NOT NULL
    AND "confirmedAt" >= "createdAt"
  )
);

CREATE FUNCTION "sylis_due_content_delete"(table_name text, row_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  owner_id uuid;
  session_id uuid;
BEGIN
  CASE table_name
    WHEN 'SupportGrant' THEN
      owner_id := (row_data ->> 'userId')::uuid;
    WHEN 'SupportGrantReadingDocumentRevisionTarget',
         'SupportGrantContentAssetRevisionTarget',
         'SupportGrantCollectedLexicalItemRevisionTarget',
         'SupportGrantExerciseAttemptTextTarget',
         'SupportGrantDiagnosticBundleRevisionTarget' THEN
      SELECT support_grant."userId" INTO owner_id
      FROM "SupportGrant" support_grant
      WHERE support_grant.id = (row_data ->> 'grantId')::uuid;
    WHEN 'ReadingActivity', 'ReadingTarget', 'ReviewEvent' THEN
      owner_id := (row_data ->> 'userId')::uuid;
    WHEN 'ReadingDocumentRevision' THEN
      SELECT document."ownerUserId" INTO owner_id
      FROM "ReadingDocument" document
      WHERE document.id = (row_data ->> 'documentId')::uuid;
    WHEN 'CollectedLexicalItemRevision' THEN
      SELECT notebook."userId" INTO owner_id
      FROM "CollectedLexicalItem" item
      JOIN "Notebook" notebook ON notebook.id = item."notebookId"
      WHERE item.id = (row_data ->> 'collectedItemId')::uuid;
    WHEN 'CollectedRevisionHeadwordTarget',
         'CollectedRevisionEntryTarget',
         'CollectedRevisionSenseTarget',
         'CollectedRevisionCollocationTarget' THEN
      SELECT notebook."userId" INTO owner_id
      FROM "CollectedLexicalItemRevision" revision
      JOIN "CollectedLexicalItem" item ON item.id = revision."collectedItemId"
      JOIN "Notebook" notebook ON notebook.id = item."notebookId"
      WHERE revision.id = (row_data ->> 'revisionId')::uuid;
    WHEN 'DiagnosticBundleRevision' THEN
      SELECT bundle."ownerUserId" INTO owner_id
      FROM "DiagnosticBundle" bundle
      WHERE bundle.id = (row_data ->> 'bundleId')::uuid;
    WHEN 'AgentArtifactRevision' THEN
      SELECT artifact."ownerUserId" INTO owner_id
      FROM "AgentArtifact" artifact
      WHERE artifact.id = (row_data ->> 'artifactId')::uuid;
    WHEN 'AgentMessage' THEN
      SELECT session."userId", session.id INTO owner_id, session_id
      FROM "AgentSession" session
      WHERE session.id = (row_data ->> 'sessionId')::uuid;
    WHEN 'AgentPlanRevision' THEN
      SELECT session."userId", session.id INTO owner_id, session_id
      FROM "AgentPlan" plan
      JOIN "AgentRun" run ON run.id = plan."runId"
      JOIN "AgentSession" session ON session.id = run."sessionId"
      WHERE plan.id = (row_data ->> 'planId')::uuid;
    WHEN 'AgentProposal' THEN
      SELECT session."userId", session.id INTO owner_id, session_id
      FROM "AgentRun" run
      JOIN "AgentSession" session ON session.id = run."sessionId"
      WHERE run.id = (row_data ->> 'runId')::uuid;
    ELSE
      RETURN false;
  END CASE;

  RETURN owner_id IS NOT NULL
    AND (
      "sylis_due_user_content_delete"(owner_id)
      OR (
        session_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM "AgentSession" session
          JOIN "ContentDeletionSessionTarget" target
            ON target."sessionId" = session.id
          JOIN "ContentDeletionRequest" request
            ON request.id = target."requestId"
           AND request."targetKind" = 'SESSION'::"ContentDeletionTargetKind"
           AND request."requestedByUserId" = session."userId"
          WHERE session.id = session_id
            AND session."userId" = owner_id
            AND session.status = 'DELETED'::"AgentSessionStatus"
            AND request.status = 'RUNNING'::"ContentDeletionStatus"
            AND request."purgeAfter" <= CURRENT_TIMESTAMP
        )
      )
    );
END;
$$;

CREATE FUNCTION "sylis_purge_user_support_grants"(owner_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  purged_grant_count integer;
BEGIN
  IF NOT public."sylis_due_user_content_delete"(owner_user_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'SUPPORT_GRANT_PURGE_NOT_DUE';
  END IF;

  DELETE FROM public."SupportGrantReadingDocumentRevisionTarget" target
  USING public."SupportGrant" support_grant
  WHERE target."grantId" = support_grant.id
    AND support_grant."userId" = owner_user_id;

  DELETE FROM public."SupportGrantContentAssetRevisionTarget" target
  USING public."SupportGrant" support_grant
  WHERE target."grantId" = support_grant.id
    AND support_grant."userId" = owner_user_id;

  DELETE FROM public."SupportGrantCollectedLexicalItemRevisionTarget" target
  USING public."SupportGrant" support_grant
  WHERE target."grantId" = support_grant.id
    AND support_grant."userId" = owner_user_id;

  DELETE FROM public."SupportGrantExerciseAttemptTextTarget" target
  USING public."SupportGrant" support_grant
  WHERE target."grantId" = support_grant.id
    AND support_grant."userId" = owner_user_id;

  DELETE FROM public."SupportGrantDiagnosticBundleRevisionTarget" target
  USING public."SupportGrant" support_grant
  WHERE target."grantId" = support_grant.id
    AND support_grant."userId" = owner_user_id;

  DELETE FROM public."SupportGrant"
  WHERE "userId" = owner_user_id;
  GET DIAGNOSTICS purged_grant_count = ROW_COUNT;
  RETURN purged_grant_count;
END;
$$;

REVOKE ALL ON FUNCTION "sylis_purge_user_support_grants"(uuid) FROM PUBLIC;

CREATE FUNCTION "sylis_reject_append_only_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
     AND "sylis_due_content_delete"(TG_TABLE_NAME, to_jsonb(OLD)) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('%I is append-only', TG_TABLE_NAME);
END;
$$;

CREATE FUNCTION "sylis_guard_outbox_event_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTBOX_EVENT_DELETE_FORBIDDEN';
  END IF;

  IF ROW(
    NEW.id,
    NEW."aggregateType",
    NEW."aggregateId",
    NEW."eventType",
    NEW."eventVersion",
    NEW.payload,
    NEW."occurredAt"
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD."aggregateType",
    OLD."aggregateId",
    OLD."eventType",
    OLD."eventVersion",
    OLD.payload,
    OLD."occurredAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTBOX_EVENT_BINDING_IMMUTABLE';
  END IF;

  IF OLD."publishedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTBOX_EVENT_PUBLISHED_IMMUTABLE';
  END IF;

  IF NEW."publishAttempts" < OLD."publishAttempts"
     OR NEW."publishAttempts" > OLD."publishAttempts" + 1
     OR (NEW."publishedAt" IS NOT NULL AND NEW."publishAttempts" = 0)
     OR (NEW."publishedAt" IS NOT NULL AND NEW."publishedAt" < NEW."occurredAt") THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTBOX_EVENT_DELIVERY_TRANSITION_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "OutboxEvent_update_guard"
BEFORE UPDATE OR DELETE ON "OutboxEvent"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_outbox_event_update"();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'AgentMessage',
    'AgentEvent',
    'AgentEvaluationEvidence',
    'AgentReleaseEvent',
    'DeploymentRelease',
    'ConsentRecord',
    'ReadingActivity',
    'ReadingTarget',
    'ReviewEvent',
    'ReviewStateSnapshot',
    'AttemptPresentedChoice',
    'AttemptSelectedChoice',
    'AttemptTextResponse',
    'AttemptSelfReport',
    'RightsDecision',
    'RightsDecisionEvidence',
    'CandidateRevision',
    'CandidateRevisionEvidence',
    'Provenance',
    'ContentEvidence',
    'TextProcessingProfile',
    'VocabularyBundle',
    'VocabularyNamespaceVersion',
    'VocabularyTerm',
    'SourceRightsPolicy',
    'SourceDatasetVersion',
    'SourceRecord',
    'SourceRestriction',
    'CorpusDatasetVersion',
    'ProficiencyFrameworkVersion',
    'ProficiencyLevel',
    'ContentProfileVersion',
    'FSRSParameterSet',
    'ReadingDocumentRevision',
    'CollectedLexicalItemRevision',
    'CollectedRevisionHeadwordTarget',
    'CollectedRevisionEntryTarget',
    'CollectedRevisionSenseTarget',
    'CollectedRevisionCollocationTarget',
    'DiagnosticBundleRevision',
    'AgentPlanRevision',
    'AgentArtifactRevision',
    'ReviewDecision',
    'ApprovalDecision',
    'BuildRunActivation',
    'BudgetApproval',
    'LexiconReleaseActivation',
    'ProviderRouteSecurityEvent',
    'CredentialSecurityEvent',
    'ModelUsageLedger',
    'SupportGrantReadingDocumentRevisionTarget',
    'SupportGrantContentAssetRevisionTarget',
    'SupportGrantCollectedLexicalItemRevisionTarget',
    'SupportGrantExerciseAttemptTextTarget',
    'SupportGrantDiagnosticBundleRevisionTarget',
    'ModelExecutionPermitAgentRunTarget',
    'ModelExecutionPermitBuildRunTarget',
    'ModelExecutionPermitEvaluationRunTarget',
    'ModelExecutionPermitAssetRevisionTarget',
    'ContentDeletionAssetTarget',
    'ContentDeletionModelExchangeTarget',
    'ContentDeletionSessionTarget',
    'ContentDeletionUserTarget',
    'LexiconReleaseBuildMetadata',
    'LexiconReleaseLearningLanguage',
    'LexiconReleaseSourceInput',
    'LexiconReleaseBookEdition',
    'VocabularyBookEdition',
    'VocabularyBookItem',
    'VocabularyBookItemHeadwordTarget',
    'VocabularyBookItemEntryTarget',
    'ProficiencyHeadwordClaim',
    'ProficiencyEntryClaim',
    'ProficiencySenseClaim',
    'HeadwordRevision',
    'LexicalEntryRevision',
    'LexicalForm',
    'FormRepresentation',
    'FormFeature',
    'LexicalSenseRevision',
    'SenseDefinition',
    'SenseTranslationText',
    'SenseUsage',
    'LexicalConceptRevision',
    'SenseConceptMembership',
    'ConceptDefinition',
    'EntryRelation',
    'SenseRelation',
    'ConceptRelation',
    'TranslationRelation',
    'EntryLineage',
    'SenseLineage',
    'ConceptLineage',
    'EntryExternalIdentifier',
    'SenseExternalIdentifier',
    'ConceptExternalIdentifier',
    'EtymologyLink',
    'EtymologyLinkSourceEntry',
    'EtymologyLinkSourceEtymon',
    'EtymologyLinkTargetEntry',
    'EtymologyLinkTargetEtymon',
    'EntryFrequencyObservation',
    'FormFrequencyObservation',
    'SenseFrequencyObservation',
    'CollocationObservation',
    'EntryAttestation',
    'FormAttestation',
    'SenseAttestation',
    'ExampleSentence',
    'ExampleTranslation',
    'SenseExample',
    'ExampleCitation',
    'Collocation',
    'SenseCollocation',
    'CollocationComponent',
    'SyntacticFrame',
    'SyntacticArgument',
    'SemanticPredicate',
    'SemanticArgument',
    'SenseFrame',
    'ArgumentMapping',
    'EtymonRevision',
    'EtymologyHypothesis',
    'MorphologicalAnalysis',
    'MorphologicalSegment',
    'InflectionGeneration',
    'WordFormation',
    'WordFormationInput',
    'WordFormationApplication',
    'MediaAsset',
    'FormMedia',
    'LearningObjectiveRevision',
    'LearningObjectiveSenseSubject',
    'LearningObjectiveFormSubject',
    'LearningObjectiveCollocationSubject',
    'LearningObjectiveFrameSubject',
    'LearningObjectiveExampleSubject',
    'LearningObjectiveHint',
    'PedagogicalMaterialRevision',
    'PedagogicalMaterialEntryTarget',
    'PedagogicalMaterialSenseTarget',
    'PedagogicalMaterialFormTarget',
    'PedagogicalMaterialMorphemeTarget',
    'PedagogicalMaterialWordFormationTarget',
    'PedagogicalMaterialCollocationTarget',
    'PedagogicalMaterialLearningObjectiveTarget',
    'PedagogicalMaterialBlock',
    'PedagogicalMaterialTextBlock',
    'PedagogicalMaterialExampleBlock',
    'PedagogicalMaterialMediaBlock',
    'PedagogicalMaterialMention',
    'PedagogicalMaterialMentionHeadwordTarget',
    'PedagogicalMaterialMentionEntryTarget',
    'PedagogicalMaterialMentionFormTarget',
    'PedagogicalMaterialMentionSenseTarget',
    'PedagogicalMaterialMentionConceptTarget',
    'PedagogicalMaterialMentionSenseExampleTarget',
    'PedagogicalMaterialMentionCollocationTarget',
    'PedagogicalMaterialMentionFrameTarget',
    'PedagogicalMaterialMentionMorphemeTarget',
    'PedagogicalMaterialCitation',
    'AssessmentStimulusRevision',
    'AssessmentStimulusBlock',
    'AssessmentStimulusTextBlock',
    'AssessmentStimulusExampleBlock',
    'AssessmentStimulusMediaBlock',
    'AssessmentStimulusMaterialBlock',
    'ExerciseRevision',
    'ExerciseStimulusRef',
    'ExerciseResponseConfig',
    'ExerciseChoiceResponseConfig',
    'ExerciseShortTextResponseConfig',
    'ExerciseExtendedTextResponseConfig',
    'ExerciseNoCaptureResponseConfig',
    'ExerciseChoice',
    'ExerciseChoiceHeadwordTarget',
    'ExerciseChoiceEntryTarget',
    'ExerciseChoiceFormTarget',
    'ExerciseChoiceSenseTarget',
    'ExerciseChoiceConceptTarget',
    'ExerciseChoiceSenseExampleTarget',
    'ExerciseChoiceCollocationTarget',
    'ExerciseChoiceFrameTarget',
    'ExerciseChoiceMorphemeTarget',
    'ExerciseCorrectChoice',
    'ExerciseAcceptedText',
    'ExerciseFeedback',
    'ExerciseRubricCriterion',
    'AssessmentBlueprintRevision',
    'AssessmentSection',
    'AssessmentSelectionRule',
    'AssessmentQuotaSelectionRule',
    'AssessmentScopeSelectionRule',
    'AssessmentBookEditionScopeRule',
    'AssessmentProficiencyLevelScopeRule',
    'AssessmentPinnedItemSelectionRule',
    'ContentProfileEvaluation',
    'ContentProfileEvaluationHeadwordTarget',
    'ContentProfileEvaluationEntryTarget',
    'ContentProfileEvaluationFormTarget',
    'ContentProfileEvaluationSenseTarget',
    'ContentProfileEvaluationConceptTarget',
    'ContentProfileEvaluationLearningObjectiveTarget',
    'ContentProfileEvaluationPedagogicalMaterialTarget',
    'ContentProfileEvaluationExerciseTarget',
    'ContentProfileEvaluationBookEditionTarget',
    'ContentRequirementEvaluation',
    'ReleaseQualityStatistic',
    'JobProgressEvent',
    'JobCheckpoint'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I '
      || 'FOR EACH ROW EXECUTE FUNCTION "sylis_reject_append_only_mutation"()',
      table_name || '_append_only',
      table_name
    );
  END LOOP;
END;
$$;

CREATE FUNCTION "sylis_valid_deployment_image_digests"(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
BEGIN
  IF jsonb_typeof(value) <> 'object' THEN
    RETURN false;
  END IF;

  RETURN ARRAY(
    SELECT image.service
    FROM jsonb_each_text(value) AS image(service, digest)
    ORDER BY image.service
  ) = ARRAY[
    'admin',
    'admin-api',
    'agent-api',
    'agent-evaluator',
    'agent-executor',
    'api',
    'asset-processor',
    'automation-executor',
    'lexicon-builder',
    'lexicon-publisher',
    'model-gateway',
    'web'
  ]::text[]
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each_text(value) AS image(service, digest)
    WHERE image.digest !~ (
      '^ghcr\.io/[a-z0-9._-]+/sylis-' || image.service
      || '@sha256:[a-f0-9]{64}$'
    )
  );
END;
$$;

CREATE FUNCTION "sylis_valid_deployment_staging_evidence"(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
BEGIN
  IF jsonb_typeof(value) <> 'object' THEN
    RETURN false;
  END IF;

  RETURN ARRAY(
    SELECT evidence.key
    FROM jsonb_each(value) AS evidence(key, nested_value)
    ORDER BY evidence.key
  ) = ARRAY[
    'ciRunId',
    'commit',
    'manifestHash',
    'manifestSchemaVersion',
    'productionSmoke',
    'releaseWorkflowRunId',
    'schemaVersion'
  ]::text[]
  AND jsonb_typeof(value -> 'schemaVersion') = 'string'
  AND jsonb_typeof(value -> 'manifestSchemaVersion') = 'string'
  AND jsonb_typeof(value -> 'ciRunId') = 'string'
  AND jsonb_typeof(value -> 'releaseWorkflowRunId') = 'string'
  AND jsonb_typeof(value -> 'commit') = 'string'
  AND jsonb_typeof(value -> 'manifestHash') = 'string'
  AND jsonb_typeof(value -> 'productionSmoke') = 'string'
  AND value ->> 'schemaVersion' = 'sylis.deployment-evidence/1'
  AND value ->> 'manifestSchemaVersion' = 'sylis.deployment-manifest/1'
  AND value ->> 'ciRunId' ~ '^[1-9][0-9]*$'
  AND value ->> 'releaseWorkflowRunId' ~ '^[1-9][0-9]*$'
  AND value ->> 'commit' ~ '^[a-f0-9]{40}$'
  AND value ->> 'manifestHash' ~ '^sha256:[a-f0-9]{64}$'
  AND value ->> 'productionSmoke' = 'SUCCEEDED';
END;
$$;

ALTER TABLE "DeploymentRelease"
ADD CONSTRAINT "DeploymentRelease_shape_check"
CHECK (
  "version" ~ '^0\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$'
  AND "gitSha" ~ '^[a-f0-9]{40}$'
  AND "releaseDigest" ~ '^sha256:[a-f0-9]{64}$'
  AND "createdByServiceKey" = 'github-actions'
  AND "productionEnvironment" = 'PRODUCTION'
  AND "approvalRef" = "workflowUrl"
  AND "workflowUrl" ~ '^https://github\.com/[^/]+/[^/]+/actions/runs/[1-9][0-9]*$'
  AND "deploymentUrl" ~ '^https://[^[:space:]]+$'
  AND "deployedAt" >= "createdAt" - interval '1 minute'
  AND "deployedAt" <= "createdAt" + interval '1 minute'
  AND "sylis_valid_deployment_image_digests"("imageDigests")
  AND "sylis_valid_deployment_staging_evidence"("stagingEvidence")
  AND "stagingEvidence" ->> 'commit' = "gitSha"
  AND "workflowUrl" LIKE (
    '%/actions/runs/' || ("stagingEvidence" ->> 'releaseWorkflowRunId')
  )
);

CREATE UNIQUE INDEX "SecurityAuditEvent_deployment_release_ingest_key"
ON "SecurityAuditEvent" ("deploymentId")
WHERE "category" = 'DEPLOYMENT'
  AND "action" = 'deployment.release.ingested';

CREATE FUNCTION "sylis_assert_deployment_release_audit"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (
    SELECT count(*)
    FROM public."SecurityAuditEvent" event
    WHERE event."category" = 'DEPLOYMENT'
      AND event."action" = 'deployment.release.ingested'
      AND event."targetType" = 'DeploymentRelease'
      AND event."targetId" = NEW.id
      AND event."deploymentId" = NEW.id::text
      AND event."actionDigest" = NEW."releaseDigest"
      AND event."result" = 'SUCCEEDED'
      AND event."metadata" = jsonb_build_object(
        'version', NEW."version",
        'gitSha', NEW."gitSha",
        'serviceKey', NEW."createdByServiceKey"
      )
  ) <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DEPLOYMENT_RELEASE_AUDIT_CLOSURE_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "sylis_assert_deployment_release_audit"() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER "DeploymentRelease_audit_closure_guard"
AFTER INSERT ON "DeploymentRelease"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_deployment_release_audit"();

ALTER TABLE "AuditRetentionPolicy"
ADD CONSTRAINT "AuditRetentionPolicy_duration_check"
CHECK (
  "onlineDays" >= 1
  AND "archiveDays" >= 1
  AND "onlineDays" <= 3650
  AND "archiveDays" <= 3650
  AND length(btrim("policyVersion")) BETWEEN 1 AND 120
  AND "actionDigest" ~ '^sha256:[0-9a-f]{64}$'
);

ALTER TABLE "AuditArchive"
ADD CONSTRAINT "AuditArchive_shape_check"
CHECK (
  "rangeEnd" > "rangeStart"
  AND "eventCount" >= 0
  AND (
    (status = 'PENDING' AND "objectRef" IS NULL AND "contentHash" IS NULL
      AND "encryptionVersion" IS NULL AND "purgedAt" IS NULL)
    OR
    (status = 'ACTIVE' AND "objectRef" IS NOT NULL
      AND "contentHash" IS NOT NULL AND "encryptionVersion" IS NOT NULL
      AND length(btrim("objectRef")) BETWEEN 1 AND 2000
      AND "contentHash" ~ '^sha256:[0-9a-f]{64}$'
      AND length(btrim("encryptionVersion")) BETWEEN 1 AND 120
      AND "purgedAt" IS NULL)
    OR
    (status = 'PURGED' AND "objectRef" IS NOT NULL
      AND "contentHash" IS NOT NULL AND "encryptionVersion" IS NOT NULL
      AND length(btrim("objectRef")) BETWEEN 1 AND 2000
      AND "contentHash" ~ '^sha256:[0-9a-f]{64}$'
      AND length(btrim("encryptionVersion")) BETWEEN 1 AND 120
      AND "purgedAt" IS NOT NULL AND "purgedAt" >= "createdAt")
  )
);

ALTER TABLE "AuditArchiveSecurityEvent"
ADD CONSTRAINT "AuditArchiveSecurityEvent_position_check"
CHECK (position >= 0);

ALTER TABLE "AuditArchiveDataAccessEvent"
ADD CONSTRAINT "AuditArchiveDataAccessEvent_position_check"
CHECK (position >= 0);

ALTER TABLE "LegalHold"
ADD CONSTRAINT "LegalHold_shape_check"
CHECK (
  length(btrim(reason)) BETWEEN 1 AND 1000
  AND "reviewAt" > "createdAt"
  AND (
    ("scopeKind" = 'GLOBAL' AND "scopeRef" IS NULL)
    OR (
      "scopeKind" = 'AUDIT_CATEGORY'
      AND "scopeRef" IN (
        'IDENTITY', 'AUTHORIZATION', 'SOURCE', 'RIGHTS', 'REVIEW', 'LEXICON',
        'AGENT', 'MODEL', 'ASSET', 'JOB', 'USER_SUPPORT', 'SECURITY',
        'DEPLOYMENT', 'RETENTION'
      )
    )
    OR (
      "scopeKind" = 'AUDIT_ARCHIVE'
      AND "scopeRef" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  )
  AND (
    ("releasedAt" IS NULL AND "releasedByUserId" IS NULL
      AND "releaseReason" IS NULL AND "releaseActionDigest" IS NULL)
    OR
    ("releasedAt" IS NOT NULL AND "releasedByUserId" IS NOT NULL
      AND "releaseReason" IS NOT NULL AND "releaseActionDigest" IS NOT NULL
      AND "releasedAt" >= "createdAt")
  )
);

ALTER TABLE "AuditExport"
ADD CONSTRAINT "AuditExport_artifact_shape_check"
CHECK (
  COALESCE(jsonb_typeof("querySnapshot" -> 'retentionPolicies') = 'object', false)
  AND COALESCE("querySnapshot" -> 'retentionPolicies' <> '{}'::jsonb, false)
  AND (
    ("artifactRef" IS NULL AND "eventCount" IS NULL
      AND "contentHash" IS NULL AND "expiresAt" IS NULL)
    OR
    ("artifactRef" IS NOT NULL AND "eventCount" IS NOT NULL
      AND "eventCount" >= 0 AND "contentHash" IS NOT NULL
      AND "expiresAt" IS NOT NULL AND "expiresAt" > "createdAt")
  )
);

CREATE FUNCTION "sylis_reject_audit_retention_policy_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'AUDIT_RETENTION_POLICY_IMMUTABLE';
END;
$$;

CREATE TRIGGER "AuditRetentionPolicy_immutable"
BEFORE UPDATE OR DELETE ON "AuditRetentionPolicy"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_audit_retention_policy_mutation"();

CREATE FUNCTION "sylis_guard_legal_hold_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'LEGAL_HOLD_DELETE_FORBIDDEN';
  END IF;
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF ROW(
       NEW.id, NEW."scopeKind", NEW."scopeRef", NEW.reason,
       NEW."externalReference", NEW."createdByUserId", NEW."createdAt",
       NEW."reviewAt", NEW."actionDigest"
     ) IS DISTINCT FROM ROW(
       OLD.id, OLD."scopeKind", OLD."scopeRef", OLD.reason,
       OLD."externalReference", OLD."createdByUserId", OLD."createdAt",
       OLD."reviewAt", OLD."actionDigest"
     )
     OR OLD."releasedAt" IS NOT NULL
     OR NEW."releasedAt" IS NULL
     OR NEW."releasedByUserId" IS NULL
     OR NEW."releaseReason" IS NULL
     OR NEW."releaseActionDigest" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'LEGAL_HOLD_TRANSITION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LegalHold_transition_guard"
BEFORE UPDATE OR DELETE ON "LegalHold"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_legal_hold_transition"();

CREATE FUNCTION "sylis_guard_legal_hold_scope"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  archive_status "AuditArchiveStatus";
BEGIN
  IF NEW."scopeKind" = 'GLOBAL' THEN
    PERFORM id
    FROM "AuditArchive"
    WHERE status = 'ACTIVE'
    ORDER BY id
    FOR SHARE;
  ELSIF NEW."scopeKind" = 'AUDIT_CATEGORY' THEN
    PERFORM id
    FROM "AuditArchive"
    WHERE status = 'ACTIVE'
      AND category::text = NEW."scopeRef"
    ORDER BY id
    FOR SHARE;
  ELSE
    SELECT status INTO archive_status
    FROM "AuditArchive"
    WHERE id = NEW."scopeRef"::uuid
    FOR SHARE;
    IF archive_status IS NULL OR archive_status = 'PURGED' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'LEGAL_HOLD_ARCHIVE_UNAVAILABLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LegalHold_scope_guard"
BEFORE INSERT ON "LegalHold"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_legal_hold_scope"();

CREATE FUNCTION "sylis_active_legal_hold_blocks_archive"(
  archive_id uuid,
  archive_category "SecurityAuditCategory"
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "LegalHold" hold
    WHERE hold."releasedAt" IS NULL
      AND (
        hold."scopeKind" = 'GLOBAL'
        OR (
          hold."scopeKind" = 'AUDIT_CATEGORY'
          AND hold."scopeRef" = archive_category::text
        )
        OR (
          hold."scopeKind" = 'AUDIT_ARCHIVE'
          AND hold."scopeRef" = archive_id::text
        )
      )
  );
$$;

CREATE FUNCTION "sylis_guard_audit_archive_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  online_days integer;
  archive_days integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUDIT_ARCHIVE_DELETE_FORBIDDEN';
  END IF;
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF ROW(
       NEW.id, NEW.category, NEW."rangeStart", NEW."rangeEnd",
       NEW."policyVersion", NEW."eventCount", NEW."archiveJobId",
       NEW."createdAt"
     ) IS DISTINCT FROM ROW(
       OLD.id, OLD.category, OLD."rangeStart", OLD."rangeEnd",
       OLD."policyVersion", OLD."eventCount", OLD."archiveJobId",
       OLD."createdAt"
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUDIT_ARCHIVE_TRANSITION_INVALID';
  END IF;

  IF OLD.status = 'PENDING'
     AND NEW.status = 'ACTIVE'
     AND OLD."objectRef" IS NULL
     AND OLD."contentHash" IS NULL
     AND OLD."encryptionVersion" IS NULL
     AND OLD."purgedAt" IS NULL
     AND NEW."objectRef" IS NOT NULL
     AND NEW."contentHash" IS NOT NULL
     AND NEW."encryptionVersion" IS NOT NULL
     AND NEW."purgedAt" IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'ACTIVE'
     OR NEW.status <> 'PURGED'
     OR NEW."objectRef" IS DISTINCT FROM OLD."objectRef"
     OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash"
     OR NEW."encryptionVersion" IS DISTINCT FROM OLD."encryptionVersion"
     OR OLD."purgedAt" IS NOT NULL
     OR NEW."purgedAt" IS NULL
     OR NEW."purgedAt" > CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUDIT_ARCHIVE_TRANSITION_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Job" purge_job
    WHERE purge_job.kind = 'AUDIT_ARCHIVE_PURGE'
      AND purge_job."ownerType" = 'AUDIT_ARCHIVE'
      AND purge_job."ownerId" = OLD.id
      AND purge_job.status = 'RUNNING'
      AND purge_job."inputRef" ->> 'requestId' = OLD.id::text
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'AUDIT_ARCHIVE_PURGE_JOB_REQUIRED';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM "AuditArchiveSecurityEvent" membership
       JOIN "SecurityAuditEvent" event ON event.id = membership."eventId"
       WHERE membership."archiveId" = OLD.id
     )
     OR EXISTS (
       SELECT 1
       FROM "AuditArchiveDataAccessEvent" membership
       JOIN "DataAccessAuditEvent" event ON event.id = membership."eventId"
       WHERE membership."archiveId" = OLD.id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'AUDIT_ARCHIVE_ONLINE_EVENTS_REMAIN';
  END IF;

  SELECT policy."onlineDays", policy."archiveDays"
  INTO online_days, archive_days
  FROM "AuditRetentionPolicy" policy
  WHERE policy.category = OLD.category
    AND policy."policyVersion" = OLD."policyVersion";
  IF online_days IS NULL OR archive_days IS NULL
     OR NEW."purgedAt" < OLD."rangeEnd"
       + make_interval(days => online_days + archive_days)
     OR "sylis_active_legal_hold_blocks_archive"(OLD.id, OLD.category) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUDIT_ARCHIVE_PURGE_FORBIDDEN';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuditArchive_transition_guard"
BEFORE UPDATE OR DELETE ON "AuditArchive"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_audit_archive_transition"();

CREATE FUNCTION "sylis_assert_audit_archive_closure"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  checked_archive_id uuid;
  checked_archive "AuditArchive"%ROWTYPE;
  checked_job "Job"%ROWTYPE;
  security_count bigint;
  data_access_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'AuditArchive' THEN
    checked_archive_id := COALESCE(
      (to_jsonb(NEW) ->> 'id')::uuid,
      (to_jsonb(OLD) ->> 'id')::uuid
    );
  ELSE
    checked_archive_id := COALESCE(
      (to_jsonb(NEW) ->> 'archiveId')::uuid,
      (to_jsonb(OLD) ->> 'archiveId')::uuid
    );
  END IF;

  SELECT * INTO checked_archive
  FROM "AuditArchive"
  WHERE id = checked_archive_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "AuditRetentionPolicy" policy
    WHERE policy.category = checked_archive.category
      AND policy."policyVersion" = checked_archive."policyVersion"
      AND policy."effectiveAt" <= checked_archive."rangeStart"
      AND NOT EXISTS (
        SELECT 1
        FROM "AuditRetentionPolicy" newer
        WHERE newer.category = policy.category
          AND newer."effectiveAt" <= checked_archive."rangeStart"
          AND newer."effectiveAt" > policy."effectiveAt"
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "AuditRetentionPolicy" boundary
        WHERE boundary.category = policy.category
          AND boundary."effectiveAt" > checked_archive."rangeStart"
          AND boundary."effectiveAt" < checked_archive."rangeEnd"
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AUDIT_ARCHIVE_POLICY_VERSION_INVALID';
  END IF;

  SELECT * INTO checked_job
  FROM "Job"
  WHERE id = checked_archive."archiveJobId";
  IF NOT FOUND
     OR checked_job.kind <> 'AUDIT_ARCHIVE'
     OR checked_job."ownerType" <> 'AUDIT_ARCHIVE'
     OR checked_job."ownerId" <> checked_archive.id
     OR checked_job."inputRef" ->> 'requestId' <> checked_archive.id::text
     OR checked_job."inputRef" ->> 'category' <> checked_archive.category::text
     OR checked_job."inputRef" ->> 'policyVersion' <> checked_archive."policyVersion"
     OR (checked_job."inputRef" ->> 'rangeStart')::timestamptz
       IS DISTINCT FROM checked_archive."rangeStart"
     OR (checked_job."inputRef" ->> 'rangeEnd')::timestamptz
       IS DISTINCT FROM checked_archive."rangeEnd"
     OR (
       checked_archive.status IN ('PENDING', 'ACTIVE')
       AND checked_job.status <> 'RUNNING'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AUDIT_ARCHIVE_JOB_BINDING_INVALID';
  END IF;

  SELECT count(*) INTO security_count
  FROM "AuditArchiveSecurityEvent" membership
  JOIN "SecurityAuditEvent" event ON event.id = membership."eventId"
  WHERE membership."archiveId" = checked_archive.id
    AND event.category = checked_archive.category
    AND event."occurredAt" >= checked_archive."rangeStart"
    AND event."occurredAt" < checked_archive."rangeEnd";

  IF security_count <> (
       SELECT count(*) FROM "AuditArchiveSecurityEvent"
       WHERE "archiveId" = checked_archive.id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AUDIT_ARCHIVE_SECURITY_MEMBERSHIP_INVALID';
  END IF;

  SELECT count(*) INTO data_access_count
  FROM "AuditArchiveDataAccessEvent" membership
  JOIN "DataAccessAuditEvent" event ON event.id = membership."eventId"
  WHERE membership."archiveId" = checked_archive.id
    AND checked_archive.category = 'USER_SUPPORT'
    AND event."occurredAt" >= checked_archive."rangeStart"
    AND event."occurredAt" < checked_archive."rangeEnd";

  IF data_access_count <> (
       SELECT count(*) FROM "AuditArchiveDataAccessEvent"
       WHERE "archiveId" = checked_archive.id
     )
     OR security_count + data_access_count <> checked_archive."eventCount"
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT count(*) AS item_count, min(position) AS first_position,
                max(position) AS last_position
         FROM "AuditArchiveSecurityEvent"
         WHERE "archiveId" = checked_archive.id
         UNION ALL
         SELECT count(*), min(position), max(position)
         FROM "AuditArchiveDataAccessEvent"
         WHERE "archiveId" = checked_archive.id
       ) positions
       WHERE positions.item_count > 0
         AND (positions.first_position <> 0
           OR positions.last_position <> positions.item_count - 1)
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AUDIT_ARCHIVE_MEMBERSHIP_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AuditArchive_closure_guard"
AFTER INSERT OR UPDATE ON "AuditArchive"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_audit_archive_closure"();

CREATE CONSTRAINT TRIGGER "AuditArchiveSecurityEvent_closure_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AuditArchiveSecurityEvent"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_audit_archive_closure"();

CREATE CONSTRAINT TRIGGER "AuditArchiveDataAccessEvent_closure_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AuditArchiveDataAccessEvent"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_audit_archive_closure"();

CREATE TRIGGER "AuditArchiveSecurityEvent_append_only"
BEFORE UPDATE OR DELETE ON "AuditArchiveSecurityEvent"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_append_only_mutation"();

CREATE TRIGGER "AuditArchiveDataAccessEvent_append_only"
BEFORE UPDATE OR DELETE ON "AuditArchiveDataAccessEvent"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_append_only_mutation"();

CREATE FUNCTION "sylis_guard_audit_export_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUDIT_EXPORT_DELETE_FORBIDDEN';
  END IF;
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF ROW(
       NEW.id, NEW."querySnapshot", NEW."requestedByUserId", NEW.reason,
       NEW."jobId", NEW."createdAt"
     ) IS DISTINCT FROM ROW(
       OLD.id, OLD."querySnapshot", OLD."requestedByUserId", OLD.reason,
       OLD."jobId", OLD."createdAt"
     )
     OR OLD."artifactRef" IS NOT NULL
     OR NEW."artifactRef" IS NULL
     OR NEW."eventCount" IS NULL
     OR NEW."contentHash" IS NULL
     OR NEW."expiresAt" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUDIT_EXPORT_TRANSITION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuditExport_transition_guard"
BEFORE UPDATE OR DELETE ON "AuditExport"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_audit_export_transition"();

CREATE FUNCTION "sylis_assert_audit_export_policy_snapshot"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot_at timestamptz;
  snapshot_category "SecurityAuditCategory";
BEGIN
  BEGIN
    snapshot_at := (NEW."querySnapshot" ->> 'snapshotAt')::timestamptz;
    IF NEW."querySnapshot" ? 'category' THEN
      snapshot_category := (
        NEW."querySnapshot" ->> 'category'
      )::"SecurityAuditCategory";
    END IF;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AUDIT_EXPORT_POLICY_SNAPSHOT_INVALID';
  END;

  IF snapshot_at IS NULL
     OR snapshot_at > NEW."createdAt" + interval '1 second'
     OR NOT COALESCE(
       jsonb_typeof(NEW."querySnapshot" -> 'streams') = 'array',
       false
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AUDIT_EXPORT_POLICY_SNAPSHOT_INVALID';
  END IF;

  IF jsonb_array_length(NEW."querySnapshot" -> 'streams') = 0
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements_text(NEW."querySnapshot" -> 'streams') stream
       WHERE stream NOT IN ('SECURITY', 'DATA_ACCESS')
     )
     OR (
       SELECT count(*)
       FROM jsonb_array_elements_text(NEW."querySnapshot" -> 'streams')
     ) <> (
       SELECT count(DISTINCT stream)
       FROM jsonb_array_elements_text(
         NEW."querySnapshot" -> 'streams'
       ) stream
     )
     OR EXISTS (
       WITH expected(category) AS (
         SELECT snapshot_category
         WHERE snapshot_category IS NOT NULL
           AND NEW."querySnapshot" -> 'streams' ? 'SECURITY'
         UNION
         SELECT category
         FROM unnest(enum_range(NULL::"SecurityAuditCategory"))
           AS categories(category)
         WHERE snapshot_category IS NULL
           AND NEW."querySnapshot" -> 'streams' ? 'SECURITY'
         UNION
         SELECT 'USER_SUPPORT'::"SecurityAuditCategory"
         WHERE NEW."querySnapshot" -> 'streams' ? 'DATA_ACCESS'
       ), actual AS (
         SELECT key::"SecurityAuditCategory" AS category, value AS policy_version
         FROM jsonb_each_text(
           NEW."querySnapshot" -> 'retentionPolicies'
         )
       )
       SELECT 1
       FROM expected
       FULL JOIN actual USING (category)
       WHERE expected.category IS NULL
          OR actual.category IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM "AuditRetentionPolicy" policy
            WHERE policy.category = actual.category
              AND policy."policyVersion" = actual.policy_version
              AND policy."effectiveAt" <= snapshot_at
              AND NOT EXISTS (
                SELECT 1
                FROM "AuditRetentionPolicy" newer
                WHERE newer.category = policy.category
                  AND newer."effectiveAt" <= snapshot_at
                  AND newer."effectiveAt" > policy."effectiveAt"
              )
          )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AUDIT_EXPORT_POLICY_SNAPSHOT_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuditExport_policy_snapshot_guard"
BEFORE INSERT ON "AuditExport"
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_audit_export_policy_snapshot"();

CREATE FUNCTION "sylis_guard_audit_event_retention"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_category "SecurityAuditCategory";
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS NOT DISTINCT FROM OLD THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUDIT_EVENT_IMMUTABLE';
  END IF;

  event_category := COALESCE(
    (to_jsonb(OLD) ->> 'category')::"SecurityAuditCategory",
    'USER_SUPPORT'::"SecurityAuditCategory"
  );
  IF (
    TG_TABLE_NAME = 'SecurityAuditEvent'
    AND NOT EXISTS (
      SELECT 1
      FROM "AuditArchiveSecurityEvent" membership
      JOIN "AuditArchive" archive ON archive.id = membership."archiveId"
      JOIN "AuditRetentionPolicy" policy
        ON policy.category = archive.category
       AND policy."policyVersion" = archive."policyVersion"
      WHERE membership."eventId" = OLD.id
        AND archive.category = event_category
        AND archive.status = 'ACTIVE'
        AND CURRENT_TIMESTAMP >= OLD."occurredAt"
          + make_interval(days => policy."onlineDays")
        AND NOT "sylis_active_legal_hold_blocks_archive"(
          archive.id,
          archive.category
        )
    )
  ) OR (
    TG_TABLE_NAME = 'DataAccessAuditEvent'
    AND NOT EXISTS (
      SELECT 1
      FROM "AuditArchiveDataAccessEvent" membership
      JOIN "AuditArchive" archive ON archive.id = membership."archiveId"
      JOIN "AuditRetentionPolicy" policy
        ON policy.category = archive.category
       AND policy."policyVersion" = archive."policyVersion"
      WHERE membership."eventId" = OLD.id
        AND archive.category = 'USER_SUPPORT'
        AND archive.status = 'ACTIVE'
        AND CURRENT_TIMESTAMP >= OLD."occurredAt"
          + make_interval(days => policy."onlineDays")
        AND NOT "sylis_active_legal_hold_blocks_archive"(
          archive.id,
          archive.category
        )
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AUDIT_EVENT_RETENTION_DELETE_FORBIDDEN';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "SecurityAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "SecurityAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_audit_event_retention"();

CREATE TRIGGER "DataAccessAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "DataAccessAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_audit_event_retention"();

CREATE FUNCTION "sylis_guard_agent_release_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = format('%I release cannot be deleted', TG_TABLE_NAME);
  END IF;

  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = format('%I release content is immutable', TG_TABLE_NAME);
  END IF;

  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF (OLD."status" = 'DRAFT' AND NEW."status" = 'CANDIDATE')
    OR (OLD."status" = 'CANDIDATE' AND NEW."status" = 'PUBLISHED')
    OR (OLD."status" <> 'REVOKED' AND NEW."status" = 'REVOKED') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AGENT_RELEASE_TRANSITION_INVALID';
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'CapabilityRelease',
    'ToolRelease',
    'SkillRelease',
    'EvalRelease'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I '
      || 'FOR EACH ROW EXECUTE FUNCTION "sylis_guard_agent_release_transition"()',
      table_name || '_immutable_release_guard',
      table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE "ProviderRouteRelease"
ADD CONSTRAINT "ProviderRouteRelease_revocation_shape_check"
CHECK (
  ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
  OR ("status" <> 'REVOKED' AND "revokedAt" IS NULL)
);

CREATE FUNCTION "sylis_guard_provider_route_release_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PROVIDER_ROUTE_RELEASE_DELETE_FORBIDDEN';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['status', 'revokedAt'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'revokedAt']) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PROVIDER_ROUTE_RELEASE_CONTENT_IMMUTABLE';
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF (OLD."status" = 'DRAFT' AND NEW."status" = 'CANDIDATE' AND NEW."revokedAt" IS NULL)
    OR (OLD."status" = 'CANDIDATE' AND NEW."status" = 'PUBLISHED' AND NEW."revokedAt" IS NULL)
    OR (OLD."status" = 'PUBLISHED' AND NEW."status" = 'REVOKED' AND NEW."revokedAt" IS NOT NULL)
    OR (OLD."status" = 'REVOKED' AND NEW."status" = 'PUBLISHED' AND NEW."revokedAt" IS NULL) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PROVIDER_ROUTE_RELEASE_TRANSITION_INVALID';
END;
$$;

CREATE TRIGGER "ProviderRouteRelease_immutable_release_guard"
BEFORE UPDATE OR DELETE ON "ProviderRouteRelease"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_provider_route_release_transition"();

CREATE FUNCTION "sylis_guard_model_usage_ledger_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_permit "ModelExecutionPermit"%ROWTYPE;
  checked_credential_owner "CredentialOwnerKind";
  checked_credential_user_id uuid;
  checked_owner_id uuid;
  checked_max_units bigint;
BEGIN
  SELECT * INTO checked_permit
  FROM "ModelExecutionPermit"
  WHERE id = NEW."permitId";

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'MODEL_USAGE_PERMIT_NOT_FOUND';
  END IF;

  SELECT profile."ownerKind", profile."ownerUserId"
  INTO checked_credential_owner, checked_credential_user_id
  FROM "CredentialRevision" revision
  JOIN "CredentialProfile" profile ON profile.id = revision."profileId"
  WHERE revision.id = checked_permit."credentialRevisionId";

  CASE checked_permit."ownerType"
    WHEN 'AGENT_RUN' THEN
      SELECT "agentRunId" INTO checked_owner_id
      FROM "ModelExecutionPermitAgentRunTarget"
      WHERE "permitId" = checked_permit.id;
    WHEN 'BUILD_RUN' THEN
      SELECT "buildRunId" INTO checked_owner_id
      FROM "ModelExecutionPermitBuildRunTarget"
      WHERE "permitId" = checked_permit.id;
    WHEN 'EVALUATION_RUN' THEN
      SELECT "evaluationRunId" INTO checked_owner_id
      FROM "ModelExecutionPermitEvaluationRunTarget"
      WHERE "permitId" = checked_permit.id;
    WHEN 'ASSET_REVISION' THEN
      SELECT "assetRevisionId" INTO checked_owner_id
      FROM "ModelExecutionPermitAssetRevisionTarget"
      WHERE "permitId" = checked_permit.id;
  END CASE;

  IF NEW."entryType" = 'SETTLEMENT'
    AND checked_credential_owner = 'USER'
    AND NEW."credentialOwnerKind" = 'PLATFORM' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_BYOK_PLATFORM_SETTLEMENT_INVALID';
  END IF;

  IF checked_credential_owner IS NULL
    OR checked_owner_id IS NULL
    OR NEW."purpose" IS DISTINCT FROM checked_permit."purpose"
    OR NEW."ownerType" IS DISTINCT FROM checked_permit."ownerType"
    OR NEW."ownerId" IS DISTINCT FROM checked_owner_id
    OR NEW."userId" IS DISTINCT FROM checked_permit."ownerUserId"
    OR NEW."routeReleaseId" IS DISTINCT FROM checked_permit."routeReleaseId"
    OR NEW."credentialOwnerKind" IS DISTINCT FROM checked_credential_owner
    OR NEW."idempotencyKey" IS DISTINCT FROM checked_permit."requestKey"
    OR NEW."currency" <> 'USD'
    OR (
      checked_credential_owner = 'USER'
      AND (
        checked_credential_user_id IS NULL
        OR checked_credential_user_id IS DISTINCT FROM checked_permit."ownerUserId"
      )
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_BINDING_INVALID';
  END IF;

  checked_max_units := checked_permit."maxInputTokens"::bigint
    + checked_permit."maxOutputTokens"::bigint;

  CASE NEW."entryType"
    WHEN 'RESERVATION' THEN
      IF checked_permit."status" <> 'ISSUED'
        OR NEW."units" <> checked_max_units
        OR NEW."costMicros" <> checked_permit."maxCostMicros" THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_RESERVATION_INVALID';
      END IF;
    WHEN 'SETTLEMENT' THEN
      IF checked_permit."status" <> 'CONSUMED'
        OR NEW."units" < 0
        OR NEW."units" > checked_max_units
        OR NEW."costMicros" < 0
        OR NEW."costMicros" > checked_permit."maxCostMicros" THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_SETTLEMENT_INVALID';
      END IF;
    WHEN 'RELEASE' THEN
      IF checked_permit."status" NOT IN ('CONSUMED', 'EXPIRED', 'REVOKED')
        OR NEW."units" <> -checked_max_units
        OR NEW."costMicros" <> -checked_permit."maxCostMicros" THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_RELEASE_INVALID';
      END IF;
    WHEN 'CORRECTION' THEN
      IF checked_permit."status" <> 'CONSUMED'
        OR (NEW."units" = 0 AND NEW."costMicros" = 0) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_CORRECTION_INVALID';
      END IF;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ModelUsageLedger_insert_guard"
BEFORE INSERT ON "ModelUsageLedger"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_model_usage_ledger_insert"();

CREATE FUNCTION "sylis_assert_model_usage_ledger_closure"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_permit_id uuid;
  checked_status "ModelPermitStatus";
  checked_max_units bigint;
  checked_max_cost bigint;
  reservation_count integer;
  settlement_count integer;
  release_count integer;
  correction_count integer;
  settled_units bigint;
  settled_cost bigint;
  corrected_units bigint;
  corrected_cost bigint;
BEGIN
  IF TG_TABLE_NAME = 'ModelUsageLedger' THEN
    checked_permit_id := NEW."permitId";
  ELSE
    checked_permit_id := NEW.id;
  END IF;

  SELECT
    permit."status",
    permit."maxInputTokens"::bigint + permit."maxOutputTokens"::bigint,
    permit."maxCostMicros"
  INTO checked_status, checked_max_units, checked_max_cost
  FROM "ModelExecutionPermit" permit
  WHERE permit.id = checked_permit_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*) FILTER (WHERE "entryType" = 'RESERVATION'),
    count(*) FILTER (WHERE "entryType" = 'SETTLEMENT'),
    count(*) FILTER (WHERE "entryType" = 'RELEASE'),
    count(*) FILTER (WHERE "entryType" = 'CORRECTION'),
    COALESCE(sum("units") FILTER (WHERE "entryType" = 'SETTLEMENT'), 0),
    COALESCE(sum("costMicros") FILTER (WHERE "entryType" = 'SETTLEMENT'), 0),
    COALESCE(sum("units") FILTER (WHERE "entryType" = 'CORRECTION'), 0),
    COALESCE(sum("costMicros") FILTER (WHERE "entryType" = 'CORRECTION'), 0)
  INTO
    reservation_count,
    settlement_count,
    release_count,
    correction_count,
    settled_units,
    settled_cost,
    corrected_units,
    corrected_cost
  FROM "ModelUsageLedger"
  WHERE "permitId" = checked_permit_id;

  IF reservation_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_RESERVATION_CARDINALITY_INVALID';
  END IF;

  IF checked_status IN ('ISSUED', 'CLAIMED') THEN
    IF settlement_count <> 0 OR release_count <> 0 OR correction_count <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_ACTIVE_LEDGER_INVALID';
    END IF;
    RETURN NULL;
  END IF;

  IF checked_status = 'CONSUMED' THEN
    IF settlement_count <> 1 OR release_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_TERMINAL_INCOMPLETE';
    END IF;
    IF correction_count > 1
      OR settled_units + corrected_units < 0
      OR settled_units + corrected_units > checked_max_units
      OR settled_cost + corrected_cost < 0
      OR settled_cost + corrected_cost > checked_max_cost THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_CORRECTION_TOTAL_INVALID';
    END IF;
    RETURN NULL;
  END IF;

  IF checked_status IN ('EXPIRED', 'REVOKED')
    AND (settlement_count <> 0 OR release_count <> 1 OR correction_count <> 0) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MODEL_USAGE_UNUSED_TERMINAL_INVALID';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ModelExecutionPermit_usage_closure_guard"
AFTER INSERT OR UPDATE OF "status" ON "ModelExecutionPermit"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_model_usage_ledger_closure"();

CREATE CONSTRAINT TRIGGER "ModelUsageLedger_closure_guard"
AFTER INSERT ON "ModelUsageLedger"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_model_usage_ledger_closure"();

CREATE FUNCTION "sylis_operator_satisfies_role_expression"(
  checked_user_id uuid,
  checked_expression text,
  checked_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  checked_roles text[];
BEGIN
  IF checked_expression !~ '^(SUPPORT|CONTENT_REVIEWER|LEXICON_OPERATOR|RELEASE_MANAGER|MODEL_OPERATOR|AGENT_RELEASE_MANAGER|SECURITY_ADMIN)(&(SUPPORT|CONTENT_REVIEWER|LEXICON_OPERATOR|RELEASE_MANAGER|MODEL_OPERATOR|AGENT_RELEASE_MANAGER|SECURITY_ADMIN))*$' THEN
    RETURN false;
  END IF;
  checked_roles := string_to_array(checked_expression, '&');
  IF cardinality(checked_roles) <> (
    SELECT count(DISTINCT role_name)
    FROM unnest(checked_roles) role_name
  ) THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1
    FROM unnest(checked_roles) required_role
    WHERE NOT EXISTS (
      SELECT 1
      FROM "OperatorRoleAssignment" assignment
      WHERE assignment."userId" = checked_user_id
        AND assignment.role = required_role::"OperatorRole"
        AND assignment."grantedAt" <= checked_at
        AND assignment."revokedAt" IS NULL
        AND (assignment."expiresAt" IS NULL OR assignment."expiresAt" > checked_at)
    )
  );
END;
$$;

CREATE FUNCTION "sylis_guard_approval_policy_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'APPROVAL_POLICY_IMMUTABLE';
  END IF;
  IF NEW."requiredQuorum" < 1
    OR NEW."requiredRoleExpression" !~ '^(SUPPORT|CONTENT_REVIEWER|LEXICON_OPERATOR|RELEASE_MANAGER|MODEL_OPERATOR|AGENT_RELEASE_MANAGER|SECURITY_ADMIN)(&(SUPPORT|CONTENT_REVIEWER|LEXICON_OPERATOR|RELEASE_MANAGER|MODEL_OPERATOR|AGENT_RELEASE_MANAGER|SECURITY_ADMIN))*$'
    OR (NEW."actionType" = 'ACTIVATE_LEXICON_RELEASE' AND NEW."requiredQuorum" <> 1) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVAL_POLICY_SHAPE_INVALID';
  END IF;
  IF cardinality(string_to_array(NEW."requiredRoleExpression", '&')) <> (
    SELECT count(DISTINCT role_name)
    FROM unnest(string_to_array(NEW."requiredRoleExpression", '&')) role_name
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVAL_POLICY_ROLE_EXPRESSION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ApprovalPolicy_write_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalPolicy"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_approval_policy_write"();

CREATE FUNCTION "sylis_guard_approval_request_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_policy "ApprovalPolicy"%ROWTYPE;
  approve_count integer;
  reject_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'APPROVAL_REQUEST_DELETE_FORBIDDEN';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO checked_policy FROM "ApprovalPolicy" WHERE id = NEW."policyId";
    IF NOT FOUND
      OR NEW."actionType" IS DISTINCT FROM checked_policy."actionType"
      OR NEW."policyVersion" IS DISTINCT FROM checked_policy."policyVersion"
      OR NEW."requiredRoleExpression" IS DISTINCT FROM checked_policy."requiredRoleExpression"
      OR NEW."requiredQuorum" IS DISTINCT FROM checked_policy."requiredQuorum"
      OR NEW."status" <> 'PENDING'
      OR NEW."expiresAt" <= NEW."createdAt"
      OR NEW."actionDigest" !~ '^sha256:[0-9a-f]{64}$' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVAL_REQUEST_POLICY_SNAPSHOT_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(
    NEW."policyId", NEW."actionType", NEW."actionDigest", NEW."targetRevision",
    NEW."policyVersion", NEW."requiredRoleExpression", NEW."requiredQuorum",
    NEW."requesterId", NEW."expiresAt", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."policyId", OLD."actionType", OLD."actionDigest", OLD."targetRevision",
    OLD."policyVersion", OLD."requiredRoleExpression", OLD."requiredQuorum",
    OLD."requesterId", OLD."expiresAt", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'APPROVAL_REQUEST_BINDING_IMMUTABLE';
  END IF;
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  SELECT
    count(*) FILTER (WHERE decision = 'APPROVE'),
    count(*) FILTER (WHERE decision = 'REJECT')
  INTO approve_count, reject_count
  FROM "ApprovalDecision"
  WHERE "requestId" = OLD.id;

  IF OLD."status" = 'PENDING'
    AND NEW."status" = 'APPROVED'
    AND OLD."expiresAt" > now()
    AND reject_count = 0
    AND approve_count >= OLD."requiredQuorum" THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'PENDING'
    AND NEW."status" = 'REJECTED'
    AND reject_count > 0 THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'PENDING'
    AND NEW."status" = 'EXPIRED'
    AND OLD."expiresAt" <= now() THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'APPROVED'
    AND NEW."status" = 'EXECUTED'
    AND OLD."expiresAt" > now()
    AND EXISTS (
      SELECT 1 FROM "LexiconReleaseActivation" activation
      WHERE activation."approvalId" = OLD.id
    ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'APPROVAL_REQUEST_TRANSITION_INVALID';
END;
$$;

CREATE TRIGGER "ApprovalRequest_write_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalRequest"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_approval_request_write"();

CREATE FUNCTION "sylis_guard_approval_decision_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_request "ApprovalRequest"%ROWTYPE;
BEGIN
  SELECT * INTO checked_request
  FROM "ApprovalRequest"
  WHERE id = NEW."requestId"
  FOR UPDATE;
  IF NOT FOUND
    OR checked_request.status <> 'PENDING'
    OR checked_request."expiresAt" <= NEW."decidedAt"
    OR NEW."actionDigest" IS DISTINCT FROM checked_request."actionDigest"
    OR NEW."reauthenticatedAt" > NEW."decidedAt"
    OR NEW."reauthenticatedAt" < NEW."decidedAt" - interval '15 minutes'
    OR NOT "sylis_operator_satisfies_role_expression"(
      NEW."actorUserId",
      checked_request."requiredRoleExpression",
      NEW."decidedAt"
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVAL_DECISION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ApprovalDecision_insert_guard"
BEFORE INSERT ON "ApprovalDecision"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_approval_decision_insert"();

CREATE UNIQUE INDEX "AgentRun_one_active_root_per_session_key"
ON "AgentRun" ("sessionId")
WHERE "parentRunId" IS NULL AND status IN ('RUNNING', 'WAITING');

CREATE FUNCTION "sylis_guard_agent_run_hierarchy_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."sessionId", NEW."parentRunId", NEW."rootRunId")
    IS DISTINCT FROM ROW(OLD."sessionId", OLD."parentRunId", OLD."rootRunId") THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AGENT_RUN_HIERARCHY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgentRun_hierarchy_binding_guard"
BEFORE UPDATE OF "sessionId", "parentRunId", "rootRunId" ON "AgentRun"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_agent_run_hierarchy_binding"();

CREATE FUNCTION "sylis_assert_agent_run_hierarchy"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_run "AgentRun"%ROWTYPE;
  checked_parent "AgentRun"%ROWTYPE;
  child_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO checked_run FROM "AgentRun" WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF checked_run."parentRunId" IS NULL THEN
    IF checked_run."rootRunId" IS DISTINCT FROM checked_run.id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_ROOT_RUN_IDENTITY_INVALID';
    END IF;
  ELSE
    SELECT * INTO checked_parent
    FROM "AgentRun"
    WHERE id = checked_run."parentRunId";
    IF NOT FOUND
      OR checked_parent."sessionId" IS DISTINCT FROM checked_run."sessionId"
      OR checked_parent."parentRunId" IS NOT NULL
      OR checked_parent."rootRunId" IS DISTINCT FROM checked_parent.id
      OR checked_run."rootRunId" IS DISTINCT FROM checked_parent.id
      OR checked_run.id = checked_parent.id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_CHILD_RUN_PARENT_INVALID';
    END IF;
  END IF;

  SELECT count(*) INTO child_count
  FROM "AgentRun"
  WHERE "parentRunId" = checked_run."rootRunId";
  IF child_count > 3 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_CHILD_RUN_LIMIT_EXCEEDED';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AgentRun_hierarchy_guard"
AFTER INSERT OR UPDATE OF "sessionId", "parentRunId", "rootRunId" ON "AgentRun"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_run_hierarchy"();

CREATE UNIQUE INDEX "AgentWaitCondition_one_active_per_run_key"
ON "AgentWaitCondition" ("runId")
WHERE status = 'ACTIVE';

CREATE FUNCTION "sylis_guard_agent_run_wait_resume"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'WAITING' AND NEW.status = 'QUEUED' THEN
    IF EXISTS (
      SELECT 1
      FROM "AgentWaitCondition" wait_condition
      WHERE wait_condition."runId" = NEW.id
        AND wait_condition.status = 'ACTIVE'
    ) OR NOT EXISTS (
      SELECT 1
      FROM "Job" resumed_job
      JOIN "Job" terminal_job ON terminal_job.id = resumed_job."supersedesJobId"
      WHERE resumed_job."ownerType" = 'AGENT_RUN'
        AND resumed_job."ownerId" = NEW.id
        AND resumed_job.kind IN ('AGENT_RUN_ACTIVATION', 'AGENT_TOOL_CONTINUATION')
        AND resumed_job.status = 'QUEUED'
        AND terminal_job."ownerType" = resumed_job."ownerType"
        AND terminal_job."ownerId" = resumed_job."ownerId"
        AND terminal_job.kind IN ('AGENT_RUN_ACTIVATION', 'AGENT_TOOL_CONTINUATION')
        AND terminal_job.status IN ('SUCCEEDED', 'FAILED', 'CANCELLED')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AGENT_WAIT_RESUME_JOB_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgentRun_wait_resume_guard"
BEFORE UPDATE OF status ON "AgentRun"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_agent_run_wait_resume"();

CREATE FUNCTION "sylis_assert_agent_run_wait_state"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_run_id uuid;
  checked_status "AgentRunStatus";
  active_wait_count integer;
  active_job_count integer;
BEGIN
  IF TG_TABLE_NAME = 'AgentRun' THEN
    checked_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME = 'AgentWaitCondition' THEN
    checked_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."runId" ELSE NEW."runId" END;
  ELSE
    IF (CASE WHEN TG_OP = 'DELETE' THEN OLD."ownerType" ELSE NEW."ownerType" END) <> 'AGENT_RUN'
      OR (CASE WHEN TG_OP = 'DELETE' THEN OLD.kind ELSE NEW.kind END)
        NOT IN ('AGENT_RUN_ACTIVATION', 'AGENT_TOOL_CONTINUATION') THEN
      RETURN NULL;
    END IF;
    checked_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."ownerId" ELSE NEW."ownerId" END;
  END IF;

  SELECT status INTO checked_status FROM "AgentRun" WHERE id = checked_run_id;
  IF NOT FOUND OR checked_status <> 'WAITING' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO active_wait_count
  FROM "AgentWaitCondition"
  WHERE "runId" = checked_run_id AND status = 'ACTIVE';

  SELECT count(*) INTO active_job_count
  FROM "Job"
  WHERE "ownerType" = 'AGENT_RUN'
    AND "ownerId" = checked_run_id
    AND kind IN ('AGENT_RUN_ACTIVATION', 'AGENT_TOOL_CONTINUATION')
    AND status IN ('QUEUED', 'RUNNING', 'RETRY_SCHEDULED');

  IF active_wait_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_WAITING_ACTIVE_CONDITION_INVALID';
  END IF;
  IF active_job_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_WAITING_ACTIVATION_JOB_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AgentRun_wait_state_guard"
AFTER INSERT OR UPDATE OF status ON "AgentRun"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_run_wait_state"();

CREATE CONSTRAINT TRIGGER "AgentWaitCondition_run_state_guard"
AFTER INSERT OR UPDATE OF status OR DELETE ON "AgentWaitCondition"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_run_wait_state"();

CREATE CONSTRAINT TRIGGER "AgentActivationJob_run_state_guard"
AFTER INSERT OR UPDATE OF status OR DELETE ON "Job"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_run_wait_state"();

CREATE FUNCTION "sylis_guard_agent_proposal_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."contentPurgedAt" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AGENT_PROPOSAL_PREPURGED_INSERT_FORBIDDEN';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."contentPurgedAt" IS NULL
    AND NEW."contentPurgedAt" IS NOT NULL
    AND NEW."contentPurgedAt" >= OLD."createdAt"
    AND NEW."contentPurgedAt" <= statement_timestamp()
    AND NEW."targetRef" = '{}'::jsonb
    AND NEW."committedResultRef" IS NULL
    AND (
      to_jsonb(NEW) - 'targetRef' - 'committedResultRef' - 'contentPurgedAt'
    ) = (
      to_jsonb(OLD) - 'targetRef' - 'committedResultRef' - 'contentPurgedAt'
    )
    AND "sylis_due_content_delete"('AgentProposal', to_jsonb(OLD)) THEN
    RETURN NEW;
  END IF;

  IF ROW(
    NEW."runId",
    NEW."commandType",
    NEW."commandVersion",
    NEW."targetRef",
    NEW."payloadContentBodyId",
    NEW."actionDigest",
    NEW."riskClass",
    NEW."expiresAt"
  ) IS DISTINCT FROM ROW(
    OLD."runId",
    OLD."commandType",
    OLD."commandVersion",
    OLD."targetRef",
    OLD."payloadContentBodyId",
    OLD."actionDigest",
    OLD."riskClass",
    OLD."expiresAt"
  )
  OR (OLD."grantId" IS NOT NULL AND NEW."grantId" IS DISTINCT FROM OLD."grantId")
  OR (
    OLD.decision IS NOT NULL
    AND ROW(NEW.decision, NEW."decidedByUserId", NEW."decidedAt")
      IS DISTINCT FROM ROW(OLD.decision, OLD."decidedByUserId", OLD."decidedAt")
  )
  OR (
    OLD."committedResultRef" IS NOT NULL
    AND NEW."committedResultRef" IS DISTINCT FROM OLD."committedResultRef"
  )
  OR (
    OLD."committedAt" IS NOT NULL
    AND NEW."committedAt" IS DISTINCT FROM OLD."committedAt"
  )
  OR NEW."contentPurgedAt" IS DISTINCT FROM OLD."contentPurgedAt"
  OR OLD."contentPurgedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AGENT_PROPOSAL_BINDING_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgentProposal_binding_guard"
BEFORE INSERT OR UPDATE ON "AgentProposal"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_agent_proposal_binding"();

ALTER TABLE "AgentProposal"
ADD CONSTRAINT "AgentProposal_state_shape_check"
CHECK (
  (
    "contentPurgedAt" IS NULL
    OR ("targetRef" = '{}'::jsonb AND "committedResultRef" IS NULL)
  )
  AND (
  (
    status = 'PENDING'
    AND decision IS NULL
    AND "decidedByUserId" IS NULL
    AND "decidedAt" IS NULL
    AND "grantId" IS NULL
    AND "commitAttemptId" IS NULL
    AND "commitLeaseExpiresAt" IS NULL
    AND "committedResultRef" IS NULL
    AND "committedAt" IS NULL
  )
  OR (
    status = 'COMMITTING'
    AND decision = 'APPROVE'
    AND "decidedByUserId" IS NOT NULL
    AND "decidedAt" IS NOT NULL
    AND "grantId" IS NOT NULL
    AND "commitAttemptId" IS NOT NULL
    AND "commitLeaseExpiresAt" > "decidedAt"
    AND "committedResultRef" IS NULL
    AND "committedAt" IS NULL
  )
  OR (
    status = 'REJECTED'
    AND decision = 'REJECT'
    AND "decidedByUserId" IS NOT NULL
    AND "decidedAt" IS NOT NULL
    AND "grantId" IS NULL
    AND "commitAttemptId" IS NULL
    AND "commitLeaseExpiresAt" IS NULL
    AND "committedResultRef" IS NULL
    AND "committedAt" IS NULL
  )
  OR (
    status = 'EXPIRED'
    AND decision IS NULL
    AND "decidedByUserId" IS NULL
    AND "decidedAt" IS NULL
    AND "grantId" IS NULL
    AND "commitAttemptId" IS NULL
    AND "commitLeaseExpiresAt" IS NULL
    AND "committedResultRef" IS NULL
    AND "committedAt" IS NULL
  )
  OR (
    status = 'COMMITTED'
    AND decision = 'APPROVE'
    AND "decidedByUserId" IS NOT NULL
    AND "decidedAt" IS NOT NULL
    AND "grantId" IS NOT NULL
    AND "commitAttemptId" IS NOT NULL
    AND "commitLeaseExpiresAt" IS NOT NULL
    AND (
      ("contentPurgedAt" IS NULL AND "committedResultRef" IS NOT NULL)
      OR ("contentPurgedAt" IS NOT NULL AND "committedResultRef" IS NULL)
    )
    AND "committedAt" IS NOT NULL
  )
  OR (
    status = 'FAILED'
    AND decision = 'APPROVE'
    AND "decidedByUserId" IS NOT NULL
    AND "decidedAt" IS NOT NULL
    AND "grantId" IS NOT NULL
    AND "commitAttemptId" IS NOT NULL
    AND "commitLeaseExpiresAt" IS NOT NULL
    AND (
      ("contentPurgedAt" IS NULL AND "committedResultRef" IS NOT NULL)
      OR ("contentPurgedAt" IS NOT NULL AND "committedResultRef" IS NULL)
    )
    AND "committedAt" IS NULL
  )
  )
);

CREATE FUNCTION "sylis_guard_agent_proposal_status_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."contentPurgedAt" IS NULL AND NEW."contentPurgedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    IF OLD.status = 'COMMITTING' THEN
      IF ROW(
        NEW."committedResultRef",
        NEW."committedAt"
      ) IS DISTINCT FROM ROW(
        OLD."committedResultRef",
        OLD."committedAt"
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AGENT_PROPOSAL_COMMITTING_RESULT_FORBIDDEN';
      END IF;
      IF ROW(
        NEW."commitAttemptId",
        NEW."commitLeaseExpiresAt"
      ) IS DISTINCT FROM ROW(
        OLD."commitAttemptId",
        OLD."commitLeaseExpiresAt"
      ) AND (
        OLD."commitLeaseExpiresAt" > statement_timestamp()
        OR NEW."commitAttemptId" IS NOT DISTINCT FROM OLD."commitAttemptId"
        OR NEW."commitLeaseExpiresAt" <= statement_timestamp()
        OR NEW."commitLeaseExpiresAt" > statement_timestamp() + interval '60 seconds'
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AGENT_PROPOSAL_LEASE_TAKEOVER_INVALID';
      END IF;
    ELSIF ROW(
      NEW."commitAttemptId",
      NEW."commitLeaseExpiresAt",
      NEW."committedResultRef",
      NEW."committedAt"
    ) IS DISTINCT FROM ROW(
      OLD."commitAttemptId",
      OLD."commitLeaseExpiresAt",
      OLD."committedResultRef",
      OLD."committedAt"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AGENT_PROPOSAL_TERMINAL_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'PENDING' AND NEW.status = 'COMMITTING' AND (
    NEW."commitLeaseExpiresAt" <= statement_timestamp()
    OR NEW."commitLeaseExpiresAt" > statement_timestamp() + interval '60 seconds'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_PROPOSAL_INITIAL_LEASE_INVALID';
  END IF;
  IF OLD.status = 'COMMITTING'
    AND NEW.status IN ('COMMITTED', 'FAILED')
    AND ROW(NEW."commitAttemptId", NEW."commitLeaseExpiresAt")
      IS DISTINCT FROM ROW(OLD."commitAttemptId", OLD."commitLeaseExpiresAt") THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AGENT_PROPOSAL_FENCING_TOKEN_CHANGED';
  END IF;
  IF NOT (
    (OLD.status = 'PENDING' AND NEW.status IN ('COMMITTING', 'REJECTED', 'EXPIRED'))
    OR (OLD.status = 'COMMITTING' AND NEW.status IN ('COMMITTED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AGENT_PROPOSAL_STATUS_TRANSITION_INVALID:' || OLD.status || ':' || NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgentProposal_status_transition_guard"
BEFORE UPDATE OF status, "commitAttemptId", "commitLeaseExpiresAt", "committedResultRef", "committedAt", "contentPurgedAt"
ON "AgentProposal"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_agent_proposal_status_transition"();

CREATE FUNCTION "sylis_assert_agent_proposal_commit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_proposal_id uuid;
  proposal "AgentProposal"%ROWTYPE;
  checked_grant "AgentToolGrant"%ROWTYPE;
  run_session_id uuid;
  run_user_id uuid;
  idempotency_count integer;
BEGIN
  IF TG_TABLE_NAME = 'AgentProposal' THEN
    checked_proposal_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME = 'AgentToolGrant' THEN
    SELECT id INTO checked_proposal_id
    FROM "AgentProposal"
    WHERE "grantId" = CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    checked_proposal_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."agentProposalId"
      ELSE NEW."agentProposalId"
    END;
  END IF;

  IF checked_proposal_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO proposal FROM "AgentProposal" WHERE id = checked_proposal_id;
  IF NOT FOUND OR proposal.status <> 'COMMITTED' THEN
    RETURN NULL;
  END IF;
  IF proposal."contentPurgedAt" IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT run."sessionId", session."userId"
  INTO run_session_id, run_user_id
  FROM "AgentRun" run
  JOIN "AgentSession" session ON session.id = run."sessionId"
  WHERE run.id = proposal."runId";

  IF proposal.decision <> 'APPROVE'
    OR proposal."decidedByUserId" IS DISTINCT FROM run_user_id
    OR proposal."decidedAt" IS NULL
    OR proposal."committedAt" IS NULL
    OR proposal."decidedAt" > proposal."committedAt"
    OR proposal."committedAt" >= proposal."expiresAt"
    OR proposal."grantId" IS NULL
    OR proposal."committedResultRef" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_PROPOSAL_COMMIT_SHAPE_INVALID';
  END IF;

  SELECT * INTO checked_grant
  FROM "AgentToolGrant"
  WHERE id = proposal."grantId";
  IF NOT FOUND
    OR checked_grant."userId" IS DISTINCT FROM run_user_id
    OR checked_grant."sessionId" IS DISTINCT FROM run_session_id
    OR checked_grant."runId" IS DISTINCT FROM proposal."runId"
    OR checked_grant."sideEffectClass" <> 'WRITE_PRIVATE_REVERSIBLE'
    OR checked_grant."maxCalls" <> 1
    OR checked_grant."revokedAt" IS NOT NULL
    OR checked_grant."expiresAt" <= proposal."committedAt"
    OR checked_grant."actionDigest" IS DISTINCT FROM proposal."actionDigest"
    OR checked_grant."issuedBy" IS DISTINCT FROM 'user:' || run_user_id::text
    OR checked_grant."resourceScope" ->> 'commandType' IS DISTINCT FROM proposal."commandType"
    OR checked_grant."resourceScope" -> 'target' IS DISTINCT FROM proposal."targetRef"
    OR checked_grant."toolKey" IS DISTINCT FROM (CASE proposal."commandType"
      WHEN 'notebook.item.add' THEN 'notebook.item.add'
      WHEN 'reading.document.publish' THEN 'reading.document.publish'
      ELSE NULL
    END) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_PROPOSAL_GRANT_INVALID';
  END IF;

  SELECT count(*) INTO idempotency_count
  FROM "IdempotencyRecord" idempotency
  WHERE idempotency."agentProposalId" = proposal.id
    AND idempotency."actorId" = run_user_id
    AND idempotency.operation = 'COMMIT_AGENT_OWNER_COMMAND'
    AND idempotency.key = 'proposal/' || proposal.id::text || '/commit'
    AND idempotency."requestHash" = proposal."actionDigest"
    AND idempotency."responseRef" = proposal."committedResultRef" ->> 'resultId'
    AND idempotency.id::text = proposal."committedResultRef" ->> 'idempotencyRecordId'
    AND idempotency."statusCode" = 201
    AND idempotency."expiresAt" > proposal."committedAt";
  IF idempotency_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_PROPOSAL_IDEMPOTENCY_INVALID';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AgentProposal_commit_guard"
AFTER INSERT OR UPDATE ON "AgentProposal"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_proposal_commit"();

CREATE CONSTRAINT TRIGGER "AgentToolGrant_proposal_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentToolGrant"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_proposal_commit"();

CREATE CONSTRAINT TRIGGER "IdempotencyRecord_proposal_guard"
AFTER INSERT OR UPDATE OR DELETE ON "IdempotencyRecord"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_proposal_commit"();

CREATE FUNCTION "sylis_guard_job_attempt_write"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_status "JobAttemptStatus";
  attempt_expiry timestamptz;
  attempt_fencing_token bigint;
  current_fencing_token bigint;
BEGIN
  SELECT "status", "leaseExpiresAt", "fencingToken"
  INTO attempt_status, attempt_expiry, attempt_fencing_token
  FROM "JobAttempt"
  WHERE "jobId" = NEW."jobId" AND "id" = NEW."attemptId";

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'JOB_ATTEMPT_OWNER_MISMATCH';
  END IF;

  SELECT max("fencingToken")
  INTO current_fencing_token
  FROM "JobAttempt"
  WHERE "jobId" = NEW."jobId";

  IF attempt_fencing_token <> current_fencing_token THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'JOB_FENCING_TOKEN_STALE';
  END IF;

  IF TG_TABLE_NAME = 'JobCheckpoint' THEN
    IF attempt_status <> 'RUNNING' OR attempt_expiry <= NEW."createdAt" THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'JOB_CHECKPOINT_LEASE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."eventType" = 'job.completed' THEN
    IF attempt_status <> 'SUCCEEDED' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'JOB_TERMINAL_PROGRESS_INVALID';
    END IF;
  ELSIF NEW."eventType" = 'job.cancelled' THEN
    IF attempt_status <> 'CANCELLED' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'JOB_TERMINAL_PROGRESS_INVALID';
    END IF;
  ELSIF NEW."eventType" = 'job.failed' THEN
    IF attempt_status NOT IN ('FAILED', 'UNKNOWN_OUTCOME') THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'JOB_TERMINAL_PROGRESS_INVALID';
    END IF;
  ELSIF attempt_status <> 'RUNNING' OR attempt_expiry <= NEW."occurredAt" THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'JOB_PROGRESS_LEASE_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "JobProgressEvent_fencing_guard"
BEFORE INSERT ON "JobProgressEvent"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_job_attempt_write"();

CREATE TRIGGER "JobCheckpoint_fencing_guard"
BEFORE INSERT ON "JobCheckpoint"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_job_attempt_write"();

CREATE FUNCTION "sylis_guard_job_terminal_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_attempt_status "JobAttemptStatus";
BEGIN
  IF OLD."status" IN ('SUCCEEDED', 'FAILED', 'CANCELLED') THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'JOB_TERMINAL_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED')
    OR NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF NEW."status" = 'CANCELLED'
    AND OLD."status" IN ('QUEUED', 'RETRY_SCHEDULED')
    AND NEW."cancelRequestedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT "status"
  INTO current_attempt_status
  FROM "JobAttempt"
  WHERE "jobId" = NEW."id"
  ORDER BY "fencingToken" DESC
  LIMIT 1;

  IF NOT FOUND
    OR (NEW."status" = 'SUCCEEDED' AND current_attempt_status <> 'SUCCEEDED')
    OR (NEW."status" = 'CANCELLED' AND current_attempt_status <> 'CANCELLED')
    OR (
      NEW."status" = 'FAILED'
      AND current_attempt_status NOT IN ('FAILED', 'UNKNOWN_OUTCOME')
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'JOB_TERMINAL_ATTEMPT_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Job_terminal_fencing_guard"
BEFORE UPDATE ON "Job"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_job_terminal_transition"();

CREATE FUNCTION "sylis_guard_active_lexicon_release"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  release_lexicon_id uuid;
  release_status "LexiconReleaseStatus";
BEGIN
  IF NEW."activeReleaseId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "lexiconId", "status"
  INTO release_lexicon_id, release_status
  FROM "LexiconRelease"
  WHERE "id" = NEW."activeReleaseId";

  IF NOT FOUND OR release_lexicon_id <> NEW."id" OR release_status <> 'VALIDATED' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEXICON_ACTIVE_RELEASE_INVALID';
  END IF;
  IF "sylis_lexicon_release_has_active_source_restriction"(
    NEW."activeReleaseId",
    CURRENT_TIMESTAMP
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LEXICON_RELEASE_ACTIVATION_SOURCE_RESTRICTED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Lexicon_active_release_guard"
BEFORE INSERT OR UPDATE OF "activeReleaseId" ON "Lexicon"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_active_lexicon_release"();

CREATE FUNCTION "sylis_guard_active_release_status"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_lexicon_id uuid;
BEGIN
  SELECT "id"
  INTO active_lexicon_id
  FROM "Lexicon"
  WHERE "activeReleaseId" = NEW."id";

  IF FOUND
    AND (
      NEW."status" <> 'VALIDATED'
      OR NEW."lexiconId" <> active_lexicon_id
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEXICON_ACTIVE_RELEASE_MUST_REMAIN_VALIDATED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LexiconRelease_active_status_guard"
BEFORE UPDATE OF "status", "lexiconId" ON "LexiconRelease"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_active_release_status"();

CREATE FUNCTION "sylis_guard_lexicon_release_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;
  IF (OLD."status" = 'DRAFT' AND NEW."status" = 'VALIDATING')
    OR (OLD."status" = 'VALIDATING' AND NEW."status" = 'VALIDATED')
    OR (OLD."status" = 'VALIDATED' AND NEW."status" = 'RETIRED') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format(
      'LEXICON_RELEASE_TRANSITION_INVALID:%s:%s',
      OLD."status",
      NEW."status"
    );
END;
$$;

CREATE TRIGGER "LexiconRelease_status_transition_guard"
BEFORE UPDATE OF "status" ON "LexiconRelease"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_lexicon_release_transition"();

CREATE FUNCTION "sylis_guard_agent_release_deployment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actual_key text;
  actual_status "ImmutableReleaseStatus";
BEGIN
  CASE NEW."releaseKind"
    WHEN 'CAPABILITY' THEN
      SELECT "capabilityKey", "status" INTO actual_key, actual_status
      FROM "CapabilityRelease" WHERE "id" = NEW."activeReleaseId";
    WHEN 'TOOL' THEN
      SELECT "toolKey", "status" INTO actual_key, actual_status
      FROM "ToolRelease" WHERE "id" = NEW."activeReleaseId";
    WHEN 'SKILL' THEN
      SELECT "skillKey", "status" INTO actual_key, actual_status
      FROM "SkillRelease" WHERE "id" = NEW."activeReleaseId";
    WHEN 'EVAL' THEN
      SELECT "evalKey", "status" INTO actual_key, actual_status
      FROM "EvalRelease" WHERE "id" = NEW."activeReleaseId";
  END CASE;

  IF actual_key IS NULL
    OR actual_key <> NEW."releaseKey"
    OR actual_status <> 'PUBLISHED' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENT_DEPLOYMENT_RELEASE_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgentReleaseDeployment_release_guard"
BEFORE INSERT OR UPDATE OF "releaseKind", "releaseKey", "activeReleaseId"
ON "AgentReleaseDeployment"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_agent_release_deployment"();

ALTER TABLE "ContentAssetRevision"
ADD CONSTRAINT "ContentAssetRevision_shape_check"
CHECK (
  "revisionNo" > 0
  AND "byteSize" >= 0
  AND length(btrim("filename")) > 0
  AND length(btrim("declaredMimeType")) > 0
  AND length(btrim("contentHash")) > 0
  AND length(btrim("objectRef")) > 0
  AND length(btrim("objectVersion")) > 0
  AND (
    "status" NOT IN ('CLEAN'::"ContentAssetRevisionStatus", 'READY'::"ContentAssetRevisionStatus")
    OR (
      "detectedMimeType" IS NOT NULL
      AND "scannerVersion" IS NOT NULL
      AND "validatorVersion" IS NOT NULL
    )
  )
  AND (
    "status" <> 'REJECTED'::"ContentAssetRevisionStatus"
    OR "scannerVersion" IS NOT NULL
  )
);

CREATE FUNCTION "sylis_content_asset_purge_is_due"(checked_asset_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "ContentAsset" asset
    WHERE asset.id = checked_asset_id
      AND asset.status IN ('HIDDEN'::"ContentAssetStatus", 'DELETED'::"ContentAssetStatus")
      AND (
        EXISTS (
          SELECT 1
          FROM "ContentDeletionAssetTarget" target
          JOIN "ContentDeletionRequest" request ON request.id = target."requestId"
          WHERE target."assetId" = asset.id
            AND request.status = 'RUNNING'::"ContentDeletionStatus"
            AND request."purgeAfter" <= statement_timestamp()
        )
        OR EXISTS (
          SELECT 1
          FROM "ContentDeletionUserTarget" target
          JOIN "ContentDeletionRequest" request ON request.id = target."requestId"
          WHERE target."userId" = asset."ownerUserId"
            AND request.status = 'RUNNING'::"ContentDeletionStatus"
            AND request."purgeAfter" <= statement_timestamp()
        )
      )
  );
$$;

CREATE FUNCTION "sylis_guard_content_asset_current_revision"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."currentRevisionId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "ContentAssetRevision" revision
       WHERE revision.id = NEW."currentRevisionId"
         AND revision."assetId" = NEW.id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'CONTENT_ASSET_CURRENT_REVISION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ContentAsset_current_revision_guard"
BEFORE INSERT OR UPDATE OF "currentRevisionId" ON "ContentAsset"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_content_asset_current_revision"();

CREATE FUNCTION "sylis_guard_content_asset_revision"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed_parser_enrichment boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_ASSET_REVISION_DELETE_FORBIDDEN';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."assetId" IS DISTINCT FROM OLD."assetId"
     OR NEW."revisionNo" IS DISTINCT FROM OLD."revisionNo"
     OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_ASSET_REVISION_BINDING_IMMUTABLE';
  END IF;

  IF OLD.status = 'PURGED'::"ContentAssetRevisionStatus" THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_ASSET_REVISION_PURGED_IMMUTABLE';
  END IF;

  IF NEW.status = 'PURGED'::"ContentAssetRevisionStatus" THEN
    IF NOT "sylis_content_asset_purge_is_due"(OLD."assetId")
       OR NEW.filename <> 'deleted'
       OR NEW."declaredMimeType" <> 'application/octet-stream'
       OR NEW."detectedMimeType" IS NOT NULL
       OR NEW."byteSize" <> 0
       OR NEW."objectRef" <> 'purged/' || OLD."assetId"::text
       OR NEW."objectVersion" <> 'purged'
       OR NEW."scannerVersion" IS NOT NULL
       OR NEW."parserVersion" IS NOT NULL
       OR NEW."validatorVersion" IS NOT NULL
       OR NEW."sourceArtifactRevisionId" IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'CONTENT_ASSET_REVISION_PURGE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."sourceArtifactRevisionId" IS DISTINCT FROM OLD."sourceArtifactRevisionId"
     OR NEW.filename IS DISTINCT FROM OLD.filename
     OR NEW."declaredMimeType" IS DISTINCT FROM OLD."declaredMimeType"
     OR NEW."byteSize" IS DISTINCT FROM OLD."byteSize" THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_ASSET_REVISION_CONTENT_IMMUTABLE';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'QUARANTINED'::"ContentAssetRevisionStatus"
         AND NEW.status IN ('CLEAN'::"ContentAssetRevisionStatus", 'REJECTED'::"ContentAssetRevisionStatus"))
       OR (OLD.status = 'CLEAN'::"ContentAssetRevisionStatus"
         AND NEW.status = 'READY'::"ContentAssetRevisionStatus")
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_ASSET_REVISION_STATUS_TRANSITION_INVALID';
  END IF;

  allowed_parser_enrichment :=
    OLD.status = 'CLEAN'::"ContentAssetRevisionStatus"
    AND NEW.status IN ('CLEAN'::"ContentAssetRevisionStatus", 'READY'::"ContentAssetRevisionStatus")
    AND OLD."parserVersion" IS NULL
    AND NEW."parserVersion" IS NOT NULL;

  IF OLD.status = 'QUARANTINED'::"ContentAssetRevisionStatus"
     AND NEW.status = 'CLEAN'::"ContentAssetRevisionStatus" THEN
    IF OLD."detectedMimeType" IS NOT NULL
       OR OLD."scannerVersion" IS NOT NULL
       OR OLD."validatorVersion" IS NOT NULL
       OR NEW."detectedMimeType" IS NULL
       OR NEW."scannerVersion" IS NULL
       OR NEW."validatorVersion" IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'CONTENT_ASSET_REVISION_SCAN_EVIDENCE_INVALID';
    END IF;
  ELSIF OLD.status = 'QUARANTINED'::"ContentAssetRevisionStatus"
     AND NEW.status = 'REJECTED'::"ContentAssetRevisionStatus" THEN
    IF OLD."detectedMimeType" IS NOT NULL
       OR OLD."scannerVersion" IS NOT NULL
       OR OLD."validatorVersion" IS NOT NULL
       OR NEW."scannerVersion" IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'CONTENT_ASSET_REVISION_SCAN_EVIDENCE_INVALID';
    END IF;
  ELSIF NEW."detectedMimeType" IS DISTINCT FROM OLD."detectedMimeType"
     OR NEW."scannerVersion" IS DISTINCT FROM OLD."scannerVersion"
     OR NEW."validatorVersion" IS DISTINCT FROM OLD."validatorVersion" THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_ASSET_REVISION_SCAN_EVIDENCE_IMMUTABLE';
  END IF;

  IF NEW."objectRef" IS DISTINCT FROM OLD."objectRef"
     OR NEW."objectVersion" IS DISTINCT FROM OLD."objectVersion" THEN
    IF NOT (
      OLD.status = 'QUARANTINED'::"ContentAssetRevisionStatus"
      AND NEW.status = 'CLEAN'::"ContentAssetRevisionStatus"
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'CONTENT_ASSET_REVISION_OBJECT_BINDING_IMMUTABLE';
    END IF;
  END IF;

  IF NEW."parserVersion" IS DISTINCT FROM OLD."parserVersion"
     AND NOT allowed_parser_enrichment THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_ASSET_REVISION_PARSER_EVIDENCE_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ContentAssetRevision_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "ContentAssetRevision"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_content_asset_revision"();

CREATE FUNCTION "sylis_guard_content_asset_revision_reference"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_revision_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'ModelExecutionPermitAssetRevisionTarget' THEN
    checked_revision_id := NEW."assetRevisionId";
  ELSIF TG_TABLE_NAME = 'ModelExchangePart' THEN
    checked_revision_id := NEW."assetRevisionId";
  ELSE
    checked_revision_id := NEW."assetRevisionId";
  END IF;

  IF checked_revision_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "ContentAssetRevision" revision
       JOIN "ContentAsset" asset ON asset.id = revision."assetId"
       WHERE revision.id = checked_revision_id
         AND revision.status IN ('CLEAN'::"ContentAssetRevisionStatus", 'READY'::"ContentAssetRevisionStatus")
         AND asset.status NOT IN ('HIDDEN'::"ContentAssetStatus", 'DELETED'::"ContentAssetStatus", 'REJECTED'::"ContentAssetStatus")
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'CONTENT_ASSET_REVISION_NOT_REFERENCEABLE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ModelExecutionPermitAssetRevisionTarget_asset_guard"
BEFORE INSERT OR UPDATE OF "assetRevisionId" ON "ModelExecutionPermitAssetRevisionTarget"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_content_asset_revision_reference"();

CREATE TRIGGER "ModelExchangePart_asset_guard"
BEFORE INSERT OR UPDATE OF "assetRevisionId" ON "ModelExchangePart"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_content_asset_revision_reference"();

CREATE TRIGGER "AgentMessageBlockReference_asset_guard"
BEFORE INSERT OR UPDATE OF "assetRevisionId" ON "AgentMessageBlockReference"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_content_asset_revision_reference"();

CREATE FUNCTION "sylis_guard_asset_processing_run"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "ContentAssetRevision" revision
      WHERE revision.id = OLD."revisionId"
        AND "sylis_content_asset_purge_is_due"(revision."assetId")
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'ASSET_PROCESSING_RUN_DELETE_FORBIDDEN';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."revisionId" IS DISTINCT FROM OLD."revisionId"
     OR NEW."jobId" IS DISTINCT FROM OLD."jobId"
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW."inputHash" IS DISTINCT FROM OLD."inputHash"
     OR NEW."toolVersion" IS DISTINCT FROM OLD."toolVersion"
     OR NEW."modelPolicyVersion" IS DISTINCT FROM OLD."modelPolicyVersion"
     OR NEW."chunkPolicyVersion" IS DISTINCT FROM OLD."chunkPolicyVersion"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSET_PROCESSING_RUN_BINDING_IMMUTABLE';
  END IF;
  IF OLD.status IN ('SUCCEEDED'::"AssetProcessingStatus", 'FAILED'::"AssetProcessingStatus", 'CANCELLED'::"AssetProcessingStatus") THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSET_PROCESSING_RUN_TERMINAL_IMMUTABLE';
  END IF;
  IF NOT (
    (OLD.status = 'QUEUED'::"AssetProcessingStatus" AND NEW.status IN ('RUNNING'::"AssetProcessingStatus", 'CANCELLED'::"AssetProcessingStatus"))
    OR (OLD.status = 'RUNNING'::"AssetProcessingStatus" AND NEW.status IN ('SUCCEEDED'::"AssetProcessingStatus", 'FAILED'::"AssetProcessingStatus", 'CANCELLED'::"AssetProcessingStatus"))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ASSET_PROCESSING_RUN_STATUS_TRANSITION_INVALID';
  END IF;
  IF NEW.status = 'SUCCEEDED'::"AssetProcessingStatus"
     AND (NEW."outputHash" IS NULL OR NEW."completedAt" IS NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSET_PROCESSING_RUN_SUCCESS_EVIDENCE_REQUIRED';
  END IF;
  IF NEW.status IN ('FAILED'::"AssetProcessingStatus", 'CANCELLED'::"AssetProcessingStatus")
     AND NEW."completedAt" IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ASSET_PROCESSING_RUN_TERMINAL_TIME_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AssetProcessingRun_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "AssetProcessingRun"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_asset_processing_run"();

CREATE FUNCTION "sylis_guard_content_asset_derivative"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  derivative_asset_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS NOT DISTINCT FROM OLD THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_ASSET_DERIVATIVE_IMMUTABLE';
  END IF;
  IF TG_OP = 'DELETE' THEN
    SELECT revision."assetId" INTO derivative_asset_id
    FROM "ContentAssetRevision" revision
    WHERE revision.id = OLD."revisionId";
    IF derivative_asset_id IS NULL
       OR NOT "sylis_content_asset_purge_is_due"(derivative_asset_id) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'CONTENT_ASSET_DERIVATIVE_DELETE_FORBIDDEN';
    END IF;
    RETURN OLD;
  END IF;

  IF num_nonnulls(NEW."objectRef", NEW."contentBodyId", NEW."vectorRef") <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM "ContentAssetRevision" revision
       JOIN "AssetProcessingRun" processing ON processing.id = NEW."processingRunId"
       WHERE revision.id = NEW."revisionId"
         AND revision.status IN ('CLEAN'::"ContentAssetRevisionStatus", 'READY'::"ContentAssetRevisionStatus")
         AND processing."revisionId" = NEW."revisionId"
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'CONTENT_ASSET_DERIVATIVE_BINDING_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ContentAssetDerivative_binding_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "ContentAssetDerivative"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_content_asset_derivative"();

CREATE FUNCTION "sylis_assert_content_asset_derivative_completion"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "AssetProcessingRun" processing
    WHERE processing.id = NEW."processingRunId"
      AND processing."revisionId" = NEW."revisionId"
      AND processing.status = 'SUCCEEDED'::"AssetProcessingStatus"
      AND processing."outputHash" = NEW."outputHash"
      AND processing."completedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'CONTENT_ASSET_DERIVATIVE_PROCESSING_INCOMPLETE';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ContentAssetDerivative_completion_guard"
AFTER INSERT ON "ContentAssetDerivative"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_content_asset_derivative_completion"();

-- Application group roles. Railway login roles inherit exactly one of these roles.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'sylis_api',
    'sylis_admin_api',
    'sylis_ci_ingestor',
    'sylis_agent_api',
    'sylis_model_gateway',
    'sylis_agent_executor',
    'sylis_agent_evaluator',
    'sylis_asset_processor',
    'sylis_automation_executor',
    'sylis_lexicon_builder',
    'sylis_lexicon_publisher'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', role_name);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO
  sylis_api,
  sylis_admin_api,
  sylis_ci_ingestor,
  sylis_agent_api,
  sylis_model_gateway,
  sylis_agent_executor,
  sylis_agent_evaluator,
  sylis_asset_processor,
  sylis_automation_executor,
  sylis_lexicon_builder,
  sylis_lexicon_publisher;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO sylis_api;

GRANT SELECT ON TABLE
  "Job",
  "JobAttempt",
  "JobProgressEvent",
  "JobCheckpoint",
  "JobKindPolicy",
  "BuildRun",
  "BuildRunActivation",
  "BudgetApproval",
  "PublishRun",
  "ApprovalPolicy",
  "ApprovalRequest",
  "ApprovalDecision",
  "LexiconReleaseActivation",
  "RightsDecision",
  "RightsDecisionEvidence",
  "Candidate",
  "CandidateRevision",
  "CandidateRevisionEvidence",
  "CandidatePromotionMap",
  "ValidationIssue",
  "ReviewBatch",
  "ReviewItem",
  "ReviewDecision",
  "SecurityAuditEvent",
  "DataAccessAuditEvent",
  "AuditRetentionPolicy",
  "AuditArchive",
  "LegalHold",
  "AuditExport",
  "DeploymentRelease",
  "AgentReleaseEvent",
  "AgentReleaseDeployment",
  "Lexicon",
  "LexiconRelease",
  "LexiconReleaseSourceInput",
  "SourceDataset",
  "SourceDatasetVersion",
  "SourceRightsPolicy",
  "SourceRestriction",
  "SourceRecord",
  "Provenance",
  "ContentEvidence"
TO sylis_admin_api;

GRANT SELECT ON TABLE
  "User",
  "AuthSession",
  "SupportGrant",
  "AgentSession",
  "AgentMessage",
  "AgentRun",
  "AgentRunStep",
  "AgentRunStepAction",
  "AgentInstruction",
  "AgentMessageBlock",
  "AgentMessageBlockContent",
  "AgentMessageBlockTable",
  "AgentMessageBlockTableRow",
  "AgentMessageBlockTableCell",
  "AgentMessageBlockDivider",
  "AgentMessageBlockReference",
  "AgentPlan",
  "AgentPlanRevision",
  "AgentWaitCondition",
  "AgentEvent",
  "AgentToolCall",
  "AgentProposal",
  "AgentToolGrant",
  "AgentArtifact",
  "AgentArtifactRevision",
  "AgentMemoryCard",
  "MemorySuppression",
  "ContextSnapshot",
  "ContextSnapshotRef",
  "CapabilityRelease",
  "CapabilityRouteAllowance",
  "ToolRelease",
  "SkillRelease",
  "EvalRelease",
  "CapabilityToolRelease",
  "CapabilitySkillRelease",
  "CapabilityEvalRequirement",
  "AgentEvaluationRun",
  "AgentEvaluationEvidence",
  "AgentReleaseEvent",
  "AgentReleaseDeployment",
  "DiagnosticBundle",
  "DiagnosticBundleRevision",
  "LexiconGapReport",
  "ContentAsset",
  "UploadIntent",
  "ContentAssetRevision",
  "AssetProcessingRun",
  "ContentAssetDerivative",
  "ContentDeletionRequest",
  "ContentDeletionAssetTarget",
  "ContentDeletionModelExchangeTarget",
  "ContentDeletionSessionTarget",
  "ContentDeletionUserTarget",
  "Job",
  "JobAttempt",
  "JobProgressEvent",
  "OutboxEvent",
  "IdempotencyRecord",
  "ProviderRouteRelease",
  "CredentialProfile",
  "ModelUsageLedger",
  "DailyStudyPlan",
  "Notebook",
  "DocumentOrigin",
  "ReadingDocument",
  "ReadingDocumentRevision",
  "LexicalAnnotation",
  "LexicalAnnotationObjectiveTarget",
  "ReadingTarget",
  "HeadwordRevision",
  "LexicalEntryRevision",
  "LexicalSenseRevision",
  "SecurityAuditEvent"
TO sylis_agent_api;

GRANT INSERT ON TABLE "SecurityAuditEvent", "DataAccessAuditEvent"
TO sylis_agent_api;

GRANT SELECT ON TABLE
  "User",
  "UserEmail",
  "ConsentRecord",
  "Notebook",
  "CollectedLexicalItem",
  "CollectedLexicalItemRevision",
  "ExerciseAttempt",
  "DataExportRequest",
  "SourceSynchronization",
  "ContentDeletionRequest",
  "ContentDeletionAssetTarget",
  "ContentDeletionModelExchangeTarget",
  "ContentDeletionSessionTarget",
  "ContentDeletionUserTarget",
  "ContentAsset",
  "ContentAssetRevision"
TO sylis_automation_executor;

REVOKE ALL ON TABLE
  "CredentialRevision",
  "ModelContentBody",
  "ModelExchange",
  "ModelExchangePart"
FROM sylis_api, sylis_admin_api, sylis_agent_api, sylis_automation_executor;

GRANT SELECT (
  "id",
  "profileId",
  "revisionNo",
  "credentialType",
  "status",
  "fingerprint",
  "fingerprintVersion",
  "maskedHint",
  "metadata",
  "validatedAt",
  "expiresAt",
  "revokedAt",
  "createdAt"
) ON "CredentialRevision" TO sylis_admin_api, sylis_agent_api;

GRANT SELECT ("id", "permitId", "ownerType", "ownerId", "status")
ON "ModelInvocation" TO sylis_agent_api;

GRANT SELECT ("id")
ON "ModelExecutionPermit" TO sylis_agent_api;

GRANT SELECT ("permitId", "agentRunId")
ON "ModelExecutionPermitAgentRunTarget" TO sylis_agent_api;

GRANT SELECT ("id", "ownerUserId", "hiddenAt", "purgedAt", "sealedAt")
ON "ModelContentBody" TO sylis_agent_api;

GRANT SELECT (
  "id",
  "bodyId",
  "invocationId",
  "modelPosition",
  "modelSubPosition",
  "fragmentSequence",
  "fragmentHash",
  "byteLength"
) ON "ModelContentFragment" TO sylis_agent_api;

GRANT SELECT ("id", "invocationId", "hiddenAt", "purgeAfter", "purgedAt")
ON "ModelExchange" TO sylis_agent_api;

-- Model Gateway only needs reference columns to avoid cryptoshredding bodies
-- that remain attached to durable Agent-owned records.
GRANT SELECT ("contentBodyId")
ON "AgentMessageBlockContent" TO sylis_model_gateway;
GRANT SELECT ("contentBodyId")
ON "AgentMessageBlockTableCell" TO sylis_model_gateway;
GRANT SELECT ("contentBodyId")
ON "AgentInstruction" TO sylis_model_gateway;
GRANT SELECT ("goalContentBodyId")
ON "AgentRun" TO sylis_model_gateway;
GRANT SELECT ("payloadContentBodyId")
ON "AgentProposal" TO sylis_model_gateway;
GRANT SELECT ("contentBodyId")
ON "AgentArtifactRevision" TO sylis_model_gateway;
GRANT SELECT ("claimContentBodyId")
ON "AgentMemoryCard" TO sylis_model_gateway;
GRANT SELECT ("inputContentBodyId", "resultContentBodyId")
ON "AgentToolCall" TO sylis_model_gateway;
GRANT SELECT ("contentBodyId")
ON "AgentEvent" TO sylis_model_gateway;

-- Permit target validation joins the Agent session only to verify its owner.
GRANT SELECT ("id", "userId")
ON "AgentSession" TO sylis_model_gateway;

GRANT INSERT, UPDATE, DELETE ON TABLE
  "User",
  "UserEmail",
  "PasswordCredential",
  "VerificationChallenge",
  "AuthenticationChallenge",
  "MfaCredential",
  "WebAuthnCredential",
  "TotpCredential",
  "MfaRecoveryCode",
  "ConsentRecord",
  "AuthSession",
  "SupportGrant",
  "ServicePrincipal",
  "ServicePrincipalKey",
  "OperatorRoleAssignment",
  "OperatorBootstrapState",
  "UserSecurityLock",
  "UserBookEnrollment",
  "DailyStudyPlan",
  "DailyStudyPlanItem",
  "UserObjectiveMemoryState",
  "ReviewEvent",
  "ReviewStateSnapshot",
  "ExerciseAttempt",
  "AttemptPresentedChoice",
  "AttemptSelectedChoice",
  "AttemptTextResponse",
  "AttemptSelfReport",
  "AssessmentSession",
  "AssessmentSessionItem",
  "AssessmentResult",
  "Notebook",
  "CollectedLexicalItem",
  "CollectedLexicalItemRevision",
  "CollectedRevisionHeadwordTarget",
  "CollectedRevisionEntryTarget",
  "CollectedRevisionSenseTarget",
  "CollectedRevisionCollocationTarget",
  "DocumentOrigin",
  "ReadingDocument",
  "ReadingDocumentRevision",
  "LexicalAnnotation",
  "LexicalAnnotationHeadwordTarget",
  "LexicalAnnotationEntryTarget",
  "LexicalAnnotationSenseTarget",
  "LexicalAnnotationCollocationTarget",
  "LexicalAnnotationObjectiveTarget",
  "ReadingActivity",
  "ReadingProgress",
  "ReadingCollection",
  "ReadingCollectionItem",
  "ReadingTarget",
  "RedditDocumentMetadata",
  "RedditSourceObservation",
  "SecurityAuditEvent",
  "DataAccessAuditEvent",
  "OutboxEvent",
  "IdempotencyRecord",
  "Job",
  "DataExportRequest"
TO sylis_api;

GRANT SELECT, INSERT ON TABLE
  "SupportGrantReadingDocumentRevisionTarget",
  "SupportGrantContentAssetRevisionTarget",
  "SupportGrantCollectedLexicalItemRevisionTarget",
  "SupportGrantExerciseAttemptTextTarget",
  "SupportGrantDiagnosticBundleRevisionTarget"
TO sylis_api;

REVOKE DELETE ON TABLE "SupportGrant" FROM sylis_api;

GRANT EXECUTE ON FUNCTION "sylis_purge_user_support_grants"(uuid)
TO sylis_api, sylis_agent_api;

GRANT INSERT ON TABLE
  "ContentDeletionRequest",
  "ContentDeletionUserTarget"
TO sylis_api;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "Job",
  "JobAttempt",
  "JobProgressEvent",
  "JobCheckpoint",
  "JobKindPolicy",
  "BuildRun",
  "BuildRunActivation",
  "BudgetApproval",
  "PublishRun",
  "ApprovalPolicy",
  "ApprovalRequest",
  "ApprovalDecision",
  "LexiconReleaseActivation",
  "RightsDecision",
  "RightsDecisionEvidence",
  "Candidate",
  "CandidateRevision",
  "CandidateRevisionEvidence",
  "CandidatePromotionMap",
  "ValidationIssue",
  "ReviewBatch",
  "ReviewItem",
  "ReviewDecision",
  "AgentReleaseEvent",
  "AgentReleaseDeployment"
TO sylis_admin_api;

GRANT SELECT, INSERT ON TABLE "DeploymentRelease"
TO sylis_ci_ingestor;

GRANT INSERT ON TABLE "SecurityAuditEvent"
TO sylis_ci_ingestor;

GRANT INSERT ON TABLE
  "SecurityAuditEvent",
  "AuditRetentionPolicy",
  "LegalHold"
TO sylis_admin_api;

-- LegalHold guards resolve only the minimum archive scope needed at write time.
GRANT SELECT ("id", "status", "category")
ON TABLE "AuditArchive" TO sylis_admin_api;

GRANT UPDATE (
  "releasedByUserId",
  "releasedAt",
  "releaseReason",
  "releaseActionDigest"
) ON TABLE "LegalHold" TO sylis_admin_api;

GRANT SELECT, INSERT ON TABLE "AuditExport" TO sylis_admin_api;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "SourceDataset"
TO sylis_admin_api;

GRANT SELECT, INSERT ON TABLE
  "SourceDatasetVersion",
  "SourceRightsPolicy",
  "SourceRestriction"
TO sylis_admin_api;

GRANT SELECT, INSERT ON TABLE "SourceSynchronization" TO sylis_admin_api;

GRANT SELECT ("id", "parentRunId", "status")
ON TABLE "AgentRun" TO sylis_admin_api;

-- Approval guards resolve only the operator's effective role at decision time.
GRANT SELECT ("userId", "role", "grantedAt", "revokedAt", "expiresAt")
ON TABLE "OperatorRoleAssignment" TO sylis_admin_api;

GRANT SELECT ("userId", "role", "grantedAt", "revokedAt", "expiresAt")
ON TABLE "OperatorRoleAssignment" TO sylis_agent_api;

-- The central Job Runtime settles Agent runs after terminal worker outcomes.
GRANT SELECT ("id", "runId", "status")
ON TABLE "AgentWaitCondition" TO sylis_admin_api;
GRANT UPDATE ("status", "waitedAt")
ON TABLE "AgentRun" TO sylis_admin_api;

GRANT USAGE, SELECT ON SEQUENCE "job_fencing_token_seq" TO sylis_admin_api;

GRANT INSERT, UPDATE, DELETE ON TABLE
  "AgentSession",
  "AgentMessage",
  "AgentRun",
  "AgentInstruction",
  "AgentPlan",
  "AgentPlanRevision",
  "AgentWaitCondition",
  "AgentEvent",
  "AgentToolCall",
  "AgentProposal",
  "AgentToolGrant",
  "AgentArtifact",
  "AgentArtifactRevision",
  "AgentMemoryCard",
  "MemorySuppression",
  "ContextSnapshot",
  "ContextSnapshotRef",
  "CapabilityRelease",
  "CapabilityRouteAllowance",
  "ToolRelease",
  "SkillRelease",
  "EvalRelease",
  "CapabilityToolRelease",
  "CapabilitySkillRelease",
  "CapabilityEvalRequirement",
  "AgentEvaluationRun",
  "AgentEvaluationEvidence",
  "AgentReleaseEvent",
  "AgentReleaseDeployment",
  "DiagnosticBundle",
  "DiagnosticBundleRevision",
  "LexiconGapReport",
  "ContentAsset",
  "UploadIntent",
  "ContentAssetRevision",
  "AssetProcessingRun",
  "ContentAssetDerivative",
  "ContentDeletionRequest",
  "Job",
  "OutboxEvent",
  "IdempotencyRecord"
TO sylis_agent_api;

GRANT INSERT ON TABLE
  "ContentDeletionAssetTarget",
  "ContentDeletionModelExchangeTarget",
  "ContentDeletionSessionTarget"
TO sylis_agent_api;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "ProviderRouteRelease",
  "ProviderRouteSecurityEvent",
  "CredentialProfile",
  "CredentialRevision",
  "CredentialSecurityEvent",
  "ModelExecutionPermit",
  "ModelInvocation",
  "ModelContentBody",
  "ModelExchange",
  "ModelExchangePart",
  "ModelUsageLedger",
  "BudgetPolicy",
  "QuotaPolicy",
  "ProviderHealthObservation"
TO sylis_model_gateway;

GRANT SELECT, INSERT ON TABLE
  "ModelExecutionPermitAgentRunTarget",
  "ModelExecutionPermitBuildRunTarget",
  "ModelExecutionPermitEvaluationRunTarget",
  "ModelExecutionPermitAssetRevisionTarget"
TO sylis_model_gateway;

GRANT SELECT ON TABLE
  "User",
  "CapabilityRelease",
  "AgentRun",
  "AgentEvaluationRun",
  "BuildRun",
  "Job",
  "JobAttempt",
  "ContentDeletionRequest",
  "ContentDeletionAssetTarget",
  "ContentDeletionUserTarget",
  "ContentAsset",
  "ContentAssetRevision",
  "ContentAssetDerivative"
TO sylis_model_gateway;

-- Model Gateway appends audit facts but must not inspect the global audit log.
GRANT INSERT ON TABLE "SecurityAuditEvent" TO sylis_model_gateway;

GRANT SELECT ON TABLE "Job", "JobAttempt", "JobProgressEvent", "JobCheckpoint"
TO sylis_agent_executor, sylis_agent_evaluator;

GRANT SELECT, INSERT, UPDATE ON TABLE
  "ContentAsset",
  "ContentAssetRevision",
  "AssetProcessingRun",
  "ContentAssetDerivative",
  "ContentDeletionRequest"
TO sylis_asset_processor;

GRANT SELECT ON TABLE
  "Job",
  "ContentAsset",
  "ContentAssetRevision",
  "AssetProcessingRun",
  "AgentArtifactRevision"
TO sylis_asset_processor;

GRANT SELECT, UPDATE ON TABLE
  "DataExportRequest",
  "SourceSynchronization",
  "ContentDeletionRequest",
  "ContentAsset",
  "ContentAssetRevision"
TO sylis_automation_executor;

GRANT SELECT ON TABLE
  "AuditRetentionPolicy",
  "AuditArchive",
  "AuditArchiveSecurityEvent",
  "AuditArchiveDataAccessEvent",
  "LegalHold",
  "AuditExport"
TO sylis_automation_executor;

GRANT INSERT ON TABLE "AuditArchive" TO sylis_automation_executor;
GRANT SELECT, INSERT ON TABLE
  "AuditArchiveSecurityEvent",
  "AuditArchiveDataAccessEvent"
TO sylis_automation_executor;
GRANT UPDATE (
  "status",
  "objectRef",
  "contentHash",
  "encryptionVersion",
  "purgedAt"
) ON TABLE "AuditArchive"
TO sylis_automation_executor;
GRANT DELETE ON TABLE "SecurityAuditEvent", "DataAccessAuditEvent"
TO sylis_automation_executor;
GRANT UPDATE ("artifactRef", "eventCount", "contentHash", "expiresAt")
ON TABLE "AuditExport" TO sylis_automation_executor;

GRANT SELECT ON TABLE
  "ContentDeletionAssetTarget",
  "ContentDeletionModelExchangeTarget",
  "ContentDeletionSessionTarget",
  "ContentDeletionUserTarget"
TO sylis_automation_executor;

GRANT SELECT, DELETE ON TABLE
  "UploadIntent",
  "AssetProcessingRun",
  "ContentAssetDerivative"
TO sylis_automation_executor;

GRANT SELECT ON TABLE
  "SourceDatasetVersion",
  "SecurityAuditEvent",
  "DataAccessAuditEvent"
TO sylis_automation_executor;

GRANT SELECT ("id", "kind", "ownerType", "ownerId", "inputRef")
ON TABLE "Job" TO sylis_automation_executor;

GRANT UPDATE ("activeReleaseId", "updatedAt")
ON TABLE "Lexicon" TO sylis_admin_api;

GRANT SELECT ON TABLE
  "BuildRun",
  "BuildRunActivation",
  "BudgetApproval",
  "ReviewBatch",
  "Job"
TO sylis_lexicon_builder;

REVOKE ALL ON TABLE
  "CredentialRevision",
  "ModelContentBody",
  "ModelExchange",
  "ModelExchangePart"
FROM sylis_lexicon_builder, sylis_lexicon_publisher;

GRANT UPDATE (
  "status",
  "artifactUri",
  "artifactHash",
  "reportUri",
  "compilerRunId",
  "completedAt"
) ON TABLE "BuildRun" TO sylis_lexicon_builder;

GRANT SELECT, INSERT ON TABLE
  "LexiconStagingRecord",
  "Lexicon",
  "TextProcessingProfile",
  "VocabularyBundle",
  "VocabularyNamespaceVersion",
  "VocabularyTerm",
  "LexiconRelease",
  "LexiconReleaseBuildMetadata",
  "LexiconReleaseLearningLanguage",
  "LexiconReleaseSourceInput",
  "LexiconReleaseBookEdition",
  "Headword",
  "HeadwordRevision",
  "LexicalEntry",
  "LexicalEntryRevision",
  "LexicalForm",
  "FormRepresentation",
  "FormFeature",
  "LexicalSense",
  "LexicalSenseRevision",
  "SenseDefinition",
  "SenseTranslationText",
  "SenseUsage",
  "LexicalConcept",
  "LexicalConceptRevision",
  "SenseConceptMembership",
  "ConceptDefinition",
  "EntryRelation",
  "SenseRelation",
  "ConceptRelation",
  "ExampleSentence",
  "ExampleTranslation",
  "SenseExample",
  "ExampleCitation",
  "Collocation",
  "SenseCollocation",
  "CollocationComponent",
  "ContentProfileEvaluation",
  "LearningObjectiveRevision",
  "ExerciseRevision",
  "SyntacticFrame",
  "SyntacticArgument",
  "SemanticPredicate",
  "SemanticArgument",
  "SenseFrame",
  "ArgumentMapping",
  "Etymon",
  "EtymonRevision",
  "EtymologyHypothesis",
  "EtymologyLink",
  "EtymologyLinkSourceEntry",
  "EtymologyLinkSourceEtymon",
  "EtymologyLinkTargetEntry",
  "EtymologyLinkTargetEtymon",
  "Morph",
  "Morpheme",
  "MorphologicalAnalysis",
  "MorphologicalSegment",
  "InflectionRule",
  "InflectionGeneration",
  "WordFormation",
  "WordFormationInput",
  "WordFormationRule",
  "WordFormationApplication",
  "TranslationRelation",
  "EntryLineage",
  "SenseLineage",
  "ConceptLineage",
  "EntryExternalIdentifier",
  "SenseExternalIdentifier",
  "ConceptExternalIdentifier",
  "MediaAsset",
  "FormMedia",
  "Provenance",
  "ContentEvidence",
  "SourceRightsPolicy",
  "SourceDataset",
  "SourceDatasetVersion",
  "SourceRecord",
  "SourceRestriction",
  "CorpusDataset",
  "CorpusDatasetVersion",
  "EntryFrequencyObservation",
  "FormFrequencyObservation",
  "SenseFrequencyObservation",
  "CollocationObservation",
  "EntryAttestation",
  "FormAttestation",
  "SenseAttestation",
  "VocabularyBook",
  "VocabularyBookEdition",
  "VocabularyBookItem",
  "VocabularyBookItemHeadwordTarget",
  "VocabularyBookItemEntryTarget",
  "LearningObjective",
  "LearningObjectiveSenseSubject",
  "LearningObjectiveFormSubject",
  "LearningObjectiveCollocationSubject",
  "LearningObjectiveFrameSubject",
  "LearningObjectiveExampleSubject",
  "LearningObjectiveHint",
  "PedagogicalMaterial",
  "PedagogicalMaterialRevision",
  "PedagogicalMaterialEntryTarget",
  "PedagogicalMaterialSenseTarget",
  "PedagogicalMaterialFormTarget",
  "PedagogicalMaterialMorphemeTarget",
  "PedagogicalMaterialWordFormationTarget",
  "PedagogicalMaterialCollocationTarget",
  "PedagogicalMaterialLearningObjectiveTarget",
  "PedagogicalMaterialBlock",
  "PedagogicalMaterialTextBlock",
  "PedagogicalMaterialExampleBlock",
  "PedagogicalMaterialMediaBlock",
  "PedagogicalMaterialMention",
  "PedagogicalMaterialMentionHeadwordTarget",
  "PedagogicalMaterialMentionEntryTarget",
  "PedagogicalMaterialMentionFormTarget",
  "PedagogicalMaterialMentionSenseTarget",
  "PedagogicalMaterialMentionConceptTarget",
  "PedagogicalMaterialMentionSenseExampleTarget",
  "PedagogicalMaterialMentionCollocationTarget",
  "PedagogicalMaterialMentionFrameTarget",
  "PedagogicalMaterialMentionMorphemeTarget",
  "PedagogicalMaterialCitation",
  "ExerciseItem",
  "ExerciseStimulusRef",
  "ExerciseResponseConfig",
  "ExerciseChoiceResponseConfig",
  "ExerciseShortTextResponseConfig",
  "ExerciseExtendedTextResponseConfig",
  "ExerciseNoCaptureResponseConfig",
  "ExerciseChoice",
  "ExerciseChoiceHeadwordTarget",
  "ExerciseChoiceEntryTarget",
  "ExerciseChoiceFormTarget",
  "ExerciseChoiceSenseTarget",
  "ExerciseChoiceConceptTarget",
  "ExerciseChoiceSenseExampleTarget",
  "ExerciseChoiceCollocationTarget",
  "ExerciseChoiceFrameTarget",
  "ExerciseChoiceMorphemeTarget",
  "ExerciseAcceptedText",
  "ExerciseCorrectChoice",
  "ExerciseFeedback",
  "ExerciseRubricCriterion",
  "AssessmentStimulus",
  "AssessmentStimulusRevision",
  "AssessmentStimulusBlock",
  "AssessmentStimulusTextBlock",
  "AssessmentStimulusExampleBlock",
  "AssessmentStimulusMediaBlock",
  "AssessmentStimulusMaterialBlock",
  "AssessmentBlueprint",
  "AssessmentBlueprintRevision",
  "AssessmentSection",
  "AssessmentSelectionRule",
  "AssessmentQuotaSelectionRule",
  "AssessmentScopeSelectionRule",
  "AssessmentBookEditionScopeRule",
  "AssessmentProficiencyLevelScopeRule",
  "AssessmentPinnedItemSelectionRule",
  "ProficiencyFramework",
  "ProficiencyFrameworkVersion",
  "ProficiencyLevel",
  "ProficiencyHeadwordClaim",
  "ProficiencyEntryClaim",
  "ProficiencySenseClaim",
  "ContentProfile",
  "ContentProfileVersion",
  "ContentProfileEvaluationHeadwordTarget",
  "ContentProfileEvaluationEntryTarget",
  "ContentProfileEvaluationFormTarget",
  "ContentProfileEvaluationSenseTarget",
  "ContentProfileEvaluationConceptTarget",
  "ContentProfileEvaluationLearningObjectiveTarget",
  "ContentProfileEvaluationPedagogicalMaterialTarget",
  "ContentProfileEvaluationExerciseTarget",
  "ContentProfileEvaluationBookEditionTarget",
  "ContentRequirementEvaluation",
  "ReleaseQualityStatistic"
TO sylis_lexicon_publisher;

GRANT DELETE ON TABLE "LexiconStagingRecord" TO sylis_lexicon_publisher;

GRANT SELECT ON TABLE
  "PublishRun",
  "BuildRun",
  "LexiconRelease",
  "Job"
TO sylis_lexicon_publisher;

GRANT UPDATE (
  "status",
  "releaseId",
  "importedCounts",
  "validation",
  "completedAt"
) ON TABLE "PublishRun" TO sylis_lexicon_publisher;

GRANT UPDATE (
  "status",
  "validationSummary",
  "validatedAt"
) ON TABLE "LexiconRelease" TO sylis_lexicon_publisher;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sylis_lexicon_publisher;

-- Durable Agent Step, Provider Attempt and Message Block target invariants.
CREATE FUNCTION "sylis_guard_agent_run_step"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_run_id uuid;
  invocation_status text;
BEGIN
  IF NEW."ordinal" < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentRunStep ordinal must be non-negative';
  END IF;
  IF NEW."completedAt" IS NOT NULL AND NEW."completedAt" < NEW."startedAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentRunStep completion cannot precede its start';
  END IF;
  IF NEW.status IN ('COMPLETED', 'FAILED', 'CANCELLED', 'UNKNOWN_OUTCOME')
     AND NEW."completedAt" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal AgentRunStep requires completedAt';
  END IF;
  IF NEW.status IN ('STREAMING', 'TOOL_EXECUTION', 'WAITING')
     AND NEW."completedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'non-terminal AgentRunStep cannot have completedAt';
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(
    NEW.id,
    NEW."runId",
    NEW.ordinal,
    NEW."modelInvocationId",
    NEW."assistantMessageId",
    NEW."startedAt"
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD."runId",
    OLD.ordinal,
    OLD."modelInvocationId",
    OLD."assistantMessageId",
    OLD."startedAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AgentRunStep identity is immutable';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('COMPLETED', 'FAILED', 'CANCELLED', 'UNKNOWN_OUTCOME')
     AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'terminal AgentRunStep is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'STREAMING' AND NEW.status IN (
      'TOOL_EXECUTION', 'COMPLETED', 'FAILED', 'CANCELLED', 'UNKNOWN_OUTCOME'
    )) OR
    (OLD.status = 'TOOL_EXECUTION' AND NEW.status IN (
      'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED', 'UNKNOWN_OUTCOME'
    )) OR
    (OLD.status = 'WAITING' AND NEW.status IN (
      'COMPLETED', 'FAILED', 'CANCELLED', 'UNKNOWN_OUTCOME'
    ))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentRunStep status transition is invalid';
  END IF;

  SELECT target."agentRunId", invocation.status::text
  INTO target_run_id, invocation_status
  FROM "ModelInvocation" invocation
  JOIN "ModelExecutionPermitAgentRunTarget" target
    ON target."permitId" = invocation."permitId"
  WHERE invocation.id = NEW."modelInvocationId";

  IF target_run_id IS NULL OR target_run_id <> NEW."runId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentRunStep invocation target must match its AgentRun';
  END IF;
  IF NEW.status = 'COMPLETED' AND invocation_status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'completed AgentRunStep requires a succeeded ModelInvocation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgentRunStep_binding_guard"
BEFORE INSERT OR UPDATE ON "AgentRunStep"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_agent_run_step"();

CREATE FUNCTION "sylis_assert_agent_run_step_action_shape"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  trigger_row jsonb;
  action_id uuid;
  action_row "AgentRunStepAction"%ROWTYPE;
  action_run_id uuid;
  target_count integer;
BEGIN
  trigger_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  action_id := CASE
    WHEN TG_TABLE_NAME = 'AgentRunStepAction' THEN (trigger_row ->> 'id')::uuid
    WHEN TG_TABLE_NAME = 'AgentToolCall' THEN (trigger_row ->> 'actionId')::uuid
    WHEN TG_TABLE_NAME = 'AgentProposal' THEN (trigger_row ->> 'actionId')::uuid
    WHEN TG_TABLE_NAME = 'AgentArtifactRevision' THEN (trigger_row ->> 'actionId')::uuid
    WHEN TG_TABLE_NAME = 'AgentWaitCondition' THEN (trigger_row ->> 'actionId')::uuid
    WHEN TG_TABLE_NAME = 'AgentRun' THEN (trigger_row ->> 'originActionId')::uuid
    ELSE NULL
  END;
  IF action_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO action_row FROM "AgentRunStepAction" WHERE id = action_id;
  IF action_row.id IS NULL THEN RETURN NULL; END IF;
  IF action_row."modelPosition" < 0
     OR action_row."actionDigest" !~ '^sha256:[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentRunStepAction identity is invalid';
  END IF;
  IF action_row.status = 'PENDING'
     AND (action_row."completedAt" IS NOT NULL OR action_row."errorCode" IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'pending AgentRunStepAction cannot be terminal';
  END IF;
  IF action_row.status <> 'PENDING' AND action_row."completedAt" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal AgentRunStepAction requires completedAt';
  END IF;
  IF action_row.status IN ('FAILED', 'REJECTED', 'UNKNOWN_OUTCOME')
     AND (action_row."errorCode" IS NULL OR btrim(action_row."errorCode") = '') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'failed AgentRunStepAction requires errorCode';
  END IF;
  IF action_row.status IN ('SUCCEEDED', 'WAITING')
     AND action_row."errorCode" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'successful AgentRunStepAction cannot have errorCode';
  END IF;

  SELECT "runId" INTO action_run_id
  FROM "AgentRunStep" WHERE id = action_row."stepId";
  SELECT
    (SELECT count(*) FROM "AgentToolCall" WHERE "actionId" = action_id) +
    (SELECT count(*) FROM "AgentProposal" WHERE "actionId" = action_id) +
    (SELECT count(*) FROM "AgentArtifactRevision" WHERE "actionId" = action_id) +
    (SELECT count(*) FROM "AgentWaitCondition" WHERE "actionId" = action_id) +
    CASE WHEN action_row."memoryCardId" IS NULL THEN 0 ELSE 1 END +
    CASE WHEN EXISTS (SELECT 1 FROM "AgentRun" WHERE "originActionId" = action_id) THEN 1 ELSE 0 END
  INTO target_count;
  IF target_count <> 1
     OR (action_row.kind = 'DOMAIN_TOOL' AND NOT EXISTS (
       SELECT 1 FROM "AgentToolCall" call
       WHERE call."actionId" = action_id
         AND call."stepId" = action_row."stepId"
         AND call."modelPosition" = action_row."modelPosition"
     ))
     OR (action_row.kind = 'PROPOSAL' AND NOT EXISTS (
       SELECT 1 FROM "AgentProposal" proposal
       WHERE proposal."actionId" = action_id AND proposal."runId" = action_run_id
     ))
     OR (action_row.kind = 'ARTIFACT' AND NOT EXISTS (
       SELECT 1
       FROM "AgentArtifactRevision" revision
       JOIN "AgentArtifact" artifact ON artifact.id = revision."artifactId"
       JOIN "AgentRun" run ON run.id = action_run_id
       JOIN "AgentSession" session ON session.id = run."sessionId"
       WHERE revision."actionId" = action_id
         AND artifact."ownerUserId" = session."userId"
     ))
     OR (action_row.kind = 'WAIT' AND NOT EXISTS (
       SELECT 1 FROM "AgentWaitCondition" wait_condition
       WHERE wait_condition."actionId" = action_id
         AND wait_condition."runId" = action_run_id
     ))
     OR (action_row.kind = 'MEMORY' AND NOT EXISTS (
       SELECT 1
       FROM "AgentMemoryCard" memory
       JOIN "AgentRun" run ON run.id = action_run_id
       JOIN "AgentSession" session ON session.id = run."sessionId"
       WHERE memory.id = action_row."memoryCardId"
         AND memory."userId" = session."userId"
         AND action_row."memoryApplied" IS NOT NULL
     ))
     OR (action_row.kind = 'CHILD_RUN' AND NOT EXISTS (
       SELECT 1 FROM "AgentRun" child
       WHERE child."originActionId" = action_id
         AND child."parentRunId" = action_run_id
     )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentRunStepAction typed target does not match its kind or Run';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AgentRunStepAction_shape_guard"
AFTER INSERT OR UPDATE ON "AgentRunStepAction"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_run_step_action_shape"();

CREATE CONSTRAINT TRIGGER "AgentToolCall_action_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentToolCall"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_run_step_action_shape"();

CREATE CONSTRAINT TRIGGER "AgentProposal_action_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentProposal"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_run_step_action_shape"();

CREATE CONSTRAINT TRIGGER "AgentArtifactRevision_action_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentArtifactRevision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_run_step_action_shape"();

CREATE CONSTRAINT TRIGGER "AgentWaitCondition_action_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentWaitCondition"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_run_step_action_shape"();

CREATE CONSTRAINT TRIGGER "AgentRun_origin_action_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentRun"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_run_step_action_shape"();

CREATE FUNCTION "sylis_guard_agent_tool_call_v2"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."modelPosition" < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentToolCall modelPosition must be non-negative';
  END IF;
  IF NEW."providerCallId" IS NOT NULL AND btrim(NEW."providerCallId") = '' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentToolCall providerCallId cannot be empty';
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(
    NEW.id,
    NEW."stepId",
    NEW."actionId",
    NEW."modelPosition",
    NEW."providerCallId",
    NEW."toolKey",
    NEW."schemaVersion",
    NEW."toolReleaseId",
    NEW."inputHash",
    NEW."inputContentBodyId",
    NEW."grantId",
    NEW."sideEffectClass",
    NEW."concurrencyMode",
    NEW."actionDigest",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD."stepId",
    OLD."actionId",
    OLD."modelPosition",
    OLD."providerCallId",
    OLD."toolKey",
    OLD."schemaVersion",
    OLD."toolReleaseId",
    OLD."inputHash",
    OLD."inputContentBodyId",
    OLD."grantId",
    OLD."sideEffectClass",
    OLD."concurrencyMode",
    OLD."actionDigest",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AgentToolCall identity is immutable';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED', 'UNKNOWN_OUTCOME')
     AND NEW IS DISTINCT FROM OLD
     AND NOT (
       (to_jsonb(NEW) - 'resultRef') IS NOT DISTINCT FROM
         (to_jsonb(OLD) - 'resultRef')
       AND (NEW."resultRef" IS NULL OR NEW."resultRef" = 'null'::jsonb)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'terminal AgentToolCall is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'PROPOSED' AND NEW.status IN ('APPROVED', 'REJECTED', 'CANCELLED')) OR
    (OLD.status = 'APPROVED' AND NEW.status IN ('QUEUED', 'REJECTED', 'CANCELLED')) OR
    (OLD.status = 'QUEUED' AND NEW.status IN ('RUNNING', 'CANCELLED')) OR
    (OLD.status = 'RUNNING' AND NEW.status IN (
      'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN_OUTCOME'
    ))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentToolCall status transition is invalid';
  END IF;
  IF (NEW."executorAttemptId" IS NULL) <> (NEW."executorFencingToken" IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentToolCall executor attempt and fencing token must be present together';
  END IF;
  IF (NEW."executorAttemptId" IS NULL) <> (NEW."startedAt" IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentToolCall executor owner and startedAt must be present together';
  END IF;
  IF NEW.status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN_OUTCOME')
     AND NEW."queuedAt" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'queued AgentToolCall lifecycle requires queuedAt';
  END IF;
  IF NEW."startedAt" IS NOT NULL AND (
    NEW."queuedAt" IS NULL OR NEW."startedAt" < NEW."queuedAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentToolCall start time is invalid';
  END IF;
  IF NEW."completedAt" IS NOT NULL AND (
    NEW."completedAt" < NEW."createdAt" OR
    (NEW."startedAt" IS NOT NULL AND NEW."completedAt" < NEW."startedAt")
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentToolCall completion time is invalid';
  END IF;
  IF NEW.status = 'QUEUED' AND (
    NEW."executorAttemptId" IS NOT NULL OR
    NEW."executorFencingToken" IS NOT NULL OR
    NEW."startedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'queued AgentToolCall cannot have an executor owner';
  END IF;
  IF NEW.status = 'RUNNING' AND (
    NEW."executorAttemptId" IS NULL OR
    NEW."executorFencingToken" IS NULL OR
    NEW."startedAt" IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'running AgentToolCall requires an executor owner and startedAt';
  END IF;
  IF NEW."executorAttemptId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "JobAttempt" attempt
    WHERE attempt.id = NEW."executorAttemptId"
      AND attempt."fencingToken" = NEW."executorFencingToken"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentToolCall executor owner does not match a JobAttempt fence';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."executorAttemptId" IS NOT NULL AND (
    NEW."executorAttemptId" IS DISTINCT FROM OLD."executorAttemptId" OR
    NEW."executorFencingToken" IS DISTINCT FROM OLD."executorFencingToken" OR
    NEW."startedAt" IS DISTINCT FROM OLD."startedAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AgentToolCall executor ownership is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."queuedAt" IS NOT NULL
     AND NEW."queuedAt" IS DISTINCT FROM OLD."queuedAt" THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AgentToolCall queue time is immutable';
  END IF;
  IF NEW.status = 'SUCCEEDED' AND NEW."resultRef" IS NULL AND NEW."resultContentBodyId" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'succeeded AgentToolCall requires a result';
  END IF;
  IF NEW.status = 'SUCCEEDED' AND NEW."errorCode" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'succeeded AgentToolCall cannot have an error';
  END IF;
  IF NEW.status IN ('FAILED', 'REJECTED', 'UNKNOWN_OUTCOME')
     AND (NEW."errorCode" IS NULL OR btrim(NEW."errorCode") = '') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'failed AgentToolCall state requires an error code';
  END IF;
  IF NEW.status IN ('PROPOSED', 'APPROVED', 'QUEUED', 'RUNNING') AND (
    NEW."resultRef" IS NOT NULL OR
    NEW."resultContentBodyId" IS NOT NULL OR
    NEW."errorCode" IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'non-terminal AgentToolCall cannot have an outcome';
  END IF;
  IF NEW.status IN ('PROPOSED', 'APPROVED', 'QUEUED', 'RUNNING') AND NEW."completedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'non-terminal AgentToolCall cannot be completed';
  END IF;
  IF NEW.status IN ('SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED', 'UNKNOWN_OUTCOME')
     AND NEW."completedAt" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal AgentToolCall requires completedAt';
  END IF;
  IF NEW.status <> 'SUCCEEDED' AND (
    NEW."resultRef" IS NOT NULL OR NEW."resultContentBodyId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'non-succeeded AgentToolCall cannot have a result';
  END IF;
  IF NEW.status IN ('SUCCEEDED', 'FAILED', 'UNKNOWN_OUTCOME') AND (
    NEW."executorAttemptId" IS NULL OR NEW."startedAt" IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'executed AgentToolCall terminal state requires an executor owner';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgentToolCall_v2_shape_guard"
BEFORE INSERT OR UPDATE ON "AgentToolCall"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_agent_tool_call_v2"();

CREATE FUNCTION "sylis_guard_model_invocation_attempt"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invocation_status text;
  previous_attempt "ModelInvocationAttempt"%ROWTYPE;
BEGIN
  IF NEW.ordinal < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelInvocationAttempt ordinal must be non-negative';
  END IF;
  IF NEW."inputTokens" < 0 OR NEW."outputTokens" < 0 OR NEW."costMicros" < 0 OR
     NEW."acceptedBlockCount" < 0 OR NEW."acceptedFragmentCount" < 0 OR
     NEW."acceptedToolCallCount" < 0 OR NEW."latencyMs" < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelInvocationAttempt counters must be non-negative';
  END IF;
  IF (NEW."acceptedBlockCount" = 0 AND (
    NEW."acceptedFragmentCount" <> 0 OR NEW."acceptedToolCallCount" <> 0
  )) OR NEW."acceptedToolCallCount" > NEW."acceptedBlockCount" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelInvocationAttempt accepted-output counters are inconsistent';
  END IF;
  IF NOT NEW."usageObserved" AND (
    NEW."inputTokens" <> 0 OR NEW."outputTokens" <> 0 OR NEW."costMicros" <> 0
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelInvocationAttempt usage requires an observation';
  END IF;
  IF NEW."providerRequestId" IS NOT NULL AND btrim(NEW."providerRequestId") = '' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelInvocationAttempt providerRequestId cannot be empty';
  END IF;
  IF NEW.status = 'STARTED' AND (
    NEW."completedAt" IS NOT NULL OR NEW."latencyMs" IS NOT NULL OR
    NEW."errorClass" IS NOT NULL OR NEW."retryReason" IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'started ModelInvocationAttempt cannot have terminal fields';
  END IF;
  IF NEW.status <> 'STARTED' AND (
    NEW."completedAt" IS NULL OR NEW."latencyMs" IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal ModelInvocationAttempt requires completion metrics';
  END IF;
  IF NEW."completedAt" IS NOT NULL AND NEW."completedAt" < NEW."startedAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelInvocationAttempt completion cannot precede its start';
  END IF;
  IF NEW.status = 'SUCCEEDED' AND (
    NEW."errorClass" IS NOT NULL OR NEW."retryReason" IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'succeeded ModelInvocationAttempt cannot have an error';
  END IF;
  IF NEW.status IN ('FAILED', 'CANCELLED', 'UNKNOWN_OUTCOME') AND (
    NEW."errorClass" IS NULL OR btrim(NEW."errorClass") = ''
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'failed ModelInvocationAttempt requires an error class';
  END IF;
  IF NEW."retryReason" IS NOT NULL AND (
    NEW.status <> 'FAILED' OR btrim(NEW."retryReason") = '' OR
    NEW."acceptedBlockCount" <> 0 OR NEW."acceptedFragmentCount" <> 0 OR
    NEW."acceptedToolCallCount" <> 0 OR NEW."usageObserved" OR
    NEW."inputTokens" <> 0 OR NEW."outputTokens" <> 0 OR NEW."costMicros" <> 0
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelInvocationAttempt retry reason requires a retry-safe failure';
  END IF;
  IF NEW.status = 'CANCELLED' AND (
    NEW."acceptedBlockCount" <> 0 OR NEW."acceptedFragmentCount" <> 0 OR
    NEW."acceptedToolCallCount" <> 0 OR NEW."usageObserved"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'cancelled ModelInvocationAttempt cannot have accepted output';
  END IF;
  IF NEW.status = 'UNKNOWN_OUTCOME' AND
     NEW."acceptedBlockCount" = 0 AND NOT NEW."usageObserved" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'unknown ModelInvocationAttempt requires accepted output or observed usage';
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(
    NEW.id,
    NEW."invocationId",
    NEW.ordinal,
    NEW."startedAt"
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD."invocationId",
    OLD.ordinal,
    OLD."startedAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ModelInvocationAttempt identity is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'STARTED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'terminal ModelInvocationAttempt is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'STARTED' AND NEW.status NOT IN (
    'STARTED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN_OUTCOME'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelInvocationAttempt status transition is invalid';
  END IF;
  SELECT status::text INTO invocation_status
  FROM "ModelInvocation"
  WHERE id = NEW."invocationId";
  IF invocation_status <> 'RUNNING' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal ModelInvocation cannot accept another attempt';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW."acceptedBlockCount" < OLD."acceptedBlockCount" OR
    NEW."acceptedFragmentCount" < OLD."acceptedFragmentCount" OR
    NEW."acceptedToolCallCount" < OLD."acceptedToolCallCount" OR
    (OLD."usageObserved" AND NOT NEW."usageObserved")
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ModelInvocationAttempt accepted-output counters cannot decrease';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.ordinal > 0 THEN
    SELECT * INTO previous_attempt
    FROM "ModelInvocationAttempt"
    WHERE "invocationId" = NEW."invocationId"
      AND ordinal = NEW.ordinal - 1;
    IF previous_attempt.id IS NULL OR
       previous_attempt.status <> 'FAILED' OR
       previous_attempt."retryReason" IS NULL OR
       previous_attempt."acceptedBlockCount" <> 0 OR
       previous_attempt."acceptedFragmentCount" <> 0 OR
       previous_attempt."acceptedToolCallCount" <> 0 OR
       previous_attempt."usageObserved" OR
       previous_attempt."inputTokens" <> 0 OR
       previous_attempt."outputTokens" <> 0 OR
       previous_attempt."costMicros" <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'only a failed attempt without accepted output may have a successor';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "ModelContentFragment"
      WHERE "invocationId" = NEW."invocationId"
    ) OR EXISTS (
      SELECT 1 FROM "AgentRunStep"
      WHERE "modelInvocationId" = NEW."invocationId"
    ) OR EXISTS (
      SELECT 1
      FROM "AgentRunStep" step
      JOIN "AgentToolCall" call ON call."stepId" = step.id
      WHERE step."modelInvocationId" = NEW."invocationId"
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'partial ModelInvocation output prevents transport retry';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ModelInvocationAttempt_retry_guard"
BEFORE INSERT OR UPDATE ON "ModelInvocationAttempt"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_model_invocation_attempt"();

CREATE FUNCTION "sylis_guard_model_content_fragment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  body_sealed_at timestamptz;
  expected_sequence integer;
BEGIN
  IF NEW."modelPosition" < 0 OR NEW."modelSubPosition" < 0 OR NEW."fragmentSequence" < 0 OR NEW."byteLength" < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelContentFragment positions and byteLength are invalid';
  END IF;
  IF octet_length(NEW.ciphertext) < 1 OR octet_length(NEW.nonce) <> 12
     OR octet_length(NEW."authTag") <> 16 OR octet_length(NEW."encryptedDek") < 1
     OR octet_length(NEW."dekNonce") <> 12 OR octet_length(NEW."dekAuthTag") <> 16
     OR NEW."aadSchemaVersion" <> 'model-content-fragment/1'
     OR NEW."fragmentHash" !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelContentFragment envelope is invalid';
  END IF;
  SELECT "sealedAt" INTO body_sealed_at FROM "ModelContentBody" WHERE id = NEW."bodyId";
  IF body_sealed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'sealed ModelContentBody cannot accept fragments';
  END IF;
  SELECT COALESCE(max("fragmentSequence") + 1, 0) INTO expected_sequence
  FROM "ModelContentFragment"
  WHERE "invocationId" = NEW."invocationId"
    AND "modelPosition" = NEW."modelPosition"
    AND "modelSubPosition" = NEW."modelSubPosition";
  IF NEW."fragmentSequence" <> expected_sequence THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ModelContentFragment sequence must be contiguous';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ModelContentFragment_append_guard"
BEFORE INSERT ON "ModelContentFragment"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_model_content_fragment"();

CREATE FUNCTION "sylis_guard_model_content_fragment_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  body_purged_at timestamptz;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ModelContentFragment is append-only';
  END IF;
  SELECT "purgedAt" INTO body_purged_at
  FROM "ModelContentBody"
  WHERE id = OLD."bodyId";
  IF body_purged_at IS NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW."bodyId" IS DISTINCT FROM OLD."bodyId"
     OR NEW."invocationId" IS DISTINCT FROM OLD."invocationId"
     OR NEW."modelPosition" IS DISTINCT FROM OLD."modelPosition"
     OR NEW."modelSubPosition" IS DISTINCT FROM OLD."modelSubPosition"
     OR NEW."fragmentSequence" IS DISTINCT FROM OLD."fragmentSequence"
     OR NEW."aadSchemaVersion" IS DISTINCT FROM OLD."aadSchemaVersion"
     OR NEW."byteLength" IS DISTINCT FROM OLD."byteLength"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."kekVersion" <> 'purged'
     OR octet_length(NEW.ciphertext) < 1
     OR octet_length(NEW.nonce) <> 12
     OR octet_length(NEW."authTag") <> 16
     OR octet_length(NEW."encryptedDek") < 1
     OR octet_length(NEW."dekNonce") <> 12
     OR octet_length(NEW."dekAuthTag") <> 16
     OR NEW."fragmentHash" !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ModelContentFragment is append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ModelContentFragment_append_only"
BEFORE UPDATE OR DELETE ON "ModelContentFragment"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_model_content_fragment_mutation"();

CREATE FUNCTION "sylis_guard_agent_message_block"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_message_id uuid;
  parent_kind text;
  step_run_id uuid;
  message_run_id uuid;
  block_depth integer;
BEGIN
  IF NEW.position < 0 OR COALESCE(NEW."modelPosition", 0) < 0 OR COALESCE(NEW."modelSubPosition", 0) < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentMessageBlock positions must be non-negative';
  END IF;
  IF (NEW."modelPosition" IS NULL) <> (NEW."modelSubPosition" IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentMessageBlock model position pair must be both present or both absent';
  END IF;
  IF (NEW."stepId" IS NULL) <> (NEW."modelPosition" IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentMessageBlock Step and model position must be present together';
  END IF;
  IF NEW.status = 'STREAMING' AND NEW."sealedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'streaming AgentMessageBlock cannot be sealed';
  END IF;
  IF NEW.status IN ('SEALED', 'INTERRUPTED') AND NEW."sealedAt" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal AgentMessageBlock requires sealedAt';
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(
    NEW.id,
    NEW."messageId",
    NEW."parentBlockId",
    NEW.position,
    NEW."stepId",
    NEW."modelPosition",
    NEW."modelSubPosition",
    NEW.kind,
    NEW."schemaVersion",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD."messageId",
    OLD."parentBlockId",
    OLD.position,
    OLD."stepId",
    OLD."modelPosition",
    OLD."modelSubPosition",
    OLD.kind,
    OLD."schemaVersion",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'AgentMessageBlock identity is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('SEALED', 'INTERRUPTED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'sealed or interrupted AgentMessageBlock is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'STREAMING' AND NEW.status IN ('SEALED', 'INTERRUPTED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentMessageBlock status transition is invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "AgentMessageBlock" sibling
    WHERE sibling."messageId" = NEW."messageId"
      AND sibling."parentBlockId" IS NOT DISTINCT FROM NEW."parentBlockId"
      AND sibling.position = NEW.position
      AND sibling.id <> NEW.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'AgentMessageBlock sibling position must be unique';
  END IF;
  IF NEW."parentBlockId" IS NOT NULL THEN
    SELECT "messageId", kind::text INTO parent_message_id, parent_kind
    FROM "AgentMessageBlock" WHERE id = NEW."parentBlockId";
    IF parent_message_id <> NEW."messageId" OR parent_kind NOT IN ('LIST_ITEM', 'QUOTE', 'CALLOUT') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentMessageBlock parent is invalid';
    END IF;
    WITH RECURSIVE ancestors AS (
      SELECT parent.id, parent."parentBlockId", 1 AS depth
      FROM "AgentMessageBlock" parent WHERE parent.id = NEW."parentBlockId"
      UNION ALL
      SELECT parent.id, parent."parentBlockId", ancestors.depth + 1
      FROM "AgentMessageBlock" parent
      JOIN ancestors ON parent.id = ancestors."parentBlockId"
      WHERE ancestors.depth < 7
    )
    SELECT max(depth) INTO block_depth FROM ancestors;
    IF block_depth >= 6 OR EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentMessageBlock tree is cyclic or too deep';
    END IF;
  END IF;
  IF (SELECT count(*) FROM "AgentMessageBlock" WHERE "messageId" = NEW."messageId" AND id <> NEW.id) >= 256 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentMessageBlock count exceeds limit';
  END IF;
  IF NEW."stepId" IS NOT NULL THEN
    SELECT "runId" INTO step_run_id FROM "AgentRunStep" WHERE id = NEW."stepId";
    SELECT "runId" INTO message_run_id FROM "AgentMessage" WHERE id = NEW."messageId";
    IF message_run_id IS NULL OR step_run_id <> message_run_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentMessageBlock Step and Message must belong to the same Run';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgentMessageBlock_tree_guard"
BEFORE INSERT OR UPDATE ON "AgentMessageBlock"
FOR EACH ROW EXECUTE FUNCTION "sylis_guard_agent_message_block"();

CREATE FUNCTION "sylis_assert_agent_message_block_shape"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  trigger_row jsonb;
  checked_block_id uuid;
  checked_kind text;
  child_count integer;
  reference_count integer;
  content_row "AgentMessageBlockContent"%ROWTYPE;
  reference_row "AgentMessageBlockReference"%ROWTYPE;
  table_row "AgentMessageBlockTable"%ROWTYPE;
  message_id uuid;
BEGIN
  trigger_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  checked_block_id := CASE
    WHEN TG_TABLE_NAME = 'AgentMessageBlock' THEN (trigger_row ->> 'id')::uuid
    WHEN TG_TABLE_NAME = 'AgentMessageBlockTableRow' THEN (trigger_row ->> 'tableId')::uuid
    WHEN TG_TABLE_NAME = 'AgentMessageBlockTableCell' THEN (
      SELECT "tableId" FROM "AgentMessageBlockTableRow"
      WHERE id = (trigger_row ->> 'rowId')::uuid
    )
    ELSE (trigger_row ->> 'blockId')::uuid
  END;
  SELECT kind::text INTO checked_kind FROM "AgentMessageBlock" WHERE id = checked_block_id;
  IF checked_kind IS NULL THEN RETURN NULL; END IF;
  SELECT
    (SELECT count(*) FROM "AgentMessageBlockContent" WHERE "blockId" = checked_block_id) +
    (SELECT count(*) FROM "AgentMessageBlockTable" WHERE "blockId" = checked_block_id) +
    (SELECT count(*) FROM "AgentMessageBlockDivider" WHERE "blockId" = checked_block_id) +
    (SELECT count(*) FROM "AgentMessageBlockReference" WHERE "blockId" = checked_block_id)
  INTO child_count;
  IF child_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AgentMessageBlock requires exactly one typed child';
  END IF;
  IF checked_kind = 'TABLE' THEN
    SELECT * INTO table_row FROM "AgentMessageBlockTable" WHERE "blockId" = checked_block_id;
    IF table_row."blockId" IS NULL OR table_row."rowCount" < 1 OR table_row."rowCount" > 50
       OR table_row."columnCount" < 1 OR table_row."columnCount" > 12
       OR (SELECT count(*) FROM "AgentMessageBlockTableRow" WHERE "tableId" = checked_block_id) <> table_row."rowCount"
       OR EXISTS (
         SELECT 1 FROM "AgentMessageBlockTableRow" table_payload_row
         WHERE table_payload_row."tableId" = checked_block_id
           AND (SELECT count(*) FROM "AgentMessageBlockTableCell" WHERE "rowId" = table_payload_row.id) <> table_row."columnCount"
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TABLE Block payload shape is invalid';
    END IF;
  ELSIF checked_kind IN ('TOOL_CALL', 'ARTIFACT', 'PROPOSAL', 'PLAN', 'WAIT_CONDITION', 'ASSET', 'NOTICE') THEN
    SELECT * INTO reference_row FROM "AgentMessageBlockReference" WHERE "blockId" = checked_block_id;
    reference_count := num_nonnulls(reference_row."toolCallId", reference_row."artifactRevisionId", reference_row."proposalId", reference_row."planRevisionId", reference_row."waitConditionId", reference_row."assetRevisionId", reference_row."noticeKind");
    IF reference_row."blockId" IS NULL OR reference_count <> 1
       OR (checked_kind = 'TOOL_CALL' AND reference_row."toolCallId" IS NULL)
       OR (checked_kind = 'ARTIFACT' AND reference_row."artifactRevisionId" IS NULL)
       OR (checked_kind = 'PROPOSAL' AND reference_row."proposalId" IS NULL)
       OR (checked_kind = 'PLAN' AND reference_row."planRevisionId" IS NULL)
       OR (checked_kind = 'WAIT_CONDITION' AND reference_row."waitConditionId" IS NULL)
       OR (checked_kind = 'ASSET' AND reference_row."assetRevisionId" IS NULL)
       OR (checked_kind = 'NOTICE' AND (reference_row."noticeKind" IS NULL OR reference_row."noticeCode" IS NULL OR btrim(reference_row."noticeCode") = ''))
       OR (checked_kind <> 'NOTICE' AND reference_row."noticeCode" IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reference Block typed target does not match its kind';
    END IF;
    IF (checked_kind = 'TOOL_CALL' AND NOT EXISTS (
         SELECT 1 FROM "AgentMessageBlock" block
         JOIN "AgentToolCall" call ON call.id = reference_row."toolCallId"
         WHERE block.id = checked_block_id AND call."stepId" = block."stepId"
       )) OR (checked_kind = 'ARTIFACT' AND NOT EXISTS (
         SELECT 1 FROM "AgentMessageBlock" block
         JOIN "AgentMessage" message ON message.id = block."messageId"
         JOIN "AgentSession" session ON session.id = message."sessionId"
         JOIN "AgentArtifactRevision" revision ON revision.id = reference_row."artifactRevisionId"
         JOIN "AgentArtifact" artifact ON artifact.id = revision."artifactId"
         WHERE block.id = checked_block_id AND artifact."ownerUserId" = session."userId"
       )) OR (checked_kind = 'PROPOSAL' AND NOT EXISTS (
         SELECT 1 FROM "AgentMessageBlock" block
         JOIN "AgentMessage" message ON message.id = block."messageId"
         JOIN "AgentProposal" proposal ON proposal.id = reference_row."proposalId"
         WHERE block.id = checked_block_id AND proposal."runId" = message."runId"
       )) OR (checked_kind = 'PLAN' AND NOT EXISTS (
         SELECT 1 FROM "AgentMessageBlock" block
         JOIN "AgentMessage" message ON message.id = block."messageId"
         JOIN "AgentPlanRevision" revision ON revision.id = reference_row."planRevisionId"
         JOIN "AgentPlan" plan ON plan.id = revision."planId"
         WHERE block.id = checked_block_id AND plan."runId" = message."runId"
       )) OR (checked_kind = 'WAIT_CONDITION' AND NOT EXISTS (
         SELECT 1 FROM "AgentMessageBlock" block
         JOIN "AgentMessage" message ON message.id = block."messageId"
         JOIN "AgentWaitCondition" wait_condition ON wait_condition.id = reference_row."waitConditionId"
         WHERE block.id = checked_block_id AND wait_condition."runId" = message."runId"
       )) OR (checked_kind = 'ASSET' AND NOT EXISTS (
         SELECT 1 FROM "AgentMessageBlock" block
         JOIN "AgentMessage" message ON message.id = block."messageId"
         JOIN "AgentSession" session ON session.id = message."sessionId"
         JOIN "ContentAssetRevision" revision ON revision.id = reference_row."assetRevisionId"
         JOIN "ContentAsset" asset ON asset.id = revision."assetId"
         WHERE block.id = checked_block_id AND asset."ownerUserId" = session."userId"
       )) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reference Block target must belong to its Step, Run, or Session owner';
    END IF;
  ELSIF checked_kind = 'DIVIDER' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "AgentMessageBlockDivider" WHERE "blockId" = checked_block_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIVIDER Block payload is missing';
    END IF;
  ELSE
    SELECT * INTO content_row FROM "AgentMessageBlockContent" WHERE "blockId" = checked_block_id;
    IF content_row."blockId" IS NULL
       OR content_row."contentBodyId" IS NULL
       OR (checked_kind = 'HEADING' AND content_row."headingLevel" IS NULL)
       OR (checked_kind <> 'HEADING' AND content_row."headingLevel" IS NOT NULL)
       OR (checked_kind = 'LIST_ITEM' AND content_row."listStyle" IS NULL)
       OR (checked_kind <> 'LIST_ITEM' AND content_row."listStyle" IS NOT NULL)
       OR (checked_kind <> 'CODE' AND content_row.language IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'document Block typed payload does not match its kind';
    END IF;
  END IF;
  SELECT "messageId" INTO message_id FROM "AgentMessageBlock" WHERE id = checked_block_id;
  IF NOT EXISTS (
    SELECT 1 FROM "AgentMessageBlock" WHERE "messageId" = message_id AND status = 'STREAMING'
  ) AND EXISTS (
    SELECT 1
    FROM (
      SELECT "parentBlockId", min(position) AS first_position, max(position) AS last_position, count(*) AS block_count
      FROM "AgentMessageBlock" WHERE "messageId" = message_id
      GROUP BY "parentBlockId"
    ) siblings
    WHERE siblings.first_position <> 0 OR siblings.last_position <> siblings.block_count - 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'terminal AgentMessageBlock sibling positions must be contiguous';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION "sylis_reject_sealed_agent_message_block_child_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  trigger_row jsonb;
  checked_block_id uuid;
  block_status text;
BEGIN
  trigger_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  checked_block_id := CASE
    WHEN TG_TABLE_NAME IN ('AgentMessageBlockTableRow') THEN (SELECT "tableId" FROM "AgentMessageBlockTableRow" WHERE id = (trigger_row ->> 'id')::uuid)
    WHEN TG_TABLE_NAME IN ('AgentMessageBlockTableCell') THEN (
      SELECT table_payload_row."tableId" FROM "AgentMessageBlockTableCell" cell
      JOIN "AgentMessageBlockTableRow" table_payload_row ON table_payload_row.id = cell."rowId"
      WHERE cell.id = (trigger_row ->> 'id')::uuid
    )
    ELSE (trigger_row ->> 'blockId')::uuid
  END;
  SELECT status::text INTO block_status FROM "AgentMessageBlock" WHERE id = checked_block_id;
  IF block_status IN ('SEALED', 'INTERRUPTED') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'sealed or interrupted AgentMessageBlock payload is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE CONSTRAINT TRIGGER "AgentMessageBlock_shape_guard"
AFTER INSERT OR UPDATE ON "AgentMessageBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_message_block_shape"();

CREATE CONSTRAINT TRIGGER "AgentMessageBlockContent_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentMessageBlockContent"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_message_block_shape"();

CREATE CONSTRAINT TRIGGER "AgentMessageBlockTable_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentMessageBlockTable"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_message_block_shape"();

CREATE CONSTRAINT TRIGGER "AgentMessageBlockTableRow_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentMessageBlockTableRow"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_message_block_shape"();

CREATE CONSTRAINT TRIGGER "AgentMessageBlockTableCell_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentMessageBlockTableCell"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_message_block_shape"();

CREATE CONSTRAINT TRIGGER "AgentMessageBlockDivider_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentMessageBlockDivider"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_message_block_shape"();

CREATE CONSTRAINT TRIGGER "AgentMessageBlockReference_shape_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgentMessageBlockReference"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "sylis_assert_agent_message_block_shape"();

CREATE TRIGGER "AgentMessageBlockContent_immutable_guard"
BEFORE UPDATE OR DELETE ON "AgentMessageBlockContent"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_sealed_agent_message_block_child_mutation"();

CREATE TRIGGER "AgentMessageBlockTable_immutable_guard"
BEFORE UPDATE OR DELETE ON "AgentMessageBlockTable"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_sealed_agent_message_block_child_mutation"();

CREATE TRIGGER "AgentMessageBlockTableRow_immutable_guard"
BEFORE UPDATE OR DELETE ON "AgentMessageBlockTableRow"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_sealed_agent_message_block_child_mutation"();

CREATE TRIGGER "AgentMessageBlockTableCell_immutable_guard"
BEFORE UPDATE OR DELETE ON "AgentMessageBlockTableCell"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_sealed_agent_message_block_child_mutation"();

CREATE TRIGGER "AgentMessageBlockDivider_immutable_guard"
BEFORE UPDATE OR DELETE ON "AgentMessageBlockDivider"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_sealed_agent_message_block_child_mutation"();

CREATE TRIGGER "AgentMessageBlockReference_immutable_guard"
BEFORE UPDATE OR DELETE ON "AgentMessageBlockReference"
FOR EACH ROW EXECUTE FUNCTION "sylis_reject_sealed_agent_message_block_child_mutation"();

GRANT INSERT, UPDATE, DELETE ON TABLE
  "AgentRunStep",
  "AgentRunStepAction",
  "AgentMessageBlock",
  "AgentMessageBlockContent",
  "AgentMessageBlockTable",
  "AgentMessageBlockTableRow",
  "AgentMessageBlockTableCell",
  "AgentMessageBlockDivider",
  "AgentMessageBlockReference"
TO sylis_agent_api;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "ModelInvocationAttempt",
  "ModelContentFragment"
TO sylis_model_gateway;
