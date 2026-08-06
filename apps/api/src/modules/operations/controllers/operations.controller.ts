import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import { Roles } from "../../../platform/auth/roles.decorator";
import {
  ApprovalDecisionDto,
  ApprovalReasonDto,
  CreateBuildRunDto,
  CreateImportJobDto,
  CreateSourceSynchronizationDto,
  RecordDeploymentDto,
  RevokeAdminSessionDto,
  UpdateRuntimeAiControlDto,
  UpdateUserStatusDto,
  UserSupportQueryDto,
  WithdrawRedditSourceDto,
} from "../dto/operations.dto";
import { OperationsService } from "../services/operations.service";

@Controller("api/admin/v1")
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}
  @Get("dashboard")
  @Roles("SUPPORT", "CONTENT_REVIEWER", "RELEASE_MANAGER", "SECURITY_ADMIN")
  dashboard() {
    return this.operations.dashboard();
  }
  @Get("build-runs") @Roles("CONTENT_REVIEWER", "RELEASE_MANAGER") builds() {
    return this.operations.builds();
  }
  @Post("build-runs") @Roles("RELEASE_MANAGER") createBuild(
    @Actor() actor: ActorContext,
    @Body() input: CreateBuildRunDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.operations.createBuild(actor, input, key);
  }
  @Get("import-jobs") @Roles("CONTENT_REVIEWER", "RELEASE_MANAGER") imports() {
    return this.operations.imports();
  }
  @Post("import-jobs") @Roles("RELEASE_MANAGER") createImport(
    @Actor() actor: ActorContext,
    @Body() input: CreateImportJobDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.operations.createImport(actor, input, key);
  }
  @Get("lexicon-releases")
  @Roles("CONTENT_REVIEWER", "RELEASE_MANAGER")
  releases() {
    return this.operations.releases();
  }
  @Post("lexicon-releases/:id/validation-jobs")
  @Roles("RELEASE_MANAGER")
  validate(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
  ) {
    return this.operations.createValidation(actor, id, key);
  }
  @Post("lexicon-releases/:id/activation-previews")
  @Roles("RELEASE_MANAGER")
  preview(@Param("id") id: string) {
    return this.operations.activationPreview(id);
  }
  @Post("lexicon-releases/:id/activation-requests")
  @Roles("RELEASE_MANAGER")
  request(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Body() input: ApprovalReasonDto,
  ) {
    return this.operations.requestActivation(actor, id, input);
  }
  @Post("approvals/:id/decisions") @Roles("RELEASE_MANAGER") decide(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Body() input: ApprovalDecisionDto,
  ) {
    return this.operations.decide(actor, id, input);
  }
  @Post("lexicon-releases/:id/activate") @Roles("RELEASE_MANAGER") activate(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Query("approvalId") approvalId: string,
    @Body() input: ApprovalReasonDto,
  ) {
    return this.operations.activate(actor, id, approvalId, input.reason);
  }
  @Get("jobs") @Roles("SUPPORT", "RELEASE_MANAGER") jobs() {
    return this.operations.jobsList();
  }
  @Get("source-rights") @Roles("CONTENT_REVIEWER", "RELEASE_MANAGER") rights() {
    return this.operations.rights();
  }
  @Post("source-synchronizations") @Roles("RELEASE_MANAGER") synchronize(
    @Actor() actor: ActorContext,
    @Body() input: CreateSourceSynchronizationDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.operations.createSourceSynchronization(actor, input, key);
  }
  @Post("sources/reddit/:postId/withdraw")
  @Roles("CONTENT_REVIEWER", "RELEASE_MANAGER")
  withdrawReddit(
    @Actor() actor: ActorContext,
    @Param("postId") postId: string,
    @Body() input: WithdrawRedditSourceDto,
  ) {
    return this.operations.withdrawRedditSource(actor, postId, input.reason);
  }
  @Get("audit-events") @Roles("SECURITY_ADMIN") audit() {
    return this.operations.audit();
  }
  @Get("ai-usage") @Roles("RELEASE_MANAGER") usage() {
    return this.operations.usage();
  }
  @Get("runtime-ai-control")
  @Roles("RELEASE_MANAGER", "SECURITY_ADMIN")
  runtimeAiControl() {
    return this.operations.runtimeAiControl();
  }
  @Post("runtime-ai-control")
  @Roles("RELEASE_MANAGER", "SECURITY_ADMIN")
  setRuntimeAiControl(
    @Actor() actor: ActorContext,
    @Body() input: UpdateRuntimeAiControlDto,
  ) {
    return this.operations.setRuntimeAiControl(actor, input);
  }
  @Get("users") @Roles("SUPPORT", "SECURITY_ADMIN") users(
    @Query() query: UserSupportQueryDto,
  ) {
    return this.operations.users(query);
  }
  @Get("users/:id/admin-sessions") @Roles("SECURITY_ADMIN") adminSessions(
    @Param("id") id: string,
  ) {
    return this.operations.adminSessions(id);
  }
  @Post("users/:id/status") @Roles("SECURITY_ADMIN") setUserStatus(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Body() input: UpdateUserStatusDto,
  ) {
    return this.operations.setUserStatus(actor, id, input);
  }
  @Post("users/:userId/admin-sessions/:sessionId/revoke")
  @Roles("SECURITY_ADMIN")
  revokeAdminSession(
    @Actor() actor: ActorContext,
    @Param("userId") userId: string,
    @Param("sessionId") sessionId: string,
    @Body() input: RevokeAdminSessionDto,
  ) {
    return this.operations.revokeAdminSession(
      actor,
      userId,
      sessionId,
      input.reason,
    );
  }
  @Get("deployment-releases")
  @Roles("RELEASE_MANAGER", "SECURITY_ADMIN")
  deployments() {
    return this.operations.deployments();
  }
  @Post("deployment-releases") @Roles("RELEASE_MANAGER") recordDeployment(
    @Actor() actor: ActorContext,
    @Body() input: RecordDeploymentDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.operations.recordDeployment(actor, input, key);
  }
}
