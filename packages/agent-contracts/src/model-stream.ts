export enum ModelContentBlockKind {
  TEXT = "TEXT",
  REASONING = "REASONING",
  TOOL_CALL = "TOOL_CALL",
}

export enum ModelStreamEventType {
  INVOCATION_STARTED = "INVOCATION_STARTED",
  BLOCK_STARTED = "BLOCK_STARTED",
  TEXT_DELTA = "TEXT_DELTA",
  REASONING_DELTA = "REASONING_DELTA",
  TOOL_CALL_DELTA = "TOOL_CALL_DELTA",
  BLOCK_COMPLETED = "BLOCK_COMPLETED",
  USAGE = "USAGE",
  RESPONSE_COMPLETED = "RESPONSE_COMPLETED",
  RESPONSE_FAILED = "RESPONSE_FAILED",
}

export enum ModelResponseFinishReason {
  STOP = "STOP",
  TOOL_CALLS = "TOOL_CALLS",
  LENGTH = "LENGTH",
  CONTENT_FILTER = "CONTENT_FILTER",
  ERROR = "ERROR",
}

export interface ModelTextContentBlock {
  kind: ModelContentBlockKind.TEXT;
  modelPosition: number;
  text: string;
}

export interface ModelReasoningContentBlock {
  kind: ModelContentBlockKind.REASONING;
  modelPosition: number;
}

export interface ModelToolCallContentBlock {
  kind: ModelContentBlockKind.TOOL_CALL;
  modelPosition: number;
  providerCallId?: string;
  providerName: string;
  input: Readonly<Record<string, unknown>>;
}

export type ModelContentBlock =
  | ModelTextContentBlock
  | ModelReasoningContentBlock
  | ModelToolCallContentBlock;

interface ModelStreamEventBase {
  invocationId: string;
}

export type ModelStreamEvent =
  | (ModelStreamEventBase & {
      type: ModelStreamEventType.INVOCATION_STARTED;
      attemptOrdinal: number;
    })
  | (ModelStreamEventBase & {
      type: ModelStreamEventType.BLOCK_STARTED;
      modelPosition: number;
      blockKind: ModelContentBlockKind;
    })
  | (ModelStreamEventBase & {
      type: ModelStreamEventType.TEXT_DELTA;
      modelPosition: number;
      providerSequence: number;
      delta: string;
    })
  | (ModelStreamEventBase & {
      type: ModelStreamEventType.REASONING_DELTA;
      modelPosition: number;
      providerSequence: number;
    })
  | (ModelStreamEventBase & {
      type: ModelStreamEventType.TOOL_CALL_DELTA;
      modelPosition: number;
      providerSequence: number;
      providerCallId?: string;
      providerName?: string;
      argumentsDelta: string;
    })
  | (ModelStreamEventBase & {
      type: ModelStreamEventType.BLOCK_COMPLETED;
      block: ModelContentBlock;
    })
  | (ModelStreamEventBase & {
      type: ModelStreamEventType.USAGE;
      inputTokens: number;
      outputTokens: number;
      costMicros?: string;
    })
  | (ModelStreamEventBase & {
      type: ModelStreamEventType.RESPONSE_COMPLETED;
      responseId?: string;
      finishReason: ModelResponseFinishReason;
    })
  | (ModelStreamEventBase & {
      type: ModelStreamEventType.RESPONSE_FAILED;
      errorCode: string;
      retryable: boolean;
      unknownOutcome: boolean;
    });

export interface ModelContentFragmentInput {
  invocationId: string;
  contentBodyId: string;
  modelPosition: number;
  modelSubPosition: number;
  fragmentSequence: number;
  serializedContent: string;
  seal: boolean;
}

export interface ModelContentFragmentRef {
  contentBodyId: string;
  contentFragmentId: string;
  contentHash: string;
  byteLength: number;
}

export interface ModelContentFragmentSnapshot {
  contentBodyId: string;
  plaintext: string;
  contentHash: string;
}
