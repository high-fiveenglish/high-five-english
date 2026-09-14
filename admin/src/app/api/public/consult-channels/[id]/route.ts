import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { actorFromAdminApiToken } from "@/lib/adminApiToken";
import { requirePermission, logAudit, ForbiddenError } from "@/lib/rbac";

export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = corsHeaders(request.headers.get("origin"));
  const { id } = await params;

  const actor = await actorFromAdminApiToken(request);
  if (!actor) return NextResponse.json({ error: "login_required" }, { status: 401, headers });
  try {
    requirePermission(actor, "consult_channels.update");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
    throw err;
  }

  const existing = await prisma.consultChannel.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404, headers });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }
  const input = body as Record<string, unknown>;
  const displayName = String(input.displayName ?? "").trim();
  const value = String(input.value ?? "").trim();
  const url = String(input.url ?? "").trim();
  const enabled = Boolean(input.enabled);

  if (url) {
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "invalid_url" }, { status: 400, headers });
    }
  }

  await prisma.consultChannel.update({
    where: { id },
    data: { displayName: displayName || existing.displayName, value, url: url || null, enabled },
  });
  await logAudit({ actor, action: "UPDATE", targetType: "ConsultChannel", targetId: id, description: "마케팅 사이트 관리자 패널에서 수정" });

  return NextResponse.json({ ok: true }, { headers });
}
