import {
  Button,
  Field,
  PageHeader,
  StatusBadge,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { record, value } from "../../app/view-utils";
import { AdminReauthentication } from "../../modules/identity";
import { operationCommands, operationQueries } from "../../modules/operations";

export function RuntimeAiPage() {
  const query = useQuery(operationQueries.runtimeAi);
  const cache = useQueryClient();
  const [reason, setReason] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const control = record(query.data);
  const enabled = control.enabled !== false;
  const update = useMutation({
    mutationFn: () => operationCommands.runtimeAi.set(!enabled, reason),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: operationQueries.runtimeAi.queryKey,
      }),
  });

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Runtime AI" title="运行控制" />
      <div className="runtime-control">
        <div>
          <StatusBadge tone={enabled ? "positive" : "danger"}>
            {enabled ? "ENABLED" : "DISABLED"}
          </StatusBadge>
          <strong>DeepSeek runtime capabilities</strong>
          <small>版本 {value(control.version, "0")}</small>
        </div>
        <Field label="变更原因">
          <TextInput
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          tone={enabled ? "danger" : "primary"}
          disabled={!reauthenticated || !reason.trim() || update.isPending}
          onClick={() => update.mutate()}
        >
          {enabled ? "停用运行时 AI" : "恢复运行时 AI"}
        </Button>
      </div>
    </div>
  );
}
