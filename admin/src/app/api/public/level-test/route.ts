import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { logAudit } from "@/lib/rbac";
import { getLevelTestEligibility } from "@/lib/studentLevelTests";

// 메인 마케팅 사이트(Vite, src/services/levelTestService.ts)의 "무료 레벨테스트 신청"
// 폼이 호출하는 공개 엔드포인트. 레벨테스트 신청은 이제 로그인이 필수라(Vite 쪽에서
// 회원가입/로그인 없이는 폼 자체를 열 수 없게 막아둠) 이 엔드포인트도 항상
// Authorization: Bearer <studentApiToken>을 요구한다 — 토큰이 유효하면 그 학생
// 계정(studentId)에 곧바로 연결된 정식 레벨테스트로 등록되어, 관리자의
// "레벨테스트관리"에 아이디/연락처/"회원으로 로그인" 등과 함께 바로 보인다.
// (예전의 완전 비로그인 리드 접수는 더 이상 프런트에서 쓰이지 않는다 — Vite 쪽
// 게이트가 실수로 뚫려도 여기서 다시 401로 막는다. 과거에 만들어진 리드 행(예:
// "Test Kim")은 그대로 남아 있고 건드리지 않는다.)
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

const VALID_FREQUENCIES = ["freq2", "freq3", "freq5"];
const VALID_DURATIONS = [25, 50];
// Vite 쪽 MEETING_PLATFORMS id("zoom"/"voov"/"teams")를 admin의 classMethod 값
// ("zoom"/"tencent"/"teams")으로 매핑 — VooV Meeting(Tencent Meeting)만 이름이 다르다.
const PLATFORM_TO_CLASS_METHOD: Record<string, string> = { zoom: "zoom", voov: "tencent", teams: "teams" };

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const studentId = studentIdFromAuthHeader(request);
  if (!studentId) {
    return NextResponse.json({ error: "login_required" }, { status: 401, headers });
  }
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
  const contactName = String(input.contactName ?? "").trim();
  const contactPhone = String(input.contactPhone ?? "").trim();
  const preferredTimeUTC = String(input.preferredTimeUTC ?? "");
  const preferredTimeZone = String(input.preferredTimeZone ?? "").trim();
  const lessonFrequency = String(input.lessonFrequency ?? "");
  const lessonDurationMin = Number(input.lessonDurationMin);
  const meetingPlatform = String(input.meetingPlatform ?? "").trim();
  const referredTeacherName = String(input.referredTeacherName ?? "").trim();
  const studentEnglishName = String(input.studentEnglishName ?? "").trim();
  const studentAge = Number(input.studentAge);

  const invalid =
    !contactName ||
    !contactPhone ||
    !preferredTimeUTC ||
    Number.isNaN(Date.parse(preferredTimeUTC)) ||
    !preferredTimeZone ||
    !VALID_FREQUENCIES.includes(lessonFrequency) ||
    !VALID_DURATIONS.includes(lessonDurationMin) ||
    !meetingPlatform ||
    !studentEnglishName ||
    !Number.isInteger(studentAge) ||
    studentAge < 3 ||
    studentAge > 99;

  if (invalid) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers });
  }

  // 이미 진행 중인(종결되지 않은) 레벨테스트가 있으면 중복 신청을 막고, 가장 최근
  // 레벨테스트가 실제로 진행(수업완료)됐다면 그로부터 6개월이 지나야 재신청을
  // 허용한다 — getLevelTestEligibility가 두 조건을 함께 판정한다.
  const eligibility = await getLevelTestEligibility(studentId);
  if (!eligibility.eligible) {
    if (eligibility.reason === "pending") {
      return NextResponse.json({ error: "already_pending" }, { status: 409, headers });
    }
    return NextResponse.json(
      { error: "cooldown_active", eligibleAt: eligibility.eligibleAt, lastConductedAt: eligibility.lastConductedAt },
      { status: 409, headers },
    );
  }

  const scheduledTestDate = new Date(preferredTimeUTC);

  const created = await prisma.levelTest.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      studentId,
      subject: "online_english",
      classMethod: PLATFORM_TO_CLASS_METHOD[meetingPlatform] ?? null,
      scheduledTestDate,
      progressStatus: "접수",
      // 신청 당시 입력값 — 학생 프로필과 별개로 "이 신청 때 실제로 뭐라고 적었는지"
      // 그대로 보존한다(예: 학부모 명의 연락처일 수 있어 프로필을 덮어쓰지 않는다).
      leadContactName: contactName,
      leadContactPhone: contactPhone,
      leadPreferredTimeUTC: scheduledTestDate,
      leadPreferredTimeZone: preferredTimeZone,
      leadLessonFrequency: lessonFrequency,
      leadLessonDurationMin: lessonDurationMin,
      leadMeetingPlatform: meetingPlatform,
      leadReferredTeacherName: referredTeacherName || null,
      leadStudentEnglishName: studentEnglishName,
      leadStudentAge: studentAge,
    },
  });

  await logAudit({
    actor: { role: "STUDENT", id: student.id, name: student.name },
    action: "CREATE",
    targetType: "LevelTest",
    targetId: created.id,
    description: "마케팅 사이트에서 레벨테스트 신청",
  });

  return NextResponse.json({ id: created.id }, { status: 201, headers });
}
