export type PricingRow = {
  frequency: string;
  price25: number;
  price50: number;
};

export type PricingDuration = {
  id: string;
  label: string;
  badge?: string;
  rows: PricingRow[];
};

export const PRICING_DURATIONS: PricingDuration[] = [
  {
    id: "1m",
    label: "1개월",
    rows: [
      { frequency: "주 5회", price25: 103000, price50: 187000 },
      { frequency: "주 3회", price25: 79000, price50: 129000 },
      { frequency: "주 2회", price25: 53000, price50: 86000 },
    ],
  },
  {
    id: "3m",
    label: "3개월",
    badge: "인기",
    rows: [
      { frequency: "주 5회", price25: 283000, price50: 517000 },
      { frequency: "주 3회", price25: 219000, price50: 356000 },
      { frequency: "주 2회", price25: 147000, price50: 238000 },
    ],
  },
  {
    id: "6m",
    label: "6개월",
    badge: "최대 혜택",
    rows: [
      { frequency: "주 5회", price25: 537000, price50: 1002000 },
      { frequency: "주 3회", price25: 416000, price50: 676000 },
      { frequency: "주 2회", price25: 280000, price50: 453000 },
    ],
  },
];

export function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}
