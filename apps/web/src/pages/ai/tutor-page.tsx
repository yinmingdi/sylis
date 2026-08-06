import { Bot, Button, PageHeader, Plus } from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { aiCommands, aiQueries } from "../../modules/ai-tutor";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

export function TutorPage() {
  const query = useQuery(aiQueries.sessions);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () => aiCommands.createSession("新会话"),
    onSuccess: async (value) => {
      await cache.invalidateQueries({ queryKey: aiQueries.sessions.queryKey });
      navigate(`/ai/tutor/${stringValue(asRecord(value).id)}`);
    },
  });
  const sessions = asArray(query.data).map(asRecord);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Tutor"
        title="AI 导师"
        actions={
          <Button icon={Plus} onClick={() => create.mutate()}>
            新会话
          </Button>
        }
      />
      <RemoteState
        pending={query.isPending}
        error={query.error}
        empty={!query.isPending && sessions.length === 0}
      >
        <div className="conversation-list">
          {sessions.map((session) => (
            <Link
              key={stringValue(session.id)}
              to={`/ai/tutor/${stringValue(session.id)}`}
            >
              <Bot />
              <strong>{stringValue(session.title, "未命名会话")}</strong>
              <span>{stringValue(session.updatedAt ?? session.createdAt)}</span>
            </Link>
          ))}
        </div>
      </RemoteState>
    </div>
  );
}
