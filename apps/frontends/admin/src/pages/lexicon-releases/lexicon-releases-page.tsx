import {
  Button,
  DataList,
  Field,
  PageHeader,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { QueryBoundary } from "../../components";
import { AdminReauthentication } from "../../modules/identity";
import { useAdminQueryScope } from "../../modules/identity";
import {
  lexiconReleaseCommands,
  lexiconReleaseQueries,
} from "../../modules/lexicon-releases";
import { array, record, value } from "../../utils";

export function LexiconReleasesPage() {
  const scope = useAdminQueryScope();
  const query = useQuery(lexiconReleaseQueries.list(scope));
  const cache = useQueryClient();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const validate = useMutation({
    mutationFn: (id: string) =>
      lexiconReleaseCommands.validate(id, crypto.randomUUID()),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: lexiconReleaseQueries.list(scope).queryKey,
      }),
  });
  const preview = useMutation({
    mutationFn: (id: string) => lexiconReleaseCommands.preview(id),
    onSuccess: (_, id) => setSelected(id),
  });
  const request = useMutation({
    mutationFn: () =>
      lexiconReleaseCommands.requestActivation(selected, reason),
    onSuccess: (approval) => {
      setApprovalId(value(approval.id));
      setActionDigest(
        value(approval.actionDigest, value(record(preview.data).actionDigest)),
      );
    },
  });
  const [actionDigest, setActionDigest] = useState("");
  const decide = useMutation({
    mutationFn: () =>
      lexiconReleaseCommands.decide(
        approvalId,
        "APPROVE",
        reason,
        actionDigest,
      ),
  });
  const activate = useMutation({
    mutationFn: () =>
      lexiconReleaseCommands.activate(selected, approvalId, reason),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: lexiconReleaseQueries.list(scope).queryKey,
      }),
  });
  const releases = array(query.data).map(record);
  return (
    <div className="admin-page">
      <PageHeader eyebrow="Immutable releases" title="Lexicon Release" />
      <section className="admin-risk-command">
        <h2>高风险操作认证</h2>
        <AdminReauthentication onStatusChange={setReauthenticated} />
      </section>
      <QueryBoundary pending={query.isPending} error={query.error}>
        <DataList
          rows={releases.map((release) => ({
            label: value(release.version),
            value: `${value(release.status)} · ${value(release.contentHash)}`,
            detail: value(release.id),
            action: (
              <div className="row-actions">
                <Button
                  tone="quiet"
                  disabled={!reauthenticated || validate.isPending}
                  onClick={() => validate.mutate(value(release.id))}
                >
                  验证
                </Button>
                <Button
                  tone="secondary"
                  disabled={preview.isPending}
                  onClick={() => preview.mutate(value(release.id))}
                >
                  发布
                </Button>
              </div>
            ),
          }))}
        />
      </QueryBoundary>
      {selected ? (
        <section className="activation-panel">
          <h2>高风险发布</h2>
          <p>
            当前{" "}
            {value(record(preview.data).fromReleaseId, "无 active release")} ·
            目标 {selected}
          </p>
          <Field label="原因">
            <TextInput
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <Button
            onClick={() => request.mutate()}
            disabled={!reauthenticated || !reason}
          >
            创建审批
          </Button>
          <Field label="Approval ID">
            <TextInput
              value={approvalId}
              onChange={(event) => setApprovalId(event.target.value)}
            />
          </Field>
          <Field label="Action digest">
            <TextInput
              value={actionDigest}
              onChange={(event) => setActionDigest(event.target.value)}
            />
          </Field>
          <Button
            tone="secondary"
            onClick={() => decide.mutate()}
            disabled={
              !reauthenticated ||
              !approvalId ||
              !actionDigest ||
              !reason ||
              decide.isPending
            }
          >
            批准
          </Button>
          <Button
            tone="danger"
            onClick={() => activate.mutate()}
            disabled={!reauthenticated || !approvalId || !reason}
          >
            激活 Release
          </Button>
        </section>
      ) : null}
    </div>
  );
}
