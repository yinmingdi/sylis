import {
  AgentToolKey,
  type AgentToolExecutionInput,
} from "@sylis/agent-contracts";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_API_VERSION = "2023-01-01";
const USER_AGENT = "SylisPublicWebReader/0.0.1";
const DEFAULT_SEARCH_COUNT = 10;
const DEFAULT_MAX_CHARACTERS = 40_000;
const ALLOWED_MEDIA_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_QUERY_KEY =
  /^(?:access[_-]?token|api[_-]?key|auth|authorization|key|password|secret|signature|sig|token|x-amz-)/iu;
const SKIPPED_HTML_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
]);
const BLOCK_HTML_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

export interface PublicWebToolsConfig {
  braveSearchApiKey: string;
  searchUrl?: string;
  searchTimeoutMs: number;
  pageTimeoutMs: number;
  maxPageBytes: number;
  maxRedirects: number;
  privateFixtureOrigins?: readonly string[];
}

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

interface PageResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Buffer;
}

interface PublicWebDependencies {
  fetchImplementation: typeof globalThis.fetch;
  resolveHost: (hostname: string) => Promise<readonly ResolvedAddress[]>;
  requestPage: (input: {
    url: URL;
    address: ResolvedAddress;
    timeoutMs: number;
    maxBytes: number;
  }) => Promise<PageResponse>;
}

interface HtmlNode {
  nodeName?: string;
  tagName?: string;
  value?: string;
  attrs?: ReadonlyArray<{ name: string; value: string }>;
  childNodes?: readonly HtmlNode[];
}

export class PublicWebTools {
  private readonly dependencies: PublicWebDependencies;

  constructor(
    private readonly config: PublicWebToolsConfig,
    dependencies: Partial<PublicWebDependencies> = {},
  ) {
    this.dependencies = {
      fetchImplementation: dependencies.fetchImplementation ?? globalThis.fetch,
      resolveHost: dependencies.resolveHost ?? resolvePublicAddresses,
      requestPage: dependencies.requestPage ?? requestPinnedPage,
    };
  }

  async execute(
    directive: AgentToolExecutionInput,
  ): Promise<Readonly<Record<string, unknown>>> {
    switch (directive.toolKey) {
      case AgentToolKey.WEB_SEARCH:
        return this.search(directive.input);
      case AgentToolKey.WEB_PAGE_READ:
        return this.readPage(directive.input);
      default:
        throw new Error("PUBLIC_WEB_TOOL_UNSUPPORTED");
    }
  }

  private async search(input: Readonly<Record<string, unknown>>) {
    const query = requiredText(input.query, "query", 400);
    if (query.split(/\s+/u).length > 50) {
      throw new Error("PUBLIC_WEB_SEARCH_QUERY_TOO_LONG");
    }
    const count = optionalInteger(input.count, DEFAULT_SEARCH_COUNT, 1, 20);
    const url = new URL(this.config.searchUrl ?? BRAVE_SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));
    url.searchParams.set("result_filter", "web");
    url.searchParams.set("safesearch", "strict");
    url.searchParams.set("spellcheck", "true");
    url.searchParams.set("text_decorations", "false");
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.config.searchTimeoutMs);
    try {
      const response = await this.dependencies.fetchImplementation(url, {
        method: "GET",
        redirect: "error",
        headers: {
          accept: "application/json",
          "api-version": BRAVE_API_VERSION,
          "user-agent": USER_AGENT,
          "x-subscription-token": this.config.braveSearchApiKey,
        },
        signal: abort.signal,
      });
      if (!response.ok) {
        throw new Error(`PUBLIC_WEB_SEARCH_HTTP_${response.status}`);
      }
      const payload = await response.json();
      const results = braveResults(payload)
        .map(searchResult)
        .filter((result): result is NonNullable<typeof result> =>
          Boolean(result),
        )
        .slice(0, count);
      return { data: { provider: "BRAVE_SEARCH", query, results } };
    } catch (error) {
      if (isAbortError(error)) throw new Error("PUBLIC_WEB_SEARCH_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async readPage(input: Readonly<Record<string, unknown>>) {
    const initialUrl = publicHttpsUrl(requiredText(input.url, "url", 2_048));
    const maxCharacters = optionalInteger(
      input.maxCharacters,
      DEFAULT_MAX_CHARACTERS,
      1_000,
      100_000,
    );
    let currentUrl = initialUrl;
    for (let redirectCount = 0; ; redirectCount += 1) {
      const addresses = await this.dependencies.resolveHost(
        hostname(currentUrl),
      );
      const address = (
        this.config.privateFixtureOrigins?.includes(currentUrl.origin)
          ? validatedAddressShape(addresses)
          : validatedAddressSet(addresses)
      )[0]!;
      const response = await this.dependencies.requestPage({
        url: currentUrl,
        address,
        timeoutMs: this.config.pageTimeoutMs,
        maxBytes: this.config.maxPageBytes,
      });
      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirectCount >= this.config.maxRedirects) {
          throw new Error("PUBLIC_WEB_REDIRECT_LIMIT_EXCEEDED");
        }
        const location = response.headers.location;
        if (!location) throw new Error("PUBLIC_WEB_REDIRECT_LOCATION_REQUIRED");
        currentUrl = publicHttpsUrl(new URL(location, currentUrl).toString());
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`PUBLIC_WEB_PAGE_HTTP_${response.status}`);
      }
      const contentType = response.headers["content-type"];
      if (!contentType) throw new Error("PUBLIC_WEB_PAGE_MIME_REQUIRED");
      const mediaType = contentType.split(";", 1)[0]!.trim().toLowerCase();
      if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
        throw new Error("PUBLIC_WEB_PAGE_MIME_UNSUPPORTED");
      }
      const decoded = decodePage(response.body, contentType);
      const extracted =
        mediaType === "text/html" || mediaType === "application/xhtml+xml"
          ? await extractHtml(decoded)
          : { title: undefined, text: normalizeText(decoded) };
      if (!extracted.text) throw new Error("PUBLIC_WEB_PAGE_TEXT_EMPTY");
      const text = extracted.text.slice(0, maxCharacters);
      const title = extracted.title ?? currentUrl.hostname;
      return {
        data: {
          source: {
            title: boundedText(title, 500),
            url: currentUrl.toString(),
            snippet: boundedText(text, 500),
          },
          mediaType,
          text,
          truncated: extracted.text.length > text.length,
          bytesRead: response.body.byteLength,
        },
      };
    }
  }
}

async function resolvePublicAddresses(
  host: string,
): Promise<readonly ResolvedAddress[]> {
  const literalFamily = isIP(host);
  if (literalFamily) {
    return [{ address: host, family: literalFamily as 4 | 6 }];
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
}

function validatedAddressSet(
  addresses: readonly ResolvedAddress[],
): readonly ResolvedAddress[] {
  const validated = validatedAddressShape(addresses);
  if (
    validated.some(
      ({ address, family }) =>
        (family !== 4 && family !== 6) || !isPublicAddress(address, family),
    )
  ) {
    throw new Error("PUBLIC_WEB_ADDRESS_FORBIDDEN");
  }
  return validated;
}

function validatedAddressShape(
  addresses: readonly ResolvedAddress[],
): readonly ResolvedAddress[] {
  if (addresses.length === 0) throw new Error("PUBLIC_WEB_DNS_EMPTY");
  if (
    addresses.some(
      ({ address, family }) =>
        (family !== 4 && family !== 6) || isIP(address) !== family,
    )
  ) {
    throw new Error("PUBLIC_WEB_ADDRESS_INVALID");
  }
  return [...addresses].sort(
    (left, right) =>
      left.family - right.family || left.address.localeCompare(right.address),
  );
}

function isPublicAddress(address: string, family: 4 | 6): boolean {
  if (isIP(address) !== family) return false;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) {
    const mapped = address.slice("::ffff:".length);
    return isIP(mapped) === 4 && isPublicAddress(mapped, 4);
  }
  return !reservedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

const reservedAddresses = createReservedAddressList();

function createReservedAddressList(): BlockList {
  const list = new BlockList();
  for (const [network, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const) {
    list.addSubnet(network, prefix, "ipv4");
  }
  for (const [network, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["100::", 64],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ] as const) {
    list.addSubnet(network, prefix, "ipv6");
  }
  return list;
}

function publicHttpsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PUBLIC_WEB_URL_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("PUBLIC_WEB_URL_FORBIDDEN");
  }
  const host = hostname(url);
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  ) {
    throw new Error("PUBLIC_WEB_HOST_FORBIDDEN");
  }
  const family = isIP(host);
  if (family && !isPublicAddress(host, family as 4 | 6)) {
    throw new Error("PUBLIC_WEB_ADDRESS_FORBIDDEN");
  }
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEY.test(key)) {
      throw new Error("PUBLIC_WEB_SENSITIVE_QUERY_FORBIDDEN");
    }
  }
  url.hash = "";
  return url;
}

function hostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
}

function requestPinnedPage(input: {
  url: URL;
  address: ResolvedAddress;
  timeoutMs: number;
  maxBytes: number;
}): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const pinnedLookup: LookupFunction = (_host, options, callback) => {
      if (options.all) {
        callback(null, [input.address]);
      } else {
        callback(null, input.address.address, input.address.family);
      }
    };
    const requestValue = request(
      input.url,
      {
        method: "GET",
        headers: {
          accept:
            "text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9",
          "accept-encoding": "identity",
          "user-agent": USER_AGENT,
        },
        lookup: pinnedLookup,
      },
      (response) => {
        const headers = normalizedHeaders(response.headers);
        if (REDIRECT_STATUSES.has(response.statusCode ?? 0)) {
          response.resume();
          settled = true;
          resolve({
            status: response.statusCode ?? 0,
            headers,
            body: Buffer.alloc(0),
          });
          return;
        }
        const declaredLength = Number(headers["content-length"] ?? 0);
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > input.maxBytes
        ) {
          response.destroy();
          fail(new Error("PUBLIC_WEB_PAGE_TOO_LARGE"));
          return;
        }
        if (
          headers["content-encoding"] &&
          headers["content-encoding"] !== "identity"
        ) {
          response.destroy();
          fail(new Error("PUBLIC_WEB_PAGE_ENCODING_UNSUPPORTED"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.byteLength;
          if (size > input.maxBytes) {
            response.destroy();
            fail(new Error("PUBLIC_WEB_PAGE_TOO_LARGE"));
            return;
          }
          chunks.push(buffer);
        });
        response.once("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            status: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks, size),
          });
        });
        response.once("error", (error) => fail(error));
      },
    );
    requestValue.setTimeout(input.timeoutMs, () => {
      requestValue.destroy(new Error("PUBLIC_WEB_PAGE_TIMEOUT"));
    });
    requestValue.once("error", (error) => fail(error));
    requestValue.end();
  });
}

function normalizedHeaders(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (typeof value === "string") return [[key.toLowerCase(), value]];
      if (Array.isArray(value)) return [[key.toLowerCase(), value.join(", ")]];
      return [];
    }),
  );
}

function braveResults(value: unknown): readonly unknown[] {
  if (
    !isRecord(value) ||
    !isRecord(value.web) ||
    !Array.isArray(value.web.results)
  ) {
    return [];
  }
  return value.web.results;
}

function searchResult(value: unknown) {
  if (!isRecord(value)) return null;
  const title = optionalText(value.title, 500);
  const snippet = optionalText(value.description, 2_000);
  const rawUrl = optionalText(value.url, 2_048);
  if (!title || !rawUrl) return null;
  let url: URL;
  try {
    url = publicHttpsUrl(rawUrl);
  } catch {
    return null;
  }
  return {
    title,
    url: url.toString(),
    ...(snippet ? { snippet } : {}),
  };
}

function decodePage(body: Buffer, contentType: string): string {
  const charset = /(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/iu.exec(
    contentType,
  )?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8", { fatal: true }).decode(body);
  } catch {
    throw new Error("PUBLIC_WEB_PAGE_CHARSET_INVALID");
  }
}

async function extractHtml(
  value: string,
): Promise<{ title?: string; text: string }> {
  const { parse } = await import("parse5");
  const root = parse(value) as unknown as HtmlNode;
  let title: string | undefined;
  const output: string[] = [];
  const visit = (node: HtmlNode, inTitle: boolean): void => {
    const tag = node.tagName?.toLowerCase();
    if (tag && SKIPPED_HTML_TAGS.has(tag)) return;
    if (
      tag &&
      node.attrs?.some(
        (attribute) =>
          attribute.name === "hidden" ||
          (attribute.name === "aria-hidden" && attribute.value === "true"),
      )
    ) {
      return;
    }
    const titleNode = inTitle || tag === "title";
    if (node.nodeName === "#text" && node.value) {
      if (titleNode) title = `${title ?? ""}${node.value}`;
      else output.push(node.value);
    }
    if (tag && BLOCK_HTML_TAGS.has(tag)) output.push("\n");
    for (const child of node.childNodes ?? []) visit(child, titleNode);
    if (tag && BLOCK_HTML_TAGS.has(tag)) output.push("\n");
  };
  visit(root, false);
  const normalizedTitle = title ? normalizeText(title) : undefined;
  return {
    ...(normalizedTitle ? { title: normalizedTitle } : {}),
    text: normalizeText(output.join("")),
  };
}

function normalizeText(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n");
  let withoutControls = "";
  for (const character of normalized) {
    const codePoint = character.codePointAt(0)!;
    if ((codePoint <= 0x1f && codePoint !== 0x0a) || codePoint === 0x7f) {
      continue;
    }
    withoutControls += character;
  }
  return withoutControls.trim();
}

function boundedText(value: string, maximum: number): string {
  return normalizeText(value).slice(0, maximum);
}

function optionalText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = boundedText(value, maximum);
  return normalized || undefined;
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") {
    throw new Error(`PUBLIC_WEB_${field.toUpperCase()}_INVALID`);
  }
  const normalized = normalizeText(value);
  if (!normalized) throw new Error(`PUBLIC_WEB_${field.toUpperCase()}_INVALID`);
  if (normalized.length > maximum) {
    throw new Error(`PUBLIC_WEB_${field.toUpperCase()}_TOO_LONG`);
  }
  return normalized;
}

function optionalInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error("PUBLIC_WEB_INTEGER_INVALID");
  }
  return value as number;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
