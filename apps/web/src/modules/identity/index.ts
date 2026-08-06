import { apiClient } from "@sylis/api-client";

export const sessionQuery = {
  queryKey: ["identity", "session"] as const,
  queryFn: () => apiClient.identity.session(),
  retry: false,
};

export const consentsQuery = {
  queryKey: ["identity", "consents"] as const,
  queryFn: () => apiClient.identity.consents(),
};

export function activeConsentId(value: unknown, purpose: string) {
  if (!Array.isArray(value)) return undefined;
  const record = value.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).purpose === purpose,
  ) as Record<string, unknown> | undefined;
  return record?.decision === "GRANTED" && typeof record.id === "string"
    ? record.id
    : undefined;
}

export const identityCommands = apiClient.identity;
export const dataCommands = apiClient.data;
