import {
  AgentEvaluationKind,
  AgentReleaseCommandKind,
  AgentReleaseEnvironment,
  AgentReleaseKind,
  AgentReleaseStatus,
  type AdminAgentReleaseActionPreview,
  type AdminAgentReleaseActionPreviewInput,
  type AdminAgentReleaseCollections,
  type AdminAgentReleaseView,
} from "@sylis/api-client/admin";
import {
  Button,
  DataList,
  Field,
  PageHeader,
  SegmentedControl,
  Select,
  ShieldCheck,
  StatusBadge,
  TextInput,
  X,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { EntityRows, QueryBoundary } from "../../components";
import {
  adminAgentReleaseCommands,
  adminAgentReleaseQueries,
} from "../../modules/agent-releases";
import { useAdminQueryScope } from "../../modules/identity";
import { AdminReauthentication } from "../../modules/identity";

const kindOptions = [
  { value: AgentReleaseKind.CAPABILITY, label: "Capability" },
  { value: AgentReleaseKind.TOOL, label: "Tool" },
  { value: AgentReleaseKind.SKILL, label: "Skill" },
  { value: AgentReleaseKind.EVAL, label: "Eval" },
] as const;

const actionOptions = Object.values(AgentReleaseCommandKind);

export function AgentReleasesPage() {
  const scope = useAdminQueryScope();
  const { releaseId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useQuery(adminAgentReleaseQueries.list(scope));
  const cache = useQueryClient();
  const kind = releaseKind(searchParams.get("kind"));
  const releases = releaseCollection(query.data, kind);
  const selected = releaseId
    ? releases.find((release) => release.id === releaseId)
    : undefined;
  const [action, setAction] = useState(AgentReleaseCommandKind.VALIDATE);
  const [reason, setReason] = useState("");
  const [environment, setEnvironment] = useState(
    AgentReleaseEnvironment.STAGING,
  );
  const [targetReleaseId, setTargetReleaseId] = useState("");
  const [evalReleaseId, setEvalReleaseId] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const [preview, setPreview] = useState<AdminAgentReleaseActionPreview>();

  useEffect(
    () => setPreview(undefined),
    [action, environment, evalReleaseId, reason, releaseId, targetReleaseId],
  );

  const previewCommand = useMutation({
    mutationFn: () =>
      adminAgentReleaseCommands.previewReleaseAction(
        kind,
        selected!.id,
        previewInput(
          action,
          reason,
          environment,
          targetReleaseId,
          evalReleaseId,
        ),
      ),
    onSuccess: setPreview,
  });
  const execute = useMutation({
    mutationFn: () => executePreview(preview!),
    onSuccess: async () => {
      setPreview(undefined);
      await cache.invalidateQueries({
        queryKey: adminAgentReleaseQueries.list(scope).queryKey,
      });
    },
  });

  const selectKind = (next: AgentReleaseKind) => {
    const params = new URLSearchParams(searchParams);
    params.set("kind", next);
    setSearchParams(params);
    navigate(`/agent/releases?${params.toString()}`);
  };

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Agent & Models" title="Agent Releases" />
      <SegmentedControl
        label="Release 类型"
        value={kind}
        options={kindOptions}
        onChange={selectKind}
      />
      <div className="admin-agent-layout" data-detail={Boolean(selected)}>
        <QueryBoundary pending={query.isPending} error={query.error}>
          <DataList
            rows={releases.map((release) => ({
              label: `${releaseKey(release)} @ ${release.version}`,
              value: (
                <StatusBadge tone={releaseTone(release.status)}>
                  {release.status}
                </StatusBadge>
              ),
              detail: release.releaseDigest,
              action: (
                <Button
                  tone="quiet"
                  onClick={() =>
                    navigate(`/agent/releases/${release.id}?kind=${kind}`)
                  }
                >
                  管理
                </Button>
              ),
            }))}
          />
        </QueryBoundary>
        {selected ? (
          <aside className="admin-agent-detail">
            <header>
              <div>
                <span>{kind}</span>
                <h2>
                  {releaseKey(selected)} @ {selected.version}
                </h2>
              </div>
              <Button
                tone="quiet"
                icon={X}
                onClick={() => navigate(`/agent/releases?kind=${kind}`)}
              >
                关闭
              </Button>
            </header>
            <section className="admin-agent-command">
              <Field label="动作">
                <Select
                  value={action}
                  onChange={(event) =>
                    setAction(event.target.value as AgentReleaseCommandKind)
                  }
                >
                  {actionOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="原因" error={previewCommand.error?.message}>
                <TextInput
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              {requiresEnvironment(action) ? (
                <Field label="环境">
                  <Select
                    value={environment}
                    onChange={(event) =>
                      setEnvironment(
                        event.target.value as AgentReleaseEnvironment,
                      )
                    }
                  >
                    {Object.values(AgentReleaseEnvironment).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              {action === AgentReleaseCommandKind.ROLLBACK ? (
                <Field label="回滚目标">
                  <Select
                    value={targetReleaseId}
                    onChange={(event) => setTargetReleaseId(event.target.value)}
                  >
                    <option value="">选择 Release</option>
                    {releases
                      .filter(
                        (release) =>
                          release.id !== selected.id &&
                          release.status === AgentReleaseStatus.PUBLISHED &&
                          releaseKey(release) === releaseKey(selected),
                      )
                      .map((release) => (
                        <option key={release.id} value={release.id}>
                          {release.version}
                        </option>
                      ))}
                  </Select>
                </Field>
              ) : null}
              {requiresEval(action) ? (
                <Field label="Eval Release">
                  <Select
                    value={evalReleaseId}
                    onChange={(event) => setEvalReleaseId(event.target.value)}
                  >
                    <option value="">选择 Eval</option>
                    {(query.data?.evals ?? []).map((release) => (
                      <option key={release.id} value={release.id}>
                        {releaseKey(release)} @ {release.version}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <AdminReauthentication onStatusChange={setReauthenticated} />
              <Button
                icon={ShieldCheck}
                tone="secondary"
                disabled={
                  !canPreview(action, reason, targetReleaseId, evalReleaseId)
                }
                onClick={() => previewCommand.mutate()}
              >
                生成预览
              </Button>
              {preview ? (
                <div className="admin-action-preview">
                  <dl>
                    <div>
                      <dt>状态变化</dt>
                      <dd>
                        {preview.impact.previousStatus} →{" "}
                        {preview.impact.resultingStatus}
                      </dd>
                    </div>
                    <div>
                      <dt>角色</dt>
                      <dd>{preview.requiredRole}</dd>
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
                    tone={dangerous(preview.action) ? "danger" : "primary"}
                    disabled={
                      (preview.requiresReauthentication && !reauthenticated) ||
                      execute.isPending
                    }
                    onClick={() => execute.mutate()}
                  >
                    执行 {preview.action}
                  </Button>
                </div>
              ) : null}
              {execute.error ? (
                <p className="form-error">{execute.error.message}</p>
              ) : null}
            </section>
          </aside>
        ) : null}
      </div>
      <section>
        <h2>Evaluations</h2>
        <EntityRows data={query.data?.evaluations} />
      </section>
    </div>
  );
}

function releaseKind(value: string | null): AgentReleaseKind {
  return Object.values(AgentReleaseKind).includes(value as AgentReleaseKind)
    ? (value as AgentReleaseKind)
    : AgentReleaseKind.CAPABILITY;
}

function releaseCollection(
  data: AdminAgentReleaseCollections | undefined,
  kind: AgentReleaseKind,
): readonly AdminAgentReleaseView[] {
  if (!data) return [];
  if (kind === AgentReleaseKind.CAPABILITY) return data.capabilities;
  if (kind === AgentReleaseKind.TOOL) return data.tools;
  if (kind === AgentReleaseKind.SKILL) return data.skills;
  return data.evals;
}

function releaseKey(release: AdminAgentReleaseView): string {
  return (
    release.capabilityKey ??
    release.toolKey ??
    release.skillKey ??
    release.evalKey ??
    release.id
  );
}

function releaseTone(
  status: AgentReleaseStatus,
): "neutral" | "positive" | "danger" | "info" {
  if (status === AgentReleaseStatus.PUBLISHED) return "positive";
  if (status === AgentReleaseStatus.REVOKED) return "danger";
  if (status === AgentReleaseStatus.CANDIDATE) return "info";
  return "neutral";
}

function requiresEnvironment(action: AgentReleaseCommandKind): boolean {
  return [
    AgentReleaseCommandKind.PROMOTE,
    AgentReleaseCommandKind.ROLLBACK,
  ].includes(action);
}

function requiresEval(action: AgentReleaseCommandKind): boolean {
  return [
    AgentReleaseCommandKind.EVALUATE,
    AgentReleaseCommandKind.JUDGE,
  ].includes(action);
}

function canPreview(
  action: AgentReleaseCommandKind,
  reason: string,
  targetReleaseId: string,
  evalReleaseId: string,
): boolean {
  if (reason.trim().length < 8) return false;
  if (action === AgentReleaseCommandKind.ROLLBACK && !targetReleaseId)
    return false;
  return !requiresEval(action) || Boolean(evalReleaseId);
}

function previewInput(
  action: AgentReleaseCommandKind,
  reason: string,
  environment: AgentReleaseEnvironment,
  targetReleaseId: string,
  evalReleaseId: string,
): AdminAgentReleaseActionPreviewInput {
  return {
    action,
    reason: reason.trim(),
    ...(requiresEnvironment(action) ? { environment } : {}),
    ...(action === AgentReleaseCommandKind.ROLLBACK ? { targetReleaseId } : {}),
    ...(requiresEval(action)
      ? {
          evaluationKind:
            action === AgentReleaseCommandKind.EVALUATE
              ? AgentEvaluationKind.EVALUATION
              : AgentEvaluationKind.JUDGEMENT,
          evalReleaseId,
        }
      : {}),
  };
}

function dangerous(action: AgentReleaseCommandKind): boolean {
  return [
    AgentReleaseCommandKind.ROLLBACK,
    AgentReleaseCommandKind.REVOKE,
  ].includes(action);
}

function executePreview(preview: AdminAgentReleaseActionPreview) {
  const { action, command } = preview;
  const key = crypto.randomUUID();
  const base = { reason: command.reason, actionDigest: command.actionDigest };
  if (action === AgentReleaseCommandKind.CANDIDATE) {
    return adminAgentReleaseCommands.createCandidate(
      command.releaseKind,
      command.releaseId,
      base,
      key,
    );
  }
  if (action === AgentReleaseCommandKind.VALIDATE) {
    return adminAgentReleaseCommands.validateRelease(
      command.releaseKind,
      command.releaseId,
      base,
      key,
    );
  }
  if (requiresEval(action)) {
    if (!command.evaluationKind || !command.evalReleaseId)
      throw new Error("Eval preview invalid");
    return adminAgentReleaseCommands.evaluateRelease(
      command.releaseKind,
      command.releaseId,
      {
        ...base,
        evaluationKind: command.evaluationKind,
        evalReleaseId: command.evalReleaseId,
      },
      key,
    );
  }
  if (action === AgentReleaseCommandKind.APPROVE) {
    return adminAgentReleaseCommands.approveRelease(
      command.releaseKind,
      command.releaseId,
      base,
      key,
    );
  }
  if (action === AgentReleaseCommandKind.PROMOTE) {
    if (!command.environment) throw new Error("Promotion preview invalid");
    return adminAgentReleaseCommands.promoteRelease(
      command.releaseKind,
      command.releaseId,
      { ...base, environment: command.environment },
      key,
    );
  }
  if (action === AgentReleaseCommandKind.ROLLBACK) {
    if (!command.environment || !command.targetReleaseId)
      throw new Error("Rollback preview invalid");
    return adminAgentReleaseCommands.rollbackRelease(
      command.releaseKind,
      command.releaseId,
      {
        ...base,
        environment: command.environment,
        targetReleaseId: command.targetReleaseId,
      },
      key,
    );
  }
  return adminAgentReleaseCommands.revokeRelease(
    command.releaseKind,
    command.releaseId,
    base,
    key,
  );
}
