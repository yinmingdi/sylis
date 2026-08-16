export * from "./client";
export * from "./contracts";
export * from "./transport";

import { createApiClient } from "./client";

export const apiClient = createApiClient();
