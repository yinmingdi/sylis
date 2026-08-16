import { VerificationChallengePurpose } from "@sylis/database";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const base64url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64url");

export const randomToken = (): string => base64url(randomBytes(32));

export const keyedHash = (value: string, key: string): string =>
  createHmac("sha256", key).update(value).digest("hex");

export const plainHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const csrfToken = (sessionId: string, key: string): string =>
  base64url(createHmac("sha256", key).update(`csrf:${sessionId}`).digest());

export function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function signedVerificationToken(
  email: string,
  purpose: VerificationChallengePurpose,
  key: string,
  expiresAt: Date,
): string {
  const payload = base64url(
    Buffer.from(
      JSON.stringify({
        email,
        purpose,
        exp: expiresAt.getTime(),
        nonce: randomToken(),
      }),
    ),
  );
  const signature = base64url(
    createHmac("sha256", key).update(payload).digest(),
  );
  return `${payload}.${signature}`;
}

export function parseVerificationToken(
  token: string,
  purpose: VerificationChallengePurpose,
  key: string,
): { email: string; purpose: VerificationChallengePurpose; exp: number } {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("VERIFICATION_TOKEN_INVALID");
  const expected = base64url(
    createHmac("sha256", key).update(payload).digest(),
  );
  if (!safeEqual(signature, expected))
    throw new Error("VERIFICATION_TOKEN_INVALID");
  const value = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as {
    email?: unknown;
    purpose?: unknown;
    exp?: unknown;
  };
  if (
    typeof value.email !== "string" ||
    value.purpose !== purpose ||
    typeof value.exp !== "number" ||
    value.exp <= Date.now()
  ) {
    throw new Error("VERIFICATION_TOKEN_INVALID");
  }
  return { email: value.email, purpose, exp: value.exp };
}
