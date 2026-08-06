import { DataList, PageHeader, Section } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { lexiconQueries } from "../../modules/lexicon";
import { PedagogicalMaterials } from "../../modules/lexicon/components/pedagogical-materials";
import { NotebookTargetAction } from "../../modules/notebooks";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function EntryPage() {
  const { id = "" } = useParams();
  const query = useQuery(lexiconQueries.entry(id));
  const entry = asRecord(query.data);
  const relations = [
    ...asArray(entry.outgoingRelations),
    ...asArray(entry.incomingRelations),
  ].map(asRecord);
  return (
    <div className="page lexicon-page">
      <PageHeader
        eyebrow={stringValue(entry.partOfSpeechCode, "Entry")}
        title={stringValue(entry.entryType, "词条")}
        actions={id ? <NotebookTargetAction kind="ENTRY" id={id} /> : null}
      />
      <RemoteState pending={query.isPending} error={query.error}>
        <Section>
          <h2>词形</h2>
          <DataList
            rows={asArray(entry.forms)
              .map(asRecord)
              .map((form) => ({
                label: stringValue(form.formType),
                value: asArray(form.representations)
                  .map(asRecord)
                  .map((row) => stringValue(row.text))
                  .join(" · "),
                detail: asArray(form.features)
                  .map(asRecord)
                  .map(
                    (row) =>
                      `${stringValue(row.featureCode)}=${stringValue(row.valueCode)}`,
                  )
                  .join(" · "),
              }))}
          />
        </Section>
        <Section>
          <h2>义项</h2>
          <div className="sense-index">
            {asArray(entry.senses)
              .map(asRecord)
              .map((sense, index) => (
                <Link
                  key={stringValue(sense.senseId)}
                  to={`/lexicon/senses/${stringValue(sense.senseId)}`}
                >
                  <span>{index + 1}</span>
                  <strong>
                    {asArray(sense.definitions)
                      .map(asRecord)
                      .map((row) => stringValue(row.text))
                      .join("；")}
                  </strong>
                  <small>
                    {asArray(sense.translations)
                      .map(asRecord)
                      .map((row) => stringValue(row.text))
                      .join("；")}
                  </small>
                </Link>
              ))}
          </div>
        </Section>
        {asArray(entry.frames).length > 0 ? (
          <Section>
            <h2>句法框架</h2>
            <DataList
              rows={asArray(entry.frames)
                .map(asRecord)
                .map((frame) => ({
                  label: stringValue(frame.frameTypeCode),
                  value: stringValue(frame.displayTemplate),
                  detail: asArray(frame.arguments)
                    .map(asRecord)
                    .map(
                      (argument) =>
                        `${stringValue(argument.functionCode)}: ${stringValue(argument.phraseTypeCode)}${argument.optional ? "（可选）" : ""}`,
                    )
                    .join(" · "),
                }))}
            />
          </Section>
        ) : null}
        {relations.length > 0 ? (
          <Section>
            <h2>词条关系</h2>
            <DataList
              rows={relations.map((relation) => {
                const targetId =
                  stringValue(relation.sourceEntryId) === id
                    ? stringValue(relation.targetEntryId)
                    : stringValue(relation.sourceEntryId);
                return {
                  label: stringValue(relation.typeCode),
                  value: (
                    <Link to={`/lexicon/entries/${targetId}`}>
                      查看关联词条
                    </Link>
                  ),
                  detail: stringValue(relation.direction),
                };
              })}
            />
          </Section>
        ) : null}
        {id ? <PedagogicalMaterials targetKind="ENTRY" targetId={id} /> : null}
      </RemoteState>
    </div>
  );
}
