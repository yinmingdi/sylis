import {
  agentContentDigest,
  capabilityReleaseDigest,
} from "@sylis/agent-contracts/release-fixtures";
import {
  AgentReleaseEnvironment,
  AgentReleaseEventKind,
  AgentReleaseKind,
  CredentialOwnerKind,
  CredentialStatus,
  ImmutableReleaseStatus,
  type AgentExecutionMode,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import { stableUuid } from "@sylis/utils";

export enum LocalDeepSeekCapabilityVersion {
  V0_0_3 = "0.0.3",
}

export enum LocalDeepSeekReleasePolicyVersion {
  V1 = "local-deepseek-runtime/1",
}

export interface LocalCapabilitySource {
  id: string;
  capabilityKey: string;
  executionMode: AgentExecutionMode;
  systemPrompt: string;
  promptHash: string;
  toolPolicyVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  contextTokenBudget: number;
  maxChildRuns: number;
  maxSteps: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  toolDependencies: ReadonlyArray<{ toolReleaseId: string }>;
  skillDependencies: ReadonlyArray<{ skillReleaseId: string }>;
  evalRequirements: ReadonlyArray<{
    evalReleaseId: string;
    minimumScore: { toString(): string };
  }>;
}

export interface LocalDeepSeekCapabilityRelease {
  id: string;
  sourceReleaseId: string;
  capabilityKey: string;
  version: LocalDeepSeekCapabilityVersion;
  executionMode: AgentExecutionMode;
  systemPrompt: string;
  promptHash: string;
  toolPolicyVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  contextTokenBudget: number;
  maxChildRuns: number;
  maxSteps: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  allowedRouteReleaseIds: readonly string[];
  toolReleaseIds: readonly string[];
  skillReleaseIds: readonly string[];
  evalRequirements: ReadonlyArray<{
    evalReleaseId: string;
    minimumScore: string;
  }>;
  releaseDigest: string;
}

export interface LocalDeepSeekRuntimeActivation {
  routeReleaseId: string;
  credentialRevisionId: string;
  capabilityReleaseIds: readonly string[];
}

const DEEPSEEK_ROUTE_SELECTOR = {
  providerKey: "deepseek",
  modelId: "deepseek-v4-flash",
  adapterVersion: "deepseek-chat-completions/1",
  policyVersion: "deepseek-nonthinking-strict-tools/1",
} as const;

export async function activateLocalDeepSeekRuntime(
  database: SylisDatabase,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LocalDeepSeekRuntimeActivation> {
  assertLocalDeepSeekActivation(env);
  const route = await database.providerRouteRelease.findFirst({
    where: {
      ...DEEPSEEK_ROUTE_SELECTOR,
      status: ImmutableReleaseStatus.PUBLISHED,
    },
  });
  if (!route) throw new Error("DEEPSEEK_ROUTE_RELEASE_NOT_PUBLISHED");
  const credential = await database.credentialProfile.findFirst({
    where: {
      ownerKind: CredentialOwnerKind.PLATFORM,
      providerKey: DEEPSEEK_ROUTE_SELECTOR.providerKey,
      status: CredentialStatus.VERIFIED,
      currentRevision: { is: { status: CredentialStatus.VERIFIED } },
    },
    select: { currentRevisionId: true },
    orderBy: { createdAt: "desc" },
  });
  if (!credential?.currentRevisionId) {
    throw new Error("DEEPSEEK_PLATFORM_CREDENTIAL_NOT_VERIFIED");
  }
  const credentialRevisionId = credential.currentRevisionId;

  const capabilityReleaseIds = await database.$transaction(
    async (transaction) => {
      const deployments = await transaction.agentReleaseDeployment.findMany({
        where: {
          releaseKind: AgentReleaseKind.CAPABILITY,
          environment: AgentReleaseEnvironment.PRODUCTION,
        },
        orderBy: { releaseKey: "asc" },
      });
      if (deployments.length === 0) {
        throw new Error("ACTIVE_CAPABILITY_RELEASES_NOT_FOUND");
      }
      const activated: string[] = [];
      for (const deployment of deployments) {
        const source = await transaction.capabilityRelease.findUnique({
          where: { id: deployment.activeReleaseId },
          include: {
            allowedRoutes: true,
            toolDependencies: true,
            skillDependencies: true,
            evalRequirements: true,
          },
        });
        if (!source || source.status !== ImmutableReleaseStatus.PUBLISHED) {
          throw new Error(
            `ACTIVE_CAPABILITY_RELEASE_INVALID:${deployment.releaseKey}`,
          );
        }
        if (
          source.version === LocalDeepSeekCapabilityVersion.V0_0_3 &&
          source.allowedRoutes.length === 1 &&
          source.allowedRoutes[0]?.routeReleaseId === route.id
        ) {
          activated.push(source.id);
          continue;
        }
        const definition = localDeepSeekCapabilityRelease(source, route.id);
        const existing = await transaction.capabilityRelease.findUnique({
          where: { id: definition.id },
          include: {
            allowedRoutes: true,
            toolDependencies: true,
            skillDependencies: true,
            evalRequirements: true,
          },
        });
        if (existing) {
          if (
            existing.releaseDigest !== definition.releaseDigest ||
            capabilityDigest(existing) !== definition.releaseDigest
          ) {
            throw new Error(
              `LOCAL_DEEPSEEK_CAPABILITY_CONFLICT:${definition.capabilityKey}`,
            );
          }
          if (existing.status === ImmutableReleaseStatus.REVOKED) {
            throw new Error(
              `LOCAL_DEEPSEEK_CAPABILITY_REVOKED:${definition.capabilityKey}`,
            );
          }
          if (existing.status === ImmutableReleaseStatus.DRAFT) {
            await transaction.capabilityRelease.update({
              where: { id: definition.id },
              data: { status: ImmutableReleaseStatus.CANDIDATE },
            });
          }
          if (existing.status !== ImmutableReleaseStatus.PUBLISHED) {
            await transaction.capabilityRelease.update({
              where: { id: definition.id },
              data: { status: ImmutableReleaseStatus.PUBLISHED },
            });
          }
        } else {
          await transaction.capabilityRelease.create({
            data: {
              id: definition.id,
              capabilityKey: definition.capabilityKey,
              version: definition.version,
              executionMode: definition.executionMode,
              systemPrompt: definition.systemPrompt,
              promptHash: definition.promptHash,
              toolPolicyVersion: definition.toolPolicyVersion,
              inputSchemaVersion: definition.inputSchemaVersion,
              outputSchemaVersion: definition.outputSchemaVersion,
              contextTokenBudget: definition.contextTokenBudget,
              maxChildRuns: definition.maxChildRuns,
              maxSteps: definition.maxSteps,
              maxToolCalls: definition.maxToolCalls,
              maxOutputTokens: definition.maxOutputTokens,
              status: ImmutableReleaseStatus.DRAFT,
              releaseEvidence: {
                source: "local-bootstrap",
                sourceReleaseId: definition.sourceReleaseId,
                checks: [
                  "deterministic-release",
                  "verified-platform-credential",
                ],
              } as PrismaTypes.InputJsonValue,
              releaseDigest: definition.releaseDigest,
            },
          });
          await transaction.capabilityRouteAllowance.create({
            data: {
              capabilityReleaseId: definition.id,
              routeReleaseId: route.id,
            },
          });
          if (definition.toolReleaseIds.length > 0) {
            await transaction.capabilityToolRelease.createMany({
              data: definition.toolReleaseIds.map((toolReleaseId) => ({
                capabilityReleaseId: definition.id,
                toolReleaseId,
              })),
            });
          }
          if (definition.skillReleaseIds.length > 0) {
            await transaction.capabilitySkillRelease.createMany({
              data: definition.skillReleaseIds.map((skillReleaseId) => ({
                capabilityReleaseId: definition.id,
                skillReleaseId,
              })),
            });
          }
          await transaction.capabilityEvalRequirement.createMany({
            data: definition.evalRequirements.map((requirement) => ({
              capabilityReleaseId: definition.id,
              evalReleaseId: requirement.evalReleaseId,
              minimumScore: requirement.minimumScore,
            })),
          });
          await transaction.capabilityRelease.update({
            where: { id: definition.id },
            data: { status: ImmutableReleaseStatus.CANDIDATE },
          });
          await transaction.capabilityRelease.update({
            where: { id: definition.id },
            data: { status: ImmutableReleaseStatus.PUBLISHED },
          });
        }

        const validationDigest = agentContentDigest({
          action: "local.deepseek.validate",
          releaseId: definition.id,
          routeReleaseId: route.id,
          credentialRevisionId,
        });
        await transaction.agentReleaseEvent.upsert({
          where: { actionDigest: validationDigest },
          create: {
            releaseKind: AgentReleaseKind.CAPABILITY,
            releaseId: definition.id,
            kind: AgentReleaseEventKind.VALIDATED,
            actorRef: "local-deepseek-bootstrap",
            reason: "local DeepSeek runtime validation",
            policyVersion: LocalDeepSeekReleasePolicyVersion.V1,
            actionDigest: validationDigest,
          },
          update: {},
        });
        const activationDigest = agentContentDigest({
          action: "local.deepseek.activate",
          releaseId: definition.id,
          previousReleaseId: deployment.activeReleaseId,
          routeReleaseId: route.id,
        });
        if (deployment.activeReleaseId !== definition.id) {
          await transaction.agentReleaseDeployment.update({
            where: { id: deployment.id },
            data: {
              activeReleaseId: definition.id,
              generation: { increment: 1 },
              actionDigest: activationDigest,
              updatedBy: "local-deepseek-bootstrap",
            },
          });
        }
        activated.push(definition.id);
      }
      return activated;
    },
  );

  return {
    routeReleaseId: route.id,
    credentialRevisionId,
    capabilityReleaseIds,
  };
}

export function localDeepSeekCapabilityRelease(
  source: LocalCapabilitySource,
  routeReleaseId: string,
): LocalDeepSeekCapabilityRelease {
  const base = {
    capabilityKey: source.capabilityKey,
    version: LocalDeepSeekCapabilityVersion.V0_0_3,
    executionMode: source.executionMode,
    systemPrompt: source.systemPrompt,
    promptHash: source.promptHash,
    toolPolicyVersion: source.toolPolicyVersion,
    inputSchemaVersion: source.inputSchemaVersion,
    outputSchemaVersion: source.outputSchemaVersion,
    contextTokenBudget: source.contextTokenBudget,
    maxChildRuns: source.maxChildRuns,
    maxSteps: source.maxSteps,
    maxToolCalls: source.maxToolCalls,
    maxOutputTokens: source.maxOutputTokens,
    allowedRouteReleaseIds: [routeReleaseId],
    toolReleaseIds: source.toolDependencies.map(
      ({ toolReleaseId }) => toolReleaseId,
    ),
    skillReleaseIds: source.skillDependencies.map(
      ({ skillReleaseId }) => skillReleaseId,
    ),
    evalRequirements: source.evalRequirements.map(
      ({ evalReleaseId, minimumScore }) => ({
        evalReleaseId,
        minimumScore: minimumScore.toString(),
      }),
    ),
  } as const;
  return {
    id: stableUuid(
      [
        "sylis.capability-release/1",
        base.capabilityKey,
        base.version,
        routeReleaseId,
      ].join("\u001f"),
    ),
    sourceReleaseId: source.id,
    ...base,
    releaseDigest: capabilityReleaseDigest(base),
  };
}

export function assertLocalDeepSeekActivation(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const nodeEnvironment = env.NODE_ENV?.trim() || "development";
  if (nodeEnvironment !== "development" || env.RAILWAY_ENVIRONMENT_ID) {
    throw new Error("LOCAL_DEEPSEEK_ACTIVATION_FORBIDDEN");
  }
}

function capabilityDigest(
  source: LocalCapabilitySource & {
    version?: string;
    allowedRoutes: ReadonlyArray<{ routeReleaseId: string }>;
  },
): string {
  return capabilityReleaseDigest({
    capabilityKey: source.capabilityKey,
    version: source.version ?? LocalDeepSeekCapabilityVersion.V0_0_3,
    executionMode: source.executionMode,
    systemPrompt: source.systemPrompt,
    promptHash: source.promptHash,
    toolPolicyVersion: source.toolPolicyVersion,
    inputSchemaVersion: source.inputSchemaVersion,
    outputSchemaVersion: source.outputSchemaVersion,
    contextTokenBudget: source.contextTokenBudget,
    maxChildRuns: source.maxChildRuns,
    maxSteps: source.maxSteps,
    maxToolCalls: source.maxToolCalls,
    maxOutputTokens: source.maxOutputTokens,
    allowedRouteReleaseIds: source.allowedRoutes.map(
      ({ routeReleaseId }) => routeReleaseId,
    ),
    toolReleaseIds: source.toolDependencies.map(
      ({ toolReleaseId }) => toolReleaseId,
    ),
    skillReleaseIds: source.skillDependencies.map(
      ({ skillReleaseId }) => skillReleaseId,
    ),
    evalRequirements: source.evalRequirements.map(
      ({ evalReleaseId, minimumScore }) => ({
        evalReleaseId,
        minimumScore: minimumScore.toString(),
      }),
    ),
  });
}
