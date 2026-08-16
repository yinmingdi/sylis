import {
  AgentHeadingLevel,
  AgentListStyle,
  AgentMessageBlockKind,
  AgentRichTextSpanKind,
  AgentTextMark,
  type AgentRichTextSpan,
} from "@sylis/agent-contracts";
import MarkdownIt from "markdown-it";

type MarkdownToken = ReturnType<MarkdownIt["parse"]>[number];
export interface AssembledVisibleBlock {
  kind:
    | AgentMessageBlockKind.PARAGRAPH
    | AgentMessageBlockKind.HEADING
    | AgentMessageBlockKind.LIST_ITEM
    | AgentMessageBlockKind.QUOTE
    | AgentMessageBlockKind.CODE
    | AgentMessageBlockKind.DIVIDER;
  modelPosition: number;
  modelSubPosition: number;
  serializedContent: string;
  headingLevel?: AgentHeadingLevel;
  listStyle?: AgentListStyle;
  language?: string;
}

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
}).disable("lheading");

export class BlockAssembler {
  assemble(
    modelPosition: number,
    source: string,
  ): readonly AssembledVisibleBlock[] {
    const tokens = markdown.parse(source, {});
    return assembleTokens(modelPosition, source, tokens);
  }

  assembleStreaming(
    modelPosition: number,
    source: string,
  ): readonly AssembledVisibleBlock[] {
    const tokens = markdown.parse(source, {});
    if (hasUnstableOpeningBlock(source, tokens)) return [];
    return assembleTokens(modelPosition, source, tokens);
  }
}

function assembleTokens(
  modelPosition: number,
  source: string,
  tokens: readonly MarkdownToken[],
): readonly AssembledVisibleBlock[] {
  const blocks: AssembledVisibleBlock[] = [];
  let listStyle: AgentListStyle | undefined;
  let quoteDepth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token.type === "bullet_list_open") {
      listStyle = AgentListStyle.BULLETED;
      continue;
    }
    if (token.type === "ordered_list_open") {
      listStyle = AgentListStyle.NUMBERED;
      continue;
    }
    if (
      token.type === "bullet_list_close" ||
      token.type === "ordered_list_close"
    ) {
      listStyle = undefined;
      continue;
    }
    if (token.type === "blockquote_open") {
      quoteDepth += 1;
      continue;
    }
    if (token.type === "blockquote_close") {
      quoteDepth -= 1;
      continue;
    }
    if (token.type === "fence") {
      blocks.push({
        kind: AgentMessageBlockKind.CODE,
        modelPosition,
        modelSubPosition: blocks.length,
        serializedContent: JSON.stringify([
          {
            kind: AgentRichTextSpanKind.TEXT,
            text: token.content,
            marks: [],
          },
        ] satisfies AgentRichTextSpan[]),
        ...(token.info.trim() ? { language: token.info.trim() } : {}),
      });
      continue;
    }
    if (token.type === "hr") {
      blocks.push({
        kind: AgentMessageBlockKind.DIVIDER,
        modelPosition,
        modelSubPosition: blocks.length,
        serializedContent: "",
      });
      continue;
    }
    if (token.type !== "heading_open" && token.type !== "paragraph_open") {
      continue;
    }
    const inline = tokens[index + 1];
    if (!inline || inline.type !== "inline") continue;
    const text = richTextBody(inline);
    if (token.type === "heading_open") {
      blocks.push({
        kind: AgentMessageBlockKind.HEADING,
        modelPosition,
        modelSubPosition: blocks.length,
        serializedContent: text,
        headingLevel: headingLevel(token.tag),
      });
      continue;
    }
    blocks.push({
      kind: listStyle
        ? AgentMessageBlockKind.LIST_ITEM
        : quoteDepth > 0
          ? AgentMessageBlockKind.QUOTE
          : AgentMessageBlockKind.PARAGRAPH,
      modelPosition,
      modelSubPosition: blocks.length,
      serializedContent: text,
      ...(listStyle ? { listStyle } : {}),
    });
  }

  if (blocks.length > 0) return blocks;
  if (!source) return [];
  return [
    {
      kind: AgentMessageBlockKind.PARAGRAPH,
      modelPosition,
      modelSubPosition: 0,
      serializedContent: richTextBody({ content: source, children: [] }),
    },
  ];
}

function hasUnstableOpeningBlock(
  source: string,
  tokens: readonly MarkdownToken[],
): boolean {
  if (source.includes("\n")) return false;
  if (tokens.some(({ type }) => type === "fence")) return true;
  const inline = tokens.find(({ type }) => type === "inline");
  if (
    !inline &&
    tokens.some(({ type }) =>
      ["blockquote_open", "bullet_list_open", "ordered_list_open"].includes(
        type,
      ),
    )
  ) {
    return true;
  }
  if (
    inline?.content === "" &&
    !source.endsWith(" ") &&
    !source.endsWith("\t")
  ) {
    return true;
  }
  return isPotentialHorizontalRulePrefix(source);
}

function isPotentialHorizontalRulePrefix(source: string): boolean {
  let offset = 0;
  while (offset < source.length && offset < 3 && source[offset] === " ") {
    offset += 1;
  }
  const candidate = source.slice(offset);
  if (candidate.length < 1) return false;
  let markerCount = 0;
  let marker: string | undefined;
  for (const character of candidate) {
    if (character === " ") continue;
    if (character !== "-" && character !== "_" && character !== "*") {
      return false;
    }
    marker ??= character;
    if (marker !== character) return false;
    markerCount += 1;
  }
  return markerCount > 0 && markerCount < 3;
}

function richTextBody(
  token: Pick<MarkdownToken, "content" | "children">,
): string {
  const spans: AgentRichTextSpan[] = [];
  const marks: AgentTextMark[] = [];
  let linkHref: string | undefined;
  for (const child of token.children ?? []) {
    const mark = markForToken(child.type);
    if (mark && child.nesting === 1) {
      marks.push(mark);
      continue;
    }
    if (mark && child.nesting === -1) {
      const index = marks.lastIndexOf(mark);
      if (index >= 0) marks.splice(index, 1);
      continue;
    }
    if (child.type === "link_open") {
      linkHref = safeLink(child.attrGet("href"));
      continue;
    }
    if (child.type === "link_close") {
      linkHref = undefined;
      continue;
    }
    if (child.type === "text" || child.type === "code_inline") {
      const childMarks =
        child.type === "code_inline"
          ? [...marks, AgentTextMark.INLINE_CODE]
          : [...marks];
      spans.push({
        ...(linkHref
          ? {
              kind: AgentRichTextSpanKind.LINK,
              text: child.content,
              href: linkHref,
            }
          : {
              kind: AgentRichTextSpanKind.TEXT,
              text: child.content,
              marks: childMarks,
            }),
      });
      continue;
    }
    if (child.type === "softbreak" || child.type === "hardbreak") {
      spans.push({ kind: AgentRichTextSpanKind.TEXT, text: "\n", marks: [] });
    }
  }
  if (spans.length === 0) {
    spans.push({
      kind: AgentRichTextSpanKind.TEXT,
      text: token.content,
      marks: [],
    });
  }
  return JSON.stringify(spans);
}

function markForToken(type: string): AgentTextMark | undefined {
  if (type === "strong_open" || type === "strong_close")
    return AgentTextMark.BOLD;
  if (type === "em_open" || type === "em_close") return AgentTextMark.ITALIC;
  if (type === "s_open" || type === "s_close")
    return AgentTextMark.STRIKETHROUGH;
  return undefined;
}

function safeLink(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function headingLevel(tag: string): AgentHeadingLevel {
  if (tag === "h1") return AgentHeadingLevel.ONE;
  if (tag === "h2") return AgentHeadingLevel.TWO;
  return AgentHeadingLevel.THREE;
}
