import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";
import { studentIdFromAuthHeader } from "@/lib/studentApiToken";
import { logAudit } from "@/lib/rbac";
import { parseAppDateTime } from "@/lib/appTime";

// 메인 마케팅 사이트(Vite, src/services/enrollmentRequestService.ts)의 "수강신청" 폼이
// 호출하는 공개 엔드포인트. 레벨테스트 신청과 동일한 정책으로 로그인이 필수라, 항상
// Authorization: Bearer <studentApiToken>을 요구한다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

const VALID_FREQUENCIES = ["freq2", "freq3", "freq5"];
const VALID_DURATIONS_MIN = [25, 50];
const VALID_TRACKS = ["junior", "senior", "business"];
const VALID_DURATION_IDS = ["1m", "3m", "6m"];
const PLATFORM_TO_CLASS_METHOD: Record<string, string> = { zoom: "zoom", voov: "tencent", teams: "teams" };

const WEEKDAYS_BY_FREQUENCY: Record<string, number[]> = {
  freq5: [1, 2, 3, 4, 5],
  freq3: [1, 3, 5],
  freq2: [2, 4],
};

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
  const meetingPlatform = String(input.meetingPlatform ?? "").trim();
  const teamsId = String(input.teamsId ?? "").trim();
  const curriculumTrack = String(input.curriculumTrack ?? "");
  const durationId = String(input.durationId ?? "");
  const lessonFrequency = String(input.lessonFrequency ?? "");
  const lessonDurationMin = Number(input.lessonDurationMin);
  const preferredStartDate = String(input.preferredStartDate ?? "");
  const preferredStartTimeKST = String(input.preferredStartTimeKST ?? "");
  const pointsToUse = Number(input.pointsToUse ?? 0);

  const invalid =
    !PLATFORM_TO_CLASS_METHOD[meetingPlatform] ||
    (meetingPlatform === "teams" && !teamsId) ||
    !VALID_TRACKS.includes(curriculumTrack) ||
    !VALID_DURATION_IDS.includes(durationId) ||
    !VALID_FREQUENCIES.includes(lessonFrequency) ||
    !VALID_DURATIONS_MIN.includes(lessonDurationMin) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(preferredStartDate) ||
    !/^\d{2}:\d{2}$/.test(preferredStartTimeKST) ||
    !Number.isFinite(pointsToUse) ||
    pointsToUse < 0;

  if (invalid) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers });
  }

  const created = await prisma.enrollmentRequest.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      studentId,
      meetingPlatform,
      teamsId: meetingPlatform === "teams" ? teamsId : null,
      curriculumTrack,
      durationId,
      lessonFrequency,
      lessonDurationMin,
      weeklyDays: WEEKDAYS_BY_FREQUENCY[lessonFrequency],
      preferredStartDate: parseAppDateTime(`${preferredStartDate}T00:00`),
      preferredStartTimeKST,
      pointsToUse: Math.round(pointsToUse),
      status: "NEW",
    },
  });

  await logAudit({
    actor: { role: "STUDENT", id: student.id, name: student.name },
    action: "CREATE",
    targetType: "EnrollmentRequest",
    targetId: created.id,
    description: "마케팅 사이트에서 수강신청",
  });

  return NextResponse.json({ id: created.id }, { status: 201, headers });
}
