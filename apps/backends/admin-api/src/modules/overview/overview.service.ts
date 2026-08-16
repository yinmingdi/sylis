import { Inject, Injectable } from "@nestjs/common";
import {
  CandidateStatus,
  JobStatus,
  OperatorRole,
  type SylisDatabase,
} from "@sylis/database";

import { AgentApiClient } from "../../integrations/agent-api/agent-api.client";
import { ModelGatewayClient } from "../../integrations/model-gateway/model-gateway.client";
import type { AdminActor } from "../../platform/auth/admin-actor";
import { ADMIN_DATABASE } from "../../platform/database/database.module";

export enum OverviewSectionStatus {
  READY = "READY",
  DEGRADED = "DEGRADED",
  OMITTED = "OMITTED",
}

@Injectable()
export class OverviewService {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
    private readonly agents: AgentApiClient,
    private readonly models: ModelGatewayClient,
  ) {}

  async projection(actor: AdminActor) {
    const observedAt = new Date();
    const [
      jobs,
      candidates,
      builds,
      publishes,
      deployments,
      activeLexicon,
      agent,
      model,
    ] = await Promise.all([
      this.database.job.groupBy({
        by: ["status"],
        _count: { _all: true },
        where: {
          status: {
            in: [
              JobStatus.QUEUED,
              JobStatus.RUNNING,
              JobStatus.RETRY_SCHEDULED,
              JobStatus.FAILED,
            ],
          },
        },
      }),
      this.database.candidate.count({
        where: { status: CandidateStatus.REVIEW_PENDING },
      }),
      this.database.buildRun.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      this.database.publishRun.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      this.database.deploymentRelease.findFirst({
        orderBy: { createdAt: "desc" },
      }),
      this.database.lexicon.findFirst({
        where: { activeReleaseId: { not: null } },
        include: { activeRelease: true },
      }),
      ownerSection(
        actor,
        [
          OperatorRole.AGENT_RELEASE_MANAGER,
          OperatorRole.MODEL_OPERATOR,
          OperatorRole.SECURITY_ADMIN,
        ],
        () => this.agents.overview(actor),
        "AGENT_API_UNAVAILABLE",
        observedAt,
      ),
      ownerSection(
        actor,
        [OperatorRole.MODEL_OPERATOR, OperatorRole.SECURITY_ADMIN],
        () => this.models.overview(actor),
        "MODEL_GATEWAY_UNAVAILABLE",
        observedAt,
      ),
    ]);
    return {
      observedAt,
      sections: {
        jobs: section(
          actor,
          Object.values(OperatorRole),
          { byStatus: jobs },
          observedAt,
        ),
        review: section(
          actor,
          [OperatorRole.CONTENT_REVIEWER],
          { pendingCandidates: candidates },
          observedAt,
        ),
        lexicon: section(
          actor,
          [OperatorRole.LEXICON_OPERATOR, OperatorRole.RELEASE_MANAGER],
          {
            activeRelease: activeLexicon?.activeRelease ?? null,
            builds,
            publishes,
          },
          observedAt,
        ),
        deployments: section(
          actor,
          Object.values(OperatorRole),
          { latest: deployments },
          observedAt,
        ),
        agent,
        model,
      },
    };
  }
}

function section(
  actor: AdminActor,
  roles: readonly OperatorRole[],
  data: unknown,
  observedAt: Date,
) {
  return roles.some((role) => actor.roles.includes(role))
    ? { status: OverviewSectionStatus.READY, observedAt, data }
    : { status: OverviewSectionStatus.OMITTED, observedAt };
}

async function ownerSection(
  actor: AdminActor,
  roles: readonly OperatorRole[],
  load: () => Promise<unknown>,
  reason: string,
  observedAt: Date,
): Promise<unknown> {
  if (!roles.some((role) => actor.roles.includes(role))) {
    return { status: OverviewSectionStatus.OMITTED, observedAt };
  }
  try {
    return {
      status: OverviewSectionStatus.READY,
      observedAt,
      data: await load(),
    };
  } catch {
    return { status: OverviewSectionStatus.DEGRADED, observedAt, reason };
  }
}
