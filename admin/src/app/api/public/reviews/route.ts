import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { actorFromAdminApiToken } from "@/lib/adminApiToken";
import { logAudit } from "@/lib/rbac";
import { resolveAgentIdFromDomain, normalizeToOwnershipAgentId } from "@/lib/agencyBranding";

// 메인 마케팅 사이트(Vite, src/services/reviewService.ts)의 수강후기 게시판. 기존 mock
// 게시판과 동일하게 로그인한 사용자만 읽고 쓸 수 있다 — 실제로는 학생만 로그인해 이
// 사이트를 쓰므로 GET/POST 모두 studentApiToken을 기본으로 받고, GET/POST 둘 다 admin
// 패널 토큰(adminApiToken)으로도 쓸 수 있다 — 관리자가 게시판을 확인하고 댓글/답글을
// 달 수 있어야 하기 때문이다(관리자 글은 studentId 없이 authorAdminName만 채운다).
// 홈페이지 노출용 큐레이션(featuredOnHome)은 폐기되었다 — 이 게시판은 로그인 후에만
// 보이는 순수 게시판이다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

function mapPost(p: {
  id: number;
  parentId: number | null;
  title: string | null;
  content: string;
  views: number;
  createdAt: Date;
  student: { name: string } | null;
  authorAdminName: string | null;
}) {
  return {
    id: String(p.id),
    parentId: p.parentId ? String(p.parentId) : undefined,
    title: p.title ?? "",
    content: p.content,
    authorName: p.student?.name ?? p.authorAdminName ?? "관리자",
    createdAt: p.createdAt.toISOString(),
    views: p.views,
  };
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const studentId = studentIdFromAuthHeader(request);
  const admin = studentId ? null : await actorFromAdminApiToken(request);
  if (!studentId && !admin) {
    return NextResponse.json({ error: "login_required" }, { status: 401, headers });
  }

  const { searchParams } = new URL(request.url);
  const agentId = await resolveAgentIdFromDomain(searchParams.get("domain"));

  const posts = await prisma.reviewPost.findMany({
    where: { siteId: DEFAULT_SITE_ID, agentId },
    orderBy: { createdAt: "desc" },
    include: { student: { select: { name: true } } },
  });

  return NextResponse.json(posts.map(mapPost), { headers });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const studentId = studentIdFromAuthHeader(request);
  const admin = studentId ? null : await actorFromAdminApiToken(request);
  if (!studentId && !admin) return NextResponse.json({ error: "login_required" }, { status: 401, headers });

  let student: { id: number; name: string; agentId: number | null } | null = null;
  if (studentId) {
    const found = await prisma.student.findUnique({ where: { id: studentId } });
    if (!found || found.deletedAt) {
      return NextResponse.json({ error: "student_not_found" }, { status: 404, headers });
    }
    student = { id: found.id, name: found.name, agentId: found.agentId };
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
  const parentIdRaw = input.parentId;
  const parentId = parentIdRaw !== undefined && parentIdRaw !== null && parentIdRaw !== "" ? Number(parentIdRaw) : null;

  // 댓글(parentId가 있는 글)은 제목 없이 바로 달 수 있다 — 최상위 후기 글만 제목이 필요하다.
  if (!content || (parentId === null && !title) || (parentId !== null && !Number.isInteger(parentId))) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers });
  }
  if (parentId !== null) {
    const parent = await prisma.reviewPost.findUnique({ where: { id: parentId } });
    if (!parent || parent.siteId !== DEFAULT_SITE_ID) {
      return NextResponse.json({ error: "parent_not_found" }, { status: 404, headers });
    }
  }

  // 댓글은 원글과 같은 게시판에 남아야 하니 원글의 agentId를 그대로 물려받고, 새 글은
  // 학생 소속(직영=null로 정규화)을 스냅샷한다. 관리자가 직접 쓰는 글(admin)은 접속
  // 도메인 기준으로 붙인다.
  let postAgentId: number | null;
  if (parentId !== null) {
    postAgentId = (await prisma.reviewPost.findUnique({ where: { id: parentId }, select: { agentId: true } }))?.agentId ?? null;
  } else if (student) {
    postAgentId = await normalizeToOwnershipAgentId(student.agentId);
  } else {
    postAgentId = await resolveAgentIdFromDomain(new URL(request.url).searchParams.get("domain"));
  }

  const created = await prisma.reviewPost.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      agentId: postAgentId,
      studentId: student?.id,
      authorAdminName: admin ? admin.name : undefined,
      title: title || null,
      content,
      parentId: parentId ?? undefined,
    },
    include: { student: { select: { name: true } } },
  });
  await logAudit({
    actor: student ? { role: "STUDENT", id: student.id, name: student.name } : admin!,
    action: "CREATE",
    targetType: "ReviewPost",
    targetId: created.id,
    description: "마케팅 사이트 수강후기 게시판 작성",
  });

  return NextResponse.json(mapPost(created), { status: 201, headers });
}
