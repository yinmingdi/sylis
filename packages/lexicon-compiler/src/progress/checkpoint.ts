import type { SylisLexiconArtifactV1 } from "@sylis/lexicon-artifact";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { CompileStage } from "./reporter";
import type { NormalizedSourceRecord } from "../candidates/candidate-v1";

interface CompilerCheckpointBase {
  checkpointVersion: "sylis.lexicon-checkpoint/2";
  runId: string;
  inputHash: string;
  codeVersion: string;
  compilerVersion: string;
  schemaVersion: "sylis.lexicon-artifact/1";
  handlerVersion: string;
}

export interface SourceRecordsCheckpoint extends CompilerCheckpointBase {
  stage: CompileStage.SOURCE_RECORDS;
  records: NormalizedSourceRecord[];
}

export interface RelationResolutionCheckpoint extends CompilerCheckpointBase {
  stage: CompileStage.RELATION_RESOLUTION;
  records: NormalizedSourceRecord[];
}

export interface LearningContentCheckpoint extends CompilerCheckpointBase {
  stage: CompileStage.EXERCISES_BLUEPRINTS;
  artifact: SylisLexiconArtifactV1;
}

export type CompilerCheckpoint =
  | SourceRecordsCheckpoint
  | RelationResolutionCheckpoint
  | LearningContentCheckpoint;

function isCompilerCheckpoint(value: unknown): value is CompilerCheckpoint {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const checkpoint = value as Record<string, unknown>;
  const baseValid =
    checkpoint.checkpointVersion === "sylis.lexicon-checkpoint/2" &&
    typeof checkpoint.runId === "string" &&
    typeof checkpoint.inputHash === "string" &&
    typeof checkpoint.codeVersion === "string" &&
    typeof checkpoint.compilerVersion === "string" &&
    checkpoint.schemaVersion === "sylis.lexicon-artifact/1" &&
    typeof checkpoint.handlerVersion === "string";
  if (!baseValid) return false;
  if (
    checkpoint.stage === CompileStage.SOURCE_RECORDS ||
    checkpoint.stage === CompileStage.RELATION_RESOLUTION
  ) {
    return Array.isArray(checkpoint.records);
  }
  return (
    checkpoint.stage === CompileStage.EXERCISES_BLUEPRINTS &&
    typeof checkpoint.artifact === "object" &&
    checkpoint.artifact !== null &&
    !Array.isArray(checkpoint.artifact)
  );
}

export async function readCheckpoint(
  path: string,
): Promise<CompilerCheckpoint | null> {
  try {
    const checkpoint = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isCompilerCheckpoint(checkpoint)) {
      throw new Error(`CHECKPOINT_INVALID:${path}`);
    }
    return checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeCheckpoint(
  path: string,
  checkpoint: CompilerCheckpoint,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(checkpoint)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
