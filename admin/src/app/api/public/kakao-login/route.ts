import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { createStudentSession } from "@/lib/studentAuth";
import { logAudit } from "@/lib/rbac";
import { exchangeKakaoCode } from "@/lib/kakaoAuth";
import { buildStudentLoginPayload } from "@/lib/studentLoginResponse";

// 마케팅 사이트(Vite)가 카카오 인가 화면에서 받은 code를 넘기면, 이 서버가
// (CLIENT_SECRET을 써서) 토큰 교환 → 카카오 회원번호 조회까지 처리하고, 그 회원번호에
// 이미 연동된(kakaoUserId) 학생 계정으로 로그인시킨다. 연동된 계정이 없으면 로그인하지
// 않고 404로 안내만 한다 — 이 화면에서 자동으로 신규 계정을 만들지 않는다(계정은
// 여전히 관리자가 등록하는 기존 정책 유지, 카카오 로그인은 "이미 등록된 계정에 붙이는
// 바로가기"로만 취급). 응답 형태는 student-login과 동일하게 맞춰 Vite 쪽 처리 로직을
// 그대로 재사용할 수 있게 한다.
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
  const code = String((body as Record<string, unknown>).code ?? "");
  const redirectUri = String((body as Record<string, unknown>).redirectUri ?? "");
  if (!code || !redirectUri) {
    return NextResponse.json({ error: "missing_code" }, { status: 400, headers });
  }

  const exchanged = await exchangeKakaoCode(code, redirectUri);
  if ("error" in exchanged) {
    return NextResponse.json({ error: exchanged.error }, { status: 400, headers });
  }

  const student = await prisma.student.findUnique({ where: { kakaoUserId: exchanged.kakaoUserId } });
  if (!student || student.deletedAt || student.accountStatus !== "ACTIVE") {
    await logAudit({ actor: null, action: "LOGIN_FAILED", description: "마케팅 사이트 카카오 로그인 실패: 연동된 계정 없음" });
    return NextResponse.json({ error: "not_linked" }, { status: 404, headers });
  }

  await createStudentSession(student.id);
  await prisma.student.update({ where: { id: student.id }, data: { lastLoginAt: new Date() } });
  await logAudit({
    actor: { role: "STUDENT", id: student.id, name: student.name },
    action: "LOGIN_SUCCESS",
    description: "마케팅 사이트에서 카카오 로그인",
  });

  const payload = await buildStudentLoginPayload(student.id);
  return NextResponse.json(payload, { status: 200, headers });
}
