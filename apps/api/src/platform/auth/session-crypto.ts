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

export function signedRegistrationToken(
  email: string,
  key: string,
  expiresAt: Date,
): string {
  const payload = base64url(
    Buffer.from(
      JSON.stringify({ email, exp: expiresAt.getTime(), nonce: randomToken() }),
    ),
  );
  const signature = base64url(
    createHmac("sha256", key).update(payload).digest(),
  );
  return `${payload}.${signature}`;
}

export function parseRegistrationToken(
  token: string,
  key: string,
): { email: string; exp: number } {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("REGISTRATION_TOKEN_INVALID");
  const expected = base64url(
    createHmac("sha256", key).update(payload).digest(),
  );
  if (!safeEqual(signature, expected))
    throw new Error("REGISTRATION_TOKEN_INVALID");
  const value = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as {
    email?: unknown;
    exp?: unknown;
  };
  if (
    typeof value.email !== "string" ||
    typeof value.exp !== "number" ||
    value.exp <= Date.now()
  ) {
    throw new Error("REGISTRATION_TOKEN_INVALID");
  }
  return { email: value.email, exp: value.exp };
}
