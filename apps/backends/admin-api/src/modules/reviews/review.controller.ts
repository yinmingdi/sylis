import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { OperatorRole } from "@sylis/database";

import { DecideReviewItemDto, ReviseCandidateDto } from "./review.dto";
import { ReviewService } from "./review.service";
import type { AdminRequest } from "../../platform/auth/admin-actor";
import {
  AdminPolicyGuard,
  RequireAnyRole,
  adminActor,
  requireRecentReauthentication,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Controller("api/admin/v1/reviews")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(OperatorRole.CONTENT_REVIEWER)
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get("batches")
  batches() {
    return this.reviews.listBatches();
  }

  @Get("batches/:batchId")
  batch(@Param("batchId") batchId: string) {
    return this.reviews.batch(batchId);
  }

  @Patch("candidates/:candidateId")
  revise(
    @Req() request: AdminRequest,
    @Param("candidateId") candidateId: string,
    @Body() input: ReviseCandidateDto,
  ) {
    requireRecentReauthentication(request);
    return this.reviews.reviseCandidate(
      adminActor(request),
      candidateId,
      input,
    );
  }

  @Post("batches/:batchId/decisions")
  decide(
    @Req() request: AdminRequest,
    @Param("batchId") batchId: string,
    @Body() input: DecideReviewItemDto,
  ) {
    requireRecentReauthentication(request);
    return this.reviews.decide(adminActor(request), batchId, input);
  }
}
