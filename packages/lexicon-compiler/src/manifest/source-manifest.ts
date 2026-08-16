import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { SourceAdapterKind } from "../candidates/candidate-v1";
import { normalizeIdentityText } from "../normalize/text-profile";

export interface HeadwordSetReference {
  version: string;
  path: string;
  sha256: string;
}

export interface HeadwordSelector {
  languageTag: string;
  normalizedHeadword: string;
}

export interface HeadwordSet {
  headwordSetVersion: "sylis.headword-set/1";
  version: string;
  headwords: HeadwordSelector[];
}

export interface RichTargetSetReference {
  version: string;
  path: string;
  sha256: string;
}

export enum PedagogicalMaterialKind {
  MNEMONIC = "MNEMONIC",
  MICRO_STORY = "MICRO_STORY",
}

export interface RichTargetSelector {
  key: string;
  languageTag: string;
  headword: string;
  partOfSpeech: string;
  senseDefinitionContains: string;
  materialKinds: PedagogicalMaterialKind[];
  generateStudyHint: boolean;
  generateExercise: boolean;
}

export interface RichTargetSet {
  targetSetVersion: "sylis.rich-target-set/1";
  version: string;
  targets: RichTargetSelector[];
}

export interface SourceManifestEntry {
  key: string;
  version: string;
  retrievedAt: string;
  adapter: SourceAdapterKind;
  uri?: string;
  pathEnv?: string;
  sha256?: string;
  sha256Env?: string;
  homepageUri?: string;
  materialization?: {
    parentUri: string;
    parentSha256: string;
    selectionSha256: string;
    materializerVersion: string;
    recordCount: number;
  };
  rights: {
    mayBuild: boolean;
    mayServe: boolean;
    mayExport: boolean;
    requiresAttribution: boolean;
    attribution?: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  };
}

const SOURCE_ADAPTERS = new Set<SourceAdapterKind>([
  SourceAdapterKind.ECDICT,
  SourceAdapterKind.WIKTEXTRACT_EN,
  SourceAdapterKind.WN_LMF,
  SourceAdapterKind.YOUDAO_NDJSON,
]);

export interface SourceManifest {
  manifestVersion: "sylis.source-manifest/1";
  sources: SourceManifestEntry[];
  selection?: {
    headwordSet: HeadwordSetReference;
  };
  release: {
    lexiconKey: string;
    releaseVersion: string;
    sourceLanguageTag: string;
    learningLanguageTags: [string, ...string[]];
    compilerVersion: string;
    gitCommit: string;
  };
  pedagogy?: {
    audienceProfileKey: string;
    learningLanguageTag: string;
    supportLanguageTag: string;
    richTargetSet: RichTargetSetReference;
  };
}

export interface ResolvedSource extends SourceManifestEntry {
  path: string;
  sourceUri: string;
  checksum: string;
  parserVersion: string;
}

const SOURCE_PARSER_VERSIONS: Record<SourceAdapterKind, string> = {
  [SourceAdapterKind.ECDICT]: "ecdict-parser/1",
  [SourceAdapterKind.WIKTEXTRACT_EN]: "wiktextract-en-parser/1",
  [SourceAdapterKind.WN_LMF]: "wn-lmf-parser/1",
  [SourceAdapterKind.YOUDAO_NDJSON]: "youdao-ndjson-parser/1",
};

function normalizeChecksum(value: string): string {
  const normalized = value.replace(/^sha256:/, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("Source checksum must be a 64-character SHA-256 value.");
  }
  return normalized;
}

function assertCanonicalLanguageTag(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a canonical language tag.`);
  }
  let canonical: string;
  try {
    [canonical] = Intl.getCanonicalLocales(value);
  } catch {
    throw new Error(`${label} must be a canonical language tag.`);
  }
  if (canonical !== value) {
    throw new Error(`${label} must be a canonical language tag.`);
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function parseSourceManifest(input: unknown): SourceManifest {
  if (!input || typeof input !== "object")
    throw new Error("Manifest must be an object.");
  const manifest = input as Partial<SourceManifest>;
  if (manifest.manifestVersion !== "sylis.source-manifest/1") {
    throw new Error("Unsupported source manifest version.");
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error("Manifest must contain at least one source.");
  }
  const release = manifest.release;
  if (
    !release ||
    !release.lexiconKey ||
    !release.releaseVersion ||
    !release.compilerVersion ||
    !/^[a-f0-9]{40}$/.test(release.gitCommit ?? "") ||
    !Array.isArray(release.learningLanguageTags) ||
    release.learningLanguageTags.length === 0
  ) {
    throw new Error("Manifest release metadata is incomplete.");
  }
  assertCanonicalLanguageTag(
    release.sourceLanguageTag,
    "Manifest sourceLanguageTag",
  );
  for (const languageTag of release.learningLanguageTags) {
    assertCanonicalLanguageTag(languageTag, "Manifest learningLanguageTag");
  }
  const keys = new Set<string>();
  for (const source of manifest.sources) {
    if (
      !source.key ||
      !source.version ||
      !source.retrievedAt ||
      Number.isNaN(Date.parse(source.retrievedAt)) ||
      !source.adapter ||
      !SOURCE_ADAPTERS.has(source.adapter)
    ) {
      throw new Error("Every source requires key, version and adapter.");
    }
    if (keys.has(source.key))
      throw new Error(`Duplicate source key ${source.key}.`);
    keys.add(source.key);
    if ((!source.uri && !source.pathEnv) || (source.uri && source.pathEnv)) {
      throw new Error(
        `Source ${source.key} must define exactly one of uri or pathEnv.`,
      );
    }
    if (
      (!source.sha256 && !source.sha256Env) ||
      (source.sha256 && source.sha256Env)
    ) {
      throw new Error(
        `Source ${source.key} must define exactly one of sha256 or sha256Env.`,
      );
    }
    if (source.sha256) normalizeChecksum(source.sha256);
    if (source.materialization) {
      const materialization = source.materialization;
      try {
        new URL(materialization.parentUri);
      } catch {
        throw new Error(
          `Source ${source.key} materialization parentUri must be an absolute URI.`,
        );
      }
      normalizeChecksum(materialization.parentSha256);
      normalizeChecksum(materialization.selectionSha256);
      if (
        !materialization.materializerVersion ||
        !Number.isSafeInteger(materialization.recordCount) ||
        materialization.recordCount < 1
      ) {
        throw new Error(
          `Source ${source.key} materialization metadata is incomplete.`,
        );
      }
    }
    const rights = source.rights;
    if (
      !rights ||
      typeof rights.mayBuild !== "boolean" ||
      typeof rights.mayServe !== "boolean" ||
      typeof rights.mayExport !== "boolean" ||
      typeof rights.requiresAttribution !== "boolean" ||
      typeof rights.effectiveFrom !== "string" ||
      Number.isNaN(Date.parse(rights.effectiveFrom)) ||
      (rights.effectiveTo !== null &&
        (typeof rights.effectiveTo !== "string" ||
          Number.isNaN(Date.parse(rights.effectiveTo))))
    ) {
      throw new Error(`Source ${source.key} rights metadata is incomplete.`);
    }
    if (
      rights.requiresAttribution &&
      (typeof rights.attribution !== "string" ||
        rights.attribution.trim().length === 0)
    ) {
      throw new Error(`Source ${source.key} attribution is required.`);
    }
    if (
      rights.effectiveTo &&
      Date.parse(rights.effectiveTo) <= Date.parse(rights.effectiveFrom)
    ) {
      throw new Error(
        `Source ${source.key} rights effectiveTo must be after effectiveFrom.`,
      );
    }
  }
  if (manifest.selection) {
    const reference = manifest.selection.headwordSet;
    if (!reference?.version || !reference.path || !reference.sha256) {
      throw new Error("Manifest headword selection metadata is incomplete.");
    }
    normalizeChecksum(reference.sha256);
  }
  for (const source of manifest.sources) {
    if (!source.materialization) continue;
    if (!manifest.selection) {
      throw new Error(
        `Source ${source.key} materialization requires a headword selection.`,
      );
    }
    if (
      normalizeChecksum(source.materialization.selectionSha256) !==
      normalizeChecksum(manifest.selection.headwordSet.sha256)
    ) {
      throw new Error(
        `Source ${source.key} materialization selection checksum does not match the headword set.`,
      );
    }
  }
  if (manifest.pedagogy) {
    const pedagogy = manifest.pedagogy;
    if (
      !pedagogy.audienceProfileKey ||
      !pedagogy.learningLanguageTag ||
      !pedagogy.supportLanguageTag ||
      !pedagogy.richTargetSet?.version ||
      !pedagogy.richTargetSet.path
    ) {
      throw new Error("Manifest pedagogy metadata is incomplete.");
    }
    normalizeChecksum(pedagogy.richTargetSet.sha256);
  }
  return manifest as SourceManifest;
}

export function headwordSelectorKey(selector: HeadwordSelector): string {
  return `${selector.languageTag}:${selector.normalizedHeadword}`;
}

export function parseHeadwordSet(
  input: unknown,
  expectedVersion: string,
): HeadwordSet {
  if (!input || typeof input !== "object") {
    throw new Error("Headword set must be an object.");
  }
  const parsed = input as Partial<HeadwordSet>;
  if (
    parsed.headwordSetVersion !== "sylis.headword-set/1" ||
    parsed.version !== expectedVersion ||
    !Array.isArray(parsed.headwords) ||
    parsed.headwords.length === 0
  ) {
    throw new Error("Headword set metadata is invalid.");
  }
  const identities = new Set<string>();
  for (const selector of parsed.headwords) {
    if (
      !selector ||
      typeof selector.languageTag !== "string" ||
      selector.languageTag.length === 0 ||
      typeof selector.normalizedHeadword !== "string" ||
      selector.normalizedHeadword.length === 0
    ) {
      throw new Error("Headword selector is invalid.");
    }
    assertCanonicalLanguageTag(
      selector.languageTag,
      `Headword selector language tag (${selector.languageTag})`,
    );
    if (
      selector.normalizedHeadword !==
      normalizeIdentityText(selector.normalizedHeadword)
    ) {
      throw new Error(
        `Headword selector must already be normalized (${headwordSelectorKey(selector)}).`,
      );
    }
    const identity = headwordSelectorKey(selector);
    if (identities.has(identity)) {
      throw new Error(`Duplicate headword selector ${identity}.`);
    }
    identities.add(identity);
  }
  return parsed as HeadwordSet;
}

export async function loadHeadwordSet(
  manifest: SourceManifest,
  manifestPath: string,
): Promise<HeadwordSet | null> {
  const reference = manifest.selection?.headwordSet;
  if (!reference) return null;
  const path = resolve(dirname(resolve(manifestPath)), reference.path);
  if (!existsSync(path)) throw new Error("Headword set does not exist.");
  const expectedChecksum = normalizeChecksum(reference.sha256);
  const actualChecksum = await sha256File(path);
  if (actualChecksum !== expectedChecksum) {
    throw new Error("Headword set checksum mismatch.");
  }
  return parseHeadwordSet(
    JSON.parse(await readFile(path, "utf8")),
    reference.version,
  );
}

export async function loadRichTargetSet(
  manifest: SourceManifest,
  manifestPath: string,
): Promise<RichTargetSet | null> {
  const reference = manifest.pedagogy?.richTargetSet;
  if (!reference) return null;
  const path = resolve(dirname(resolve(manifestPath)), reference.path);
  if (!existsSync(path)) throw new Error("Rich target set does not exist.");
  const expectedChecksum = normalizeChecksum(reference.sha256);
  const actualChecksum = await sha256File(path);
  if (actualChecksum !== expectedChecksum) {
    throw new Error("Rich target set checksum mismatch.");
  }
  const parsed = JSON.parse(
    await readFile(path, "utf8"),
  ) as Partial<RichTargetSet>;
  if (
    parsed.targetSetVersion !== "sylis.rich-target-set/1" ||
    parsed.version !== reference.version ||
    !Array.isArray(parsed.targets)
  ) {
    throw new Error("Rich target set metadata is invalid.");
  }
  const keys = new Set<string>();
  for (const target of parsed.targets) {
    if (
      !target.key ||
      !target.languageTag ||
      !target.headword ||
      !target.partOfSpeech ||
      !target.senseDefinitionContains ||
      !Array.isArray(target.materialKinds) ||
      typeof target.generateStudyHint !== "boolean" ||
      typeof target.generateExercise !== "boolean"
    ) {
      throw new Error("Rich target selector is invalid.");
    }
    if (keys.has(target.key)) {
      throw new Error(`Duplicate rich target key ${target.key}.`);
    }
    keys.add(target.key);
    if (
      target.materialKinds.some(
        (kind) => !Object.values(PedagogicalMaterialKind).includes(kind),
      )
    ) {
      throw new Error(
        `Rich target ${target.key} has an invalid material kind.`,
      );
    }
  }
  return parsed as RichTargetSet;
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Source download failed with HTTP ${response.status}.`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await pipeline(
    Readable.from(response.body as unknown as AsyncIterable<Uint8Array>),
    createWriteStream(destination),
  );
}

export async function resolveManifestSources(
  manifest: SourceManifest,
  manifestPath: string,
  workRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedSource[]> {
  const manifestDirectory = dirname(resolve(manifestPath));
  const resolvedSources: ResolvedSource[] = [];

  for (const source of manifest.sources) {
    const checksumValue = source.sha256 ?? env[source.sha256Env ?? ""];
    if (!checksumValue)
      throw new Error(`Missing checksum for source ${source.key}.`);
    const checksum = normalizeChecksum(checksumValue);
    let path: string;
    let sourceUri: string;

    if (source.pathEnv) {
      const configuredPath = env[source.pathEnv];
      if (!configuredPath) throw new Error(`Missing ${source.pathEnv}.`);
      path = resolve(configuredPath);
      sourceUri = `urn:sylis:private-source:${source.key}:${source.version}`;
    } else if (/^https?:\/\//.test(source.uri ?? "")) {
      const extension = extname(new URL(source.uri!).pathname);
      path = resolve(
        workRoot,
        "sources",
        `${source.key}-${source.version}${extension}`,
      );
      sourceUri = source.uri!;
      if (!existsSync(path)) await download(source.uri!, path);
    } else {
      path = resolve(manifestDirectory, source.uri!);
      sourceUri = `urn:sylis:source:${source.key}:${source.version}`;
    }

    if (!existsSync(path))
      throw new Error(`Source ${source.key} does not exist.`);
    const actualChecksum = await sha256File(path);
    if (actualChecksum !== checksum) {
      throw new Error(`Checksum mismatch for source ${source.key}.`);
    }
    resolvedSources.push({
      ...source,
      path,
      sourceUri,
      checksum,
      parserVersion: SOURCE_PARSER_VERSIONS[source.adapter],
    });
  }

  return resolvedSources;
}
