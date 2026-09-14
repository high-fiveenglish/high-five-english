import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { actorFromAdminApiToken } from "@/lib/adminApiToken";
import { requirePermission, logAudit, ForbiddenError } from "@/lib/rbac";

// 메인 마케팅 사이트의 가격표 섹션(src/services/pricingService.ts)이 호출하는
// 공개 읽기 전용 엔드포인트. 응답 shape은 그 사이트의 PricingDuration/PricingRow
// 타입(src/data/pricing.ts)과 맞춘다 — durationId별로 rows를 묶어서 내려준다.
// PATCH는 Vite 자체 관리자 패널(/admin/pricing)이 adminApiToken을 Bearer로 실어
// 호출한다 — admin/의 진짜 /pricing 페이지는 서버 액션(actions.ts)으로 직접 prisma를
// 쓰므로 이 라우트를 거치지 않는다. 로직은 그 actions.ts의 updatePricingCell과 동일.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const durations = await prisma.pricingDuration.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { order: "asc" },
    include: { rows: true },
  });

  const payload = durations.map((d) => ({
    id: d.code,
    hasBadge: d.hasBadge,
    rows: d.rows.map((r) => ({
      frequencyId: r.frequencyId,
      price25: { KRW: r.price25KRW, CNY: r.price25CNY, VND: r.price25VND },
      price50: { KRW: r.price50KRW, CNY: r.price50CNY, VND: r.price50VND },
    })),
  }));

  return NextResponse.json(payload, { headers });
}

const VALID_CURRENCIES = ["KRW", "CNY", "VND"] as const;
type Currency = (typeof VALID_CURRENCIES)[number];

export async function PATCH(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const actor = await actorFromAdminApiToken(request);
  if (!actor) return NextResponse.json({ error: "login_required" }, { status: 401, headers });
  try {
    requirePermission(actor, "pricing.update");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }
  const input = body as Record<string, unknown>;
  const durationId = String(input.durationId ?? "");
  const frequencyId = String(input.frequencyId ?? "");
  const lessonLength = Number(input.lessonLength);
  const currency = String(input.currency ?? "") as Currency;
  const amount = Number(input.amount);

  if (
    !durationId ||
    !frequencyId ||
    (lessonLength !== 25 && lessonLength !== 50) ||
    !VALID_CURRENCIES.includes(currency) ||
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers });
  }

  const duration = await prisma.pricingDuration.findUnique({
    where: { siteId_code: { siteId: DEFAULT_SITE_ID, code: durationId } },
  });
  if (!duration) return NextResponse.json({ error: "not_found" }, { status: 404, headers });

  const row = await prisma.pricingRow.findUnique({
    where: { durationId_frequencyId: { durationId: duration.id, frequencyId } },
  });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404, headers });

  const field = `price${lessonLength}${currency}` as
    | "price25KRW"
    | "price25CNY"
    | "price25VND"
    | "price50KRW"
    | "price50CNY"
    | "price50VND";

  await prisma.pricingRow.update({ where: { id: row.id }, data: { [field]: Math.round(amount) } });
  await logAudit({
    actor,
    action: "UPDATE",
    targetType: "PricingRow",
    targetId: row.id,
    description: `마케팅 사이트 관리자 패널에서 수정: ${field} = ${amount}`,
  });

  return NextResponse.json({ ok: true }, { headers });
}
