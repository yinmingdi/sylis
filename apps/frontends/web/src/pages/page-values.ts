export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const stringValue = (value: unknown, fallback = '-'): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
