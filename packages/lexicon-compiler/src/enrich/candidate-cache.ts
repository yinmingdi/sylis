import type { StructuredGenerationResult } from "@sylis/ai-provider/contracts";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface CandidateCache {
  get<T>(candidateKey: string): Promise<StructuredGenerationResult<T> | null>;
  set<T>(
    candidateKey: string,
    value: StructuredGenerationResult<T>,
  ): Promise<void>;
}

export class MemoryCandidateCache implements CandidateCache {
  private readonly values = new Map<string, StructuredGenerationResult>();

  async get<T>(
    candidateKey: string,
  ): Promise<StructuredGenerationResult<T> | null> {
    return (
      (this.values.get(candidateKey) as StructuredGenerationResult<T>) ?? null
    );
  }

  async set<T>(
    candidateKey: string,
    value: StructuredGenerationResult<T>,
  ): Promise<void> {
    this.values.set(candidateKey, value);
  }
}

interface EncryptedValue {
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface CacheEnvelope {
  version: "sylis.ai-cache/1";
  values: Record<string, EncryptedValue>;
}

function decodeEncryptionKey(value: string): Buffer {
  const encoding = /^[a-f0-9]{64}$/i.test(value) ? "hex" : "base64";
  const key = Buffer.from(value, encoding);
  if (key.length !== 32) {
    throw new Error("LEXICON_AI_CACHE_KEY must encode exactly 32 bytes.");
  }
  return key;
}

export class EncryptedFileCandidateCache implements CandidateCache {
  private envelope: CacheEnvelope | undefined;
  private readonly key: Buffer;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    encryptionKey: string,
  ) {
    this.key = decodeEncryptionKey(encryptionKey);
  }

  private async load(): Promise<CacheEnvelope> {
    if (this.envelope) return this.envelope;
    try {
      const parsed = JSON.parse(
        await readFile(this.path, "utf8"),
      ) as CacheEnvelope;
      if (
        parsed.version !== "sylis.ai-cache/1" ||
        typeof parsed.values !== "object"
      ) {
        throw new Error("AI_CACHE_FORMAT_INVALID");
      }
      this.envelope = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.envelope = { version: "sylis.ai-cache/1", values: {} };
    }
    return this.envelope;
  }

  async get<T>(
    candidateKey: string,
  ): Promise<StructuredGenerationResult<T> | null> {
    const value = (await this.load()).values[candidateKey];
    if (!value) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(value.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(candidateKey));
    decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(
      plaintext.toString("utf8"),
    ) as StructuredGenerationResult<T>;
  }

  async set<T>(
    candidateKey: string,
    value: StructuredGenerationResult<T>,
  ): Promise<void> {
    const write = this.writeTail.then(async () => {
      const envelope = await this.load();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.key, iv);
      cipher.setAAD(Buffer.from(candidateKey));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final(),
      ]);
      envelope.values[candidateKey] = {
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      };
      await mkdir(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(envelope)}\n`, {
        mode: 0o600,
      });
      await rename(temporaryPath, this.path);
    });
    this.writeTail = write.catch(() => undefined);
    await write;
  }
}

export function createEncryptedCandidateCacheFromEnv(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): EncryptedFileCandidateCache {
  const key = env.LEXICON_AI_CACHE_KEY;
  if (!key)
    throw new Error("LEXICON_AI_CACHE_KEY is required when AI is enabled.");
  return new EncryptedFileCandidateCache(path, key);
}
