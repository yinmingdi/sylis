import { describe, expect, it } from "vitest";

import { createContentCrypto, type EncryptionContext } from "../src";

const context: EncryptionContext = {
  ownerKind: "USER",
  ownerId: "user-1",
  purpose: "MODEL_CONTENT",
  recordId: "body-1",
  schemaVersion: "1",
};

describe("content crypto", () => {
  it("encrypts with a per-record DEK and rewraps without changing ciphertext", async () => {
    const keyring = new Map([
      ["v1", Buffer.alloc(32, 1)],
      ["v2", Buffer.alloc(32, 2)],
    ]);
    let current = "v1";
    const crypto = createContentCrypto({
      currentVersion: () => current,
      key: (version) => keyring.get(version)!,
    });
    const encrypted = await crypto.encrypt(Buffer.from("private"), context);
    current = "v2";
    const rewrapped = await crypto.rewrap(encrypted, context);
    expect(rewrapped.ciphertext).toBe(encrypted.ciphertext);
    expect(rewrapped.kekVersion).toBe("v2");
    expect(
      Buffer.from(await crypto.decrypt(rewrapped, context)).toString(),
    ).toBe("private");
  });

  it("binds ciphertext to the exact owner context", async () => {
    const crypto = createContentCrypto({
      currentVersion: () => "v1",
      key: () => Buffer.alloc(32, 1),
    });
    const encrypted = await crypto.encrypt(Buffer.from("private"), context);
    await expect(
      crypto.decrypt(encrypted, { ...context, ownerId: "user-2" }),
    ).rejects.toThrow();
  });
});
