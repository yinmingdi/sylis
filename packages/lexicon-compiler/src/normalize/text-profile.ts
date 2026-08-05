export function normalizeIdentityText(value: string): string {
  return value.trim().normalize("NFC").replace(/\s+/g, " ");
}

export function normalizeSearchKey(value: string, locale = "en"): string {
  return normalizeIdentityText(value).toLocaleLowerCase(locale);
}

export function normalizeComparableText(value: string): string {
  return normalizeSearchKey(value)
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
