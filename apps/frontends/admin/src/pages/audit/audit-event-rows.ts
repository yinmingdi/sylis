export enum AuditStream {
  SECURITY = "SECURITY",
  DATA_ACCESS = "DATA_ACCESS",
}

interface SecurityAuditRowSource {
  id: string;
  action: string;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  result: string;
  occurredAt: string;
}

interface DataAccessAuditRowSource {
  id: string;
  actorUserId: string;
  ownerUserId: string;
  resourceKind: string;
  resourceId: string;
  result: string;
  occurredAt: string;
}

export interface AuditEventRow {
  label: string;
  value: string;
  detail: string;
}

export function toAuditEventRows(
  stream: AuditStream.SECURITY,
  events: readonly SecurityAuditRowSource[],
): AuditEventRow[];
export function toAuditEventRows(
  stream: AuditStream.DATA_ACCESS,
  events: readonly DataAccessAuditRowSource[],
): AuditEventRow[];
export function toAuditEventRows(
  stream: AuditStream,
  events: readonly (SecurityAuditRowSource | DataAccessAuditRowSource)[],
): AuditEventRow[] {
  return stream === AuditStream.SECURITY
    ? (events as readonly SecurityAuditRowSource[]).map((event) => ({
        label: event.action,
        value: event.result,
        detail: joinDetails(
          event.actorUserId ? `Actor ${event.actorUserId}` : "Actor system",
          event.targetType,
          event.targetId,
          event.occurredAt,
        ),
      }))
    : (events as readonly DataAccessAuditRowSource[]).map((event) => ({
        label: event.resourceKind,
        value: event.result,
        detail: joinDetails(
          `Actor ${event.actorUserId}`,
          `Owner ${event.ownerUserId}`,
          `Resource ${event.resourceId}`,
          event.occurredAt,
        ),
      }));
}

function joinDetails(...values: Array<string | null>): string {
  return values.filter(Boolean).join(" · ");
}
