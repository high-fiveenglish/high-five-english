import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { actorFromAdminApiToken } from "@/lib/adminApiToken";
import { requirePermission, logAudit, ForbiddenError } from "@/lib/rbac";
import { resolveAgentIdFromDomain } from "@/lib/agencyBranding";

// 메인 마케팅 사이트(Vite, src/services/homeNoticeService.ts)의 홈페이지 공지 목록 —
// 비로그인 방문자도 읽는 공개 피드라 GET은 인증이 필요 없다. POST(작성)만 Vite 자체
// 관리자 패널(/admin/home-notices)에서 adminApiToken을 Bearer로 실어 호출한다 — 진짜
// 관리자 페이지(admin/의 /home-notices)는 서버 액션으로 직접 prisma를 쓰므로 이 라우트를
// 거치지 않는다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

/** 유효한 admin Bearer 토큰이 실려 있으면(관리자 패널) published 여부와 무관하게
 * 전체 + published 필드를 내려주고, 없으면(공개 방문자) 게시된 것만 내려준다 —
 * consult-channels GET과 동일한 정책. authorName은 예전 mock 공개 피드와 동일하게
 * 방문자에게도 항상 보여준다(작성한 관리자 이름은 민감정보가 아니다). */
export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  const admin = await actorFromAdminApiToken(request);
  const { searchParams } = new URL(request.url);
  // 본사/협력사 공지는 "각각 진행"이라 병합 없이 정확히 접속 도메인의 협력사(또는
  // 본사=null)에 해당하는 것만 보여준다 — pricing/consult-channels와 달리 폴백하지
  // 않는다.
  const agentId = await resolveAgentIdFromDomain(searchParams.get("domain"));

  const notices = await prisma.homeNotice.findMany({
    where: { siteId: DEFAULT_SITE_ID, agentId, ...(admin ? {} : { published: true }) },
    orderBy: { createdAt: "desc" },
  });

  const authorIds = [...new Set(notices.map((n) => n.authorAdminId).filter((id): id is number => id !== null))];
  const authors = await prisma.adminUser.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } });
  const authorNameById = new Map(authors.map((a) => [a.id, a.name]));

  return NextResponse.json(
    notices.map((n) => ({
      id: String(n.id),
      title: n.title,
      content: n.content,
      createdAt: n.createdAt.toISOString(),
      views: n.views,
      authorName: (n.authorAdminId !== null ? authorNameById.get(n.authorAdminId) : undefined) ?? "-",
      ...(admin ? { published: n.published } : {}),
    })),
    { headers },
  );
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const actor = await actorFromAdminApiToken(request);
  if (!actor) return NextResponse.json({ error: "login_required" }, { status: 401, headers });
  try {
    requirePermission(actor, "home_notices.create");
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
  const title = String(input.title ?? "").trim();
  const content = String(input.content ?? "").trim();
  const published = Boolean(input.published);
  if (!title || !content) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers });
  }

  const created = await prisma.homeNotice.create({
    data: { siteId: DEFAULT_SITE_ID, title, content, published, authorAdminId: actor.id },
  });
  await logAudit({ actor, action: "CREATE", targetType: "HomeNotice", targetId: created.id, description: "마케팅 사이트 관리자 패널에서 작성" });

  return NextResponse.json({ id: String(created.id) }, { status: 201, headers });
}
