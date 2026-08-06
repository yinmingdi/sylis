import { DataList, PageHeader, Section } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { lexiconQueries } from "../../modules/lexicon";
import { PedagogicalMaterials } from "../../modules/lexicon/components/pedagogical-materials";
import { NotebookTargetAction } from "../../modules/notebooks";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function SensePage() {
  const { id = "" } = useParams();
  const query = useQuery(lexiconQueries.sense(id));
  const sense = asRecord(query.data);
  const definitions = asArray(sense.definitions).map(asRecord);
  const examples = asArray(sense.examples).map(asRecord);
  const collocations = asArray(sense.collocations).map(asRecord);
  const usages = asArray(sense.usages).map(asRecord);
  const children = asArray(sense.children).map(asRecord);
  const memberships = asArray(sense.memberships).map(asRecord);
  const relations = [
    ...asArray(sense.outgoingRelations),
    ...asArray(sense.incomingRelations),
  ].map(asRecord);
  return (
    <div className="page lexicon-page">
      <PageHeader
        eyebrow="Sense"
        title={
          definitions.map((row) => stringValue(row.text)).join("；") || "义项"
        }
        actions={id ? <NotebookTargetAction kind="SENSE" id={id} /> : null}
      />
      <RemoteState pending={query.isPending} error={query.error}>
        <Section>
          <h2>释义</h2>
          <DataList
            rows={definitions.map((row) => ({
              label: stringValue(row.languageTag),
              value: stringValue(row.text),
              detail: stringValue(row.definitionType),
            }))}
          />
          <div className="translation-list">
            {asArray(sense.translations)
              .map(asRecord)
              .map((row) => (
                <span key={stringValue(row.id)}>{stringValue(row.text)}</span>
              ))}
          </div>
        </Section>
        {usages.length > 0 ? (
          <Section>
            <h2>用法限制</h2>
            <DataList
              rows={usages.map((usage) => ({
                label: stringValue(usage.usageTypeCode),
                value: stringValue(usage.text ?? usage.valueCode),
                detail: usage.text ? stringValue(usage.valueCode, "") : "",
              }))}
            />
          </Section>
        ) : null}
        {examples.length > 0 ? (
          <Section>
            <h2>例句</h2>
            <div className="example-list">
              {examples.map((link) => {
                const example = asRecord(link.example);
                return (
                  <blockquote key={stringValue(example.id)}>
                    <p>{stringValue(example.text)}</p>
                    {asArray(example.translations)
                      .map(asRecord)
                      .map((translation) => (
                        <footer key={stringValue(translation.id)}>
                          {stringValue(translation.text)}
                        </footer>
                      ))}
                  </blockquote>
                );
              })}
            </div>
          </Section>
        ) : null}
        {collocations.length > 0 ? (
          <Section>
            <h2>搭配</h2>
            <DataList
              rows={collocations.map((link) => {
                const collocation = asRecord(link.collocation);
                return {
                  label: stringValue(link.relationType),
                  value: stringValue(collocation.canonicalText),
                  detail: asArray(collocation.components)
                    .map(asRecord)
                    .map((part) => stringValue(part.surfaceText))
                    .join(" + "),
                };
              })}
            />
          </Section>
        ) : null}
        {children.length > 0 ? (
          <Section>
            <h2>细分义项</h2>
            <div className="sense-index">
              {children.map((child, index) => (
                <Link
                  key={stringValue(child.senseId)}
                  to={`/lexicon/senses/${stringValue(child.senseId)}`}
                >
                  <span>{index + 1}</span>
                  <strong>
                    {asArray(child.definitions)
                      .map(asRecord)
                      .map((definition) => stringValue(definition.text))
                      .join("；")}
                  </strong>
                  <small>
                    {asArray(child.translations)
                      .map(asRecord)
                      .map((translation) => stringValue(translation.text))
                      .join("；")}
                  </small>
                </Link>
              ))}
            </div>
          </Section>
        ) : null}
        {memberships.length > 0 ? (
          <Section>
            <h2>概念归属</h2>
            <DataList
              rows={memberships.map((membership) => {
                const concept = asRecord(membership.conceptRevision);
                return {
                  label: stringValue(membership.membershipType),
                  value:
                    asArray(concept.definitions)
                      .map(asRecord)
                      .map((definition) => stringValue(definition.text))
                      .join("；") || stringValue(concept.conceptType),
                  detail: membership.canonical ? "规范义项" : "关联义项",
                };
              })}
            />
          </Section>
        ) : null}
        {relations.length > 0 ? (
          <Section>
            <h2>语义关系</h2>
            <DataList
              rows={relations.map((relation) => {
                const targetId =
                  stringValue(relation.sourceSenseId) === id
                    ? stringValue(relation.targetSenseId)
                    : stringValue(relation.sourceSenseId);
                return {
                  label: stringValue(relation.typeCode),
                  value: (
                    <Link to={`/lexicon/senses/${targetId}`}>查看关联义项</Link>
                  ),
                  detail: stringValue(relation.direction),
                };
              })}
            />
          </Section>
        ) : null}
        {id ? <PedagogicalMaterials targetKind="SENSE" targetId={id} /> : null}
      </RemoteState>
    </div>
  );
}
