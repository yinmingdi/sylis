import { createBrowserRouter } from "react-router-dom";

import { AdminGuard } from "./guard";
import { operationQueries } from "../../modules/operations";
import { BuildsPage } from "../../pages/builds/builds-page";
import { DashboardPage } from "../../pages/dashboard/dashboard-page";
import { AdminLoginPage } from "../../pages/identity/login-page";
import { ImportsPage } from "../../pages/imports/imports-page";
import { EntityPage } from "../../pages/operations/entity-page";
import { JobsPage } from "../../pages/operations/jobs-page";
import { RuntimeAiPage } from "../../pages/operations/runtime-ai-page";
import { SourcesPage } from "../../pages/operations/sources-page";
import { UsersPage } from "../../pages/operations/users-page";
import { ReleasesPage } from "../../pages/releases/releases-page";
import { AdminShell } from "../layout/admin-shell";

export const router = createBrowserRouter([
  { path: "/login", element: <AdminLoginPage /> },
  {
    element: <AdminGuard />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "/builds", element: <BuildsPage /> },
          { path: "/imports", element: <ImportsPage /> },
          { path: "/releases", element: <ReleasesPage /> },
          { path: "/jobs", element: <JobsPage /> },
          {
            path: "/source-rights",
            element: (
              <EntityPage
                eyebrow="Governance"
                title="来源权利"
                query={operationQueries.rights}
              />
            ),
          },
          { path: "/sources", element: <SourcesPage /> },
          {
            path: "/ai-usage",
            element: (
              <EntityPage
                eyebrow="Runtime AI"
                title="AI 用量"
                query={operationQueries.usage}
              />
            ),
          },
          { path: "/runtime-ai", element: <RuntimeAiPage /> },
          {
            path: "/deployments",
            element: (
              <EntityPage
                eyebrow="Delivery evidence"
                title="部署记录"
                query={operationQueries.deployments}
              />
            ),
          },
          {
            path: "/audit",
            element: (
              <EntityPage
                eyebrow="Security"
                title="审计事件"
                query={operationQueries.audit}
              />
            ),
          },
          { path: "/users", element: <UsersPage /> },
        ],
      },
    ],
  },
]);
