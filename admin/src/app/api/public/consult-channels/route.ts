import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { actorFromAdminApiToken } from "@/lib/adminApiToken";

// 메인 마케팅 사이트(Vite, src/services/consultChannelService.ts)의 "상담문의" 화면과
// 자체 관리자 패널(/admin/consult-channels)이 함께 호출한다. 유효한 admin Bearer 토큰이
// 실려 있으면(관리자 패널) enabled 여부와 무관하게 전체를 내려주고, 없으면(공개 방문자)
// enabled인 채널만 내려준다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  const actor = await actorFromAdminApiToken(request);

  const channels = await prisma.consultChannel.findMany({
    where: { siteId: DEFAULT_SITE_ID, ...(actor ? {} : { enabled: true }) },
    orderBy: { id: "asc" },
  });

  return NextResponse.json(
    channels.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      value: c.value,
      url: c.url ?? undefined,
      enabled: c.enabled,
    })),
    { headers },
  );
}
