export enum AuditArchiveSchemaVersion {
  V1 = "sylis-audit-archive/v1",
}

export enum AuditArchiveRecordKind {
  MANIFEST = "MANIFEST",
  SECURITY_EVENT = "SECURITY_EVENT",
  DATA_ACCESS_EVENT = "DATA_ACCESS_EVENT",
}

export enum AuditArchiveProgressStage {
  SNAPSHOTTING = "SNAPSHOTTING",
  HASHING = "HASHING",
  ENCRYPTING = "ENCRYPTING",
  RECORDED = "RECORDED",
  PURGING = "PURGING",
  PURGED = "PURGED",
}

export enum AuditArchiveResultType {
  ARCHIVE = "audit-archive",
  PURGE = "audit-archive-purge",
}

export enum AuditArchiveEncryptionAlgorithm {
  AES_256_GCM = "AES-256-GCM",
}
