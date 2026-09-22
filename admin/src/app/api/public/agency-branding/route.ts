import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID, HIGHFIVE_AGENT_CODE } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { normalizeDomain } from "@/lib/agencyBranding";

// 마케팅 사이트(Vite)가 앱 시작 시 자신의 접속 도메인(window.location.hostname)으로
// 호출해 "지금 어느 협력사 사이트인지"와 그 협력사의 브랜딩/회사정보/계좌를 받아온다.
// 도메인이 매칭되지 않으면(본사 도메인 포함) 본사(highfive) 정보로 대체한다 — 항상
// 뭔가는 내려주므로 마케팅 사이트가 별도 null 처리를 할 필요가 없다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  const { searchParams } = new URL(request.url);
  const domain = normalizeDomain(searchParams.get("domain"));

  const matched = domain
    ? await prisma.agent.findFirst({ where: { siteId: DEFAULT_SITE_ID, domain } })
    : null;
  const agent =
    matched ?? (await prisma.agent.findFirst({ where: { siteId: DEFAULT_SITE_ID, code: HIGHFIVE_AGENT_CODE } }));

  if (!agent) {
    return NextResponse.json({ error: "not_configured" }, { status: 500, headers });
  }

  return NextResponse.json(
    {
      agentId: agent.id,
      code: agent.code,
      name: agent.name,
      isHeadquarters: agent.code === HIGHFIVE_AGENT_CODE,
      domain: agent.domain,
      logoUrl: agent.logoUrl,
      brandTagline: agent.brandTagline,
      biz: {
        name: agent.bizName,
        ceo: agent.bizCeo,
        regNo: agent.bizRegNo,
        address: agent.bizAddress,
        phone: agent.bizPhone,
        email: agent.bizEmail,
        mailOrderNo: agent.bizMailOrderNo,
      },
      bank: {
        name: agent.bankName,
        accountNumber: agent.bankAccountNumber,
        accountHolder: agent.bankAccountHolder,
      },
    },
    // 이 GET은 Authorization 헤더에 따라 응답이 달라지지 않는 순수 공개 조회이고
    // (?domain= 쿼리스트링만으로 응답이 정해짐), 협력사별로 URL 자체가 달라지므로
    // 브라우저/CDN 캐시가 도메인을 쿼리스트링까지 포함해 키로 쓰는 한 다른 협력사
    // 데이터와 섞일 수 없다. 관리자가 협력사 정보를 수정해도 늦어도 30초 내엔
    // 반영되도록 TTL을 짧게 잡는다.
    { headers: { ...headers, "Cache-Control": "public, max-age=30" } },
  );
}
