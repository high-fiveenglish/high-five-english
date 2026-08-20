import type { PriceByCurrency } from "./currencies";

// Sale prices are stored per currency, independently — NOT derived from a live exchange
// rate. This is a deliberate business decision: a KRW price change must never silently
// move the CNY/VND price, and vice versa. See src/services/pricingService.ts for the
// mutable, admin-editable copy of this seed (same "static seed -> store overlay" pattern
// as data/classroomMock.ts -> services/store.ts).
export type PricingRow = {
  frequencyId: string;
  price25: PriceByCurrency;
  price50: PriceByCurrency;
};

export type PricingDuration = {
  id: string;
  hasBadge?: boolean;
  rows: PricingRow[];
};

export const PRICING_SEED: PricingDuration[] = [
  {
    id: "1m",
    rows: [
      {
        frequencyId: "freq5",
        price25: { KRW: 103000, CNY: 509, VND: 1950000 },
        price50: { KRW: 187000, CNY: 929, VND: 3550000 },
      },
      {
        frequencyId: "freq3",
        price25: { KRW: 79000, CNY: 399, VND: 1500000 },
        price50: { KRW: 129000, CNY: 639, VND: 2450000 },
      },
      {
        frequencyId: "freq2",
        price25: { KRW: 53000, CNY: 269, VND: 1000000 },
        price50: { KRW: 86000, CNY: 429, VND: 1650000 },
      },
    ],
  },
  {
    id: "3m",
    hasBadge: true,
    rows: [
      {
        frequencyId: "freq5",
        price25: { KRW: 283000, CNY: 1389, VND: 5350000 },
        price50: { KRW: 517000, CNY: 2539, VND: 9700000 },
      },
      {
        frequencyId: "freq3",
        price25: { KRW: 219000, CNY: 1079, VND: 4150000 },
        price50: { KRW: 356000, CNY: 1749, VND: 6700000 },
      },
      {
        frequencyId: "freq2",
        price25: { KRW: 147000, CNY: 729, VND: 2800000 },
        price50: { KRW: 238000, CNY: 1169, VND: 4500000 },
      },
    ],
  },
  {
    id: "6m",
    hasBadge: true,
    rows: [
      {
        frequencyId: "freq5",
        price25: { KRW: 537000, CNY: 2639, VND: 10100000 },
        price50: { KRW: 1002000, CNY: 4919, VND: 18800000 },
      },
      {
        frequencyId: "freq3",
        price25: { KRW: 416000, CNY: 2049, VND: 7800000 },
        price50: { KRW: 676000, CNY: 3319, VND: 12700000 },
      },
      {
        frequencyId: "freq2",
        price25: { KRW: 280000, CNY: 1379, VND: 5300000 },
        price50: { KRW: 453000, CNY: 2229, VND: 8500000 },
      },
    ],
  },
];

/** Pure lookup — a future order/payment flow snapshots this returned number into the
 * order record at purchase time (plain JS numbers copy by value, so the order is never
 * affected by a later admin price edit). Returns undefined if this row/currency
 * combination has no price set. */
export function getPrice(
  durations: PricingDuration[],
  durationId: string,
  frequencyId: string,
  lessonLength: 25 | 50,
  currency: keyof PriceByCurrency,
): number | undefined {
  const row = durations.find((d) => d.id === durationId)?.rows.find((r) => r.frequencyId === frequencyId);
  if (!row) return undefined;
  return lessonLength === 25 ? row.price25[currency] : row.price50[currency];
}
