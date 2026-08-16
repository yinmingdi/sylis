import { createHmac } from "node:crypto";

import { MfaCredentialKind, type OperatorRole } from "@sylis/database";
import {
  expect,
  type APIRequestContext,
  type PlaywrightWorkerArgs,
} from "@playwright/test";

import {
  e2eOperatorCredentials,
  e2ePorts,
  e2eRoleOperatorCredentials,
  type E2eOperatorCredentials,
} from "../runtime";
import { E2eResourceKind, type E2eNamespace } from "./namespace";

export interface ApiLearnerFixture {
  email: string;
  password: string;
  storageStatePath: string;
}

export interface ApiOperatorFixture extends E2eOperatorCredentials {
  storageStatePath: string;
}

export type E2eStorageState = Awaited<
  ReturnType<APIRequestContext["storageState"]>
>;
type E2ePlaywright = PlaywrightWorkerArgs["playwright"];

export async function createLearnerStorageState(input: {
  playwright: E2ePlaywright;
  namespace: E2eNamespace;
  storageStatePath: string;
}): Promise<ApiLearnerFixture> {
  const request = await input.playwright.request.newContext({
    baseURL: `http://127.0.0.1:${e2ePorts().web}`,
  });
  try {
    const email = input.namespace.email(E2eResourceKind.LEARNER);
    const password = `Sylis-e2e-${input.namespace.value}-Aa1!`;
    const challenge = await request.post(
      "/api/v1/auth/registration-challenges",
      { data: { email } },
    );
    expect(challenge.ok()).toBeTruthy();
    const token = await deliveredVerificationToken(email);
    const registration = await request.post("/api/v1/auth/register", {
      data: {
        token,
        displayName: `E2E learner ${input.namespace.value}`,
        password,
        timezone: "Asia/Shanghai",
      },
    });
    expect(
      registration.ok() || registration.status() === 409,
      `registration failed with status ${registration.status()}`,
    ).toBeTruthy();
    if (registration.status() === 409) {
      const session = await request.post("/api/v1/auth/sessions", {
        data: { email, password },
      });
      expect(
        session.ok(),
        `learner login failed with status ${session.status()}`,
      ).toBeTruthy();
    }
    await request.storageState({ path: input.storageStatePath });
    return { email, password, storageStatePath: input.storageStatePath };
  } finally {
    await request.dispose();
  }
}

export async function createOperatorStorageState(input: {
  playwright: E2ePlaywright;
  storageStatePath: string;
  workerIndex: number;
  role?: OperatorRole;
}): Promise<ApiOperatorFixture> {
  const credentials = input.role
    ? e2eRoleOperatorCredentials(input.role)
    : e2eOperatorCredentials(input.workerIndex);
  const request = await input.playwright.request.newContext({
    baseURL: `http://127.0.0.1:${e2ePorts().admin}`,
  });
  try {
    await authenticateOperator(request, credentials);
    await request.storageState({ path: input.storageStatePath });
    return { ...credentials, storageStatePath: input.storageStatePath };
  } finally {
    await request.dispose();
  }
}

export async function learnerSessionStorageState(
  playwright: E2ePlaywright,
  account: ApiLearnerFixture,
): Promise<E2eStorageState> {
  const request = await playwright.request.newContext({
    baseURL: `http://127.0.0.1:${e2ePorts().web}`,
  });
  try {
    const session = await request.post("/api/v1/auth/sessions", {
      data: { email: account.email, password: account.password },
    });
    expect(session.ok()).toBeTruthy();
    return await request.storageState();
  } finally {
    await request.dispose();
  }
}

export async function operatorSessionStorageState(
  playwright: E2ePlaywright,
  account: ApiOperatorFixture,
): Promise<E2eStorageState> {
  const request = await playwright.request.newContext({
    baseURL: `http://127.0.0.1:${e2ePorts().admin}`,
  });
  try {
    await authenticateOperator(request, account);
    return await request.storageState();
  } finally {
    await request.dispose();
  }
}

async function authenticateOperator(
  request: APIRequestContext,
  credentials: E2eOperatorCredentials,
): Promise<void> {
  const challenge = await request.post("/api/admin/v1/auth/challenges", {
    data: { email: credentials.email, password: credentials.password },
  });
  expect(challenge.ok()).toBeTruthy();
  const challengeBody = (await challenge.json()) as {
    challengeToken?: unknown;
  };
  if (typeof challengeBody.challengeToken !== "string") {
    throw new Error("E2E_OPERATOR_CHALLENGE_TOKEN_MISSING");
  }
  const session = await request.post("/api/admin/v1/auth/sessions", {
    data: {
      challengeToken: challengeBody.challengeToken,
      method: MfaCredentialKind.TOTP,
      code: totp(credentials.totpSecret),
    },
  });
  expect(session.ok()).toBeTruthy();
}

export async function deliveredVerificationToken(
  email: string,
): Promise<string> {
  const mailpit = `http://127.0.0.1:${e2ePorts().mailpit}`;
  const query = new URLSearchParams({ query: `to:"${email}"` });
  let body = "";
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${mailpit}/view/latest.txt?${query.toString()}`,
        );
        body = response.ok ? await response.text() : "";
        return response.status;
      },
      { timeout: 20_000 },
    )
    .toBe(200);
  const match = /[?&]token=([^\s&]+)/.exec(body);
  if (!match?.[1]) throw new Error("E2E_VERIFICATION_TOKEN_NOT_FOUND");
  return decodeURIComponent(match[1]);
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
    if (index < 0) throw new Error("E2E_TOTP_SECRET_INVALID");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}
