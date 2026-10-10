import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { actorFromAdminApiToken } from "@/lib/adminApiToken";
import { hasPermission, logAudit } from "@/lib/rbac";
import { parseRouteId } from "@/lib/routeId";

export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

/** 상세 조회 — 조회할 때마다 views를 올린다(기존 mock getBoardPost와 동일한 정책).
 * 목록과 마찬가지로 로그인(학생 또는 관리자 패널)이 필요하다. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = corsHeaders(request.headers.get("origin"));
  const { id } = await params;

  const studentId = studentIdFromAuthHeader(request);
  const admin = studentId ? null : await actorFromAdminApiToken(request);
  if (!studentId && !admin) return NextResponse.json({ error: "login_required" }, { status: 401, headers });

  // 인증 뒤에 id 형식을 확인한다(잘못된 id가 Prisma까지 가서 500이 되거나 "1.5" 같은 값이 다른 글과 맞아떨어지지 않게).
  const postId = parseRouteId(id);
  if (postId === null) return NextResponse.json({ error: "not_found" }, { status: 404, headers });

  const existing = await prisma.reviewPost.findUnique({ where: { id: postId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404, headers });

  const updated = await prisma.reviewPost.update({
    where: { id: postId },
    data: { views: { increment: 1 } },
    include: { student: { select: { name: true } } },
  });

  return NextResponse.json(
    {
      id: String(updated.id),
      parentId: updated.parentId ? String(updated.parentId) : undefined,
      title: updated.title ?? "",
      content: updated.content,
      authorName: updated.student?.name ?? updated.authorAdminName ?? "관리자",
      createdAt: updated.createdAt.toISOString(),
      views: updated.views,
    },
    { headers },
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = corsHeaders(request.headers.get("origin"));
  const { id } = await params;

  const studentId = studentIdFromAuthHeader(request);
  const admin = studentId ? null : await actorFromAdminApiToken(request);
  if (!studentId && !admin) return NextResponse.json({ error: "login_required" }, { status: 401, headers });

  const postId = parseRouteId(id);
  if (postId === null) return NextResponse.json({ error: "not_found" }, { status: 404, headers });

  const existing = await prisma.reviewPost.findUnique({ where: { id: postId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  // 본인 글만 수정 가능 — 학생은 studentId로, 관리자는 자기 이름으로 쓴 글만.
  const isOwner = studentId ? existing.studentId === studentId : existing.authorAdminName === admin?.name;
  if (!isOwner) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
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
  // 댓글(parentId가 있는 글)은 제목 없이 수정할 수 있다 — 최상위 후기 글만 제목이 필요하다.
  if (!content || (existing.parentId === null && !title)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers });
  }

  await prisma.reviewPost.update({ where: { id: postId }, data: { title: title || null, content } });
  return NextResponse.json({ ok: true }, { headers });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = corsHeaders(request.headers.get("origin"));
  const { id } = await params;

  const studentId = studentIdFromAuthHeader(request);
  const admin = studentId ? null : await actorFromAdminApiToken(request);
  if (!studentId && !admin) return NextResponse.json({ error: "login_required" }, { status: 401, headers });

  const postId = parseRouteId(id);
  if (postId === null) return NextResponse.json({ error: "not_found" }, { status: 404, headers });

  const existing = await prisma.reviewPost.findUnique({ where: { id: postId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  if (studentId && existing.studentId !== studentId && !admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }
  // 관리자 토큰이면 누구나 모든 글을 지울 수 있던 구멍을 막는다. 남이 쓴 글은 관리자 앱의 deleteReviewPost와
  // 같은 기준(reviews.delete, 본사 계정)을 요구하고, 그 외에는 자기가 쓴 글(PATCH와 같은 소유 기준)만 지울 수 있다.
  if (admin && existing.authorAdminName !== admin.name && (admin.role === "AGENT" || !hasPermission(admin, "reviews.delete"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }

  // 최상위 글이면 답글도 함께 지운다(admin/의 reviews/actions.ts deleteReviewPost와 동일 정책).
  await prisma.reviewPost.deleteMany({ where: { OR: [{ id: postId }, { parentId: postId }] } });
  await logAudit({
    actor: admin ?? { role: "STUDENT", id: studentId!, name: "" },
    action: "DELETE",
    targetType: "ReviewPost",
    targetId: postId,
    description: "마케팅 사이트 수강후기 게시판 삭제",
  });

  return NextResponse.json({ ok: true }, { headers });
}
