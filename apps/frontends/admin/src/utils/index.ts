export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const value = (input: unknown, fallback = "-"): string =>
  typeof input === "string" || typeof input === "number"
    ? String(input)
    : fallback;
