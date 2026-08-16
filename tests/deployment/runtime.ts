import { createHmac } from "node:crypto";

export enum DeploymentTestTag {
  BROWSER = "BROWSER",
  DEPLOYMENT = "DEPLOYMENT",
  NIGHTLY = "NIGHTLY",
}

export enum DeploymentProjectKind {
  WEB_SHELL = "deployment:web",
  ADMIN_SHELL = "deployment:admin",
  WEB_AUTHENTICATED = "deployment:web-authenticated",
  ADMIN_AUTHENTICATED = "deployment:admin-authenticated",
  NOTEBOOK_SCHEDULED = "deployment:notebook-scheduled",
}

export enum DeploymentEnvironmentVariable {
  USER_EMAIL = "SYLIS_SYNTHETIC_USER_EMAIL",
  USER_PASSWORD = "SYLIS_SYNTHETIC_USER_PASSWORD",
  ADMIN_EMAIL = "SYLIS_SYNTHETIC_ADMIN_EMAIL",
  ADMIN_PASSWORD = "SYLIS_SYNTHETIC_ADMIN_PASSWORD",
  ADMIN_TOTP_SECRET = "SYLIS_SYNTHETIC_ADMIN_TOTP_SECRET",
  EXPECTED_VERSION = "SYLIS_EXPECTED_VERSION",
  EXPECTED_COMMIT_SHA = "SYLIS_EXPECTED_COMMIT_SHA",
  RESOURCE_PREFIX = "SYLIS_SYNTHETIC_RESOURCE_PREFIX",
}

export { DeploymentTestTag as TestTag };

export function deploymentTags(
  ...tags: readonly DeploymentTestTag[]
): string[] {
  return tags.map((tag) => `@${tag}`);
}

export function requiredDeploymentEnvironment(
  name: DeploymentEnvironmentVariable,
): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

export function syntheticResourcePrefix(): string {
  return (
    process.env[DeploymentEnvironmentVariable.RESOURCE_PREFIX]?.trim() ||
    "[sylis-synthetic]"
  );
}

export function totp(secret: string, now = Date.now()): string {
  const counter = Math.floor(now / 30_000);
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret))
    .update(bytes)
    .digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

function base32Decode(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("SYLIS_SYNTHETIC_TOTP_SECRET_INVALID");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}
