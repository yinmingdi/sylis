import { AdminOperatorRole } from "@sylis/api-client/admin";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { adminSessionQuery } from "../../modules/identity";
import { AdminShell } from "./admin-shell";

const expectedNavigation = new Map<AdminOperatorRole, string[]>([
  [
    AdminOperatorRole.SUPPORT,
    ["概览", "Assets", "Jobs", "User Support", "Deployments"],
  ],
  [
    AdminOperatorRole.CONTENT_REVIEWER,
    ["概览", "Review Center", "Assets", "Jobs", "Deployments"],
  ],
  [
    AdminOperatorRole.LEXICON_OPERATOR,
    [
      "概览",
      "Sources",
      "Rights",
      "Build Runs",
      "Publish Runs",
      "Assets",
      "Jobs",
      "Deployments",
    ],
  ],
  [
    AdminOperatorRole.RELEASE_MANAGER,
    ["概览", "Releases", "Assets", "Jobs", "Deployments"],
  ],
  [
    AdminOperatorRole.MODEL_OPERATOR,
    [
      "概览",
      "Agent Runs",
      "Model Routes",
      "Credentials",
      "AI Usage",
      "Assets",
      "Jobs",
      "Deployments",
    ],
  ],
  [
    AdminOperatorRole.AGENT_RELEASE_MANAGER,
    ["概览", "Agent Runs", "Agent Releases", "Assets", "Jobs", "Deployments"],
  ],
  [
    AdminOperatorRole.SECURITY_ADMIN,
    [
      "概览",
      "Agent Runs",
      "Model Routes",
      "Credentials",
      "Assets",
      "Jobs",
      "User Support",
      "Operator Roles",
      "Audit",
      "Deployments",
    ],
  ],
]);

function renderAdminShell(roles: AdminOperatorRole[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(adminSessionQuery.queryKey, { roles });
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AdminShell />,
        children: [{ index: true, element: <h1>Admin overview</h1> }],
      },
    ],
    { initialEntries: ["/"] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("AdminShell", () => {
  it.each([...expectedNavigation])(
    "ADMIN-001-COMPONENT exposes only the navigation allowed for %s",
    (role, expectedLinks) => {
      renderAdminShell([role]);

      const navigation = screen.getByRole("navigation", {
        name: "Admin navigation",
      });
      const visibleLinks = within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent);
      expect(visibleLinks).toEqual(expectedLinks);
    },
  );

  it("ADMIN-001-A11Y has no automatically detectable accessibility violations", async () => {
    const { container } = renderAdminShell([AdminOperatorRole.SECURITY_ADMIN]);

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
