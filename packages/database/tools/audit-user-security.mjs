import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Prisma } = require("@prisma/client");

const allowedDeletePolicies = new Set(["Cascade", "Restrict"]);
const expectedAuthenticationStorage = new Map([
  [
    "PasswordCredential",
    new Map([
      ["hash", ["scalar", "String"]],
      ["algorithm", ["enum", "PasswordHashAlgorithm"]],
    ]),
  ],
  [
    "VerificationChallenge",
    new Map([
      ["destinationHash", ["scalar", "String"]],
      ["codeHash", ["scalar", "String"]],
    ]),
  ],
  [
    "AuthenticationChallenge",
    new Map([["deviceNonceHash", ["scalar", "String"]]]),
  ],
  [
    "TotpCredential",
    new Map([
      ["secretCiphertext", ["scalar", "Bytes"]],
      ["keyVersion", ["scalar", "String"]],
      ["algorithm", ["enum", "TotpAlgorithm"]],
    ]),
  ],
  [
    "MfaRecoveryCode",
    new Map([
      ["codeHash", ["scalar", "String"]],
      ["algorithm", ["enum", "PasswordHashAlgorithm"]],
    ]),
  ],
  [
    "AuthSession",
    new Map([
      ["tokenHash", ["scalar", "String"]],
      ["csrfTokenHash", ["scalar", "String"]],
      ["ipHash", ["scalar", "String"]],
      ["userAgentHash", ["scalar", "String"]],
    ]),
  ],
]);
const allowedSensitiveFields = new Map(
  [...expectedAuthenticationStorage].map(([model, fields]) => [
    model,
    new Set(fields.keys()),
  ]),
);
allowedSensitiveFields.set("WebAuthnCredential", new Set());
allowedSensitiveFields.set("MfaCredential", new Set());

const failures = [];
let userReferenceCount = 0;
for (const model of Prisma.dmmf.datamodel.models) {
  if (["Account", "Profile", "UserProfile"].includes(model.name)) {
    failures.push(`${model.name}:DUPLICATE_USER_IDENTITY_MODEL`);
  }
  for (const relation of model.fields) {
    if (
      relation.kind === "object" &&
      relation.type === "User" &&
      relation.relationFromFields?.length > 0 &&
      !allowedDeletePolicies.has(relation.relationOnDelete)
    ) {
      failures.push(
        `${model.name}.${relation.name}:DELETE_POLICY_NOT_EXPLICIT`,
      );
    }
  }
  for (const field of model.fields) {
    if (["accountId", "userProfileId"].includes(field.name)) {
      failures.push(
        `${model.name}.${field.name}:DUPLICATE_USER_IDENTITY_FIELD`,
      );
    }
    if (
      field.kind !== "scalar" ||
      (field.name !== "userId" && !field.name.endsWith("UserId"))
    ) {
      continue;
    }
    userReferenceCount += 1;
    const relation = model.fields.find(
      (candidate) =>
        candidate.kind === "object" &&
        candidate.type === "User" &&
        candidate.relationFromFields?.includes(field.name),
    );
    if (!relation) {
      failures.push(`${model.name}.${field.name}:USER_RELATION_MISSING`);
      continue;
    }
    if (!allowedDeletePolicies.has(relation.relationOnDelete)) {
      failures.push(
        `${model.name}.${relation.name}:DELETE_POLICY_NOT_EXPLICIT`,
      );
    }
  }

  const allowed = allowedSensitiveFields.get(model.name);
  if (!allowed) continue;
  for (const field of model.fields) {
    if (
      field.kind !== "object" &&
      ["String", "Bytes", "Json"].includes(field.type) &&
      /(password|token|secret|code|nonce|ip|userAgent)/i.test(field.name) &&
      !allowed.has(field.name)
    ) {
      failures.push(`${model.name}.${field.name}:PLAINTEXT_SENSITIVE_FIELD`);
    }
  }
}

for (const [modelName, fields] of expectedAuthenticationStorage) {
  const model = Prisma.dmmf.datamodel.models.find(
    (candidate) => candidate.name === modelName,
  );
  if (!model) {
    failures.push(`${modelName}:MODEL_MISSING`);
    continue;
  }
  for (const [fieldName, [expectedKind, expectedType]] of fields) {
    const field = model.fields.find(
      (candidate) => candidate.name === fieldName,
    );
    if (!field || field.kind !== expectedKind || field.type !== expectedType) {
      failures.push(`${modelName}.${fieldName}:SECURE_STORAGE_SHAPE_INVALID`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`USER_SECURITY_AUDIT_FAILED\n${failures.join("\n")}`);
}

process.stdout.write(
  `user security audit passed userReferences=${userReferenceCount} authenticationModels=${allowedSensitiveFields.size}\n`,
);
