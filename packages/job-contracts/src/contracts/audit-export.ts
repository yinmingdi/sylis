export enum AuditEventStreamKind {
  DATA_ACCESS = "DATA_ACCESS",
  SECURITY = "SECURITY",
}

export enum AuditExportProgressStage {
  QUERYING = "QUERYING",
  STREAMING_ARTIFACT = "STREAMING_ARTIFACT",
  UPLOADED = "UPLOADED",
}

export enum AuditExportRecordKind {
  DATA_ACCESS_EVENT = "data-access-event",
  MANIFEST = "manifest",
  SECURITY_EVENT = "security-event",
}

export enum AuditExportResultType {
  AUDIT_EXPORT = "audit-export",
}

export enum AuditExportSchemaVersion {
  V1 = "sylis.audit-export/1",
}
