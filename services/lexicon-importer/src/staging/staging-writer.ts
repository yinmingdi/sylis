import type { SylisDatabase } from "@sylis/database";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";

import { streamArtifact } from "../artifact/reader";

const COPY_BATCH_SIZE = 10_000;

interface StagingRow {
  jobId: string;
  collectionPath: string;
  position: number;
  payloadHash: string;
  payload: unknown;
}

const copyText = (value: string): string =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\t", "\\t")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");

const encodeRow = (row: StagingRow): string =>
  [
    row.jobId,
    copyText(row.collectionPath),
    String(row.position),
    row.payloadHash,
    copyText(JSON.stringify(row.payload)),
  ].join("\t") + "\n";

async function copyBatch(
  databaseUrl: string,
  rows: StagingRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const stream = client.query(
      copyFrom(
        'COPY "ArtifactStagingRecord" ("jobId", "collectionPath", "position", "payloadHash", "payload") FROM STDIN WITH (FORMAT text)',
      ),
    );
    const completed = new Promise<void>((resolve, reject) => {
      stream.once("finish", resolve);
      stream.once("error", reject);
    });
    for (const row of rows) {
      if (!stream.write(encodeRow(row))) await once(stream, "drain");
    }
    stream.end();
    await completed;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export async function stageArtifact(
  database: SylisDatabase,
  jobId: string,
  artifactPath: string,
  options: {
    databaseUrl: string;
    onProgress?: (processed: number) => Promise<void>;
    isCancelled?: () => Promise<boolean>;
  },
): Promise<{
  manifest: Awaited<ReturnType<typeof streamArtifact>>["manifest"];
  counts: Record<string, number>;
}> {
  const batch: StagingRow[] = [];
  const existing = await database.artifactStagingRecord.groupBy({
    by: ["collectionPath"],
    where: { jobId },
    _max: { position: true },
    _count: { _all: true },
  });
  const committedPosition = new Map(
    existing.map((row) => [row.collectionPath, row._max.position ?? -1]),
  );
  let processed = existing.reduce((sum, row) => sum + row._count._all, 0);
  if (processed > 0) await options.onProgress?.(processed);

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const rows = batch.splice(0, batch.length);
    await copyBatch(options.databaseUrl, rows);
    processed += rows.length;
    await options.onProgress?.(processed);
    if (await options.isCancelled?.()) throw new Error("JOB_CANCELLED");
  };

  const result = await streamArtifact(artifactPath, {
    async onEntity(entity) {
      if (entity.position <= (committedPosition.get(entity.path) ?? -1)) return;
      const serialized = JSON.stringify(entity.value);
      batch.push({
        jobId,
        collectionPath: entity.path,
        position: entity.position,
        payloadHash: `sha256:${createHash("sha256").update(serialized).digest("hex")}`,
        payload: entity.value,
      });
      if (batch.length >= COPY_BATCH_SIZE) await flush();
    },
  });
  await flush();
  return { manifest: result.manifest, counts: result.counts };
}
