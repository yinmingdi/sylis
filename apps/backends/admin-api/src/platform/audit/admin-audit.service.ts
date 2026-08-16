import { Inject, Injectable } from "@nestjs/common";
import {
  SecurityAuditResult,
  type SecurityAuditCategory,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";

import type { AdminActor } from "../auth/admin-actor";
import { ADMIN_DATABASE } from "../database/database.module";

export interface AdminAuditInput {
  category: SecurityAuditCategory;
  action: string;
  targetType?: string;
  targetId?: string;
  targetRevisionId?: string;
  actionDigest?: string;
  policyVersion?: string;
  reasonCode?: string;
  reason?: string;
  beforeDigest?: string;
  afterDigest?: string;
  result?: SecurityAuditResult;
  metadata?: PrismaTypes.InputJsonValue;
}

@Injectable()
export class AdminAuditService {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
  ) {}

  write(
    actor: AdminActor,
    input: AdminAuditInput,
    store: SylisDatabase | SylisTransaction = this.database,
  ) {
    return store.securityAuditEvent.create({
      data: {
        actorUserId: actor.userId,
        sessionId: actor.sessionId,
        category: input.category,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        targetRevisionId: input.targetRevisionId,
        actionDigest: input.actionDigest,
        policyVersion: input.policyVersion,
        reasonCode: input.reasonCode,
        reason: input.reason,
        beforeDigest: input.beforeDigest,
        afterDigest: input.afterDigest,
        result: input.result ?? SecurityAuditResult.SUCCEEDED,
        metadata: input.metadata ?? {},
      },
    });
  }
}
