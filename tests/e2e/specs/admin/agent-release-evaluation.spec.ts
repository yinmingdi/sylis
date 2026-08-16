import { AgentReleaseCommandKind, CapabilityKey } from "@sylis/agent-contracts";
import { AGENT_RUNTIME_FIXTURE_IDS } from "@sylis/agent-contracts/release-fixtures";
import {
  AgentEvaluationKind,
  AgentEvaluationStatus,
  AgentReleaseEventKind,
  AgentReleaseKind,
  ImmutableReleaseStatus,
  JobStatus,
} from "@sylis/database";

import { adminUrl, operatorMutationHeaders } from "../../fixtures/operator";
import { expect, test } from "../../fixtures/test";
import { TestTag, e2eTags } from "../../runtime";

interface AgentReleaseOverview {
  capabilities: Array<{
    id: string;
    capabilityKey: string;
    status: ImmutableReleaseStatus;
  }>;
  evaluations: Array<{
    id: string;
    targetReleaseId: string;
    kind: AgentEvaluationKind;
    status: AgentEvaluationStatus;
    budgetMicros: string;
    evidence: Array<{ passed: boolean; score: string }>;
  }>;
  events: Array<{
    releaseId: string;
    kind: AgentReleaseEventKind;
  }>;
}

test(
  "AGENT-RELEASE-001-E2E an operator evaluates a validated capability through the real evaluator",
  {
    tag: e2eTags(TestTag.SYSTEM),
  },
  async ({ operatorPage: page }) => {
    const headers = await operatorMutationHeaders(page);
    const releaseId =
      AGENT_RUNTIME_FIXTURE_IDS.capabilityReleases[
        CapabilityKey.LEXICON_EXPLAIN
      ];
    const reason = "Verify the deterministic E2E capability release";

    const releasesResponse = await page.request.get(
      adminUrl("/api/admin/v1/agents/releases"),
    );
    expect(releasesResponse.ok()).toBeTruthy();
    const initial = (await releasesResponse.json()) as AgentReleaseOverview;
    expect(initial.capabilities).toContainEqual(
      expect.objectContaining({
        id: releaseId,
        capabilityKey: CapabilityKey.LEXICON_EXPLAIN,
        status: ImmutableReleaseStatus.PUBLISHED,
      }),
    );
    expect(initial.events).toContainEqual(
      expect.objectContaining({
        releaseId,
        kind: AgentReleaseEventKind.VALIDATED,
      }),
    );

    const previewResponse = await page.request.post(
      adminUrl(
        `/api/admin/v1/agents/releases/${AgentReleaseKind.CAPABILITY}/${releaseId}/action-previews`,
      ),
      {
        headers,
        data: {
          action: AgentReleaseCommandKind.EVALUATE,
          reason,
          evaluationKind: AgentEvaluationKind.EVALUATION,
          evalReleaseId: AGENT_RUNTIME_FIXTURE_IDS.evalRelease,
        },
      },
    );
    expect(previewResponse.ok()).toBeTruthy();
    const preview = (await previewResponse.json()) as {
      action: AgentReleaseCommandKind;
      actionDigest: string;
      command: { actionDigest: string };
    };
    expect(preview.action).toBe(AgentReleaseCommandKind.EVALUATE);
    expect(preview.actionDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(preview.command.actionDigest).toBe(preview.actionDigest);

    const evaluationResponse = await page.request.post(
      adminUrl(
        `/api/admin/v1/agents/releases/${AgentReleaseKind.CAPABILITY}/${releaseId}/evaluations`,
      ),
      {
        headers,
        data: {
          reason,
          actionDigest: preview.actionDigest,
          evaluationKind: AgentEvaluationKind.EVALUATION,
          evalReleaseId: AGENT_RUNTIME_FIXTURE_IDS.evalRelease,
        },
      },
    );
    expect(evaluationResponse.ok()).toBeTruthy();
    const scheduled = (await evaluationResponse.json()) as {
      evaluation: {
        id: string;
        status: AgentEvaluationStatus;
        budgetMicros: string;
      };
      job: { id: string; status: JobStatus };
    };
    expect(scheduled.evaluation.status).toBe(AgentEvaluationStatus.QUEUED);
    expect(scheduled.evaluation.budgetMicros).toBe("2000000");
    expect(scheduled.job.status).toBe(JobStatus.QUEUED);

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            adminUrl("/api/admin/v1/agents/releases"),
          );
          if (!response.ok()) return null;
          const overview = (await response.json()) as AgentReleaseOverview;
          return overview.evaluations.find(
            (evaluation) => evaluation.id === scheduled.evaluation.id,
          );
        },
        { timeout: 30_000 },
      )
      .toMatchObject({
        targetReleaseId: releaseId,
        kind: AgentEvaluationKind.EVALUATION,
        status: AgentEvaluationStatus.SUCCEEDED,
        budgetMicros: "2000000",
        evidence: [expect.objectContaining({ passed: true, score: "1" })],
      });
  },
);
