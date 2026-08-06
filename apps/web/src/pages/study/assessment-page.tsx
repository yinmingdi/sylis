import { Button, ListChecks, PageHeader } from "@sylis/components";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import {
  assessmentCommands,
  assessmentQueries,
} from "../../modules/assessments";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function AssessmentPage() {
  const query = useQuery(assessmentQueries.blueprints);
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: (id: string) =>
      assessmentCommands.createSession(id, crypto.randomUUID()),
    onSuccess: (data) =>
      navigate(`/study/assessments/${stringValue(asRecord(data).id)}`),
  });
  const blueprints = asArray(query.data).map(asRecord);
  return (
    <div className="page">
      <PageHeader eyebrow="Assessment" title="测评" />
      <RemoteState
        pending={query.isPending}
        error={query.error}
        empty={!query.isPending && blueprints.length === 0}
      >
        <div className="book-grid">
          {blueprints.map((blueprint) => (
            <article key={stringValue(blueprint.id)}>
              <ListChecks aria-hidden="true" />
              <span>{stringValue(blueprint.version)}</span>
              <h2>{stringValue(blueprint.title)}</h2>
              <p>
                {asArray(blueprint.sections)
                  .map(asRecord)
                  .reduce(
                    (sum, section) => sum + Number(section.itemCount ?? 0),
                    0,
                  )}{" "}
                题
              </p>
              <Button
                disabled={create.isPending}
                onClick={() => create.mutate(stringValue(blueprint.id))}
              >
                开始测评
              </Button>
            </article>
          ))}
        </div>
      </RemoteState>
    </div>
  );
}
