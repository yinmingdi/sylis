import {
  Button,
  PageHeader,
  ProgressBar,
  Section,
  Target,
} from "@sylis/components";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { ExercisePlayer } from "../../modules/exercises";
import { activeConsentId, consentsQuery } from "../../modules/identity";
import { JobProgress } from "../../modules/jobs";
import { studyCommands, studyQueries } from "../../modules/study";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function TodayPage() {
  const query = useQuery(studyQueries.today);
  const consents = useQuery(consentsQuery);
  const navigate = useNavigate();
  const attempt = useMutation({
    mutationFn: (planItemId: string) =>
      studyCommands.createAttempt(planItemId, crypto.randomUUID()),
  });
  const generate = useMutation({
    mutationFn: () => studyCommands.generateToday(crypto.randomUUID()),
  });
  const plan = asRecord(query.data);
  const items = asArray(plan.items).map(asRecord);
  const completed = items.filter((item) => item.completedAt).length;
  return (
    <div className="page">
      <PageHeader
        eyebrow={stringValue(plan.localDate, "今日计划")}
        title="背单词"
        actions={
          <Button
            icon={Target}
            tone="secondary"
            onClick={() => navigate("/study/books")}
          >
            词书
          </Button>
        }
      />
      <Section>
        <div className="metric-strip">
          <div>
            <strong>{items.length}</strong>
            <span>今日目标</span>
          </div>
          <div>
            <strong>{completed}</strong>
            <span>已完成</span>
          </div>
          <ProgressBar
            value={items.length ? (completed / items.length) * 100 : 0}
            label="今日进度"
          />
        </div>
      </Section>
      {!query.isPending && items.length === 0 && !generate.data ? (
        <div className="empty-command">
          <p>今日计划尚未生成。</p>
          <Button onClick={() => generate.mutate()}>生成今日计划</Button>
        </div>
      ) : null}
      {generate.data ? (
        <JobProgress
          jobId={generate.data.id}
          onTerminal={() => void query.refetch()}
        />
      ) : null}
      <RemoteState pending={query.isPending} error={query.error}>
        {!attempt.data ? (
          <div className="objective-list">
            {items.map((item, index) => {
              const objective = asRecord(item.objective);
              return (
                <button
                  key={stringValue(item.id, String(index))}
                  onClick={() => attempt.mutate(stringValue(item.id))}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>
                    {stringValue(objective.knowledgeFacet, "学习目标")}
                  </strong>
                  <small>
                    {stringValue(objective.retrievalDirection, "RECALL")}
                  </small>
                </button>
              );
            })}
          </div>
        ) : (
          <ExercisePlayer
            attempt={attempt.data}
            consentRecordId={activeConsentId(consents.data, "PERSONALIZATION")}
            onSubmit={studyCommands.submitResponse}
          />
        )}
      </RemoteState>
    </div>
  );
}
