// Pricing service layer. listPricing now reads from the real admin/LMS backend's public
// API (admin/src/app/api/public/pricing) — the admin's "가격표 관리" screen there is the
// source of truth. Falls back to the local mock store if that backend is unreachable, so
// the price table never renders empty. Editing (updatePricingPrice) still operates on
// this mock store and backs the OLD Vite admin pricing page — same "read moved, write
// stayed on the old admin" pattern as instructorService.ts/levelTestService.ts.
import type { PricingDuration } from "../data/pricing";
import type { CurrencyCode } from "../data/currencies";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission } from "../lib/auth/permissions";
import { store } from "./store";
import { ADMIN_API_URL } from "../lib/adminApi";

export async function listPricing(): Promise<PricingDuration[]> {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/public/pricing`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as PricingDuration[];
  } catch (err) {
    console.warn("[pricingService] admin backend unreachable, falling back to mock store", err);
    return store.pricing;
  }
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
