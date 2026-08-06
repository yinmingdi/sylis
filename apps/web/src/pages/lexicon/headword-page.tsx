import { PageHeader, Section, Volume2 } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { lexiconQueries } from "../../modules/lexicon";
import { NotebookTargetAction } from "../../modules/notebooks";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function HeadwordPage() {
  const { id = "" } = useParams();
  const query = useQuery(lexiconQueries.headword(id));
  const headword = asRecord(query.data);
  const entries = asArray(headword.entries).map(asRecord);
  return (
    <div className="page lexicon-page">
      <PageHeader
        eyebrow="Headword"
        title={stringValue(headword.displayText, "词条")}
        actions={id ? <NotebookTargetAction kind="HEADWORD" id={id} /> : null}
      />
      <RemoteState pending={query.isPending} error={query.error}>
        {entries.map((entry) => (
          <Section key={stringValue(entry.entryId)}>
            <div className="entry-heading">
              <div>
                <span>{stringValue(entry.partOfSpeechCode)}</span>
                <h2>{stringValue(entry.entryType, "Lexical entry")}</h2>
              </div>
              <Link to={`/lexicon/entries/${stringValue(entry.entryId)}`}>
                完整词条
              </Link>
            </div>
            <FormSummary forms={asArray(entry.forms)} />
            <SenseList senses={asArray(entry.senses)} />
          </Section>
        ))}
      </RemoteState>
    </div>
  );
}

function FormSummary({ forms }: { forms: unknown[] }) {
  const rows = forms.map(asRecord);
  return (
    <div className="form-strip">
      {rows
        .flatMap((form) => asArray(form.representations).map(asRecord))
        .map((representation, index) => (
          <span key={stringValue(representation.id, String(index))}>
            {stringValue(representation.representationType)}{" "}
            <strong>{stringValue(representation.text)}</strong>
            {stringValue(representation.representationType).includes(
              "PRONUNCIATION",
            ) ? (
              <Volume2 size={15} />
            ) : null}
          </span>
        ))}
    </div>
  );
}

function SenseList({
  senses,
  nested = false,
}: {
  senses: unknown[];
  nested?: boolean;
}) {
  return (
    <ol className={nested ? "sense-list sense-list--nested" : "sense-list"}>
      {senses.map(asRecord).map((sense) => {
        const senseId = stringValue(sense.senseId);
        const children = asArray(sense.children);
        return (
          <li key={senseId}>
            <Link to={`/lexicon/senses/${senseId}`}>
              <div>
                {asArray(sense.definitions)
                  .map(asRecord)
                  .map((definition) => (
                    <p key={stringValue(definition.id)}>
                      {stringValue(definition.text)}
                    </p>
                  ))}
              </div>
              <div className="translation-list">
                {asArray(sense.translations)
                  .map(asRecord)
                  .map((translation) => (
                    <span key={stringValue(translation.id)}>
                      {stringValue(translation.text)}
                    </span>
                  ))}
              </div>
            </Link>
            {children.length > 0 ? (
              <SenseList senses={children} nested />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
