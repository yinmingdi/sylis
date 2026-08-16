import { JobStatus } from "@sylis/api-client/admin";
import {
  Button,
  DataList,
  Field,
  PageHeader,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { QueryBoundary } from "../../components";
import { AdminReauthentication } from "../../modules/identity";
import { useAdminQueryScope } from "../../modules/identity";
import { jobCommands, jobQueries } from "../../modules/jobs";
import { array, record, value } from "../../utils";

enum JobCommand {
  CANCEL = "CANCEL",
  RETRY = "RETRY",
}

export function JobsPage() {
  const scope = useAdminQueryScope();
  const { jobId = "" } = useParams();
  const query = useQuery(jobQueries.list(scope));
  const detail = useQuery({
    ...jobQueries.detail(scope, jobId),
    enabled: Boolean(jobId),
  });
  const cache = useQueryClient();
  const [selected, setSelected] = useState("");
  const [command, setCommand] = useState(JobCommand.RETRY);
  const [reason, setReason] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const control = useMutation({
    mutationFn: () =>
      command === JobCommand.RETRY
        ? jobCommands.retry(selected, reason)
        : jobCommands.cancel(selected, reason),
    onSuccess: async () => {
      setSelected("");
      setReason("");
      await cache.invalidateQueries({
        queryKey: jobQueries.list(scope).queryKey,
      });
      if (jobId) {
        await cache.invalidateQueries({
          queryKey: jobQueries.detail(scope, jobId).queryKey,
        });
      }
    },
  });

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Background execution" title="Jobs" />
      <div className="admin-agent-layout" data-detail={Boolean(jobId)}>
        <QueryBoundary pending={query.isPending} error={query.error}>
          <DataList
            rows={(query.data ?? []).map((job) => {
              const latestAttempt = record(array(job.attempts)[0]);
              const latestProgress = record(array(job.progress)[0]);
              return {
                label: job.kind,
                value: `${job.status} · ${value(latestProgress.stage, "waiting")}`,
                detail: `${job.id} · attempt ${value(latestAttempt.attemptNumber, "0")}`,
                action: (
                  <div className="row-actions">
                    <Link
                      className="sy-button sy-button--quiet"
                      to={`/jobs/${job.id}`}
                    >
                      查看
                    </Link>
                    {job.status === JobStatus.FAILED ? (
                      <Button
                        tone="secondary"
                        onClick={() => {
                          setSelected(job.id);
                          control.reset();
                          setCommand(JobCommand.RETRY);
                        }}
                      >
                        重试
                      </Button>
                    ) : null}
                    {[
                      JobStatus.QUEUED,
                      JobStatus.RUNNING,
                      JobStatus.RETRY_SCHEDULED,
                    ].includes(job.status) ? (
                      <Button
                        tone="danger"
                        onClick={() => {
                          setSelected(job.id);
                          control.reset();
                          setCommand(JobCommand.CANCEL);
                        }}
                      >
                        取消
                      </Button>
                    ) : null}
                  </div>
                ),
              };
            })}
          />
        </QueryBoundary>
        {jobId ? (
          <aside className="admin-agent-detail">
            <header>
              <div>
                <span>Job detail</span>
                <h2>{jobId}</h2>
              </div>
              <Link to="/jobs">关闭</Link>
            </header>
            <QueryBoundary pending={detail.isPending} error={detail.error}>
              <DataList
                rows={Object.entries(record(detail.data)).map(
                  ([label, item]) => ({
                    label,
                    value: value(
                      item,
                      typeof item === "object" ? "structured" : "-",
                    ),
                  }),
                )}
              />
            </QueryBoundary>
          </aside>
        ) : null}
      </div>
      {control.isSuccess ? (
        <p className="admin-command-result" role="status">
          {command === JobCommand.RETRY
            ? `重试任务已创建：${control.data.id}`
            : `任务已取消：${control.data.id}`}
        </p>
      ) : null}
      {control.error ? (
        <p className="form-error" role="alert">
          {control.error.message}
        </p>
      ) : null}
      {selected ? (
        <section className="admin-risk-command">
          <h2>{command === JobCommand.RETRY ? "重试 Job" : "取消 Job"}</h2>
          <p>{selected}</p>
          <Field label="原因">
            <TextInput
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <AdminReauthentication onStatusChange={setReauthenticated} />
          <Button
            tone="danger"
            disabled={!reauthenticated || !reason.trim() || control.isPending}
            onClick={() => control.mutate()}
          >
            确认{command === JobCommand.RETRY ? "重试" : "取消"}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
