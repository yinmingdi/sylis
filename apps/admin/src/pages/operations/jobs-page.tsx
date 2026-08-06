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
import { operationCommands, operationQueries } from "../../modules/operations";

export function JobsPage() {
  const query = useQuery(operationQueries.jobs);
  const cache = useQueryClient();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const resume = useMutation({
    mutationFn: () => operationCommands.jobs.resume(selected, reason),
    onSuccess: async () => {
      setSelected("");
      setReason("");
      await cache.invalidateQueries({
        queryKey: operationQueries.jobs.queryKey,
      });
    },
  });
  const jobs = array(query.data).map(record);

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Background jobs" title="Jobs" />
      <QueryBoundary pending={query.isPending} error={query.error}>
        <DataList
          rows={jobs.map((job) => {
            const status = value(job.status);
            const id = value(job.id);
            return {
              label: value(job.kind),
              value: `${status} · attempt ${value(job.attempt)}/${value(job.maxAttempts)}`,
              detail: `${id} · ${value(job.errorCode, value(job.pauseReasonCode))}`,
              action: ["FAILED", "PAUSED"].includes(status) ? (
                <Button tone="secondary" onClick={() => setSelected(id)}>
                  恢复
                </Button>
              ) : null,
            };
          })}
        />
      </QueryBoundary>
      {selected ? (
        <section className="admin-risk-command">
          <h2>恢复 Job</h2>
          <p>{selected}</p>
          <Field label="原因">
            <TextInput
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <Button
            tone="danger"
            disabled={!reason.trim() || resume.isPending}
            onClick={() => resume.mutate()}
          >
            确认重新入队
          </Button>
        </section>
      ) : null}
    </div>
  );
}
