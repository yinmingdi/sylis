import { PageHeader } from "@sylis/components";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { EntityRows, QueryBoundary } from "../../app/view-utils";

export function EntityPage({
  title,
  eyebrow,
  query: options,
  actions,
}: {
  title: string;
  eyebrow: string;
  query: UseQueryOptions<unknown, Error>;
  actions?: ReactNode;
}) {
  const query = useQuery(options);
  return (
    <div className="admin-page">
      <PageHeader eyebrow={eyebrow} title={title} actions={actions} />
      <QueryBoundary pending={query.isPending} error={query.error}>
        <EntityRows data={query.data} />
      </QueryBoundary>
    </div>
  );
}
