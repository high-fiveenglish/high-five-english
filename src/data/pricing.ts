export type PricingRow = {
  frequencyId: string;
  price25: number;
  price50: number;
};

export type PricingDuration = {
  id: string;
  hasBadge?: boolean;
  rows: PricingRow[];
};

export const PRICING_DURATIONS: PricingDuration[] = [
  {
    id: "1m",
    rows: [
      { frequencyId: "freq5", price25: 103000, price50: 187000 },
      { frequencyId: "freq3", price25: 79000, price50: 129000 },
      { frequencyId: "freq2", price25: 53000, price50: 86000 },
    ],
  },
  {
    id: "3m",
    hasBadge: true,
    rows: [
      { frequencyId: "freq5", price25: 283000, price50: 517000 },
      { frequencyId: "freq3", price25: 219000, price50: 356000 },
      { frequencyId: "freq2", price25: 147000, price50: 238000 },
    ],
  },
  {
    id: "6m",
    hasBadge: true,
    rows: [
      { frequencyId: "freq5", price25: 537000, price50: 1002000 },
      { frequencyId: "freq3", price25: 416000, price50: 676000 },
      { frequencyId: "freq2", price25: 280000, price50: 453000 },
    ],
  },
];

export function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}
