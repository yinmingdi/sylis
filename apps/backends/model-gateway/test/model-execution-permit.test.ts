import {
  CredentialOwnerKind,
  CredentialStatus,
  ImmutableReleaseStatus,
  ModelCapabilityKind,
  ModelExecutionOwnerType,
  ModelOperationKind,
  ModelPurposeKind,
  ModelRetentionMode,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { CredentialCryptoService } from "../src/platform/encryption/credential-crypto.service";
import { ProviderRegistry } from "../src/providers/provider-registry";
import { ModelExecutionService } from "../src/modules/invocations/model-execution.service";

describe("ModelExecutionPermit issuance", () => {
  it("retries a Serializable write conflict and returns the committed permit", async () => {
    const createdPermit = {
      id: "00000000-0000-4000-8000-000000000021",
      inputDigest: `sha256:${"a".repeat(64)}`,
      expiresAt: new Date("2026-08-16T00:05:00.000Z"),
    };
    const transaction = {
      budgetPolicy: { findMany: vi.fn().mockResolvedValue([]) },
      quotaPolicy: { findMany: vi.fn().mockResolvedValue([]) },
      modelExecutionPermit: {
        create: vi.fn().mockResolvedValue(createdPermit),
      },
      modelUsageLedger: { create: vi.fn().mockResolvedValue({}) },
    };
    const runTransaction = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(
          new Error("Transaction failed due to a write conflict or a deadlock"),
          { code: "P2034", clientVersion: "6.19.2" },
        ),
      )
      .mockImplementationOnce(
        async (operation: (database: typeof transaction) => unknown) =>
          operation(transaction),
      );
    const database = {
      modelExecutionPermit: { findUnique: vi.fn().mockResolvedValue(null) },
      providerRouteRelease: {
        findUnique: vi.fn().mockResolvedValue({
          status: ImmutableReleaseStatus.PUBLISHED,
          providerKey: "fixture",
          capabilities: [ModelCapabilityKind.TEXT_GENERATION],
          pricing: {
            inputUsdPerMillion: "1",
            outputUsdPerMillion: "1",
            cachedInputUsdPerMillion: "0",
          },
        }),
      },
      credentialRevision: {
        findUnique: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000014",
          status: CredentialStatus.VERIFIED,
          revokedAt: null,
          expiresAt: null,
          profile: {
            status: CredentialStatus.VERIFIED,
            currentRevisionId: "00000000-0000-4000-8000-000000000014",
            providerKey: "fixture",
            ownerKind: CredentialOwnerKind.PLATFORM,
            ownerUserId: null,
          },
        }),
      },
      $transaction: runTransaction,
    } as unknown as SylisDatabase;
    const service = new ModelExecutionService(
      database,
      {} as CredentialCryptoService,
      {} as ProviderRegistry,
    );

    await expect(
      service.issuePermit({
        issuerServiceKey: "agent-api",
        callerServiceKey: "agent-executor",
        purpose: ModelPurposeKind.AGENT_RUN,
        ownerType: ModelExecutionOwnerType.AGENT_RUN,
        ownerId: "00000000-0000-4000-8000-000000000011",
        ownerUserId: "00000000-0000-4000-8000-000000000012",
        routeReleaseId: "00000000-0000-4000-8000-000000000013",
        credentialRevisionId: "00000000-0000-4000-8000-000000000014",
        operation: ModelOperationKind.STREAMING_GENERATION,
        inputDigest: createdPermit.inputDigest,
        maxInputTokens: 1_024,
        maxOutputTokens: 512,
        retentionMode: ModelRetentionMode.ENCRYPTED_EXCHANGE,
        idempotencyKey: "agent-run/permit-retry",
      }),
    ).resolves.toEqual({
      permitId: createdPermit.id,
      inputDigest: createdPermit.inputDigest,
      expiresAt: createdPermit.expiresAt.toISOString(),
    });
    expect(runTransaction).toHaveBeenCalledTimes(2);
    expect(transaction.modelExecutionPermit.create).toHaveBeenCalledOnce();
    expect(transaction.modelUsageLedger.create).toHaveBeenCalledOnce();
  });
});
