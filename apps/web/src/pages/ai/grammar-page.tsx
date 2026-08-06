import {
  Button,
  DataList,
  Field,
  PageHeader,
  Section,
  SquarePen,
} from "@sylis/components";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { aiCommands } from "../../modules/ai-tutor";
import { activeConsentId, consentsQuery } from "../../modules/identity";
import { JobProgress } from "../../modules/jobs";
import { asArray, asRecord, stringValue } from "../page-values";

export function GrammarPage() {
  const [text, setText] = useState("");
  const [jobId, setJobId] = useState<string>();
  const [diagnosisId, setDiagnosisId] = useState<string>();
  const consents = useQuery(consentsQuery);
  const consentRecordId = activeConsentId(consents.data, "AI_GRAMMAR");
  const diagnosis = useQuery({
    queryKey: ["ai", "grammar-diagnosis", diagnosisId] as const,
    queryFn: () => aiCommands.diagnosis(diagnosisId!),
    enabled: Boolean(diagnosisId),
  });
  const diagnose = useMutation({
    mutationFn: async () => {
      if (!consentRecordId) throw new Error("请先在隐私设置中授权语法诊断");
      return aiCommands.diagnoseGrammar(
        { text, languageTag: "en", consentRecordId },
        crypto.randomUUID(),
      );
    },
    onSuccess: (value) => {
      setJobId(value.jobId);
      setDiagnosisId(value.diagnosisId);
    },
  });
  const result = asRecord(asRecord(diagnosis.data).result);
  const issues = asArray(result.issues).map(asRecord);
  return (
    <div className="page">
      <PageHeader eyebrow="Grammar" title="语法诊断" />
      <form
        className="grammar-editor"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (text.trim() && consentRecordId) diagnose.mutate();
        }}
      >
        <Field
          label="英文文本"
          error={
            diagnose.error?.message ??
            (!consents.isPending && !consentRecordId
              ? "请先在隐私设置中授权语法诊断"
              : undefined)
          }
        >
          <textarea
            className="sy-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        <Button
          icon={SquarePen}
          type="submit"
          disabled={!text.trim() || !consentRecordId || diagnose.isPending}
        >
          开始诊断
        </Button>
      </form>
      {jobId ? (
        <JobProgress
          jobId={jobId}
          onTerminal={() => void diagnosis.refetch()}
        />
      ) : null}
      {result.correctedText ? (
        <Section>
          <h2>修改建议</h2>
          <div className="grammar-result">
            <p>{stringValue(result.correctedText)}</p>
            <small>{stringValue(result.summary)}</small>
            <DataList
              rows={issues.map((issue) => ({
                label: stringValue(issue.category, "GRAMMAR"),
                value: stringValue(issue.suggestion),
                detail: stringValue(issue.explanation),
              }))}
            />
          </div>
        </Section>
      ) : null}
    </div>
  );
}
