import { seedAuditRetentionPolicies } from "./seed-audit-retention-policies";
import { seedCredentialedAccount } from "./seed-credentialed-account";
import { seedDeploymentSyntheticLexicon } from "./seed-deployment-synthetic-lexicon";
import { OperatorRole, type SylisDatabase } from "../client/prisma-client";

export enum DeploymentSyntheticVariable {
  USER_EMAIL = "SYLIS_SYNTHETIC_USER_EMAIL",
  USER_PASSWORD = "SYLIS_SYNTHETIC_USER_PASSWORD",
  ADMIN_EMAIL = "SYLIS_SYNTHETIC_ADMIN_EMAIL",
  ADMIN_PASSWORD = "SYLIS_SYNTHETIC_ADMIN_PASSWORD",
  ADMIN_TOTP_SECRET = "SYLIS_SYNTHETIC_ADMIN_TOTP_SECRET",
}

interface DeploymentSyntheticConfig {
  userEmail: string;
  userPassword: string;
  adminEmail: string;
  adminPassword: string;
  adminTotpSecret: string;
  contentEncryptionKey: Uint8Array;
  contentEncryptionKeyVersion: string;
}

export async function seedDeploymentSyntheticData(
  database: SylisDatabase,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  learnerUserId: string;
  operatorUserId: string;
  lexiconReleaseId: string;
} | null> {
  const config = deploymentSyntheticConfig(env);
  if (!config) return null;

  const learner = await seedCredentialedAccount({
    database,
    namespace: "deployment-synthetic-learner",
    email: config.userEmail,
    password: config.userPassword,
    displayName: "Sylis Synthetic Learner",
  });
  const operator = await seedCredentialedAccount({
    database,
    namespace: "deployment-synthetic-operator",
    email: config.adminEmail,
    password: config.adminPassword,
    displayName: "Sylis Synthetic Operator",
    roles: Object.values(OperatorRole),
    totp: {
      secret: config.adminTotpSecret,
      contentEncryptionKey: config.contentEncryptionKey,
      contentEncryptionKeyVersion: config.contentEncryptionKeyVersion,
    },
    bootstrap: {
      policyVersion: "deployment-synthetic-lexicon-activation/1",
      requiredRole: OperatorRole.RELEASE_MANAGER,
    },
  });
  await seedAuditRetentionPolicies(database, operator.userId, new Date());
  const lexicon = await seedDeploymentSyntheticLexicon(
    database,
    env.SYLIS_COMMIT_SHA?.trim(),
  );
  return {
    learnerUserId: learner.userId,
    operatorUserId: operator.userId,
    lexiconReleaseId: lexicon.releaseId,
  };
}

function deploymentSyntheticConfig(
  env: NodeJS.ProcessEnv,
): DeploymentSyntheticConfig | null {
  const values = Object.values(DeploymentSyntheticVariable).map(
    (name) => [name, env[name]?.trim() || ""] as const,
  );
  if (values.every(([, value]) => !value)) return null;
  const missing = values.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `DEPLOYMENT_SYNTHETIC_CONFIG_REQUIRED:${missing.join(",")}`,
    );
  }

  const activeVersion = env.CONTENT_ENCRYPTION_ACTIVE_KEY_VERSION?.trim();
  const encodedKeys = env.CONTENT_ENCRYPTION_KEYS_JSON?.trim();
  if (!activeVersion || !encodedKeys) {
    throw new Error("DEPLOYMENT_SYNTHETIC_CONTENT_KEY_CONFIG_REQUIRED");
  }
  let keys: Record<string, unknown>;
  try {
    keys = JSON.parse(encodedKeys) as Record<string, unknown>;
  } catch {
    throw new Error("DEPLOYMENT_SYNTHETIC_CONTENT_KEYS_INVALID");
  }
  const encodedKey = keys[activeVersion];
  if (typeof encodedKey !== "string") {
    throw new Error("DEPLOYMENT_SYNTHETIC_ACTIVE_CONTENT_KEY_NOT_FOUND");
  }
  const contentEncryptionKey = Buffer.from(encodedKey, "base64");
  if (contentEncryptionKey.byteLength !== 32) {
    throw new Error("DEPLOYMENT_SYNTHETIC_CONTENT_KEY_INVALID");
  }

  const value = Object.fromEntries(values) as Record<
    DeploymentSyntheticVariable,
    string
  >;
  return {
    userEmail: value[DeploymentSyntheticVariable.USER_EMAIL],
    userPassword: value[DeploymentSyntheticVariable.USER_PASSWORD],
    adminEmail: value[DeploymentSyntheticVariable.ADMIN_EMAIL],
    adminPassword: value[DeploymentSyntheticVariable.ADMIN_PASSWORD],
    adminTotpSecret: value[DeploymentSyntheticVariable.ADMIN_TOTP_SECRET],
    contentEncryptionKey,
    contentEncryptionKeyVersion: activeVersion,
  };
}
