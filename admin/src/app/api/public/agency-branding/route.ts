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

  // domain 매칭에 실패하면 본사로 폴백하는데, 예전엔 그 폴백 조회가 별도 쿼리였다
  // (domain 매칭 실패 시 2회 왕복). Agent.code/domain이 둘 다 @unique라 각 조건이
  // 최대 1행만 매칭함이 스키마로 보장되므로, 두 조건을 OR로 묶어 후보를 1번에 가져온
  // 뒤 JS에서 우선순위(도메인 매칭 우선)로 고른다 — findFirst 2번과 결과가 항상 같다.
  const candidates = await prisma.agent.findMany({
    where: {
      siteId: DEFAULT_SITE_ID,
      OR: domain ? [{ domain }, { code: HIGHFIVE_AGENT_CODE }] : [{ code: HIGHFIVE_AGENT_CODE }],
    },
  });
  const agent =
    (domain ? candidates.find((a) => a.domain === domain) : null) ??
    candidates.find((a) => a.code === HIGHFIVE_AGENT_CODE) ??
    null;

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
    // 이 GET은 Authorization 헤더에 따라 응답이 달라지지 않는 순수 공개 조회다.
    // 다만 Netlify의 캐시 키는 기본적으로 ?domain= 쿼리스트링을 구분하지 않아서
    // (실측으로 재현: A 협력사 도메인 캐시가 B 협력사 요청에도 그대로 반환됨),
    // Netlify-Vary에 "query=domain"을 명시해 협력사별로 캐시가 분리되도록 한다.
    // 관리자가 협력사 정보를 수정해도 늦어도 30초 내엔 반영되도록 TTL을 짧게 잡는다.
    { headers: { ...headers, "Cache-Control": "public, max-age=30", "Netlify-Vary": "query=domain" } },
  );
}
