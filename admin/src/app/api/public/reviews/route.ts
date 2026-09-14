import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { actorFromAdminApiToken } from "@/lib/adminApiToken";
import { logAudit } from "@/lib/rbac";

// 메인 마케팅 사이트(Vite, src/services/reviewService.ts)의 수강후기 게시판. 기존 mock
// 게시판과 동일하게 로그인한 사용자만 읽고 쓸 수 있다 — 실제로는 학생만 로그인해 이
// 사이트를 쓰므로 GET/POST 모두 studentApiToken을 기본으로 받고, GET만 admin
// 패널(/admin/reviews의 모니터링 용도는 아니지만 재사용 대비) 조회도 허용한다.
// 홈페이지 노출용 큐레이션(featuredOnHome)은 폐기되었다 — 이 게시판은 로그인 후에만
// 보이는 순수 게시판이다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

function mapPost(p: { id: number; parentId: number | null; title: string; content: string; views: number; createdAt: Date; student: { name: string } }) {
  return {
    id: String(p.id),
    parentId: p.parentId ? String(p.parentId) : undefined,
    title: p.title,
    content: p.content,
    authorName: p.student.name,
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

  const posts = await prisma.reviewPost.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { createdAt: "desc" },
    include: { student: { select: { name: true } } },
  });

  return NextResponse.json(posts.map(mapPost), { headers });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const studentId = studentIdFromAuthHeader(request);
  if (!studentId) return NextResponse.json({ error: "login_required" }, { status: 401, headers });
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.deletedAt) {
    return NextResponse.json({ error: "student_not_found" }, { status: 404, headers });
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

  if (!title || !content || (parentId !== null && !Number.isInteger(parentId))) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers });
  }
  if (parentId !== null) {
    const parent = await prisma.reviewPost.findUnique({ where: { id: parentId } });
    if (!parent || parent.siteId !== DEFAULT_SITE_ID) {
      return NextResponse.json({ error: "parent_not_found" }, { status: 404, headers });
    }
  }

  const created = await prisma.reviewPost.create({
    data: { siteId: DEFAULT_SITE_ID, studentId, title, content, parentId: parentId ?? undefined },
    include: { student: { select: { name: true } } },
  });
  await logAudit({
    actor: { role: "STUDENT", id: student.id, name: student.name },
    action: "CREATE",
    targetType: "ReviewPost",
    targetId: created.id,
    description: "마케팅 사이트 수강후기 게시판 작성",
  });

  return NextResponse.json(mapPost(created), { status: 201, headers });
}
