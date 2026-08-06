import { DataList, PageHeader } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { studyQueries } from "../../modules/study";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function ObjectivePage() {
  const { objectiveId = "" } = useParams();
  const query = useQuery(studyQueries.objective(objectiveId));
  const objective = asRecord(query.data);
  const hints = asArray(objective.hints).map(asRecord);
  return (
    <div className="page">
      <PageHeader
        eyebrow={stringValue(objective.retrievalDirection, "Objective")}
        title={stringValue(objective.knowledgeFacet, "学习目标")}
      />
      <RemoteState pending={query.isPending} error={query.error}>
        <DataList
          rows={hints.map((hint, index) => ({
            label: `${stringValue(hint.hintKind, "提示")} ${index + 1}`,
            value: stringValue(hint.text),
          }))}
        />
      </RemoteState>
    </div>
  );
}
