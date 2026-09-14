import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { verifyBackofficeLogin, createBackofficeSession } from "@/lib/backofficeAuth";
import { logAudit } from "@/lib/rbac";
import { createAdminApiToken } from "@/lib/adminApiToken";

// 마케팅 사이트(Vite)의 "관리자/매니저" 로그인이, 아이디·비밀번호가 실제 admin
// DB(AdminUser)와 일치할 때만 admin 앱(:3001)에 진짜 admin_session 쿠키를 심어주는
// 공개 엔드포인트 — student-login과 동일한 패턴(비밀번호 검증 자체를 신뢰 근거로
// 삼아 한 응답 안에서 세션 쿠키를 심음). Vite의 admin1/manager 같은 나머지 데모
// 계정은 애초에 AdminUser에 대응 행이 없어 이 경로를 타도 그냥 매칭 실패로
// 끝난다 — 오직 실제 AdminUser와 일치하는 자격증명(예: admin/시드된 초기 비밀번호)일
// 때만 "홈페이지관리" 클릭이 재로그인 없이 바로 실제 대시보드로 연결된다.
// apiToken도 함께 내려준다 — admin_session 쿠키는 SameSite=Lax라 Vite의 자체 관리자
// 패널(/admin/pricing 등)이 cross-origin fetch로 실제 DB에 쓸 때는 실리지 않으므로,
// studentApiToken과 동일한 이유로 Bearer 토큰이 따로 필요하다(adminApiToken.ts 참고).
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request, { credentials: true });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"), { credentials: true });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }

  const loginId = String((body as Record<string, unknown>).loginId ?? "").trim();
  const password = String((body as Record<string, unknown>).password ?? "");
  if (!loginId || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400, headers });
  }

  const adminUserId = await verifyBackofficeLogin(loginId, password);
  if (!adminUserId) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401, headers });
  }

  await createBackofficeSession(adminUserId);
  const user = await prisma.adminUser.update({
    where: { id: adminUserId },
    data: { lastLoginAt: new Date() },
  });
  await logAudit({
    actor: { role: user.role, id: user.id, name: user.name },
    action: "LOGIN_SUCCESS",
    description: "마케팅 사이트에서 관리자 페이지로 바로 이동(자동 로그인)",
  });

  return NextResponse.json(
    {
      matched: true,
      apiToken: createAdminApiToken(user.id, user.role),
      role: user.role,
      name: user.name,
    },
    { status: 200, headers },
  );
}
