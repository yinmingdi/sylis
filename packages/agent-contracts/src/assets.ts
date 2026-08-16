export enum AssetMimeType {
  TEXT_PLAIN = "text/plain",
  TEXT_MARKDOWN = "text/markdown",
  APPLICATION_JSON = "application/json",
  PDF = "application/pdf",
  DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  EPUB = "application/epub+zip",
  PNG = "image/png",
  JPEG = "image/jpeg",
  WEBP = "image/webp",
}

export enum AssetPurpose {
  AGENT_CONTEXT = "AGENT_CONTEXT",
  USER_UPLOAD = "USER_UPLOAD",
  AGENT_ARTIFACT = "AGENT_ARTIFACT",
  DIAGNOSTIC_BUNDLE = "DIAGNOSTIC_BUNDLE",
}

export enum AssetStatus {
  QUARANTINED = "QUARANTINED",
  PROCESSING = "PROCESSING",
  READY = "READY",
  REJECTED = "REJECTED",
  HIDDEN = "HIDDEN",
  DELETED = "DELETED",
}

export enum AssetRevisionStatus {
  QUARANTINED = "QUARANTINED",
  CLEAN = "CLEAN",
  READY = "READY",
  REJECTED = "REJECTED",
  PURGED = "PURGED",
}

export enum AssetDerivativeKind {
  EXTRACTED_TEXT = "EXTRACTED_TEXT",
  OCR_TEXT = "OCR_TEXT",
  LEXICAL_INDEX = "LEXICAL_INDEX",
  EMBEDDING = "EMBEDDING",
  IMAGE_ANALYSIS = "IMAGE_ANALYSIS",
}

export enum AssetProcessingResultKind {
  SCAN = "SCAN",
  TEXT_EXTRACTION = "TEXT_EXTRACTION",
  LEXICAL_INDEX = "LEXICAL_INDEX",
  MODEL_OUTPUT = "MODEL_OUTPUT",
}

export enum AssetScanStatus {
  READY = "READY",
  REJECTED = "REJECTED",
}

export enum AssetScanRejectionReason {
  MALWARE_DETECTED = "MALWARE_DETECTED",
}

export enum AssetParserKind {
  PLAIN_TEXT = "PLAIN_TEXT",
  JSON = "JSON",
  PDF = "PDF",
  DOCX = "DOCX",
  EPUB = "EPUB",
  IMAGE_OCR = "IMAGE_OCR",
}

export enum AssetLanguageCode {
  ENGLISH = "en",
  CHINESE = "zh",
  MIXED = "mul",
  UNDETERMINED = "und",
}

export interface AssetProcessingTask {
  assetRevisionId: string;
  mimeType: AssetMimeType;
  contentHash: string;
  byteSize: number;
  downloadUrl?: string;
  cleanUploadUrl?: string;
  sourceText?: string;
  modelExecutionPermitId?: string;
}

export interface AssetScanAcceptedResult {
  resultKind: AssetProcessingResultKind.SCAN;
  status: AssetScanStatus.READY;
  detectedMimeType: AssetMimeType;
  scannerVersion: string;
  validatorVersion: string;
  pageCount?: number;
  pixelWidth?: number;
  pixelHeight?: number;
}

export interface AssetScanRejectedResult {
  resultKind: AssetProcessingResultKind.SCAN;
  status: AssetScanStatus.REJECTED;
  rejectionReason: AssetScanRejectionReason;
  scannerVersion: string;
}

export type AssetScanResult = AssetScanAcceptedResult | AssetScanRejectedResult;

export interface AssetTextExtractionResult {
  resultKind: AssetProcessingResultKind.TEXT_EXTRACTION;
  text: string;
  parser: AssetParserKind;
  parserVersion: string;
  language: AssetLanguageCode;
  pageCount?: number;
}

export interface AssetLexicalTerm {
  normalized: string;
  surfaceForms: readonly string[];
  count: number;
  firstOffset: number;
}

export interface AssetLexicalIndexResult {
  resultKind: AssetProcessingResultKind.LEXICAL_INDEX;
  language: AssetLanguageCode;
  tokenCount: number;
  terms: readonly AssetLexicalTerm[];
  tokenizerVersion: string;
}

export interface AssetModelResult {
  resultKind: AssetProcessingResultKind.MODEL_OUTPUT;
  output: Readonly<Record<string, unknown>>;
}

export type AssetProcessingResult =
  | AssetScanResult
  | AssetTextExtractionResult
  | AssetLexicalIndexResult
  | AssetModelResult;
