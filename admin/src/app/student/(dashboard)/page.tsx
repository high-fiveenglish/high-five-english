import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/studentAuth";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { EnrollmentSelect } from "./EnrollmentSelect";
import { CalendarView } from "./CalendarView";
import { ENGLISH_LEVEL_OPTIONS } from "@/lib/levelTestOptions";
import { formatAppDate, formatAppTime } from "@/lib/appTime";
import type { EnrollmentStatus, SessionStatus } from "@/generated/prisma/client";

const ENGLISH_LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  ENGLISH_LEVEL_OPTIONS.map((o) => [o.value, o.label]),
);

// 화면에 보여줄 날짜/시간은 항상 한국시간(Asia/Seoul) 기준 — 서버 프로세스의 TZ 설정과
// 무관하게 정확한 시각을 보여주기 위해 .toISOString() 대신 명시적으로 변환한다.
const fmtDate = formatAppDate;
const fmtTime = formatAppTime;

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  APPLIED: "신청",
  PAID: "결제완료",
  ACTIVE: "진행중",
  HOLDING: "홀드",
  COMPLETED: "종료",
  RENEWED: "재수강",
  LOST: "이탈",
};

const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  SCHEDULED: "예정",
  COMPLETED: "완료",
  CANCELLED: "취소",
  MAKEUP_NEEDED: "보충필요",
  LEAVE: "휴강",
};

export default async function StudentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ enrollment?: string }>;
}) {
  const student = await requireStudent();
  const { enrollment: enrollmentParam } = await searchParams;

  // Enrollment 목록만 먼저 조회한다 — 이 학생의 모든 ClassSession을 한 번에
  // 가져오지 않는다. 특정 Enrollment가 선택된 뒤에야 그 범위의 수업만 조회한다.
  const [enrollments, levelTests, recentEvaluations] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: student.id, status: { notIn: ["LOST"] } },
      include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
      orderBy: { startDate: "desc" },
    }),
    // 레벨테스트는 Enrollment 선택과 무관하게 학생 전체 기준.
    prisma.levelTest.findMany({
      where: { studentId: student.id },
      include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
      orderBy: { id: "desc" },
    }),
    // 데일리 평가서 미리보기도 Enrollment 선택과 무관하게 학생 전체 기준, 최신 3건만.
    prisma.classSession.findMany({
      where: { studentId: student.id, evaluation: { isNot: null } },
      include: { evaluation: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
      orderBy: { scheduledAt: "desc" },
      take: 3,
    }),
  ]);

  const now = new Date();
  const requestedId = enrollmentParam ? Number(enrollmentParam) : null;
  // enrollments는 이미 studentId: student.id로 필터된 배열이므로, 여기서 못 찾으면
  // 다른 학생 소유이거나 존재하지 않는 id다 — find 자체가 소유권 검사를 겸한다.
  const selected =
    (requestedId ? enrollments.find((e) => e.id === requestedId) : undefined) ??
    enrollments.find((e) => e.startDate <= now && now <= e.endDate) ??
    enrollments[0];

  const sessions = selected
    ? await prisma.classSession.findMany({
        where: { enrollmentId: selected.id },
        include: { teacher: { select: TEACHER_SUMMARY_SELECT }, evaluation: true },
        orderBy: { scheduledAt: "asc" },
      })
    : [];

  const past = sessions.filter(
    (s) => s.status !== "SCHEDULED" || s.scheduledAt.getTime() + s.durationMin * 60_000 < now.getTime(),
  );
  const current = sessions.filter(
    (s) =>
      s.status === "SCHEDULED" &&
      s.scheduledAt.getTime() <= now.getTime() &&
      now.getTime() <= s.scheduledAt.getTime() + s.durationMin * 60_000,
  );
  const upcoming = sessions.filter((s) => s.status === "SCHEDULED" && s.scheduledAt.getTime() > now.getTime());

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">안녕하세요, {student.name} 학생님</h1>

      {enrollments.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400">
          등록된 수강 정보가 없습니다.
        </div>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">수업내역</h2>
          <EnrollmentSelect
            enrollments={enrollments.map((e) => ({
              id: e.id,
              label: `${fmtDate(e.startDate)} ~ ${fmtDate(e.endDate)} · ${e.textbookName ?? "교재 미지정"} · ${e.teacher?.realName ?? "미배정"}`,
            }))}
            selectedId={selected!.id}
          />

          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700">수강정보</h2>
          <div className="mb-8 grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
            <InfoItem label="강사" value={selected!.teacher?.realName ?? "미배정"} />
            <InfoItem label="수강 기간" value={`${fmtDate(selected!.startDate)} ~ ${fmtDate(selected!.endDate)}`} />
            <InfoItem label="교재" value={selected!.textbookName ?? "-"} />
            <InfoItem label="수업 방식" value={selected!.classMethod} />
            <InfoItem label="수업 타입" value={selected!.classType} />
            <InfoItem label="수강 상태" value={ENROLLMENT_STATUS_LABEL[selected!.status]} />
            <InfoItem label="총 회차" value={`${selected!.totalSessions}회`} />
            <InfoItem label="요일" value={selected!.scheduleDays} />
          </div>

          <h2 className="mb-3 text-sm font-semibold text-slate-700">수업 정보</h2>
          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <SessionGroup title="지난 수업" sessions={past} emptyText="지난 수업이 없습니다." />
            <SessionGroup title="현재 수업" sessions={current} emptyText="진행 중인 수업이 없습니다." />
            <SessionGroup title="예정 수업" sessions={upcoming} emptyText="예정된 수업이 없습니다." />
          </div>

          {sessions.length > 0 && (
            <>
              <h2 className="mb-3 text-sm font-semibold text-slate-700">선택된 수업의 Calendar</h2>
              <div className="mb-8">
                <CalendarView
                  sessions={sessions.map((s) => ({
                    id: s.id,
                    scheduledAt: s.scheduledAt,
                    durationMin: s.durationMin,
                    status: s.status,
                    progressNote: s.progressNote,
                    teacherName: s.teacher.realName,
                    evaluationId: s.evaluation?.id ?? null,
                    isSupplement: s.isSupplement,
                  }))}
                  classMethod={selected!.classMethod}
                  classType={selected!.classType}
                  textbookName={selected!.textbookName}
                />
              </div>
            </>
          )}
        </>
      )}

      <h2 className="mb-3 text-sm font-semibold text-slate-700">레벨테스트</h2>
      <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">신청일</th>
              <th className="px-4 py-3">테스트일</th>
              <th className="px-4 py-3">담당 강사</th>
              <th className="px-4 py-3">결과</th>
              <th className="px-4 py-3">레벨</th>
              <th className="px-4 py-3">코멘트</th>
              <th className="px-4 py-3">평가서</th>
            </tr>
          </thead>
          <tbody>
            {levelTests.map((lt) => (
              <tr key={lt.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">{fmtDate(lt.appliedAt)}</td>
                <td className="px-4 py-3 text-slate-500">{lt.scheduledTestDate ? fmtDate(lt.scheduledTestDate) : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{lt.teacher?.realName ?? "미배정"}</td>
                <td className="px-4 py-3 text-slate-600">{lt.progressStatus ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{lt.englishLevel ? (ENGLISH_LEVEL_LABEL[lt.englishLevel] ?? lt.englishLevel) : "-"}</td>
                <td className="px-4 py-3 text-slate-500">{lt.teacherNote ?? "-"}</td>
                <td className="px-4 py-3">
                  {lt.resultContent ? (
                    <Link
                      href={`/student/level-tests/${lt.id}`}
                      className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700 hover:underline"
                    >
                      결과 보기
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
              </tr>
            ))}
            {levelTests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  레벨테스트 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-3 flex gap-2">
        <Link
          href="/student/evaluations"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          데일리 평가서
        </Link>
        <Link
          href="/student/monthly-evaluations"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          월별 평가
        </Link>
      </div>

      {recentEvaluations.length > 0 && (
        <div className="flex flex-col gap-2">
          {recentEvaluations.map((s) => (
            <Link
              key={s.evaluation!.id}
              href={`/student/evaluations/${s.evaluation!.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300"
            >
              <p className="text-sm font-bold text-slate-900">{fmtDate(s.scheduledAt)}</p>
              <p className="mt-1 text-xs text-slate-500">강사: {s.teacher.realName}</p>
              <p className="mt-2 text-xs font-semibold text-slate-700">평가서 보기 →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SessionGroup({
  title,
  sessions,
  emptyText,
}: {
  title: string;
  sessions: {
    id: number;
    scheduledAt: Date;
    durationMin: number;
    status: SessionStatus;
    isSupplement: boolean;
    teacher: { realName: string };
    evaluation: { id: number } | null;
  }[];
  emptyText: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-900">{title}</h3>
      <div className="flex flex-col gap-2">
        {sessions.map((s) => (
          <div key={s.id} className="rounded-lg border border-slate-100 p-3 text-sm">
            <p className="font-medium text-slate-900">
              {fmtDate(s.scheduledAt)}
              {s.isSupplement && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                  보충수업
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500">
              {fmtTime(s.scheduledAt)} · {s.teacher.realName} · {SESSION_STATUS_LABEL[s.status]}
            </p>
            {s.status === "COMPLETED" && (
              <p className="mt-1 text-xs">
                {s.evaluation ? (
                  <Link href={`/student/evaluations/${s.evaluation.id}`} className="font-semibold text-slate-700 hover:underline">
                    평가서 보기
                  </Link>
                ) : (
                  <span className="text-slate-400">평가서 준비 중</span>
                )}
              </p>
            )}
          </div>
        ))}
        {sessions.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{emptyText}</p>}
      </div>
    </div>
  );
}
