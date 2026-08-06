import {
  Button,
  Field,
  PageHeader,
  Select,
  WandSparkles,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { aiCommands, aiQueries } from "../../modules/ai-tutor";
import { activeConsentId, consentsQuery } from "../../modules/identity";
import { JobProgress } from "../../modules/jobs";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function AiReadingPage() {
  const [difficulty, setDifficulty] = useState("B1");
  const [jobId, setJobId] = useState<string>();
  const query = useQuery(aiQueries.readings);
  const consents = useQuery(consentsQuery);
  const cache = useQueryClient();
  const consentRecordId = activeConsentId(consents.data, "AI_READING");
  const generate = useMutation({
    mutationFn: () =>
      aiCommands.generateReading(
        { difficulty, constraints: {}, consentRecordId },
        crypto.randomUUID(),
      ),
    onSuccess: (value) => setJobId(value.jobId),
  });
  const readings = asArray(query.data).map(asRecord);
  return (
    <div className="page">
      <PageHeader
        eyebrow="AI Reading"
        title="生成阅读"
        actions={
          <div className="inline-form">
            <Field label="难度">
              <Select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
              >
                {["A2", "B1", "B2", "C1"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </Field>
            <Button
              icon={WandSparkles}
              disabled={generate.isPending || !consentRecordId}
              onClick={() => generate.mutate()}
            >
              生成
            </Button>
          </div>
        }
      />
      {jobId ? (
        <JobProgress
          jobId={jobId}
          onTerminal={() =>
            void cache.invalidateQueries({
              queryKey: aiQueries.readings.queryKey,
            })
          }
        />
      ) : null}
      <RemoteState
        pending={query.isPending}
        error={query.error}
        empty={!query.isPending && readings.length === 0}
      >
        <div className="reading-feed">
          {readings.map((reading) => {
            const document = asRecord(reading.document);
            const revision = asRecord(document.currentRevision);
            return (
              <Link
                key={stringValue(reading.id)}
                to={`/reading/${stringValue(document.id)}`}
              >
                <span>{stringValue(reading.requestedDifficulty, "AI")}</span>
                <h2>{stringValue(revision.title, "阅读材料")}</h2>
                <p>{stringValue(revision.wordCount, "0")} words</p>
              </Link>
            );
          })}
        </div>
      </RemoteState>
    </div>
  );
}
