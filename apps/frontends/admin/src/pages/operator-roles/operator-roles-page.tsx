import { AdminOperatorRole } from "@sylis/api-client/admin";
import {
  Button,
  DataList,
  Field,
  PageHeader,
  Select,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { QueryBoundary } from "../../components";
import { AdminReauthentication } from "../../modules/identity";
import { useAdminQueryScope } from "../../modules/identity";
import {
  operatorRoleCommands,
  operatorRoleQuery,
} from "../../modules/operator-roles";
import { value } from "../../utils";

export function OperatorRolesPage() {
  const scope = useAdminQueryScope();
  const query = useQuery(operatorRoleQuery(scope));
  const cache = useQueryClient();
  const [targetUserId, setTargetUserId] = useState("");
  const [role, setRole] = useState(AdminOperatorRole.SUPPORT);
  const [policyVersion, setPolicyVersion] = useState("operator-rbac/1");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [lockUserId, setLockUserId] = useState("");
  const [reasonCode, setReasonCode] = useState("SECURITY_INCIDENT");
  const [reauthenticated, setReauthenticated] = useState(false);
  const grant = useMutation({
    mutationFn: () =>
      operatorRoleCommands.grant({
        targetUserId,
        role,
        policyVersion,
        expiresAt: new Date(expiresAt).toISOString(),
        reason,
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: operatorRoleQuery(scope).queryKey }),
  });
  const revoke = useMutation({
    mutationFn: () => operatorRoleCommands.revoke(assignmentId, reason),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: operatorRoleQuery(scope).queryKey }),
  });
  const lock = useMutation({
    mutationFn: () =>
      operatorRoleCommands.lockUser(lockUserId, { reasonCode, reason }),
  });

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Fixed RBAC" title="Operator Roles" />
      <form
        className="admin-command admin-command--stacked"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (reauthenticated) grant.mutate();
        }}
      >
        <Field label="Target User ID">
          <TextInput
            required
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
          />
        </Field>
        <Field label="Role">
          <Select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as AdminOperatorRole)
            }
          >
            {Object.values(AdminOperatorRole).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Policy version">
          <TextInput
            required
            value={policyVersion}
            onChange={(event) => setPolicyVersion(event.target.value)}
          />
        </Field>
        <Field label="Expires at">
          <TextInput
            required
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </Field>
        <Field label="Reason">
          <TextInput
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          type="submit"
          disabled={!reauthenticated || !expiresAt || grant.isPending}
        >
          授予角色
        </Button>
      </form>
      <QueryBoundary pending={query.isPending} error={query.error}>
        <DataList
          rows={(query.data ?? []).map((assignment) => ({
            label: value(assignment.role),
            value: assignment.revokedAt ? "REVOKED" : "ACTIVE",
            detail: `${value(assignment.targetUserId, value(assignment.userId))} · ${value(assignment.expiresAt)} · ${assignment.id}`,
            action: assignment.revokedAt ? null : (
              <Button
                tone="danger"
                onClick={() => setAssignmentId(assignment.id)}
              >
                撤销
              </Button>
            ),
          }))}
        />
      </QueryBoundary>
      {assignmentId ? (
        <section className="admin-risk-command">
          <h2>撤销角色</h2>
          <p>{assignmentId}</p>
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
            撤销
          </Button>
        </section>
      ) : null}
      <section className="admin-risk-command">
        <h2>Security lock</h2>
        <Field label="User ID">
          <TextInput
            value={lockUserId}
            onChange={(event) => setLockUserId(event.target.value)}
          />
        </Field>
        <Field label="Reason code">
          <TextInput
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value)}
          />
        </Field>
        <Field label="Reason">
          <TextInput
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          tone="danger"
          disabled={
            !reauthenticated || !lockUserId || !reason.trim() || lock.isPending
          }
          onClick={() => lock.mutate()}
        >
          锁定 User
        </Button>
      </section>
    </div>
  );
}
