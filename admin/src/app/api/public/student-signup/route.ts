import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { createStudentSession } from "@/lib/studentAuth";
import { logAudit } from "@/lib/rbac";
import { buildStudentLoginPayload } from "@/lib/studentLoginResponse";
import { DEFAULT_SITE_ID, HIGHFIVE_AGENT_CODE } from "@/lib/constants";
import { resolveAgentIdFromDomain } from "@/lib/agencyBranding";
import type { ConsultRoute, ResidenceRegion } from "@/generated/prisma/client";

// 마케팅 사이트의 회원가입 화면이 직접 학생 계정을 생성하는 공개 엔드포인트. 지금까지는
// 학생 계정을 전부 관리자가 admin 패널(학생관리 > 학생 등록)에서 만들었는데, 방문자가
// 스스로 가입할 방법이 아예 없어 레벨테스트 신청 등 신규 유입 경로가 막혀 있었다 — 이
// 경로가 그 공백을 메운다. 휴대폰/이메일 본인확인 없이 바로 생성하는 정책은 기존 관리자
// 등록과 같은 신뢰 수준을 유지한 것(사용자와 협의된 정책). 협력사는 방문한 도메인
// 기준으로 자동 배정한다(요청에 실린 domain을 서버에서 직접 매칭 — 클라이언트가
// agentId를 임의로 지정하게 하지 않는다) — 매칭되는 협력사가 없으면(본사 도메인 포함)
// 직영으로 떨어진다. 가입 직후 응답 형태는 student-login과 동일해 Vite 쪽 처리 로직을
// 그대로 재사용할 수 있다(가입=자동 로그인).
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
  const b = body as Record<string, unknown>;
  const str = (key: string) => String(b[key] ?? "").trim();

  const name = str("name");
  const loginId = str("loginId");
  const password = String(b.password ?? "");
  const englishName = str("englishName");
  const mobilePhone = str("mobilePhone");
  const email = str("email");
  const consultRouteRaw = str("consultRoute");
  const preferredClassMethod = str("preferredClassMethod");
  const regionRaw = str("region");
  const wechatId = str("wechatId");
  const kakaoId = str("kakaoId");
  const referrerId = str("referrerId");

  if (!name || !loginId || !password) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400, headers });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400, headers });
  }

  const existing = await prisma.student.findUnique({ where: { loginId } });
  if (existing) {
    return NextResponse.json({ error: "login_id_taken" }, { status: 409, headers });
  }

  const domain = str("domain");
  const resolvedAgentId = domain ? await resolveAgentIdFromDomain(domain) : null;
  const agentId =
    resolvedAgentId ?? (await prisma.agent.findUnique({ where: { code: HIGHFIVE_AGENT_CODE } }))?.id ?? null;
  const passwordHash = await bcrypt.hash(password, 10);

  const student = await prisma.student.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      name,
      loginId,
      passwordHash,
      grade: "GENERAL",
      status: "ACTIVE",
      agentId,
      englishName: englishName || null,
      mobilePhone: mobilePhone || null,
      email: email || null,
      consultRoute: consultRouteRaw ? (consultRouteRaw as ConsultRoute) : null,
      preferredClassMethod: preferredClassMethod || null,
      region: regionRaw ? (regionRaw as ResidenceRegion) : null,
      wechatId: wechatId || null,
      kakaoId: kakaoId || null,
      referrerId: referrerId || null,
    },
  });

  await createStudentSession(student.id);
  await logAudit({
    actor: { role: "STUDENT", id: student.id, name: student.name },
    action: "ACCOUNT_CREATED",
    description: "마케팅 사이트에서 직접 회원가입",
  });

  const payload = await buildStudentLoginPayload(student.id);
  return NextResponse.json(payload, { status: 201, headers });
}
