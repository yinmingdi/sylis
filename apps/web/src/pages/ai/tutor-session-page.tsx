import { Button, PageHeader, Send } from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { aiCommands, aiQueries } from "../../modules/ai-tutor";
import { activeConsentId, consentsQuery } from "../../modules/identity";
import { JobProgress } from "../../modules/jobs";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function TutorSessionPage() {
  const { sessionId = "" } = useParams();
  const [content, setContent] = useState("");
  const [jobId, setJobId] = useState<string>();
  const query = useQuery(aiQueries.messages(sessionId));
  const consents = useQuery(consentsQuery);
  const consentRecordId = activeConsentId(consents.data, "AI_TUTOR");
  const cache = useQueryClient();
  const send = useMutation({
    mutationFn: async () => {
      if (!consentRecordId) throw new Error("请先在隐私设置中授权 AI 导师");
      return aiCommands.sendMessage(
        sessionId,
        { content, consentRecordId, contextRefs: [] },
        crypto.randomUUID(),
      );
    },
    onSuccess: (value) => {
      setContent("");
      setJobId(value.jobId);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (content.trim() && consentRecordId) send.mutate();
  };
  const messages = asArray(query.data).map(asRecord);
  return (
    <div className="page tutor-page">
      <PageHeader eyebrow="Tutor session" title="导师会话" />
      <RemoteState pending={query.isPending} error={query.error}>
        <div className="message-stream">
          {messages.map((message) => (
            <article
              key={stringValue(message.id)}
              data-role={stringValue(message.role)}
            >
              <span>{stringValue(message.role)}</span>
              <p>{stringValue(message.content ?? message.contentPreview)}</p>
            </article>
          ))}
        </div>
      </RemoteState>
      {jobId ? (
        <JobProgress
          jobId={jobId}
          onTerminal={() => {
            void cache.invalidateQueries({
              queryKey: aiQueries.messages(sessionId).queryKey,
            });
          }}
        />
      ) : null}
      <form className="composer" onSubmit={submit}>
        <textarea
          aria-label="消息"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={consentRecordId ? "输入消息" : "请先授权 AI 导师"}
          disabled={!consentRecordId}
        />
        <Button
          icon={Send}
          type="submit"
          disabled={send.isPending || !content.trim() || !consentRecordId}
        >
          发送
        </Button>
      </form>
      {send.error ? <p className="form-error">{send.error.message}</p> : null}
    </div>
  );
}
