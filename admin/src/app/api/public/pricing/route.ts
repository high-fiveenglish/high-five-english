import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { actorFromAdminApiToken } from "@/lib/adminApiToken";
import { requirePermission, logAudit, ForbiddenError } from "@/lib/rbac";
import { normalizeDomain } from "@/lib/agencyBranding";

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
  const { searchParams } = new URL(request.url);
  const domain = normalizeDomain(searchParams.get("domain"));

  // domain→agent 조회를 별도 쿼리(resolveAgentIdFromDomain)로 먼저 하지 않고, agent
  // relation filter로 이 쿼리 안에 흡수한다 — DB 왕복이 2회(agent lookup + pricing
  // query)에서 1회로 줄어든다(실측: 약 497ms → 230ms). agentId로 직접 필터링하던 것을
  // "그 domain을 가진 agent가 소유한 행"으로 바꿨을 뿐이라 의미는 완전히 동일하다 —
  // domain이 없으면 agentId:null(본사) 행만 남는 것도 이전과 같다.
  const durations = await prisma.pricingDuration.findMany({
    where: {
      siteId: DEFAULT_SITE_ID,
      OR: domain ? [{ agent: { domain } }, { agentId: null }] : [{ agentId: null }],
    },
    orderBy: { order: "asc" },
    include: { rows: true },
  });
  // 같은 code(1m/3m/6m)가 협력사 행/본사 행 둘 다 있을 수 있으니, 협력사 행을 우선한다.
  const byCode = new Map<string, (typeof durations)[number]>();
  for (const d of durations) {
    const existing = byCode.get(d.code);
    if (!existing || (d.agentId !== null && existing.agentId === null)) byCode.set(d.code, d);
  }

  const payload = [...byCode.values()]
    .sort((a, b) => a.order - b.order)
    .map((d) => ({
      id: d.code,
      hasBadge: d.hasBadge,
      rows: d.rows.map((r) => ({
        frequencyId: r.frequencyId,
        price25: { KRW: r.price25KRW, CNY: r.price25CNY, VND: r.price25VND },
        price50: { KRW: r.price50KRW, CNY: r.price50CNY, VND: r.price50VND },
      })),
    }));

  // 이 GET은 인증 헤더로 응답이 안 바뀌어 캐시 허용 대상이지만, Netlify의 캐시 키는
  // 기본적으로 쿼리스트링(?domain=)을 구분하지 않는다 — 그대로 두면 협력사 A를 캐싱한
  // 응답이 협력사 B에게도 그대로 나갈 수 있다(실측으로 재현된 cross-tenant 캐시 오염).
  // Netlify-Vary에 "query=domain"을 명시해 domain별로 캐시가 분리되도록 한다 — Next.js/
  // Netlify가 자동으로 붙이는 값(__nextDataReq 등)은 이 응답(순수 JSON API)에는 원래
  // 의미가 없는 페이지 라우팅용 variation이라 domain 하나만 추가한다.
  return NextResponse.json(payload, {
    headers: { ...headers, "Cache-Control": "public, max-age=30", "Netlify-Vary": "query=domain" },
  });
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

  const duration = await prisma.pricingDuration.findFirst({
    where: { siteId: DEFAULT_SITE_ID, agentId: null, code: durationId },
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
