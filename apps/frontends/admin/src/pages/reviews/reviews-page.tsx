import { ReviewDecisionKind } from "@sylis/api-client/admin";
import {
  Button,
  DataList,
  Field,
  PageHeader,
  Select,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { QueryBoundary } from "../../components";
import { AdminReauthentication } from "../../modules/identity";
import { useAdminQueryScope } from "../../modules/identity";
import { reviewCommands, reviewQueries } from "../../modules/reviews";
import { array, record, value } from "../../utils";

export function ReviewsPage() {
  const scope = useAdminQueryScope();
  const { batchId = "" } = useParams();
  const batches = useQuery(reviewQueries.batches(scope));
  const batch = useQuery({
    ...reviewQueries.batch(scope, batchId),
    enabled: Boolean(batchId),
  });
  const cache = useQueryClient();
  const [candidateRevisionId, setCandidateRevisionId] = useState("");
  const [decision, setDecision] = useState(ReviewDecisionKind.APPROVE);
  const [reason, setReason] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const items = useMemo(
    () => array(record(batch.data).items).map(record),
    [batch.data],
  );
  const selectedItem = items.find(
    (item) => value(record(item.candidateRevision).id) === candidateRevisionId,
  );
  const decide = useMutation({
    mutationFn: () =>
      reviewCommands.decide(batchId, { candidateRevisionId, decision, reason }),
    onSuccess: async () => {
      setCandidateRevisionId("");
      setReason("");
      await cache.invalidateQueries({
        queryKey: reviewQueries.batches(scope).queryKey,
      });
      await cache.invalidateQueries({
        queryKey: reviewQueries.batch(scope, batchId).queryKey,
      });
    },
  });

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Candidate governance" title="Review Center" />
      <div className="admin-agent-layout" data-detail={Boolean(batchId)}>
        <QueryBoundary pending={batches.isPending} error={batches.error}>
          <DataList
            rows={(batches.data ?? []).map((item) => ({
              label: value(item.queueKind, value(item.id)),
              value: value(item.status),
              detail: `${value(record(item._count).items, "0")} items · ${value(record(item._count).decisions, "0")} decisions`,
              action: (
                <Link
                  className="sy-button sy-button--quiet"
                  to={`/lexicon/reviews/${item.id}`}
                >
                  打开
                </Link>
              ),
            }))}
          />
        </QueryBoundary>
        {batchId ? (
          <aside className="admin-agent-detail">
            <header>
              <div>
                <span>Review batch</span>
                <h2>{batchId}</h2>
              </div>
              <Link to="/lexicon/reviews">关闭</Link>
            </header>
            <QueryBoundary pending={batch.isPending} error={batch.error}>
              <DataList
                rows={items.map((item) => {
                  const revision = record(item.candidateRevision);
                  const candidate = record(revision.candidate);
                  return {
                    label: value(candidate.taskType, value(candidate.id)),
                    value: value(candidate.status),
                    detail: `${value(revision.schemaVersion)} · ${value(revision.contentHash)}`,
                    action: (
                      <Button
                        tone="secondary"
                        onClick={() =>
                          setCandidateRevisionId(value(revision.id))
                        }
                      >
                        审核
                      </Button>
                    ),
                  };
                })}
              />
            </QueryBoundary>
          </aside>
        ) : null}
      </div>
      {selectedItem ? (
        <section className="admin-review-inspector">
          <header>
            <span>
              {value(
                record(record(selectedItem.candidateRevision).candidate)
                  .taskType,
              )}
            </span>
            <strong>{candidateRevisionId}</strong>
          </header>
          <pre>
            {JSON.stringify(
              record(selectedItem.candidateRevision).payload,
              null,
              2,
            )}
          </pre>
          <Field label="Decision">
            <Select
              value={decision}
              onChange={(event) =>
                setDecision(event.target.value as ReviewDecisionKind)
              }
            >
              {Object.values(ReviewDecisionKind).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason">
            <TextInput
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <AdminReauthentication onStatusChange={setReauthenticated} />
          <Button
            tone={decision === ReviewDecisionKind.REJECT ? "danger" : "primary"}
            disabled={!reauthenticated || !reason.trim() || decide.isPending}
            onClick={() => decide.mutate()}
          >
            提交决定
          </Button>
        </section>
      ) : null}
    </div>
  );
}
