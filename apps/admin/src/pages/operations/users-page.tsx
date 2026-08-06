import {
  Button,
  DataList,
  Field,
  PageHeader,
  Search,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { array, QueryBoundary, record, value } from "../../app/view-utils";
import { AdminReauthentication } from "../../modules/identity";
import { operationCommands, operationQueries } from "../../modules/operations";

export function UsersPage() {
  const [queryText, setQueryText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const options = operationQueries.users(searchText);
  const sessionOptions = operationQueries.adminSessions(selected);
  const query = useQuery(options);
  const sessionsQuery = useQuery({
    ...sessionOptions,
    enabled: Boolean(selected),
  });
  const cache = useQueryClient();
  const update = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "ACTIVE" | "SUSPENDED";
    }) => operationCommands.users.setStatus(id, status, reason),
    onSuccess: () => cache.invalidateQueries({ queryKey: options.queryKey }),
  });
  const revoke = useMutation({
    mutationFn: (sessionId: string) =>
      operationCommands.users.revokeAdminSession(selected, sessionId, reason),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: sessionOptions.queryKey }),
  });
  const users = array(query.data).map(record);

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Support" title="用户支持" />
      <form
        className="admin-search"
        onSubmit={(event) => {
          event.preventDefault();
          setSearchText(queryText.trim());
        }}
      >
        <Field label="用户 ID 或邮箱">
          <TextInput
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
          />
        </Field>
        <Button icon={Search} type="submit" tone="secondary">
          查询
        </Button>
      </form>
      <QueryBoundary pending={query.isPending} error={query.error}>
        <DataList
          rows={users.map((user) => {
            const emails = array(user.emails).map(record);
            return {
              label: value(
                emails.find((email) => email.isPrimary)?.displayEmail,
                value(user.id),
              ),
              value: value(user.status),
              detail: `${value(user.locale)} · ${value(user.timezone)} · ${value(user.id)}`,
              action: (
                <Button
                  tone="quiet"
                  onClick={() => setSelected(value(user.id))}
                >
                  管理
                </Button>
              ),
            };
          })}
        />
      </QueryBoundary>
      {selected ? (
        <section className="admin-risk-command">
          <h2>账户状态</h2>
          <Field label="原因">
            <TextInput
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <AdminReauthentication onStatusChange={setReauthenticated} />
          <Button
            disabled={!reauthenticated || !reason.trim()}
            onClick={() => update.mutate({ id: selected, status: "ACTIVE" })}
          >
            恢复账户
          </Button>
          <Button
            tone="danger"
            disabled={!reauthenticated || !reason.trim()}
            onClick={() => update.mutate({ id: selected, status: "SUSPENDED" })}
          >
            停用并撤销会话
          </Button>
          <h2>管理员会话</h2>
          <QueryBoundary
            pending={sessionsQuery.isPending}
            error={sessionsQuery.error}
          >
            <DataList
              rows={array(sessionsQuery.data)
                .map(record)
                .map((session) => ({
                  label: value(session.id),
                  value: session.revokedAt ? "REVOKED" : "ACTIVE",
                  detail: `${value(session.authStrength)} · ${value(session.lastSeenAt)}`,
                  action: session.revokedAt ? null : (
                    <Button
                      tone="danger"
                      disabled={
                        !reauthenticated || !reason.trim() || revoke.isPending
                      }
                      onClick={() => revoke.mutate(value(session.id))}
                    >
                      撤销
                    </Button>
                  ),
                }))}
            />
          </QueryBoundary>
        </section>
      ) : null}
    </div>
  );
}
