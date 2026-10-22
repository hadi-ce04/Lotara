// Conservative identifier normalization. Originals are always kept alongside.
// Never maps look-alike characters (O/0, I/1) and never strips punctuation inside lot codes.

export type GtinResult =
  | { ok: true; gtin14: string }
  | { ok: false; reason: "MISSING" | "NOT_DIGITS" | "BAD_LENGTH" | "BAD_CHECK_DIGIT" };

export function normalizeGtin(raw: string | null | undefined): GtinResult {
  const value = raw?.trim();
  if (!value) return { ok: false, reason: "MISSING" };
  if (!/^\d+$/.test(value)) return { ok: false, reason: "NOT_DIGITS" };
  if (![8, 12, 13, 14].includes(value.length)) return { ok: false, reason: "BAD_LENGTH" };
  if (!hasValidCheckDigit(value)) return { ok: false, reason: "BAD_CHECK_DIGIT" };
  // Explicit rule: GTIN-8/12/13 compare as GTIN-14 by left-padding with zeroes.
  return { ok: true, gtin14: value.padStart(14, "0") };
}

export function hasValidCheckDigit(digits: string): boolean {
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

/** Trims surrounding whitespace only. Returns null for empty values. */
export function normalizeLot(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

export function lotsEqual(a: string, b: string, caseInsensitive: boolean): boolean {
  return caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** Accepts ISO dates (2026-12-10) or French label dates (10/12/2026). */
export function normalizeDate(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : fr ? [fr[3], fr[2], fr[1]] : [];
  if (!y) return null;
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${y}-${m}-${d}`) return null;
  return `${y}-${m}-${d}`;
}
