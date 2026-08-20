// Pricing mock service layer. listPricing is public (the homepage price table and the
// level-test modal's plan labels don't require login) — only editing requires the
// "pricing" permission, same requirePermission-first pattern as every other admin*
// service. Editing one row's price for one currency never touches the other currencies'
// prices (see data/pricing.ts's header comment) or any other row.
import type { PricingDuration } from "../data/pricing";
import type { CurrencyCode } from "../data/currencies";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission } from "../lib/auth/permissions";
import { store } from "./store";

export async function listPricing(): Promise<PricingDuration[]> {
  return store.pricing;
}

export async function updatePricingPrice(
  actor: Actor | null,
  durationId: string,
  frequencyId: string,
  lessonLength: 25 | 50,
  currency: CurrencyCode,
  amount: number,
): Promise<ServiceResult<PricingDuration[]>> {
  const guard = requirePermission(actor, "pricing");
  if (!guard.ok) return guard;
  if (!Number.isFinite(amount) || amount < 0) {
    return errResult("NOT_FOUND", "가격은 0 이상의 숫자여야 합니다.");
  }

  const field = lessonLength === 25 ? "price25" : "price50";
  let found = false;
  store.pricing = store.pricing.map((duration) => {
    if (duration.id !== durationId) return duration;
    return {
      ...duration,
      rows: duration.rows.map((row) => {
        if (row.frequencyId !== frequencyId) return row;
        found = true;
        return { ...row, [field]: { ...row[field], [currency]: amount } };
      }),
    };
  });
  if (!found) return errResult("NOT_FOUND", "해당 상품을 찾을 수 없습니다.");
  return okResult(store.pricing);
}
