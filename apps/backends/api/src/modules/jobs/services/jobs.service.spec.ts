import { ConflictException } from "@nestjs/common";
import {
  JobKind,
  JobOwnerType,
  JobStatus,
  SessionAudience,
  SessionAuthStrength,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { JobsService } from "./jobs.service";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const JOB_ID = "20000000-0000-4000-8000-000000000001";

describe("JobsService user-owned projections", () => {
  it("allows a user to observe an Asset processing Job they own", async () => {
    const job = {
      id: JOB_ID,
      kind: JobKind.ASSET_SCAN,
      ownerType: JobOwnerType.ASSET_REVISION,
      ownerId: "30000000-0000-4000-8000-000000000001",
      status: JobStatus.RUNNING,
      attempts: [],
      progress: [],
    };
    const findFirst = vi.fn().mockResolvedValue(job);
    const service = new JobsService({
      job: { findFirst },
    } as unknown as SylisDatabase);

    await expect(service.get(actor(), JOB_ID)).resolves.toBe(job);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: JOB_ID,
          OR: expect.arrayContaining([
            {
              assetProcessing: {
                revision: { asset: { ownerUserId: USER_ID } },
              },
            },
          ]),
        },
      }),
    );
  });

  it("does not make an observable Asset processing Job cancellable", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: JOB_ID,
      kind: JobKind.ASSET_SCAN,
      ownerType: JobOwnerType.ASSET_REVISION,
      ownerId: "30000000-0000-4000-8000-000000000001",
      status: JobStatus.RUNNING,
      attempts: [],
      progress: [],
    });
    const update = vi.fn();
    const service = new JobsService({
      job: { findFirst, update },
    } as unknown as SylisDatabase);

    await expect(service.cancel(actor(), JOB_ID)).rejects.toEqual(
      new ConflictException("USER_JOB_KIND_NOT_OWNED"),
    );
    expect(update).not.toHaveBeenCalled();
  });
});

function actor(): ActorContext {
  return {
    userId: USER_ID,
    sessionId: "40000000-0000-4000-8000-000000000001",
    audience: SessionAudience.USER,
    roles: [],
    authStrength: SessionAuthStrength.PASSWORD,
  };
}
