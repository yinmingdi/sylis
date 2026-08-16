import { createBrowserRouter } from "react-router-dom";

import { AdminGuard } from "./guard";
import { AgentReleasesPage } from "../../pages/agent-releases/agent-releases-page";
import { AgentRunsPage } from "../../pages/agent-runs/agent-runs-page";
import { AiUsagePage } from "../../pages/ai-usage/ai-usage-page";
import { AssetsPage } from "../../pages/assets/assets-page";
import { AuditPage } from "../../pages/audit/audit-page";
import { BuildRunsPage } from "../../pages/build-runs/build-runs-page";
import { CredentialsPage } from "../../pages/credentials/credentials-page";
import { DeploymentsPage } from "../../pages/deployments/deployments-page";
import { AdminLoginPage } from "../../pages/identity/login-page";
import { JobsPage } from "../../pages/jobs/jobs-page";
import { LexiconReleasesPage } from "../../pages/lexicon-releases/lexicon-releases-page";
import { OperatorRolesPage } from "../../pages/operator-roles/operator-roles-page";
import { OverviewPage } from "../../pages/overview/overview-page";
import { ProviderRoutesPage } from "../../pages/provider-routes/provider-routes-page";
import { PublishRunsPage } from "../../pages/publish-runs/publish-runs-page";
import { ReviewsPage } from "../../pages/reviews/reviews-page";
import { RightsDecisionsPage } from "../../pages/rights-decisions/rights-decisions-page";
import { SourceDatasetsPage } from "../../pages/source-datasets/source-datasets-page";
import { UserSupportPage } from "../../pages/user-support/user-support-page";
import { AdminShell } from "../layout/admin-shell";

export const router = createBrowserRouter([
  { path: "/login", element: <AdminLoginPage /> },
  {
    element: <AdminGuard />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "/lexicon/sources", element: <SourceDatasetsPage /> },
          {
            path: "/lexicon/sources/:datasetId/versions/:versionId",
            element: <SourceDatasetsPage />,
          },
          { path: "/lexicon/rights", element: <RightsDecisionsPage /> },
          { path: "/lexicon/build-runs", element: <BuildRunsPage /> },
          { path: "/lexicon/build-runs/:runId", element: <BuildRunsPage /> },
          { path: "/lexicon/reviews", element: <ReviewsPage /> },
          { path: "/lexicon/reviews/:batchId", element: <ReviewsPage /> },
          { path: "/lexicon/publish-runs", element: <PublishRunsPage /> },
          {
            path: "/lexicon/publish-runs/:runId",
            element: <PublishRunsPage />,
          },
          { path: "/lexicon/releases", element: <LexiconReleasesPage /> },
          {
            path: "/lexicon/releases/:releaseId",
            element: <LexiconReleasesPage />,
          },
          { path: "/jobs", element: <JobsPage /> },
          { path: "/jobs/:jobId", element: <JobsPage /> },
          { path: "/agent/runs", element: <AgentRunsPage /> },
          { path: "/agent/runs/:runId", element: <AgentRunsPage /> },
          { path: "/agent/releases", element: <AgentReleasesPage /> },
          {
            path: "/agent/releases/:releaseId",
            element: <AgentReleasesPage />,
          },
          { path: "/models/routes", element: <ProviderRoutesPage /> },
          { path: "/models/credentials", element: <CredentialsPage /> },
          { path: "/models/usage", element: <AiUsagePage /> },
          { path: "/assets", element: <AssetsPage /> },
          { path: "/assets/:assetId", element: <AssetsPage /> },
          { path: "/users/support", element: <UserSupportPage /> },
          { path: "/security/operators", element: <OperatorRolesPage /> },
          { path: "/security/audit", element: <AuditPage /> },
          { path: "/deployments", element: <DeploymentsPage /> },
        ],
      },
    ],
  },
]);
