import { EmptyState, FileText } from "@sylis/components";
import type { ReactNode } from "react";

export function RemoteState({
  pending,
  error,
  empty,
  children,
}: {
  pending: boolean;
  error: Error | null;
  empty?: boolean;
  children: ReactNode;
}) {
  if (pending)
    return (
      <div className="skeleton-lines" aria-label="正在载入">
        <span />
        <span />
        <span />
      </div>
    );
  if (error)
    return (
      <EmptyState
        icon={FileText}
        title="载入失败"
        description={error.message}
      />
    );
  if (empty)
    return (
      <EmptyState
        icon={FileText}
        title="暂无内容"
        description="当前范围没有可显示的记录。"
      />
    );
  return <>{children}</>;
}
