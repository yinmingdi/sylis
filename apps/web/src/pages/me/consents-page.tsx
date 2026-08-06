import { Button, DataList, PageHeader, ShieldCheck } from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { identityCommands } from "../../modules/identity";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

const purposes = [
  "AI_TUTOR",
  "AI_GRAMMAR",
  "AI_READING",
  "PERSONALIZATION",
  "REDDIT_SYNC",
] as const;

export function ConsentsPage() {
  const key = ["identity", "consents"] as const;
  const query = useQuery({ queryKey: key, queryFn: identityCommands.consents });
  const cache = useQueryClient();
  const rows = asArray(query.data).map(asRecord);
  const record = useMutation({
    mutationFn: ({
      purpose,
      decision,
    }: {
      purpose: string;
      decision: "GRANTED" | "WITHDRAWN";
    }) =>
      identityCommands.recordConsent({
        purpose,
        decision,
        policyVersion: "0.0.1",
      }),
    onSuccess: () => cache.invalidateQueries({ queryKey: key }),
  });
  return (
    <div className="page">
      <PageHeader eyebrow="Privacy" title="隐私授权" />
      <RemoteState pending={query.isPending} error={query.error}>
        <DataList
          rows={purposes.map((purpose) => {
            const current = rows.find((row) => row.purpose === purpose);
            const granted = current?.decision === "GRANTED";
            return {
              label: purpose,
              value: granted ? "已授权" : "未授权",
              detail: current
                ? stringValue(current.recordedAt ?? current.createdAt)
                : "-",
              action: (
                <Button
                  icon={ShieldCheck}
                  tone={granted ? "quiet" : "secondary"}
                  onClick={() =>
                    record.mutate({
                      purpose,
                      decision: granted ? "WITHDRAWN" : "GRANTED",
                    })
                  }
                >
                  {granted ? "撤回" : "授权"}
                </Button>
              ),
            };
          })}
        />
      </RemoteState>
    </div>
  );
}
