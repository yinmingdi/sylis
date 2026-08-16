import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";
import { jsonReplacer } from "@sylis/utils";

import { ADMIN_DATABASE } from "../../platform/database/database.module";

@Injectable()
export class AssetsService {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
  ) {}

  async list() {
    const assets = await this.database.contentAsset.findMany({
      select: {
        id: true,
        ownerUserId: true,
        purpose: true,
        status: true,
        currentRevisionId: true,
        createdAt: true,
        hiddenAt: true,
        deletedAt: true,
        currentRevision: {
          select: {
            id: true,
            revisionNo: true,
            filename: true,
            declaredMimeType: true,
            detectedMimeType: true,
            byteSize: true,
            contentHash: true,
            scannerVersion: true,
            parserVersion: true,
            validatorVersion: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return jsonBoundary(assets);
  }

  async detail(assetId: string) {
    const asset = await this.database.contentAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        ownerUserId: true,
        purpose: true,
        status: true,
        currentRevisionId: true,
        createdAt: true,
        hiddenAt: true,
        deletedAt: true,
        revisions: {
          select: {
            id: true,
            revisionNo: true,
            filename: true,
            declaredMimeType: true,
            detectedMimeType: true,
            byteSize: true,
            contentHash: true,
            scannerVersion: true,
            parserVersion: true,
            validatorVersion: true,
            status: true,
            createdAt: true,
            processingRuns: {
              select: {
                id: true,
                jobId: true,
                kind: true,
                status: true,
                toolVersion: true,
                modelPolicyVersion: true,
                createdAt: true,
                completedAt: true,
              },
              orderBy: { createdAt: "desc" },
            },
            derivatives: {
              select: {
                id: true,
                kind: true,
                outputHash: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: { revisionNo: "desc" },
        },
      },
    });
    if (!asset) throw new NotFoundException("CONTENT_ASSET_NOT_FOUND");
    return jsonBoundary(asset);
  }
}

function jsonBoundary<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, jsonReplacer)) as T;
}
