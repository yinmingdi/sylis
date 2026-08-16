import type { AgentResourceRef } from "./index";

export enum AgentMessageStatus {
  STREAMING = "STREAMING",
  COMPLETED = "COMPLETED",
  INTERRUPTED = "INTERRUPTED",
}

export enum AgentMessageBlockStatus {
  STREAMING = "STREAMING",
  SEALED = "SEALED",
  INTERRUPTED = "INTERRUPTED",
}

export enum AgentMessageBlockKind {
  PARAGRAPH = "PARAGRAPH",
  HEADING = "HEADING",
  LIST_ITEM = "LIST_ITEM",
  QUOTE = "QUOTE",
  CALLOUT = "CALLOUT",
  CODE = "CODE",
  EQUATION = "EQUATION",
  TABLE = "TABLE",
  DIVIDER = "DIVIDER",
  TOOL_CALL = "TOOL_CALL",
  ARTIFACT = "ARTIFACT",
  PROPOSAL = "PROPOSAL",
  PLAN = "PLAN",
  WAIT_CONDITION = "WAIT_CONDITION",
  ASSET = "ASSET",
  NOTICE = "NOTICE",
}

export enum AgentRichTextSpanKind {
  TEXT = "TEXT",
  LEXICAL_MENTION = "LEXICAL_MENTION",
  CITATION = "CITATION",
  LINK = "LINK",
}

export enum AgentTextMark {
  BOLD = "BOLD",
  ITALIC = "ITALIC",
  UNDERLINE = "UNDERLINE",
  STRIKETHROUGH = "STRIKETHROUGH",
  INLINE_CODE = "INLINE_CODE",
}

export enum AgentHeadingLevel {
  ONE = 1,
  TWO = 2,
  THREE = 3,
}

export enum AgentListStyle {
  BULLETED = "BULLETED",
  NUMBERED = "NUMBERED",
}

export enum AgentNoticeKind {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  RECOVERY = "RECOVERY",
}

export type AgentRichTextSpan =
  | {
      kind: AgentRichTextSpanKind.TEXT;
      text: string;
      marks: readonly AgentTextMark[];
    }
  | {
      kind: AgentRichTextSpanKind.LEXICAL_MENTION;
      text: string;
      target: AgentResourceRef;
    }
  | {
      kind: AgentRichTextSpanKind.CITATION;
      text: string;
      evidence: AgentResourceRef;
    }
  | {
      kind: AgentRichTextSpanKind.LINK;
      text: string;
      href: string;
    };

export interface AgentMessageBlockIdentity {
  messageId: string;
  blockId: string;
  parentBlockId?: string;
  position: number;
  stepId?: string;
  modelPosition?: number;
  modelSubPosition?: number;
}

interface AgentMessageBlockProposalBase extends AgentMessageBlockIdentity {
  schemaVersion: string;
  kind: AgentMessageBlockKind;
}

export type AgentMessageBlockProposal =
  | (AgentMessageBlockProposalBase & {
      kind:
        | AgentMessageBlockKind.PARAGRAPH
        | AgentMessageBlockKind.QUOTE
        | AgentMessageBlockKind.CALLOUT;
      contentBodyId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.HEADING;
      level: AgentHeadingLevel;
      contentBodyId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.LIST_ITEM;
      style: AgentListStyle;
      contentBodyId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.CODE;
      language?: string;
      contentBodyId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.EQUATION;
      contentBodyId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.TABLE;
      rowCount: number;
      columnCount: number;
      cellContentBodyIds: readonly string[];
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.DIVIDER;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.TOOL_CALL;
      toolCallId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.ARTIFACT;
      artifactRevisionId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.PROPOSAL;
      proposalId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.PLAN;
      planRevisionId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.WAIT_CONDITION;
      waitConditionId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.ASSET;
      assetRevisionId: string;
    })
  | (AgentMessageBlockProposalBase & {
      kind: AgentMessageBlockKind.NOTICE;
      noticeKind: AgentNoticeKind;
      code: string;
    });

interface AgentVisibleMessageFragmentBase extends AgentMessageBlockIdentity {
  stepOrdinal: number;
  schemaVersion: string;
  fragmentSequence: number;
  contentBodyId: string;
  contentFragmentId: string;
  contentHash: string;
  byteLength: number;
  sealed: boolean;
}

export type AgentVisibleMessageFragment =
  | (AgentVisibleMessageFragmentBase & {
      kind:
        | AgentMessageBlockKind.PARAGRAPH
        | AgentMessageBlockKind.QUOTE
        | AgentMessageBlockKind.CALLOUT
        | AgentMessageBlockKind.EQUATION;
    })
  | (AgentVisibleMessageFragmentBase & {
      kind: AgentMessageBlockKind.HEADING;
      level: AgentHeadingLevel;
    })
  | (AgentVisibleMessageFragmentBase & {
      kind: AgentMessageBlockKind.LIST_ITEM;
      style: AgentListStyle;
    })
  | (AgentVisibleMessageFragmentBase & {
      kind: AgentMessageBlockKind.CODE;
      language?: string;
    });
