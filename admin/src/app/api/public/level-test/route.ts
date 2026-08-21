import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";

// 메인 마케팅 사이트(Vite, src/services/levelTestService.ts)의 "무료 레벨테스트 신청"
// 폼이 로그인 없이 호출하는 공개 엔드포인트. proxy.ts의 matcher에서 이 경로만 인증을
// 제외해뒀다 — 새 방문자는 아직 계정이 없으므로 인증을 요구할 수 없다.
const ALLOWED_ORIGINS = (process.env.PUBLIC_SITE_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

const VALID_FREQUENCIES = ["freq2", "freq3", "freq5"];
const VALID_DURATIONS = [25, 50];

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

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

  const created = await prisma.levelTest.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      progressStatus: "신청",
      leadContactName: contactName,
      leadContactPhone: contactPhone,
      leadPreferredTimeUTC: new Date(preferredTimeUTC),
      leadPreferredTimeZone: preferredTimeZone,
      leadLessonFrequency: lessonFrequency,
      leadLessonDurationMin: lessonDurationMin,
      leadMeetingPlatform: meetingPlatform,
      leadReferredTeacherName: referredTeacherName || null,
      leadStudentEnglishName: studentEnglishName,
      leadStudentAge: studentAge,
    },
  });

  return NextResponse.json({ id: created.id }, { status: 201, headers });
}
