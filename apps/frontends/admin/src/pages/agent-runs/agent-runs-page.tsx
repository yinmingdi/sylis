import {
  AgentRunStatus,
  type AdminAgentRunTerminationPreview,
} from "@sylis/api-client/admin";
import {
  Button,
  DataList,
  Field,
  PageHeader,
  ShieldCheck,
  StatusBadge,
  TextInput,
  X,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { QueryBoundary } from "../../components";
import {
  adminAgentRunCommands,
  adminAgentRunQueries,
} from "../../modules/agent-runs";
import { useAdminQueryScope } from "../../modules/identity";
import { AdminReauthentication } from "../../modules/identity";

const terminalStatuses = new Set([
  AgentRunStatus.SUCCEEDED,
  AgentRunStatus.FAILED,
  AgentRunStatus.CANCELLED,
]);

export function AgentRunsPage() {
  const scope = useAdminQueryScope();
  const { runId } = useParams();
  const navigate = useNavigate();
  const query = useQuery(adminAgentRunQueries.list(scope));
  const cache = useQueryClient();
  const [reason, setReason] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const [preview, setPreview] = useState<AdminAgentRunTerminationPreview>();
  const selected = query.data?.find((run) => run.id === runId);
  useEffect(() => setPreview(undefined), [reason, runId]);

  const previewCommand = useMutation({
    mutationFn: () =>
      adminAgentRunCommands.previewTermination(selected!.id, reason.trim()),
    onSuccess: setPreview,
  });
  const terminate = useMutation({
    mutationFn: () =>
      adminAgentRunCommands.terminate(
        selected!.id,
        {
          reason: preview!.reason,
          actionDigest: preview!.actionDigest,
        },
        crypto.randomUUID(),
      ),
    onSuccess: async () => {
      setPreview(undefined);
      await cache.invalidateQueries({
        queryKey: adminAgentRunQueries.list(scope).queryKey,
      });
    },
  });

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Agent & Models" title="Agent Runs" />
      <div className="admin-agent-layout" data-detail={Boolean(selected)}>
        <QueryBoundary pending={query.isPending} error={query.error}>
          <DataList
            rows={(query.data ?? []).map((run) => ({
              label: run.requestedCapability,
              value: (
                <StatusBadge tone={runTone(run.status)}>
                  {run.status}
                </StatusBadge>
              ),
              detail: `${run.id} · ${run.providerRouteRelease.providerKey}/${run.providerRouteRelease.modelId}`,
              action: (
                <Button
                  tone="quiet"
                  onClick={() => navigate(`/agent/runs/${run.id}`)}
                >
                  查看
                </Button>
              ),
            }))}
          />
        </QueryBoundary>
        {selected ? (
          <aside className="admin-agent-detail">
            <header>
              <div>
                <span>Run</span>
                <h2>{selected.requestedCapability}</h2>
              </div>
              <Button
                tone="quiet"
                icon={X}
                onClick={() => navigate("/agent/runs")}
              >
                关闭
              </Button>
            </header>
            <dl className="admin-agent-facts">
              <div>
                <dt>状态</dt>
                <dd>{selected.status}</dd>
              </div>
              <div>
                <dt>模型路由</dt>
                <dd>{selected.providerRouteRelease.modelId}</dd>
              </div>
              <div>
                <dt>凭证</dt>
                <dd>{selected.credentialRevision.maskedHint}</dd>
              </div>
              <div>
                <dt>活动</dt>
                <dd>
                  {selected._count.toolCalls} tools ·{" "}
                  {selected._count.proposals} proposals ·{" "}
                  {selected._count.events} events
                </dd>
              </div>
            </dl>
            {!terminalStatuses.has(selected.status) ? (
              <section className="admin-agent-command">
                <h3>终止 Run</h3>
                <Field label="原因" error={previewCommand.error?.message}>
                  <TextInput
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
                <AdminReauthentication onStatusChange={setReauthenticated} />
                <Button
                  icon={ShieldCheck}
                  tone="secondary"
                  disabled={
                    reason.trim().length < 8 || previewCommand.isPending
                  }
                  onClick={() => previewCommand.mutate()}
                >
                  生成预览
                </Button>
                {preview ? (
                  <div className="admin-action-preview">
                    <dl>
                      <div>
                        <dt>影响</dt>
                        <dd>{preview.affectedRuns} 个 Run</dd>
                      </div>
                      <div>
                        <dt>策略</dt>
                        <dd>{preview.policyVersion}</dd>
                      </div>
                      <div>
                        <dt>动作摘要</dt>
                        <dd>{preview.actionDigest}</dd>
                      </div>
                    </dl>
                    <Button
                      icon={X}
                      tone="danger"
                      disabled={!reauthenticated || terminate.isPending}
                      onClick={() => terminate.mutate()}
                    >
                      确认终止
                    </Button>
                  </div>
                ) : null}
                {terminate.error ? (
                  <p className="form-error">{terminate.error.message}</p>
                ) : null}
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function runTone(
  status: AgentRunStatus,
): "neutral" | "positive" | "warning" | "danger" | "info" {
  if (status === AgentRunStatus.SUCCEEDED) return "positive";
  if (status === AgentRunStatus.FAILED) return "danger";
  if (status === AgentRunStatus.WAITING) return "warning";
  if (status === AgentRunStatus.RUNNING) return "info";
  return "neutral";
}
