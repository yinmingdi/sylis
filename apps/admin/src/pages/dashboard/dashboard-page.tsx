import { PageHeader, StatusBadge } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";

import { QueryBoundary, record, value } from "../../app/view-utils";
import { operationQueries } from "../../modules/operations";

export function DashboardPage() {
  const query = useQuery(operationQueries.dashboard);
  const data = record(query.data);
  return (
    <div className="admin-page">
      <PageHeader eyebrow="Operations" title="概览" />
      <QueryBoundary pending={query.isPending} error={query.error}>
        <div className="admin-metrics">
          {Object.entries(data).map(([key, item]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>
                {value(
                  typeof item === "object"
                    ? (record(item).count ?? record(item).status)
                    : item,
                )}
              </strong>
              {typeof item === "object" && record(item).status ? (
                <StatusBadge>{value(record(item).status)}</StatusBadge>
              ) : null}
            </div>
          ))}
        </div>
      </QueryBoundary>
    </div>
  );
}
