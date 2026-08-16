import { request } from "@playwright/test";

import {
  DeploymentEnvironmentVariable,
  requiredDeploymentEnvironment,
  syntheticResourcePrefix,
} from "./runtime";

interface NotebookSummary {
  id?: unknown;
  name?: unknown;
}

async function cleanupSyntheticNotebooks(): Promise<void> {
  const rawOrigin = process.env.SYLIS_WEB_URL?.trim();
  if (!rawOrigin) throw new Error("SYLIS_WEB_URL_REQUIRED");
  const origin = new URL(rawOrigin).origin;
  const api = await request.newContext({ baseURL: origin });
  try {
    const login = await api.post("/api/v1/auth/sessions", {
      data: {
        email: requiredDeploymentEnvironment(
          DeploymentEnvironmentVariable.USER_EMAIL,
        ),
        password: requiredDeploymentEnvironment(
          DeploymentEnvironmentVariable.USER_PASSWORD,
        ),
      },
    });
    if (!login.ok()) {
      throw new Error(`SYNTHETIC_CLEANUP_LOGIN_HTTP_${login.status()}`);
    }
    const session = (await login.json()) as { csrfToken?: unknown };
    if (typeof session.csrfToken !== "string" || !session.csrfToken) {
      throw new Error("SYNTHETIC_CLEANUP_CSRF_TOKEN_REQUIRED");
    }
    const list = await api.get("/api/v1/notebooks");
    if (!list.ok())
      throw new Error(`SYNTHETIC_CLEANUP_LIST_HTTP_${list.status()}`);
    const notebooks = (await list.json()) as NotebookSummary[];
    const prefix = syntheticResourcePrefix();
    const targets = notebooks.filter(
      (notebook) =>
        typeof notebook.id === "string" &&
        typeof notebook.name === "string" &&
        notebook.name.startsWith(prefix),
    );
    for (const notebook of targets) {
      const response = await api.delete(`/api/v1/notebooks/${notebook.id}`, {
        headers: {
          Origin: origin,
          "X-CSRF-Token": session.csrfToken,
        },
      });
      if (!response.ok()) {
        throw new Error(
          `SYNTHETIC_CLEANUP_DELETE_${String(notebook.id)}_HTTP_${response.status()}`,
        );
      }
    }
    process.stdout.write(
      `${JSON.stringify({ removed: targets.length, prefix })}\n`,
    );
  } finally {
    await api.dispose();
  }
}

await cleanupSyntheticNotebooks();
