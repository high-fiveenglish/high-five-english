// Extensible currency catalog. Adding a future market (e.g. Japan, US, Philippines)
// means appending one entry here — every price lookup/format call derives the symbol
// from this array, nothing else hardcodes "₩"/"¥"/"₫" anywhere in the app. Same
// "as const satisfies" pattern already used for MEETING_PLATFORMS/SUPPORTED_LANGUAGES.
export interface CurrencyInfo {
  code: string;
  symbol: string;
}

export const CURRENCIES = [
  { code: "KRW", symbol: "₩" },
  { code: "CNY", symbol: "¥" },
  { code: "VND", symbol: "₫" },
] as const satisfies CurrencyInfo[];

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

/** Prices are stored as independently-set sale prices per currency (see data/pricing.ts)
 * — never derived from a live exchange rate — so this map is always a plain lookup,
 * never a conversion. */
export type PriceByCurrency = Partial<Record<CurrencyCode, number>>;

function currencySymbol(code: CurrencyCode): string {
  return (CURRENCIES as readonly CurrencyInfo[]).find((c) => c.code === code)?.symbol ?? code;
}

/** Formats a stored sale price for display, e.g. formatPrice(103000, "KRW") -> "₩103,000". */
export function formatPrice(amount: number, currency: CurrencyCode): string {
  return `${currencySymbol(currency)}${amount.toLocaleString("en-US")}`;
}
