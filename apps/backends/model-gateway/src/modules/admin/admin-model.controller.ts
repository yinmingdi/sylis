import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ProviderHealthProbeKind } from "@sylis/database";

import {
  AdminModelService,
  type CreateCredentialInput,
  type ModelAdminActor,
} from "./admin-model.service";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";

interface ServiceRequest {
  serviceKey?: string;
}

@Controller("internal/v1/admin")
@UseGuards(ServiceGrantGuard)
export class AdminModelController {
  constructor(private readonly models: AdminModelService) {}

  @Post("overview/query")
  overview(
    @Req() request: ServiceRequest,
    @Body() body: { actor: ModelAdminActor },
  ) {
    return this.models.overview(serviceKey(request), body.actor);
  }

  @Post("routes/query")
  routes(
    @Req() request: ServiceRequest,
    @Body() body: { actor: ModelAdminActor },
  ) {
    return this.models.routes(serviceKey(request), body.actor);
  }

  @Post("credentials/query")
  credentials(
    @Req() request: ServiceRequest,
    @Body() body: { actor: ModelAdminActor },
  ) {
    return this.models.credentials(serviceKey(request), body.actor);
  }

  @Post("credentials")
  createCredential(
    @Req() request: ServiceRequest,
    @Body() body: { actor: ModelAdminActor; credential: CreateCredentialInput },
  ) {
    return this.models.createCredential(
      serviceKey(request),
      body.actor,
      body.credential,
    );
  }

  @Post("credentials/:profileId/rotations")
  rotateCredential(
    @Req() request: ServiceRequest,
    @Param("profileId") profileId: string,
    @Body()
    body: {
      actor: ModelAdminActor;
      credential: Omit<CreateCredentialInput, "providerKey" | "label">;
    },
  ) {
    return this.models.rotateCredential(
      serviceKey(request),
      body.actor,
      profileId,
      body.credential,
    );
  }

  @Post("credential-revisions/:revisionId/validations")
  validateCredential(
    @Req() request: ServiceRequest,
    @Param("revisionId") revisionId: string,
    @Body()
    body: { actor: ModelAdminActor; routeReleaseId: string; reason: string },
  ) {
    return this.models.validateCredential(
      serviceKey(request),
      body.actor,
      revisionId,
      body.routeReleaseId,
      body.reason,
    );
  }

  @Post("credential-profiles/:profileId/revocations")
  revokeCredential(
    @Req() request: ServiceRequest,
    @Param("profileId") profileId: string,
    @Body() body: { actor: ModelAdminActor; reason: string },
  ) {
    return this.models.revokeCredential(
      serviceKey(request),
      body.actor,
      profileId,
      body.reason,
    );
  }

  @Post("credential-profiles/:profileId/quarantines")
  quarantineCredential(
    @Req() request: ServiceRequest,
    @Param("profileId") profileId: string,
    @Body() body: { actor: ModelAdminActor; reason: string },
  ) {
    return this.models.quarantineCredential(
      serviceKey(request),
      body.actor,
      profileId,
      body.reason,
    );
  }

  @Post("credential-profiles/:profileId/restorations")
  restoreCredential(
    @Req() request: ServiceRequest,
    @Param("profileId") profileId: string,
    @Body() body: { actor: ModelAdminActor; reason: string },
  ) {
    return this.models.restoreCredential(
      serviceKey(request),
      body.actor,
      profileId,
      body.reason,
    );
  }

  @Post("provider-routes/:routeReleaseId/health-probes")
  probeRoute(
    @Req() request: ServiceRequest,
    @Param("routeReleaseId") routeReleaseId: string,
    @Body()
    body: {
      actor: ModelAdminActor;
      credentialRevisionId: string;
      probeKind: ProviderHealthProbeKind;
      reason: string;
    },
  ) {
    return this.models.probeRoute(
      serviceKey(request),
      body.actor,
      routeReleaseId,
      body.credentialRevisionId,
      body.probeKind,
      body.reason,
    );
  }

  @Post("provider-routes/:routeReleaseId/security-revocations")
  revokeRoute(
    @Req() request: ServiceRequest,
    @Param("routeReleaseId") routeReleaseId: string,
    @Body() body: { actor: ModelAdminActor; reason: string },
  ) {
    return this.models.revokeRoute(
      serviceKey(request),
      body.actor,
      routeReleaseId,
      body.reason,
    );
  }

  @Post("provider-routes/:routeReleaseId/restorations")
  restoreRoute(
    @Req() request: ServiceRequest,
    @Param("routeReleaseId") routeReleaseId: string,
    @Body() body: { actor: ModelAdminActor; reason: string },
  ) {
    return this.models.restoreRoute(
      serviceKey(request),
      body.actor,
      routeReleaseId,
      body.reason,
    );
  }

  @Post("usage/query")
  usage(
    @Req() request: ServiceRequest,
    @Body() body: { actor: ModelAdminActor },
  ) {
    return this.models.usage(serviceKey(request), body.actor);
  }

  @Post("budgets")
  budget(
    @Req() request: ServiceRequest,
    @Body()
    body: {
      actor: ModelAdminActor;
      budget: Parameters<AdminModelService["createBudget"]>[2];
    },
  ) {
    return this.models.createBudget(
      serviceKey(request),
      body.actor,
      body.budget,
    );
  }

  @Post("quotas")
  quota(
    @Req() request: ServiceRequest,
    @Body()
    body: {
      actor: ModelAdminActor;
      quota: Parameters<AdminModelService["createQuota"]>[2];
    },
  ) {
    return this.models.createQuota(serviceKey(request), body.actor, body.quota);
  }
}

function serviceKey(request: ServiceRequest): string {
  if (!request.serviceKey) throw new Error("SERVICE_GRANT_CONTEXT_MISSING");
  return request.serviceKey;
}
