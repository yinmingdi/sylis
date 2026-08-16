import { describe, expect, it } from "vitest";

import {
  executeLexicalCandidateTasks,
  LexicalCandidateDisposition,
  type LexicalCandidatePort,
  LexicalCandidateRiskClass,
  type LexicalCandidateSubmission,
  LexicalCandidateTargetKind,
  type LexicalCandidateTask,
  LexicalCandidateTaskType,
} from "../src/candidates/lexical-candidate";
import { StructuredTaskExecutor } from "../src/enrich/structured-task-executor";
import { FakeStructuredGenerationPort } from "./fake-generation";

interface TestCandidateValue {
  value: string;
}

const options = {
  enabled: true,
  budgetUsd: "1.00",
  concurrency: 2,
  pricing: { inputUsdPerMillion: "1", outputUsdPerMillion: "2" },
  promptVersion: "test/v1",
  schemaVersion: "sylis.ai-candidate/1",
  modelPolicyVersion: "test/v1",
  requestedProvider: "fake",
  requestedModel: "fixture",
} as const;

const candidateTask = (
  sourceRecordIds: string[],
  targetKey = "sense:helpful:1",
  riskClass = LexicalCandidateRiskClass.MEDIUM,
): LexicalCandidateTask<TestCandidateValue> => ({
  taskType: LexicalCandidateTaskType.LEARNER_DEFINITION,
  target: {
    kind: LexicalCandidateTargetKind.SENSE,
    targetKey,
  },
  riskClass,
  sourceRecordIds,
  schemaName: "sylis_test_learner_definition",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: { value: { type: "string", minLength: 1 } },
  },
  systemPrompt: "Return one learner definition.",
  input: { sourceSenseKey: "helpful:1" },
  maxTokens: 32,
});

class RecordingCandidatePort implements LexicalCandidatePort {
  readonly resolveCalls: string[] = [];
  readonly submissions: Array<LexicalCandidateSubmission<unknown>> = [];

  async resolve<T>(candidateKey: string) {
    this.resolveCalls.push(candidateKey);
    return null;
  }

  async submit<T>(candidate: LexicalCandidateSubmission<T>) {
    this.submissions.push(candidate as LexicalCandidateSubmission<unknown>);
    return {
      disposition: LexicalCandidateDisposition.APPROVED,
      candidateRevisionId: "revision-1",
      payload: candidate.payload,
    };
  }

  async finalizeReviewBatch() {
    return { reviewBatchId: null, pendingCount: 0 };
  }
}

const createExecutor = (generation: FakeStructuredGenerationPort) =>
  new StructuredTaskExecutor(options, {
    generation,
    resolvedIdentity: { provider: "fake", model: "fixture" },
  });

describe("lexical candidate execution", () => {
  it("generates and submits a duplicate candidate key once", async () => {
    const generation = new FakeStructuredGenerationPort(() => ({
      value: "giving useful help",
    }));
    const port = new RecordingCandidatePort();
    const outcomes = await executeLexicalCandidateTasks(
      createExecutor(generation),
      port,
      [candidateTask(["source-b"]), candidateTask(["source-a"])],
    );

    expect(generation.requests).toHaveLength(1);
    expect(port.resolveCalls).toHaveLength(1);
    expect(port.submissions).toHaveLength(1);
    expect(port.submissions[0]?.sourceRecordIds).toEqual([
      "source-a",
      "source-b",
    ]);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]?.candidateRevisionId).toBe("revision-1");
    expect(outcomes[1]).toMatchObject({
      candidateRevisionId: "revision-1",
      usage: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0 },
    });
  });

  it("rejects an approved revision for a different target", async () => {
    const generation = new FakeStructuredGenerationPort(() => {
      throw new Error("generation must not run");
    });
    const port: LexicalCandidatePort = {
      async resolve<T>() {
        return {
          disposition: LexicalCandidateDisposition.APPROVED,
          candidateRevisionId: "revision-1",
          payload: {
            schemaVersion: "sylis.ai-candidate/1",
            taskType: LexicalCandidateTaskType.LEARNER_DEFINITION,
            target: {
              kind: LexicalCandidateTargetKind.SENSE,
              targetKey: "sense:other:1",
            },
            value: { value: "wrong target" } as T,
          },
        };
      },
      async submit() {
        throw new Error("submit must not run");
      },
      async finalizeReviewBatch() {
        return { reviewBatchId: null, pendingCount: 0 };
      },
    };

    await expect(
      executeLexicalCandidateTasks(createExecutor(generation), port, [
        candidateTask(["source-a"]),
      ]),
    ).rejects.toThrow("LEXICAL_CANDIDATE_ENVELOPE_MISMATCH");
    expect(generation.requests).toHaveLength(0);
  });

  it("revalidates an approved revision before projection", async () => {
    const generation = new FakeStructuredGenerationPort(() => {
      throw new Error("generation must not run");
    });
    const port: LexicalCandidatePort = {
      async resolve<T>() {
        return {
          disposition: LexicalCandidateDisposition.APPROVED,
          candidateRevisionId: "revision-1",
          payload: {
            schemaVersion: "sylis.ai-candidate/1",
            taskType: LexicalCandidateTaskType.LEARNER_DEFINITION,
            target: {
              kind: LexicalCandidateTargetKind.SENSE,
              targetKey: "sense:helpful:1",
            },
            value: { value: "" } as T,
          },
        };
      },
      async submit() {
        throw new Error("submit must not run");
      },
      async finalizeReviewBatch() {
        return { reviewBatchId: null, pendingCount: 0 };
      },
    };

    await expect(
      executeLexicalCandidateTasks(createExecutor(generation), port, [
        candidateTask(["source-a"]),
      ]),
    ).rejects.toThrow("AI_CANDIDATE_INVALID:LEARNER_DEFINITION");
    expect(generation.requests).toHaveLength(0);
  });

  it("includes the review target in candidate identity", async () => {
    const generation = new FakeStructuredGenerationPort(() => ({
      value: "definition",
    }));
    const port = new RecordingCandidatePort();

    await executeLexicalCandidateTasks(createExecutor(generation), port, [
      candidateTask(["source-a"]),
      candidateTask(["source-a"], "sense:other:1"),
    ]);
    expect(port.resolveCalls).toHaveLength(2);
    expect(generation.requests).toHaveLength(2);
  });

  it("rejects duplicate keys with different review metadata", async () => {
    const generation = new FakeStructuredGenerationPort(() => ({
      value: "unreachable",
    }));
    const port = new RecordingCandidatePort();

    await expect(
      executeLexicalCandidateTasks(createExecutor(generation), port, [
        candidateTask(["source-a"]),
        candidateTask(
          ["source-a"],
          "sense:helpful:1",
          LexicalCandidateRiskClass.HIGH,
        ),
      ]),
    ).rejects.toThrow("LEXICAL_CANDIDATE_KEY_COLLISION");
    expect(port.resolveCalls).toHaveLength(0);
    expect(generation.requests).toHaveLength(0);
  });
});
