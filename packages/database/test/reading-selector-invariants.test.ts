import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

describeDatabase("reading selector database invariants", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("requires canonical SHA-256 content hashes for reading revisions", async () => {
    const originId = randomUUID();
    const documentId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "DocumentOrigin" (
         "id", kind, "sourceKey", "rightsPolicy", "retentionPolicy"
       ) VALUES ($1::uuid, 'CURATED', $2, 'PLATFORM_OWNED', 'INDEFINITE')`,
      originId,
      `selector-test-${originId}`,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "ReadingDocument" ("id", "originId", visibility)
       VALUES ($1::uuid, $2::uuid, 'PUBLIC')`,
      documentId,
      originId,
    );

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "ReadingDocumentRevision" (
           "id", "documentId", "revisionNo", "languageTag", "title",
           "contentCiphertext", "keyVersion", "contentHash", "wordCount"
         ) VALUES (
           $1::uuid, $2::uuid, 1, 'en', 'Selector invariant',
           decode('00', 'hex'), 'test-key', 'not-a-sha256', 1
         )`,
        randomUUID(),
        documentId,
      ),
    ).rejects.toThrow(/ReadingDocumentRevision_content_hash_check/);
  });

  it("binds selectors to revision id and content hash with immutable selector fields", async () => {
    const constraints = await database!.$queryRawUnsafe<
      Array<{ definition: string }>
    >(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = '"LexicalAnnotation"'::regclass
         AND contype = 'f'`,
    );
    expect(constraints.map((row) => row.definition).join("\n")).toContain(
      'FOREIGN KEY ("revisionId", "revisionContentHash") REFERENCES "ReadingDocumentRevision"(id, "contentHash")',
    );

    const triggers = await database!.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT tgname AS name
       FROM pg_trigger
       WHERE tgrelid = '"LexicalAnnotation"'::regclass
         AND NOT tgisinternal`,
    );
    expect(triggers.map((trigger) => trigger.name)).toContain(
      "LexicalAnnotation_selector_immutable",
    );
  });
});
