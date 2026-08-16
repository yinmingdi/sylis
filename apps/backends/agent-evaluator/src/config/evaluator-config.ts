export interface AgentEvaluatorConfig {
  instanceId: string;
  adminApiUrl: string;
  agentApiUrl: string;
  modelGatewayUrl: string;
  serviceToken: string;
  port: number;
}

export function agentEvaluatorConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AgentEvaluatorConfig {
  return {
    instanceId: env.RAILWAY_REPLICA_ID ?? `agent-evaluator-${process.pid}`,
    adminApiUrl: required(env, "ADMIN_API_URL"),
    agentApiUrl: required(env, "AGENT_API_URL"),
    modelGatewayUrl: required(env, "MODEL_GATEWAY_URL"),
    serviceToken: required(env, "SERVICE_GRANT_TOKEN"),
    port: parsePort(env.PORT, 3500),
  };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`CONFIG_REQUIRED:${key}`);
  return value;
}

function parsePort(value: string | undefined, fallback: number): number {
  const port = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("CONFIG_PORT_INVALID");
  }
  return port;
}
