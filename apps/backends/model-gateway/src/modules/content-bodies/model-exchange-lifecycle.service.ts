import { Inject, Injectable } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";

import { ModelContentBodyService } from "./model-content-body.service";
import { MODEL_DATABASE } from "../../platform/database/database.module";

enum ModelExchangeLifecycleCaller {
  AGENT_API = "agent-api",
  AUTOMATION_EXECUTOR = "automation-executor",
}

export interface ModelExchangeLifecycleResult {
  exchanges: number;
  parts: number;
  purgedBodies: number;
  retainedSharedBodies: number;
}

@Injectable()
export class ModelExchangeLifecycleService {
  constructor(
    @Inject(MODEL_DATABASE) private readonly database: SylisDatabase,
    private readonly contentBodies: ModelContentBodyService,
  ) {}

  async assertOwnership(
    serviceKey: string,
    input: { ownerUserId: string; ids: readonly string[] },
  ): Promise<{ owned: number }> {
    if (serviceKey !== ModelExchangeLifecycleCaller.AGENT_API) {
      throw new Error("MODEL_EXCHANGE_OWNERSHIP_CHECK_FORBIDDEN");
    }
    const ids = uniqueIds(input.ids);
    await this.requireOwnership(ids, input.ownerUserId);
    return { owned: ids.length };
  }

  async hide(
    serviceKey: string,
    input: {
      ownerUserId: string;
      ids: readonly string[];
      purgeAfter: string;
    },
  ): Promise<{ hidden: number }> {
    if (serviceKey !== ModelExchangeLifecycleCaller.AGENT_API) {
      throw new Error("MODEL_EXCHANGE_HIDE_FORBIDDEN");
    }
    const ids = uniqueIds(input.ids);
    const purgeAfter = parseDate(input.purgeAfter);
    await this.requireOwnership(ids, input.ownerUserId);
    const now = new Date();
    await this.database.$transaction([
      this.database.modelExchangePart.updateMany({
        where: { exchangeId: { in: ids }, hiddenAt: null, purgedAt: null },
        data: { hiddenAt: now, purgeAfter },
      }),
      this.database.modelExchange.updateMany({
        where: { id: { in: ids }, purgedAt: null },
        data: { hiddenAt: now, purgeAfter },
      }),
    ]);
    return { hidden: ids.length };
  }

  async purge(
    serviceKey: string,
    input: {
      ownerUserId: string;
      ids: readonly string[];
      purgeAfter?: string;
    },
  ): Promise<ModelExchangeLifecycleResult> {
    const caller = purgeCaller(serviceKey, input.purgeAfter);
    const ids = uniqueIds(input.ids);
    const exchanges = await this.database.modelExchange.findMany({
      where: {
        id: { in: ids },
        invocation: { permit: { ownerUserId: input.ownerUserId } },
      },
      select: {
        id: true,
        hiddenAt: true,
        purgeAfter: true,
        purgedAt: true,
        parts: { select: { id: true, contentBodyId: true } },
      },
    });
    if (exchanges.length !== ids.length) {
      throw new Error("MODEL_EXCHANGE_OWNER_MISMATCH");
    }
    const now = new Date();
    const pending = exchanges.filter(({ purgedAt }) => purgedAt === null);
    if (caller === ModelExchangeLifecycleCaller.AUTOMATION_EXECUTOR) {
      const requestedPurgeAfter = parseDate(input.purgeAfter ?? "");
      if (requestedPurgeAfter > now) {
        throw new Error("MODEL_EXCHANGE_NOT_PURGEABLE");
      }
      const unhiddenIds = pending
        .filter(({ hiddenAt }) => hiddenAt === null)
        .map(({ id }) => id);
      if (unhiddenIds.length > 0) {
        await this.database.$transaction([
          this.database.modelExchangePart.updateMany({
            where: { exchangeId: { in: unhiddenIds }, purgedAt: null },
            data: { hiddenAt: now, purgeAfter: requestedPurgeAfter },
          }),
          this.database.modelExchange.updateMany({
            where: { id: { in: unhiddenIds }, purgedAt: null },
            data: { hiddenAt: now, purgeAfter: requestedPurgeAfter },
          }),
        ]);
        for (const exchange of pending) {
          if (!unhiddenIds.includes(exchange.id)) continue;
          exchange.hiddenAt = now;
          exchange.purgeAfter = requestedPurgeAfter;
        }
      }
    }
    if (
      pending.some(
        ({ hiddenAt, purgeAfter }) =>
          hiddenAt === null || purgeAfter === null || purgeAfter > now,
      )
    ) {
      throw new Error("MODEL_EXCHANGE_NOT_PURGEABLE");
    }
    if (pending.length === 0) {
      return {
        exchanges: 0,
        parts: 0,
        purgedBodies: 0,
        retainedSharedBodies: 0,
      };
    }

    const pendingIds = pending.map(({ id }) => id);
    const bodyIds = [
      ...new Set(
        pending.flatMap(({ parts }) =>
          parts.flatMap(({ contentBodyId }) =>
            contentBodyId ? [contentBodyId] : [],
          ),
        ),
      ),
    ];
    const bodies = await this.database.modelContentBody.findMany({
      where: { id: { in: bodyIds } },
      select: {
        id: true,
        _count: {
          select: {
            messageBlockContents: true,
            messageBlockTableCells: true,
            instructions: true,
            runGoals: true,
            proposalPayloads: true,
            artifactRevisions: true,
            memoryClaims: true,
            toolInputs: true,
            toolResults: true,
            agentEvents: true,
            exchangeParts: {
              where: { exchangeId: { notIn: pendingIds } },
            },
          },
        },
      },
    });
    if (bodies.length !== bodyIds.length) {
      throw new Error("MODEL_EXCHANGE_CONTENT_REFERENCE_MISSING");
    }
    const exclusiveBodyIds = bodies
      .filter(({ _count }) =>
        Object.values(_count).every((referenceCount) => referenceCount === 0),
      )
      .map(({ id }) => id);
    const purgedBodies = await this.contentBodies.cryptoshred(
      exclusiveBodyIds,
      now,
    );
    const partCount = pending.reduce(
      (total, exchange) => total + exchange.parts.length,
      0,
    );
    await this.database.$transaction([
      this.database.modelExchangePart.updateMany({
        where: { exchangeId: { in: pendingIds }, purgedAt: null },
        data: {
          contentBodyId: null,
          assetRevisionId: null,
          hiddenAt: now,
          purgeAfter: now,
          purgedAt: now,
        },
      }),
      this.database.modelExchange.updateMany({
        where: { id: { in: pendingIds }, purgedAt: null },
        data: { hiddenAt: now, purgeAfter: now, purgedAt: now },
      }),
    ]);
    return {
      exchanges: pending.length,
      parts: partCount,
      purgedBodies,
      retainedSharedBodies: bodyIds.length - exclusiveBodyIds.length,
    };
  }

  private async requireOwnership(
    ids: readonly string[],
    ownerUserId: string,
  ): Promise<void> {
    const owned = await this.database.modelExchange.count({
      where: {
        id: { in: [...ids] },
        invocation: { permit: { ownerUserId } },
      },
    });
    if (owned !== ids.length) {
      throw new Error("MODEL_EXCHANGE_OWNER_MISMATCH");
    }
  }
}

function purgeCaller(
  serviceKey: string,
  purgeAfter: string | undefined,
): ModelExchangeLifecycleCaller {
  if (
    serviceKey === ModelExchangeLifecycleCaller.AGENT_API &&
    purgeAfter === undefined
  ) {
    return ModelExchangeLifecycleCaller.AGENT_API;
  }
  if (
    serviceKey === ModelExchangeLifecycleCaller.AUTOMATION_EXECUTOR &&
    typeof purgeAfter === "string"
  ) {
    return ModelExchangeLifecycleCaller.AUTOMATION_EXECUTOR;
  }
  throw new Error("MODEL_EXCHANGE_PURGE_FORBIDDEN");
}

function parseDate(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("MODEL_EXCHANGE_PURGE_AFTER_INVALID");
  }
  return parsed;
}

function uniqueIds(value: readonly string[]): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 10_000 ||
    value.some(
      (id) =>
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  ) {
    throw new Error("MODEL_EXCHANGE_IDS_INVALID");
  }
  const ids = [...new Set(value)];
  if (ids.length !== value.length) {
    throw new Error("MODEL_EXCHANGE_IDS_DUPLICATE");
  }
  return ids;
}
