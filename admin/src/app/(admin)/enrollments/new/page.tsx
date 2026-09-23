import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { parseScheduleDaysLabel } from "../scheduleUtils";
import { EnrollmentCreateForm, type EnrollmentInitialValues } from "./EnrollmentCreateForm";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { WEEKDAYS } from "@/lib/weekdays";

const WEEKDAY_LABEL: Record<number, string> = Object.fromEntries(WEEKDAYS.map((d) => [d.value, d.label]));

// 마케팅 사이트 수강신청 리드(EnrollmentRequest)의 값 → 이 폼의 값으로 변환하는 표 —
// api/public/enrollment-requests/route.ts가 받아들이는 값의 집합과 정확히 맞춰야 한다.
const PLATFORM_TO_CLASS_METHOD: Record<string, string> = { zoom: "zoom", voov: "tencent", teams: "teams" };
const DURATION_ID_TO_MONTHS: Record<string, number> = { "1m": 1, "3m": 3, "6m": 6 };
const AGE_GROUP_LABEL: Record<string, string> = { preschool: "유아", elementary: "초등", secondary: "중고등", adult: "성인" };
const FIELD_LABEL: Record<string, string> = {
  phonics: "파닉스",
  "basic-conversation": "기초 회화",
  "reading-smalltalk": "리딩·스몰토크",
  "native-reading": "원서 읽기",
  "conversation-debate": "회화·디베이트",
  "advanced-discussion": "고급 토론·에세이",
  exam: "시험 대비",
  business: "비즈니스 영어",
  expression: "표현력 강화",
  interview: "인터뷰 준비",
};
function trackLabel(track: string): string {
  const sepIndex = track.indexOf(":");
  if (sepIndex === -1) return track;
  const ageGroup = track.slice(0, sepIndex);
  const field = track.slice(sepIndex + 1);
  return `${AGE_GROUP_LABEL[ageGroup] ?? ageGroup} · ${FIELD_LABEL[field] ?? field}`;
}

export default async function NewEnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string; fromRequest?: string; renewFrom?: string; fromReservation?: string }>;
}) {
  const actor = await requireBackofficeActor();
  const scopeAgentId = actor.role === "AGENT" ? actor.agentId : undefined;
  const { studentId, fromRequest, renewFrom, fromReservation } = await searchParams;

  const [students, teachers, request, renewSource, reservationRows] = await Promise.all([
    prisma.student.findMany({
      where: { siteId: DEFAULT_SITE_ID, ...(scopeAgentId ? { agentId: scopeAgentId } : {}), deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { realName: "asc" }, select: TEACHER_SUMMARY_SELECT }),
    fromRequest
      ? prisma.enrollmentRequest.findUnique({ where: { id: Number(fromRequest) }, include: { student: true } })
      : null,
    renewFrom
      ? prisma.enrollment.findUnique({ where: { id: Number(renewFrom) }, include: { student: true } })
      : null,
    // fromReservation 값은 순수 숫자(legacy: groupId 도입 전 행의 id)이거나 UUID
    // 문자열(신규: groupId)이다 — 형태만으로 명확히 구분해서 서로 섞이지 않게 한다
    // (reservations/actions.ts의 cancelReservation과 동일한 판별 방식).
    fromReservation
      ? /^\d+$/.test(fromReservation)
        ? prisma.slotReservation.findMany({
            where: { id: Number(fromReservation), groupId: null },
            include: { teacher: true },
          })
        : prisma.slotReservation.findMany({ where: { groupId: fromReservation }, include: { teacher: true } })
      : null,
  ]);

  // "신청" 목록의 "수정"에서 들어온 경우: 그 리드가 신청한 학생으로 고정하고, 신청서에
  // 담긴 값들을 그대로 채운다 — 관리자는 강사만 배정하면 된다(강사 배정 즉시 진행중으로
  // 전환되는 것은 actions.ts의 createEnrollment가 sourceRequestId를 보고 처리한다).
  if (request && request.siteId === DEFAULT_SITE_ID) {
    const initialValues: EnrollmentInitialValues = {
      classMethod: PLATFORM_TO_CLASS_METHOD[request.meetingPlatform] ?? "zoom",
      studentLevel: "",
      textbookName: "",
      curriculum: trackLabel(request.curriculumTrack),
      scheduleDayValues: request.weeklyDays,
      classDurationMin: request.lessonDurationMin,
      packageMonths: DURATION_ID_TO_MONTHS[request.durationId] ?? 1,
      totalSessions: request.weeklyDays.length * (DURATION_ID_TO_MONTHS[request.durationId] ?? 1) * 4,
      startDate: request.preferredStartDate.toISOString().slice(0, 10),
      classTime: request.preferredStartTimeKST,
      dayTimes: {},
      teacherId: null,
      studentEnglishName: "",
      adminNote: "",
    };

    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-slate-900">수강신청 등록 — 신청 건 검토</h1>
        <p className="mb-6 -mt-4 text-sm text-slate-500">
          {request.student.name} 학생이 신청한 내용입니다. 강사를 배정하고 저장하면 이 신청 건은 "등록전환"으로
          표시되고, 새 수강 건이 "진행중" 상태로 바로 생성됩니다.
        </p>
        <EnrollmentCreateForm
          students={students.map((s) => ({
            id: s.id,
            label: `${s.name} (${s.loginId})`,
            name: s.name,
            englishName: s.englishName,
          }))}
          teachers={teachers.map((t) => ({ id: t.id, label: t.realName }))}
          defaultStudentId={request.studentId}
          lockStudent
          studentLabel={`${request.student.loginId} (${request.student.name})`}
          studentName={request.student.name}
          defaultEnglishName={request.student.englishName}
          initialValues={initialValues}
          sourceRequestId={request.id}
        />
      </div>
    );
  }

  // "재수강" — 기존(진행중/종료된) 수강 건의 강사·요일·시간·기간·교재 등을 그대로
  // 기본값으로 채운 등록 화면을 보여준다. 관리자가 값을 확인·수정하고 실제로 저장
  // 버튼을 눌러야만(createEnrollment) 새 수강 건이 만들어진다 — 클릭 즉시 DB에
  // 만들어지던 예전 방식과 달리, 개월수·시간이 달라지는 경우도 저장 전에 고칠 수 있다.
  if (renewSource && renewSource.siteId === DEFAULT_SITE_ID) {
    const newStartDate = new Date(renewSource.endDate);
    newStartDate.setUTCDate(newStartDate.getUTCDate() + 1);

    const dayTimes =
      renewSource.classTimes && typeof renewSource.classTimes === "object"
        ? Object.fromEntries(
            Object.entries(renewSource.classTimes as Record<string, string>).map(([k, v]) => [Number(k), v]),
          )
        : {};

    const initialValues: EnrollmentInitialValues = {
      classMethod: renewSource.classMethod,
      studentLevel: renewSource.studentLevel ?? "",
      textbookName: renewSource.textbookName ?? "",
      curriculum: renewSource.curriculum ?? "",
      scheduleDayValues: parseScheduleDaysLabel(renewSource.scheduleDays),
      classDurationMin: renewSource.classDurationMin,
      packageMonths: renewSource.packageMonths,
      totalSessions: renewSource.totalSessions,
      startDate: newStartDate.toISOString().slice(0, 10),
      classTime: renewSource.classTime ?? "",
      dayTimes,
      teacherId: renewSource.teacherId,
      studentEnglishName: renewSource.studentEnglishName ?? "",
      adminNote: renewSource.adminNote ?? "",
    };

    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-slate-900">재수강 신청 — 기존 스케줄 검토</h1>
        <p className="mb-6 -mt-4 text-sm text-slate-500">
          {renewSource.student.name} 학생의 이전 수강 건(#{renewSource.id})과 동일한 강사·요일·시간·기간으로
          기본값이 채워져 있습니다. 개월 수를 늘리거나 시간을 바꿔야 하면 아래에서 직접 수정한 뒤 저장하세요 —
          저장을 눌러야 새 수강 건이 등록됩니다.
        </p>
        <EnrollmentCreateForm
          students={students.map((s) => ({
            id: s.id,
            label: `${s.name} (${s.loginId})`,
            name: s.name,
            englishName: s.englishName,
          }))}
          teachers={teachers.map((t) => ({ id: t.id, label: t.realName }))}
          defaultStudentId={renewSource.studentId}
          lockStudent
          studentLabel={`${renewSource.student.loginId} (${renewSource.student.name})`}
          studentName={renewSource.student.name}
          defaultEnglishName={renewSource.student.englishName}
          initialValues={initialValues}
          renewedFromId={renewSource.id}
        />
      </div>
    );
  }

  // "강사 자리 예약"의 "등록전환"에서 들어온 경우: 그룹(주 N회면 요일 수만큼의 행)의
  // 강사·요일·시간·수업방법을 전부 그대로 기본값으로 채운다 — 예약 단계에는 아직
  // 학생 계정이 없으므로(상담 단계 이름만 있음) 학생은 잠그지 않고 관리자가 직접
  // 검색·선택(또는 먼저 학생 등록)하게 한다. 저장 시 createEnrollment가
  // reservationGroupId를 보고 이 그룹 전체를 CONVERTED로 바꾼다.
  const activeReservations = (reservationRows ?? []).filter(
    (r) => r.siteId === DEFAULT_SITE_ID && r.status === "RESERVED",
  );
  if (activeReservations.length > 0) {
    const first = activeReservations[0];
    const weekdayValues = activeReservations.map((r) => r.weekday);
    const times = new Set(activeReservations.map((r) => r.classTime));
    // 모든 요일이 같은 시각이면 "모두 동일" 모드로(classTime 하나), 다르면 "요일마다
    // 다르게" 모드로(dayTimes에 전부 채움) — EnrollmentCreateForm의 sameTimeForAllDays
    // 판별과 동일한 규칙(dayTimes가 비어있으면 "모두 동일"로 연다).
    const allSameTime = times.size === 1;
    const dayTimes = allSameTime
      ? {}
      : Object.fromEntries(activeReservations.map((r) => [r.weekday, r.classTime]));

    const initialValues: EnrollmentInitialValues = {
      classMethod: first.classMethod ?? "zoom",
      studentLevel: "",
      textbookName: "",
      curriculum: "",
      scheduleDayValues: weekdayValues,
      classDurationMin: first.durationMin,
      packageMonths: 1,
      totalSessions: weekdayValues.length * 4,
      startDate: new Date().toISOString().slice(0, 10),
      classTime: allSameTime ? first.classTime : "",
      dayTimes,
      teacherId: first.teacherId,
      studentEnglishName: "",
      adminNote: "",
    };

    const scheduleLabel = activeReservations
      .map((r) => `${WEEKDAY_LABEL[r.weekday]} ${r.classTime}`)
      .join(", ");

    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-slate-900">수강신청 등록 — 예약 건 등록전환</h1>
        <p className="mb-6 -mt-4 text-sm text-slate-500">
          {first.prospectName}님과의 상담으로 예약해둔 {first.teacher.realName} 강사님의 주 {weekdayValues.length}회
          ({scheduleLabel}) 자리입니다. 학생을 검색·선택하고 저장하면 이 예약은 "등록완료"로 바뀝니다.
        </p>
        <EnrollmentCreateForm
          students={students.map((s) => ({
            id: s.id,
            label: `${s.name} (${s.loginId})`,
            name: s.name,
            englishName: s.englishName,
          }))}
          teachers={teachers.map((t) => ({ id: t.id, label: t.realName }))}
          defaultStudentId={null}
          studentName=""
          defaultEnglishName={null}
          initialValues={initialValues}
          reservationGroupId={first.groupId ?? String(first.id)}
        />
      </div>
    );
  }

  // 학생관리 목록의 "수강등록"에서 넘어온 경우 해당 학생이 미리 선택되고, 회원정보에
  // 저장된 희망 수업방법을 수업 방식 기본값으로 채워 관리자가 다시 입력하지 않아도 된다.
  const preselected = students.find((s) => s.id === Number(studentId));

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">수강신청 등록</h1>
      <EnrollmentCreateForm
        students={students.map((s) => ({
          id: s.id,
          label: `${s.name} (${s.loginId})`,
          name: s.name,
          englishName: s.englishName,
        }))}
        teachers={teachers.map((t) => ({ id: t.id, label: t.realName }))}
        defaultStudentId={preselected?.id ?? null}
        defaultClassMethod={preselected?.preferredClassMethod ?? null}
        studentName={preselected?.name ?? ""}
        defaultEnglishName={preselected?.englishName ?? null}
      />
    </div>
  );
}
