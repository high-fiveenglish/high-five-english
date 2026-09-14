import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { actorFromAdminApiToken } from "@/lib/adminApiToken";
import { requirePermission, logAudit, ForbiddenError } from "@/lib/rbac";

export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

/** 공개 상세 조회 — 게시된 글만, 조회할 때마다 views를 올린다(기존 mock
 * getPublishedHomeNotice와 동일한 정책). 비로그인 방문자도 호출한다. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = corsHeaders(request.headers.get("origin"));
  const { id } = await params;
  const noticeId = Number(id);
  if (!Number.isInteger(noticeId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers });

  const existing = await prisma.homeNotice.findUnique({ where: { id: noticeId } });
  if (!existing || !existing.published) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }
  const updated = await prisma.homeNotice.update({ where: { id: noticeId }, data: { views: { increment: 1 } } });
  const author = updated.authorAdminId !== null
    ? await prisma.adminUser.findUnique({ where: { id: updated.authorAdminId }, select: { name: true } })
    : null;

  return NextResponse.json(
    {
      id: String(updated.id),
      title: updated.title,
      content: updated.content,
      createdAt: updated.createdAt.toISOString(),
      views: updated.views,
      authorName: author?.name ?? "-",
    },
    { headers },
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = corsHeaders(request.headers.get("origin"));
  const { id } = await params;
  const noticeId = Number(id);

  const actor = await actorFromAdminApiToken(request);
  if (!actor) return NextResponse.json({ error: "login_required" }, { status: 401, headers });
  try {
    requirePermission(actor, "home_notices.update");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
    throw err;
  }

  const existing = await prisma.homeNotice.findUnique({ where: { id: noticeId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404, headers });

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

  await prisma.homeNotice.update({ where: { id: noticeId }, data: { title, content, published } });
  await logAudit({ actor, action: "UPDATE", targetType: "HomeNotice", targetId: noticeId, description: "마케팅 사이트 관리자 패널에서 수정" });

  return NextResponse.json({ ok: true }, { headers });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = corsHeaders(request.headers.get("origin"));
  const { id } = await params;
  const noticeId = Number(id);

  const actor = await actorFromAdminApiToken(request);
  if (!actor) return NextResponse.json({ error: "login_required" }, { status: 401, headers });
  try {
    requirePermission(actor, "home_notices.delete");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
    throw err;
  }

  const existing = await prisma.homeNotice.findUnique({ where: { id: noticeId } });
  if (existing) {
    await prisma.homeNotice.delete({ where: { id: noticeId } });
    await logAudit({ actor, action: "DELETE", targetType: "HomeNotice", targetId: noticeId, description: "마케팅 사이트 관리자 패널에서 삭제" });
  }

  return NextResponse.json({ ok: true }, { headers });
}
