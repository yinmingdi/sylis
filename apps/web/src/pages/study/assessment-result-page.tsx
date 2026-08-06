import { DataList, PageHeader } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { assessmentQueries } from "../../modules/assessments";
import { RemoteState } from "../page-utils";
import { asRecord, stringValue } from "../page-values";

export function AssessmentResultPage() {
  const { sessionId = "" } = useParams();
  const query = useQuery(assessmentQueries.result(sessionId));
  const result = asRecord(query.data);
  const score = Number(result.rawScore ?? 0);
  const max = Number(result.maxScore ?? 0);
  const domainScore = asRecord(result.domainScore);
  const sections = asRecord(domainScore.sections);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Result"
        title={max ? `${Math.round((score / max) * 100)} 分` : "测评结果"}
      />
      <RemoteState pending={query.isPending} error={query.error}>
        <DataList
          rows={[
            {
              label: "总分",
              value: `${stringValue(result.rawScore, "0")} / ${stringValue(result.maxScore, "0")}`,
            },
            ...Object.values(sections)
              .map(asRecord)
              .map((section) => ({
                label: stringValue(
                  section.title,
                  stringValue(section.sectionKey),
                ),
                value: `${stringValue(section.rawScore, "0")} / ${stringValue(section.maxScore, "0")}`,
              })),
            { label: "提交时间", value: stringValue(result.computedAt) },
          ]}
        />
      </RemoteState>
    </div>
  );
}
