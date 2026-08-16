import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";

export function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
