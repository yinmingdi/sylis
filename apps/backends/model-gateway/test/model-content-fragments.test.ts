import type { ModelContentFragmentInput } from "@sylis/agent-contracts";
import {
  ModelPurposeKind,
  ModelRetentionMode,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayConfig } from "../src/config/model-gateway.config";
import { ModelContentBodyService } from "../src/modules/content-bodies/model-content-body.service";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const INVOCATION_ID = "20000000-0000-4000-8000-000000000001";
const BODY_ID = "30000000-0000-4000-8000-000000000001";

describe("ModelContentBodyService Agent fragments", () => {
  it("keeps exact historical snapshots while the body resolves to the latest snapshot", async () => {
    const { service } = fixture();
    const firstContent = JSON.stringify([
      { kind: "TEXT", text: "Hel", marks: [] },
    ]);
    const finalContent = JSON.stringify([
      { kind: "TEXT", text: "Hello", marks: [] },
    ]);

    const first = await service.appendAgentFragment(
      "agent-executor",
      fragmentInput(0, firstContent, false),
    );
    const final = await service.appendAgentFragment(
      "agent-executor",
      fragmentInput(1, finalContent, true),
    );

    await expect(
      service.read("agent-api", BODY_ID, USER_ID),
    ).resolves.toMatchObject({
      id: BODY_ID,
      plaintext: finalContent,
      contentHash: final.contentHash,
    });
    await expect(
      service.readAgentFragment("agent-api", first.contentFragmentId, USER_ID),
    ).resolves.toEqual({
      contentBodyId: BODY_ID,
      plaintext: firstContent,
      contentHash: first.contentHash,
    });
    await expect(
      service.readAgentFragment("agent-api", final.contentFragmentId, USER_ID),
    ).resolves.toEqual({
      contentBodyId: BODY_ID,
      plaintext: finalContent,
      contentHash: final.contentHash,
    });
  });

  it("cryptoshreds fragment envelopes together with their parent body", async () => {
    const bodyUpdate = vi.fn();
    const fragmentUpdate = vi.fn();
    const database = {
      modelContentBody: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: BODY_ID, hiddenAt: new Date(), purgeAfter: new Date() },
          ]),
      },
      $transaction: vi.fn(
        async (callback: (transaction: unknown) => Promise<unknown>) =>
          callback({
            modelContentBody: { update: bodyUpdate },
            modelContentFragment: { updateMany: fragmentUpdate },
          }),
      ),
    };
    const service = new ModelContentBodyService(
      database as unknown as SylisDatabase,
      {
        contentKekVersion: "content-v1",
        contentKeks: { "content-v1": Buffer.alloc(32, 7) },
      } as unknown as ModelGatewayConfig,
    );

    await expect(service.cryptoshred([BODY_ID], new Date())).resolves.toBe(1);

    expect(bodyUpdate).toHaveBeenCalledOnce();
    expect(fragmentUpdate).toHaveBeenCalledWith({
      where: { bodyId: BODY_ID },
      data: expect.objectContaining({
        ciphertext: expect.any(Buffer),
        encryptedDek: expect.any(Buffer),
        kekVersion: "purged",
        fragmentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }),
    });
    expect(bodyUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      fragmentUpdate.mock.invocationCallOrder[0]!,
    );
  });
});

function fragmentInput(
  fragmentSequence: number,
  serializedContent: string,
  seal: boolean,
): ModelContentFragmentInput {
  return {
    invocationId: INVOCATION_ID,
    contentBodyId: BODY_ID,
    modelPosition: 0,
    modelSubPosition: 0,
    fragmentSequence,
    serializedContent,
    seal,
  };
}

function fixture() {
  type Body = Record<string, unknown> & {
    id: string;
    ownerUserId: string | null;
    hiddenAt: Date | null;
    purgedAt: Date | null;
    sealedAt: Date | null;
  };
  type Fragment = Record<string, unknown> & {
    id: string;
    bodyId: string;
    invocationId: string;
    modelPosition: number;
    modelSubPosition: number;
    fragmentSequence: number;
  };
  const bodies = new Map<string, Body>();
  const fragments = new Map<string, Fragment>();
  const fragmentBySequence = (where: Record<string, unknown>) => {
    const key =
      where.invocationId_modelPosition_modelSubPosition_fragmentSequence as
        | {
            invocationId: string;
            modelPosition: number;
            modelSubPosition: number;
            fragmentSequence: number;
          }
        | undefined;
    if (!key) return undefined;
    return [...fragments.values()].find(
      (fragment) =>
        fragment.invocationId === key.invocationId &&
        fragment.modelPosition === key.modelPosition &&
        fragment.modelSubPosition === key.modelSubPosition &&
        fragment.fragmentSequence === key.fragmentSequence,
    );
  };
  const fragmentWithBody = (fragment: Fragment | undefined) =>
    fragment ? { ...fragment, body: bodies.get(fragment.bodyId) } : null;
  const modelContentBody = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if (typeof where.id === "string") return bodies.get(where.id) ?? null;
      if (typeof where.requestKey === "string") {
        return (
          [...bodies.values()].find(
            (body) => body.requestKey === where.requestKey,
          ) ?? null
        );
      }
      return null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const body = bodies.get(where.id);
      if (!body) throw new Error("BODY_NOT_FOUND");
      return body;
    }),
    findFirst: vi.fn(
      async ({ where }: { where: { id: string; ownerUserId: string } }) => {
        const body = bodies.get(where.id);
        if (
          !body ||
          body.ownerUserId !== where.ownerUserId ||
          body.hiddenAt ||
          body.purgedAt
        ) {
          return null;
        }
        const latest = [...fragments.values()]
          .filter((fragment) => fragment.bodyId === body.id)
          .sort(
            (left, right) => right.fragmentSequence - left.fragmentSequence,
          )[0];
        return { ...body, fragments: latest ? [latest] : [] };
      },
    ),
    create: vi.fn(async ({ data }: { data: Body }) => {
      const body = {
        ...data,
        hiddenAt: null,
        purgedAt: null,
        sealedAt: null,
      };
      bodies.set(body.id, body);
      return body;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Body>;
      }) => {
        const body = bodies.get(where.id);
        if (!body) throw new Error("BODY_NOT_FOUND");
        Object.assign(body, data);
        return body;
      },
    ),
  };
  const modelContentFragment = {
    findUnique: vi.fn(
      async ({
        where,
        include,
      }: {
        where: Record<string, unknown>;
        include?: unknown;
      }) => {
        const fragment = fragmentBySequence(where);
        return include ? fragmentWithBody(fragment) : (fragment ?? null);
      },
    ),
    findUniqueOrThrow: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) => {
        const fragment = fragmentBySequence(where);
        if (!fragment) throw new Error("FRAGMENT_NOT_FOUND");
        return fragment;
      },
    ),
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { id: string; body: { ownerUserId: string } };
      }) => {
        const fragment = fragments.get(where.id);
        const body = fragment ? bodies.get(fragment.bodyId) : undefined;
        if (
          !fragment ||
          !body ||
          body.ownerUserId !== where.body.ownerUserId ||
          body.hiddenAt ||
          body.purgedAt
        ) {
          return null;
        }
        return { ...fragment, body };
      },
    ),
    create: vi.fn(async ({ data }: { data: Fragment }) => {
      fragments.set(data.id, data);
      return data;
    }),
  };
  const database = {
    modelInvocation: {
      findUnique: vi.fn().mockResolvedValue({
        id: INVOCATION_ID,
        purpose: ModelPurposeKind.AGENT_RUN,
        permit: {
          ownerUserId: USER_ID,
          retentionMode: ModelRetentionMode.ENCRYPTED_EXCHANGE,
        },
      }),
    },
    modelContentBody,
    modelContentFragment,
    $transaction: vi.fn(
      async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({
          $queryRaw: vi.fn(),
          modelContentBody,
          modelContentFragment,
        }),
    ),
  };
  const key = Buffer.alloc(32, 7);
  const config = {
    contentKekVersion: "content-v1",
    contentKeks: { "content-v1": key },
  } as unknown as ModelGatewayConfig;
  return {
    service: new ModelContentBodyService(
      database as unknown as SylisDatabase,
      config,
    ),
    database,
  };
}
