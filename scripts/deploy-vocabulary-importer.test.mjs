import assert from "node:assert/strict";
import test from "node:test";

import {
  findLatestProgress,
  parseDeploymentUpload,
  parseJsonLines,
  validateSummary,
} from "./deploy-vocabulary-importer.mjs";

const config = {
  expectedSelected: 770_611,
  expectedBooks: 24,
};

test("parses Railway NDJSON while ignoring progress output", () => {
  assert.deepEqual(
    parseJsonLines(
      'Starting Container\n{"mode":"dry-run","selected":770611}\n',
    ),
    [{ mode: "dry-run", selected: 770_611 }],
  );
});

test("reads the latest importer progress from Railway JSON logs", () => {
  assert.deepEqual(
    findLatestProgress(
      [
        '{"mode":"progress","phase":"stage","processed":25000}',
        '{"level":"info","mode":"progress","phase":"stage","processed":50000}',
      ].join("\n"),
    ),
    {
      level: "info",
      mode: "progress",
      phase: "stage",
      processed: 50_000,
    },
  );
});

test("reads the deployment ID from Railway's structured upload result", () => {
  assert.equal(
    parseDeploymentUpload(
      '{"deploymentId":"7422c95b-c604-46bc-9de4-b7a43e1fd53d","logsUrl":"https://railway.com/logs"}\n',
    ).deploymentId,
    "7422c95b-c604-46bc-9de4-b7a43e1fd53d",
  );
});

test("rejects upload output without a structured deployment ID", () => {
  assert.throws(
    () => parseDeploymentUpload("Build queued\n"),
    /valid deployment ID/,
  );
});

test("accepts a read-only dry-run summary", () => {
  assert.doesNotThrow(() =>
    validateSummary(
      {
        mode: "dry-run",
        checksum: "a".repeat(64),
        selected: 770_611,
        skipped: 0,
        inserted: 0,
        updated: 0,
        relations: 0,
        books: 0,
      },
      "dry-run",
      config,
    ),
  );
});

test("rejects dry-runs that report writes", () => {
  assert.throws(
    () =>
      validateSummary(
        {
          checksum: "a".repeat(64),
          selected: 770_611,
          skipped: 0,
          inserted: 1,
          updated: 0,
          relations: 0,
          books: 0,
        },
        "dry-run",
        config,
      ),
    /database writes/,
  );
});

test("accepts a complete formal import gated by the same checksum", () => {
  assert.doesNotThrow(() =>
    validateSummary(
      {
        mode: "import",
        checksum: "b".repeat(64),
        selected: 770_611,
        skipped: 0,
        inserted: 700_000,
        updated: 70_611,
        books: 24,
      },
      "import",
      { ...config, preflightChecksum: "b".repeat(64) },
    ),
  );
});

test("rejects a formal import with a different checksum", () => {
  assert.throws(
    () =>
      validateSummary(
        {
          checksum: "c".repeat(64),
          selected: 770_611,
          skipped: 0,
          inserted: 770_611,
          updated: 0,
          books: 24,
        },
        "import",
        { ...config, preflightChecksum: "d".repeat(64) },
      ),
    /differs from its preflight/,
  );
});
