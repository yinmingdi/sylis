import { PageHeader, StatusBadge } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";

import { QueryBoundary } from "../../components";
import { useAdminQueryScope } from "../../modules/identity";
import { overviewQuery } from "../../modules/overview";
import { record, value } from "../../utils";

export function OverviewPage() {
  const scope = useAdminQueryScope();
  const query = useQuery(overviewQuery(scope));
  const sections = query.data?.sections ?? {};
  return (
    <div className="admin-page">
      <PageHeader eyebrow="Operations" title="概览" />
      <QueryBoundary pending={query.isPending} error={query.error}>
        <div className="admin-metrics">
          {Object.entries(sections).map(([key, section]) => {
            const data = record(section.data);
            return (
              <div key={key}>
                <span className="admin-metrics__label">{key}</span>
                <strong>
                  {value(data.pendingCandidates ?? data.count, section.status)}
                </strong>
                <StatusBadge
                  tone={
                    section.status === "READY"
                      ? "positive"
                      : section.status === "DEGRADED"
                        ? "danger"
                        : "info"
                  }
                >
                  {section.status}
                </StatusBadge>
              </div>
            );
          })}
        </div>
      </QueryBoundary>
    </div>
  );
}
