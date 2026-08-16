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

import { QueryBoundary } from "../../components";
import { AdminReauthentication } from "../../modules/identity";
import { useAdminQueryScope } from "../../modules/identity";
import {
  userSupportCommands,
  userSupportQuery,
} from "../../modules/user-support";
import { array, record, value } from "../../utils";

export function UserSupportPage() {
  const scope = useAdminQueryScope();
  const [queryText, setQueryText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [grantId, setGrantId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const options = userSupportQuery(scope, searchText);
  const query = useQuery({ ...options, enabled: searchText.length >= 2 });
  const cache = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => userSupportCommands.revokeSessions(selected, reason),
    onSuccess: () => cache.invalidateQueries({ queryKey: options.queryKey }),
  });
  const access = useMutation({
    mutationFn: () => userSupportCommands.accessGrant(grantId, requestId),
  });
  const users = array(query.data).map(record);

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Minimum-data support" title="User Support" />
      <form
        className="admin-search"
        onSubmit={(event) => {
          event.preventDefault();
          const normalized = queryText.trim();
          if (normalized.length >= 2) setSearchText(normalized);
        }}
      >
        <Field label="User ID or email">
          <TextInput
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
          />
        </Field>
        <Button
          icon={Search}
          type="submit"
          tone="secondary"
          disabled={queryText.trim().length < 2}
        >
          查询
        </Button>
      </form>
      <QueryBoundary
        pending={query.isPending && searchText.length >= 2}
        error={query.error}
      >
        <DataList
          rows={users.map((user) => ({
            label: value(user.displayEmail, value(user.email, value(user.id))),
            value: value(user.status),
            detail: `${value(user.locale)} · ${value(user.timezone)} · ${value(user.id)}`,
            action: (
              <Button tone="danger" onClick={() => setSelected(value(user.id))}>
                撤销会话
              </Button>
            ),
          }))}
        />
      </QueryBoundary>
      <section className="admin-risk-command">
        <h2>受控支持访问</h2>
        <Field label="Support grant ID">
          <TextInput
            value={grantId}
            onChange={(event) => setGrantId(event.target.value)}
          />
        </Field>
        <Field label="Request ID">
          <TextInput
            value={requestId}
            onChange={(event) => setRequestId(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          disabled={
            !reauthenticated || !grantId || !requestId || access.isPending
          }
          onClick={() => access.mutate()}
        >
          使用授权
        </Button>
        {access.error ? (
          <p className="form-error" role="alert">
            {access.error.message}
          </p>
        ) : null}
      </section>
      {access.data ? (
        <section className="admin-support-result">
          <h2>授权资源</h2>
          <DataList
            rows={[
              { label: "Grant", value: access.data.grantId },
              {
                label: "Resource",
                value: access.data.resourceKind,
                detail:
                  access.data.resourceId +
                  " · revision " +
                  access.data.resourceRevisionId,
              },
              { label: "Purpose", value: access.data.purpose },
              {
                label: "Audit",
                value: access.data.audit.result,
                detail:
                  access.data.audit.requestId +
                  " · " +
                  new Date(access.data.audit.occurredAt).toLocaleString(),
              },
            ]}
          />
          <pre>{JSON.stringify(access.data.resource, null, 2)}</pre>
        </section>
      ) : null}
      {selected ? (
        <section className="admin-risk-command">
          <h2>撤销 User 会话</h2>
          <p>{selected}</p>
          <Field label="Reason">
            <TextInput
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <AdminReauthentication onStatusChange={setReauthenticated} />
          <Button
            tone="danger"
            disabled={!reauthenticated || !reason.trim() || revoke.isPending}
            onClick={() => revoke.mutate()}
          >
            撤销全部会话
          </Button>
        </section>
      ) : null}
    </div>
  );
}
