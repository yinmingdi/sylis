import { Button, Download, PageHeader } from "@sylis/components";
import { useMutation, useQuery } from "@tanstack/react-query";

import { dataCommands } from "../../modules/identity";
import { JobProgress } from "../../modules/jobs";
import { asRecord, stringValue } from "../page-values";

export function DataPage() {
  const request = useMutation({
    mutationFn: () =>
      dataCommands.requestExport(
        { include: ["identity", "study", "reading", "notebooks", "ai"] },
        crypto.randomUUID(),
      ),
  });
  const requestId = request.data?.requestId ?? "";
  const exportQuery = useQuery({
    queryKey: ["identity", "data-export", requestId],
    queryFn: () => dataCommands.exportStatus(requestId),
    enabled: Boolean(requestId),
    refetchInterval: (query) =>
      asRecord(query.state.data).artifactUrl ? false : 5_000,
  });
  const exported = asRecord(exportQuery.data);
  const artifactUrl = stringValue(exported.artifactUrl, "");
  return (
    <div className="page">
      <PageHeader
        eyebrow="Data"
        title="我的数据"
        actions={
          <Button
            icon={Download}
            disabled={request.isPending}
            onClick={() => request.mutate()}
          >
            创建导出
          </Button>
        }
      />
      {request.data ? (
        <JobProgress
          jobId={request.data.jobId}
          onTerminal={() => void exportQuery.refetch()}
        />
      ) : null}
      {artifactUrl ? (
        <div className="settings-actions">
          <Button
            icon={Download}
            onClick={() => window.location.assign(artifactUrl)}
          >
            下载 JSON
          </Button>
          <span>
            下载链接将在{" "}
            {new Date(stringValue(exported.expiresAt)).toLocaleString()} 失效
          </span>
        </div>
      ) : null}
      {request.error ? (
        <p className="form-error">{request.error.message}</p>
      ) : null}
      {exportQuery.error ? (
        <p className="form-error">{exportQuery.error.message}</p>
      ) : null}
    </div>
  );
}
