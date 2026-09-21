import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { actorFromAdminApiToken } from "@/lib/adminApiToken";
import { resolveAgentIdFromDomain } from "@/lib/agencyBranding";

// 메인 마케팅 사이트(Vite, src/services/consultChannelService.ts)의 "상담문의" 화면과
// 자체 관리자 패널(/admin/consult-channels)이 함께 호출한다. 유효한 admin Bearer 토큰이
// 실려 있으면(관리자 패널) enabled 여부와 무관하게 본사 채널 전체를 내려주고, 없으면
// (공개 방문자) 접속 도메인(?domain=)의 협력사 채널을 우선 쓰고 없는 code는 본사
// 채널로 대체한 뒤, enabled인 것만 내려준다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  const actor = await actorFromAdminApiToken(request);

  if (actor) {
    const channels = await prisma.consultChannel.findMany({
      where: { siteId: DEFAULT_SITE_ID, agentId: null },
      orderBy: { id: "asc" },
    });
    // 외부(마케팅 사이트) 계약은 항상 code를 "id"로 노출한다 — DB의 진짜 int PK는
    // agentId별로 같은 code가 여러 행 생길 수 있어 이 API의 안정적인 식별자로 쓸 수
    // 없다(공개 계약을 안 바꾸려고 code를 그대로 id 자리에 내려준다).
    return NextResponse.json(
      channels.map((c) => ({
        id: c.code,
        displayName: c.displayName,
        value: c.value,
        url: c.url ?? undefined,
        enabled: c.enabled,
      })),
      { headers },
    );
  }

  const { searchParams } = new URL(request.url);
  const agentId = await resolveAgentIdFromDomain(searchParams.get("domain"));

  const channels = await prisma.consultChannel.findMany({
    where: {
      siteId: DEFAULT_SITE_ID,
      enabled: true,
      OR: agentId ? [{ agentId }, { agentId: null }] : [{ agentId: null }],
    },
    orderBy: { id: "asc" },
  });
  // 같은 code가 협력사 행/본사 행 둘 다 있을 수 있으니, 협력사 행을 우선한다.
  const byCode = new Map<string, (typeof channels)[number]>();
  for (const c of channels) {
    const existing = byCode.get(c.code);
    if (!existing || (c.agentId !== null && existing.agentId === null)) byCode.set(c.code, c);
  }

  return NextResponse.json(
    [...byCode.values()].map((c) => ({
      id: c.code,
      displayName: c.displayName,
      value: c.value,
      url: c.url ?? undefined,
      enabled: c.enabled,
    })),
    { headers },
  );
}
