// Pricing service layer. Both reading and writing now hit the real admin/LMS backend's
// public API (admin/src/app/api/public/pricing) — the admin's real "가격표 관리" screen
// (admin/의 /pricing) is the source of truth and writes there directly via a server
// action. This site's own mock admin panel (/admin/pricing) writes through the same
// public API instead, authenticated with adminApiToken (see AuthContext) — so an edit
// made from either screen lands in the same Postgres row and is reflected on the main
// site immediately.
import type { PricingDuration } from "../data/pricing";
import type { CurrencyCode } from "../data/currencies";
import type { ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { ADMIN_API_URL } from "../lib/adminApi";

export async function listPricing(): Promise<PricingDuration[]> {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/public/pricing`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as PricingDuration[];
  } catch (err) {
    console.warn("[pricingService] admin backend unreachable", err);
    return [];
  }
}

export async function updatePricingPrice(
  adminApiToken: string | null,
  durationId: string,
  frequencyId: string,
  lessonLength: 25 | 50,
  currency: CurrencyCode,
  amount: number,
): Promise<ServiceResult<PricingDuration[]>> {
  if (!adminApiToken) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  if (!Number.isFinite(amount) || amount < 0) {
    return errResult("NOT_FOUND", "가격은 0 이상의 숫자여야 합니다.");
  }

  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/pricing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminApiToken}` },
      body: JSON.stringify({ durationId, frequencyId, lessonLength, currency, amount }),
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (res.status === 401) return errResult("UNAUTHENTICATED", "세션이 만료되었습니다. 다시 로그인해주세요.");
  if (res.status === 404) return errResult("NOT_FOUND", "해당 상품을 찾을 수 없습니다.");
  if (!res.ok) return errResult("NOT_FOUND", "가격을 수정하지 못했습니다.");

  return okResult(await listPricing());
}
