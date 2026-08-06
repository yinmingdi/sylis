import {
  Button,
  DataList,
  Field,
  PageHeader,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { array, QueryBoundary, record, value } from "../../app/view-utils";
import { AdminReauthentication } from "../../modules/identity";
import { operationCommands, operationQueries } from "../../modules/operations";

export function ReleasesPage() {
  const query = useQuery(operationQueries.releases);
  const cache = useQueryClient();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const validate = useMutation({
    mutationFn: (id: string) =>
      operationCommands.releases.validate(id, crypto.randomUUID()),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: operationQueries.releases.queryKey }),
  });
  const request = useMutation({
    mutationFn: () =>
      operationCommands.releases.requestActivation(selected, reason),
  });
  const activate = useMutation({
    mutationFn: () =>
      operationCommands.releases.activate(selected, approvalId, reason),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: operationQueries.releases.queryKey }),
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
                  onClick={() => setSelected(value(release.id))}
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
