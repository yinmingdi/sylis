import {
  Button,
  Field,
  PageHeader,
  RefreshCw,
  TextInput,
} from "@sylis/components";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { AdminReauthentication } from "../../modules/identity";
import { operationCommands } from "../../modules/operations";

export function SourcesPage() {
  const [postId, setPostId] = useState("");
  const [reason, setReason] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const synchronize = useMutation({
    mutationFn: () =>
      operationCommands.sources.synchronize("REDDIT", crypto.randomUUID()),
  });
  const withdraw = useMutation({
    mutationFn: () => operationCommands.sources.withdrawReddit(postId, reason),
  });

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Source operations"
        title="来源同步与撤回"
        actions={
          <Button
            icon={RefreshCw}
            disabled={!reauthenticated || synchronize.isPending}
            onClick={() => synchronize.mutate()}
          >
            同步 Reddit
          </Button>
        }
      />
      {synchronize.data ? (
        <p className="admin-notice">同步任务已创建：{synchronize.data.jobId}</p>
      ) : null}
      <section className="admin-risk-command">
        <h2>撤回来源内容</h2>
        <Field label="Reddit Post ID">
          <TextInput
            value={postId}
            onChange={(event) => setPostId(event.target.value)}
          />
        </Field>
        <Field label="原因">
          <TextInput
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          tone="danger"
          disabled={!reauthenticated || !postId.trim() || !reason.trim()}
          onClick={() => withdraw.mutate()}
        >
          撤回内容
        </Button>
      </section>
    </div>
  );
}
