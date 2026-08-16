import type {
  AdminAuditEventView,
  AdminAuditQuery,
  AdminEntityView,
} from "@sylis/api-client/admin";
import {
  LegalHoldScopeKind,
  SecurityAuditCategory,
} from "@sylis/api-client/admin";
import {
  Button,
  DataList,
  EmptyState,
  Field,
  FileText,
  PageHeader,
  Select,
  StatusBadge,
  TextInput,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { AuditStream, toAuditEventRows } from "./audit-event-rows";
import { EntityRows, QueryBoundary } from "../../components";
import { auditCommands, auditQueries } from "../../modules/audit";
import { useAdminQueryScope } from "../../modules/identity";
import { AdminReauthentication } from "../../modules/identity";

const dayAgo = () => new Date(Date.now() - 24 * 60 * 60_000).toISOString();

export function AuditPage() {
  const scope = useAdminQueryScope();
  const [from, setFrom] = useState(dayAgo);
  const [to, setTo] = useState(() => new Date().toISOString());
  const [stream, setStream] = useState(AuditStream.SECURITY);
  const [action, setAction] = useState("");
  const [applied, setApplied] = useState<AdminAuditQuery>({
    from,
    to,
    limit: 100,
  });
  const [exportReason, setExportReason] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [scopeKind, setScopeKind] = useState(LegalHoldScopeKind.GLOBAL);
  const [scopeRef, setScopeRef] = useState("");
  const [reviewAt, setReviewAt] = useState("");
  const [policyCategory, setPolicyCategory] = useState(
    SecurityAuditCategory.SECURITY,
  );
  const [onlineDays, setOnlineDays] = useState("30");
  const [archiveDays, setArchiveDays] = useState("365");
  const [policyVersion, setPolicyVersion] = useState("audit-retention/v0.0.1");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [archiveFrom, setArchiveFrom] = useState(dayAgo);
  const [archiveTo, setArchiveTo] = useState(() => new Date().toISOString());
  const [archiveCategory, setArchiveCategory] = useState(
    SecurityAuditCategory.SECURITY,
  );
  const [archiveReason, setArchiveReason] = useState("");
  const [releaseHoldId, setReleaseHoldId] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [purgeArchiveId, setPurgeArchiveId] = useState("");
  const [purgeReason, setPurgeReason] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const events = useQuery<AdminAuditEventView[]>(
    stream === AuditStream.SECURITY
      ? auditQueries.security(scope, applied)
      : auditQueries.dataAccess(scope, applied),
  );
  const holds = useQuery(auditQueries.legalHolds(scope));
  const retention = useQuery(auditQueries.retention(scope));
  const exportsQuery = useQuery(auditQueries.exports(scope));
  const cache = useQueryClient();
  const eventRows =
    stream === AuditStream.SECURITY
      ? toAuditEventRows(
          stream,
          (events.data?.filter((event) => "action" in event) as
            | Extract<AdminAuditEventView, { action: string }>[]
            | undefined) ?? [],
        )
      : toAuditEventRows(
          stream,
          (events.data?.filter((event) => "resourceKind" in event) as
            | Extract<AdminAuditEventView, { resourceKind: string }>[]
            | undefined) ?? [],
        );
  const createExport = useMutation({
    mutationFn: () =>
      auditCommands.createExport(
        { ...applied, streams: [stream], reason: exportReason },
        crypto.randomUUID(),
      ),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: auditQueries.exports(scope).queryKey,
      }),
  });
  const createHold = useMutation({
    mutationFn: () =>
      auditCommands.createLegalHold({
        scopeKind,
        ...(scopeRef ? { scopeRef } : {}),
        reason: holdReason,
        reviewAt: new Date(reviewAt).toISOString(),
      }),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: auditQueries.legalHolds(scope).queryKey,
      }),
  });
  const createPolicy = useMutation({
    mutationFn: () =>
      auditCommands.createRetentionPolicy({
        category: policyCategory,
        onlineDays: Number(onlineDays),
        archiveDays: Number(archiveDays),
        policyVersion,
        effectiveAt: new Date(effectiveAt).toISOString(),
      }),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: auditQueries.retention(scope).queryKey,
      }),
  });
  const createArchive = useMutation({
    mutationFn: () =>
      auditCommands.createArchive(
        {
          category: archiveCategory,
          from: new Date(archiveFrom).toISOString(),
          to: new Date(archiveTo).toISOString(),
          reason: archiveReason,
        },
        crypto.randomUUID(),
      ),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: auditQueries.retention(scope).queryKey,
      }),
  });
  const releaseHold = useMutation({
    mutationFn: () =>
      auditCommands.releaseLegalHold(releaseHoldId, {
        reason: releaseReason,
      }),
    onSuccess: () => {
      setReleaseHoldId("");
      setReleaseReason("");
      return cache.invalidateQueries({
        queryKey: auditQueries.legalHolds(scope).queryKey,
      });
    },
  });
  const purgeArchive = useMutation({
    mutationFn: () =>
      auditCommands.purgeArchive(
        purgeArchiveId,
        { reason: purgeReason },
        crypto.randomUUID(),
      ),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: auditQueries.retention(scope).queryKey,
      }),
  });
  const activeHolds = (holds.data ?? []).filter(
    (hold) => !entityText(hold, "releasedAt"),
  );
  const activeArchives = (retention.data?.archives ?? []).filter(
    (archive) => entityText(archive, "status") === "ACTIVE",
  );

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Immutable evidence" title="Audit" />
      <form
        className="admin-search admin-search--wide"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setApplied({
            from: new Date(from).toISOString(),
            to: new Date(to).toISOString(),
            ...(action ? { action } : {}),
            limit: 100,
          });
        }}
      >
        <Field label="Stream">
          <Select
            value={stream}
            onChange={(event) => setStream(event.target.value as AuditStream)}
          >
            <option value={AuditStream.SECURITY}>SECURITY</option>
            <option value={AuditStream.DATA_ACCESS}>DATA_ACCESS</option>
          </Select>
        </Field>
        <Field label="From">
          <TextInput
            type="datetime-local"
            value={from.slice(0, 16)}
            onChange={(event) => setFrom(event.target.value)}
          />
        </Field>
        <Field label="To">
          <TextInput
            type="datetime-local"
            value={to.slice(0, 16)}
            onChange={(event) => setTo(event.target.value)}
          />
        </Field>
        <Field label="Action">
          <TextInput
            value={action}
            onChange={(event) => setAction(event.target.value)}
          />
        </Field>
        <Button type="submit">查询</Button>
      </form>
      <QueryBoundary pending={events.isPending} error={events.error}>
        {eventRows.length ? (
          <DataList
            rows={eventRows.map((row) => ({
              ...row,
              value: (
                <StatusBadge
                  tone={row.value === "SUCCEEDED" ? "positive" : "danger"}
                >
                  {row.value}
                </StatusBadge>
              ),
            }))}
          />
        ) : (
          <EmptyState
            icon={FileText}
            title="暂无记录"
            description="当前筛选范围没有记录。"
          />
        )}
      </QueryBoundary>
      <section className="admin-risk-command">
        <h2>Audit export</h2>
        <Field label="Reason">
          <TextInput
            value={exportReason}
            onChange={(event) => setExportReason(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          disabled={
            !reauthenticated || !exportReason.trim() || createExport.isPending
          }
          onClick={() => createExport.mutate()}
        >
          创建导出
        </Button>
      </section>
      <section className="admin-risk-command">
        <h2>Legal hold</h2>
        <Field label="Scope kind">
          <Select
            value={scopeKind}
            onChange={(event) => {
              setScopeKind(event.target.value as LegalHoldScopeKind);
              setScopeRef("");
            }}
          >
            {Object.values(LegalHoldScopeKind).map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </Select>
        </Field>
        {scopeKind === LegalHoldScopeKind.AUDIT_CATEGORY ? (
          <Field label="Scope reference">
            <Select
              value={scopeRef}
              onChange={(event) => setScopeRef(event.target.value)}
            >
              <option value="">Select category</option>
              {Object.values(SecurityAuditCategory).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>
        ) : scopeKind === LegalHoldScopeKind.AUDIT_ARCHIVE ? (
          <Field label="Scope reference">
            <TextInput
              value={scopeRef}
              onChange={(event) => setScopeRef(event.target.value)}
            />
          </Field>
        ) : null}
        <Field label="Review at">
          <TextInput
            type="datetime-local"
            value={reviewAt}
            onChange={(event) => setReviewAt(event.target.value)}
          />
        </Field>
        <Field label="Reason">
          <TextInput
            value={holdReason}
            onChange={(event) => setHoldReason(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          tone="danger"
          disabled={
            !reauthenticated ||
            (scopeKind !== LegalHoldScopeKind.GLOBAL && !scopeRef) ||
            !reviewAt ||
            !holdReason.trim() ||
            createHold.isPending
          }
          onClick={() => createHold.mutate()}
        >
          创建 Legal Hold
        </Button>
      </section>
      <section className="admin-risk-command">
        <h2>Retention policy</h2>
        <Field label="Category">
          <Select
            value={policyCategory}
            onChange={(event) =>
              setPolicyCategory(event.target.value as SecurityAuditCategory)
            }
          >
            {Object.values(SecurityAuditCategory).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Online days">
          <TextInput
            type="number"
            value={onlineDays}
            onChange={(event) => setOnlineDays(event.target.value)}
          />
        </Field>
        <Field label="Archive days">
          <TextInput
            type="number"
            value={archiveDays}
            onChange={(event) => setArchiveDays(event.target.value)}
          />
        </Field>
        <Field label="Policy version">
          <TextInput
            value={policyVersion}
            onChange={(event) => setPolicyVersion(event.target.value)}
          />
        </Field>
        <Field label="Effective at">
          <TextInput
            type="datetime-local"
            value={effectiveAt}
            onChange={(event) => setEffectiveAt(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          tone="danger"
          disabled={
            !reauthenticated ||
            !effectiveAt ||
            !policyVersion.trim() ||
            Number(onlineDays) < 1 ||
            Number(archiveDays) < 1 ||
            createPolicy.isPending
          }
          onClick={() => createPolicy.mutate()}
        >
          创建保留策略
        </Button>
      </section>
      <section className="admin-risk-command">
        <h2>Archive audit events</h2>
        <Field label="Category">
          <Select
            value={archiveCategory}
            onChange={(event) =>
              setArchiveCategory(event.target.value as SecurityAuditCategory)
            }
          >
            {Object.values(SecurityAuditCategory).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <TextInput
            type="datetime-local"
            value={archiveFrom.slice(0, 16)}
            onChange={(event) => setArchiveFrom(event.target.value)}
          />
        </Field>
        <Field label="To">
          <TextInput
            type="datetime-local"
            value={archiveTo.slice(0, 16)}
            onChange={(event) => setArchiveTo(event.target.value)}
          />
        </Field>
        <Field label="Reason">
          <TextInput
            value={archiveReason}
            onChange={(event) => setArchiveReason(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          tone="danger"
          disabled={
            !reauthenticated ||
            !archiveFrom ||
            !archiveTo ||
            !archiveReason.trim() ||
            createArchive.isPending
          }
          onClick={() => createArchive.mutate()}
        >
          创建归档任务
        </Button>
      </section>
      <section className="admin-risk-command">
        <h2>Release legal hold</h2>
        <Field label="Legal hold">
          <Select
            value={releaseHoldId}
            onChange={(event) => setReleaseHoldId(event.target.value)}
          >
            <option value="">Select active hold</option>
            {activeHolds.map((hold) => {
              const id = entityText(hold, "id");
              return (
                <option key={id} value={id}>
                  {entityText(hold, "scopeKind")} · {id}
                </option>
              );
            })}
          </Select>
        </Field>
        <Field label="Release reason">
          <TextInput
            value={releaseReason}
            onChange={(event) => setReleaseReason(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          tone="danger"
          disabled={
            !reauthenticated ||
            !releaseHoldId ||
            !releaseReason.trim() ||
            releaseHold.isPending
          }
          onClick={() => releaseHold.mutate()}
        >
          释放 Legal Hold
        </Button>
      </section>
      <section className="admin-risk-command">
        <h2>Purge audit archive</h2>
        <Field label="Archive">
          <Select
            value={purgeArchiveId}
            onChange={(event) => setPurgeArchiveId(event.target.value)}
          >
            <option value="">Select active archive</option>
            {activeArchives.map((archive) => {
              const id = entityText(archive, "id");
              return (
                <option key={id} value={id}>
                  {entityText(archive, "category")} · {id}
                </option>
              );
            })}
          </Select>
        </Field>
        <Field label="Reason">
          <TextInput
            value={purgeReason}
            onChange={(event) => setPurgeReason(event.target.value)}
          />
        </Field>
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button
          tone="danger"
          disabled={
            !reauthenticated ||
            !purgeArchiveId ||
            !purgeReason.trim() ||
            purgeArchive.isPending
          }
          onClick={() => purgeArchive.mutate()}
        >
          创建清理任务
        </Button>
      </section>
      <div className="admin-three-column">
        <section>
          <h2>Exports</h2>
          <QueryBoundary
            pending={exportsQuery.isPending}
            error={exportsQuery.error}
          >
            <EntityRows data={exportsQuery.data} />
          </QueryBoundary>
        </section>
        <section>
          <h2>Legal Holds</h2>
          <QueryBoundary pending={holds.isPending} error={holds.error}>
            <EntityRows data={holds.data} />
          </QueryBoundary>
        </section>
        <section>
          <h2>Retention</h2>
          <QueryBoundary pending={retention.isPending} error={retention.error}>
            <EntityRows
              data={[
                ...(retention.data?.policies ?? []),
                ...(retention.data?.archives ?? []),
              ]}
            />
          </QueryBoundary>
        </section>
      </div>
    </div>
  );
}

function entityText(entity: AdminEntityView, key: string): string {
  const value = entity[key];
  return typeof value === "string" ? value : "";
}
