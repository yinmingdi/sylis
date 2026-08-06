import { DataList, EmptyState, FileText, StatusBadge } from "@sylis/components";
import type { ReactNode } from "react";

export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
export const value = (input: unknown, fallback = "-"): string =>
  typeof input === "string" || typeof input === "number"
    ? String(input)
    : fallback;
export function QueryBoundary({
  pending,
  error,
  children,
}: {
  pending: boolean;
  error: Error | null;
  children: ReactNode;
}) {
  if (pending) return <div className="admin-loading">载入中</div>;
  if (error)
    return (
      <EmptyState
        icon={FileText}
        title="载入失败"
        description={error.message}
      />
    );
  return <>{children}</>;
}
export function EntityRows({ data }: { data: unknown }) {
  const rows = array(data).map(record);
  return rows.length ? (
    <DataList
      rows={rows.map((row, index) => ({
        label: value(
          row.title ?? row.name ?? row.kind ?? row.eventType,
          `记录 ${index + 1}`,
        ),
        value: (
          <>
            <strong>
              {value(row.status ?? row.state ?? row.version ?? row.actionType)}
            </strong>
            {row.status || row.state ? (
              <StatusBadge
                tone={
                  ["SUCCEEDED", "VALIDATED", "APPROVED"].includes(
                    value(row.status ?? row.state),
                  )
                    ? "positive"
                    : ["FAILED", "REJECTED"].includes(
                          value(row.status ?? row.state),
                        )
                      ? "danger"
                      : "info"
                }
              >
                {value(row.status ?? row.state)}
              </StatusBadge>
            ) : null}
          </>
        ),
        detail: value(row.id ?? row.createdAt),
      }))}
    />
  ) : (
    <EmptyState
      icon={FileText}
      title="暂无记录"
      description="当前筛选范围没有记录。"
    />
  );
}
