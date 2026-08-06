export interface DatabaseConfig {
  url: string;
  log: Array<"query" | "info" | "warn" | "error">;
}

export function databaseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return {
    url,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  };
}
