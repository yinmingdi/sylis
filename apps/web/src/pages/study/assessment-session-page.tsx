import type { ExerciseView } from "@sylis/api-client";
import { Button, PageHeader, ProgressBar } from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  assessmentCommands,
  assessmentQueries,
} from "../../modules/assessments";
import { ExercisePlayer } from "../../modules/exercises";
import { activeConsentId, consentsQuery } from "../../modules/identity";
import { RemoteState } from "../page-utils";
import { asArray, asRecord } from "../page-values";

export function AssessmentSessionPage() {
  const { sessionId = "" } = useParams();
  const query = useQuery(assessmentQueries.session(sessionId));
  const consents = useQuery(consentsQuery);
  const [position, setPosition] = useState(0);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const session = asRecord(query.data);
  const items = asArray(session.items) as ExerciseView[];
  const answered = items.filter((item) => item.status === "SUBMITTED").length;
  const complete = items.length > 0 && answered === items.length;
  const submit = useMutation({
    mutationFn: () => assessmentCommands.submit(sessionId),
    onSuccess: () => navigate(`/study/assessments/${sessionId}/result`),
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow="Assessment session"
        title="测评作答"
        actions={
          <ProgressBar
            value={items.length ? (answered / items.length) * 100 : 0}
            label="答题进度"
          />
        }
      />
      <RemoteState pending={query.isPending} error={query.error}>
        {items[position] ? (
          <ExercisePlayer
            key={items[position].id}
            attempt={items[position]}
            consentRecordId={activeConsentId(consents.data, "PERSONALIZATION")}
            onSubmit={async (attemptId, response, idempotencyKey) => {
              const result = await assessmentCommands.respond(
                sessionId,
                { attemptId, response },
                idempotencyKey,
              );
              await cache.invalidateQueries({
                queryKey: assessmentQueries.session(sessionId).queryKey,
              });
              if (position < items.length - 1) setPosition(position + 1);
              return result;
            }}
          />
        ) : null}
        {items.length > 0 && position >= items.length - 1 ? (
          <div className="submit-row">
            <Button
              disabled={submit.isPending || !complete}
              onClick={() => submit.mutate()}
            >
              提交测评
            </Button>
          </div>
        ) : null}
      </RemoteState>
    </div>
  );
}
