import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";

import { DATABASE } from "../../../platform/database/database.module";

export interface ActiveRelease {
  lexiconId: string;
  releaseId: string;
  releaseVersion: string;
}

@Injectable()
export class ActiveReleaseService {
  constructor(@Inject(DATABASE) private readonly database: SylisDatabase) {}

  async resolve(): Promise<ActiveRelease> {
    const lexicon = await this.database.lexicon.findFirst({
      where: { activeReleaseId: { not: null } },
      include: { activeRelease: true },
      orderBy: { key: "asc" },
    });
    if (
      !lexicon?.activeRelease ||
      lexicon.activeRelease.status !== "VALIDATED"
    ) {
      throw new ServiceUnavailableException("No active lexicon release");
    }
    return {
      lexiconId: lexicon.id,
      releaseId: lexicon.activeRelease.id,
      releaseVersion: lexicon.activeRelease.version,
    };
  }
}
