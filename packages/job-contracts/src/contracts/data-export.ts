export enum DataExportProgressStage {
  COLLECTING = "COLLECTING",
  SERIALIZING = "SERIALIZING",
  UPLOADED = "UPLOADED",
}

export enum DataExportCategory {
  EXERCISE_ATTEMPTS = "EXERCISE_ATTEMPTS",
  NOTEBOOKS = "NOTEBOOKS",
  PROFILE = "PROFILE",
}

export enum DataExportResultType {
  USER_DATA_EXPORT = "user-data-export",
}

export enum DataExportSchemaVersion {
  V1 = "sylis.user-export/1",
}
