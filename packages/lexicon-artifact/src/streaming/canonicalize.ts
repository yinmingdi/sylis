import { createHash } from "node:crypto";

function compareUnicode(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function* canonicalJsonChunks(
  value: unknown,
  path = "",
  excludedPaths: ReadonlySet<string> = new Set(),
): Generator<string> {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    yield JSON.stringify(value);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Canonical JSON rejects non-finite numbers.");
    yield JSON.stringify(Object.is(value, -0) ? 0 : value);
    return;
  }
  if (Array.isArray(value)) {
    yield "[";
    for (const [index, child] of value.entries()) {
      if (index > 0) yield ",";
      yield* canonicalJsonChunks(child, `${path}/${index}`, excludedPaths);
    }
    yield "]";
    return;
  }
  if (typeof value === "object") {
    yield "{";
    let emitted = 0;
    for (const key of Object.keys(value as Record<string, unknown>).sort(
      compareUnicode,
    )) {
      const childPath = `${path}/${key}`;
      if (excludedPaths.has(childPath)) continue;
      if (emitted > 0) yield ",";
      emitted += 1;
      yield JSON.stringify(key);
      yield ":";
      yield* canonicalJsonChunks(
        (value as Record<string, unknown>)[key],
        childPath,
        excludedPaths,
      );
    }
    yield "}";
    return;
  }
  throw new Error(`Canonical JSON cannot encode ${typeof value}.`);
}

export function canonicalContentHash(value: unknown): string {
  const hash = createHash("sha256");
  const excluded = new Set(["/manifest/contentHash"]);
  for (const chunk of canonicalJsonChunks(value, "", excluded))
    hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}
