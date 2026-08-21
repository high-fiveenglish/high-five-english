import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";

// 메인 마케팅 사이트의 가격표 섹션(src/services/pricingService.ts)이 호출하는
// 공개 읽기 전용 엔드포인트. 응답 shape은 그 사이트의 PricingDuration/PricingRow
// 타입(src/data/pricing.ts)과 맞춘다 — durationId별로 rows를 묶어서 내려준다.
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
