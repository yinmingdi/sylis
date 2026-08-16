import { PageHeader } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";

import { EntityRows, QueryBoundary } from "../../components";
import { deploymentQuery } from "../../modules/deployments";
import { useAdminQueryScope } from "../../modules/identity";

export function DeploymentsPage() {
  const scope = useAdminQueryScope();
  const query = useQuery(deploymentQuery(scope));
  return (
    <div className="admin-page">
      <PageHeader eyebrow="Delivery evidence" title="Deployments" />
      <QueryBoundary pending={query.isPending} error={query.error}>
        <EntityRows data={query.data} />
      </QueryBoundary>
    </div>
  );
}
